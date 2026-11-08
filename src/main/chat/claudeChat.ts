import { randomUUID } from 'crypto'
import { parseQuestions, type ChatEvent, type ChatImage, type ChatOpenOptions, type PermissionState } from '@shared/chat'
import type { Profile } from '@shared/types'
import { summarizeToolInput } from '../providers/common'
import { buildEnv } from '../pty'
import { normalizeSdkMessage } from './normalize'
import { recordRateLimit } from './usage'
import { claudeExecutable } from '../claudeExe'

type Emit = (e: ChatEvent) => void
type SdkModule = typeof import('@anthropic-ai/claude-agent-sdk')
type Query = ReturnType<SdkModule['query']>
type SDKUserMessage = import('@anthropic-ai/claude-agent-sdk').SDKUserMessage
type PermissionResult = import('@anthropic-ai/claude-agent-sdk').PermissionResult

let sdk: Promise<SdkModule> | null = null
// SDK là ESM-only → nạp động
const loadSdk = () => (sdk ??= import('@anthropic-ai/claude-agent-sdk'))

/** Hàng đợi tin nhắn người dùng, đưa vào SDK dưới dạng AsyncIterable. */
class InputQueue implements AsyncIterable<SDKUserMessage> {
  private items: SDKUserMessage[] = []
  private waiter: ((r: IteratorResult<SDKUserMessage>) => void) | null = null
  private done = false

  push(m: SDKUserMessage) {
    if (this.waiter) {
      const w = this.waiter
      this.waiter = null
      w({ value: m, done: false })
    } else this.items.push(m)
  }

  close() {
    this.done = true
    this.waiter?.({ value: undefined, done: true })
    this.waiter = null
  }

  [Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    return {
      next: () => {
        const m = this.items.shift()
        if (m) return Promise.resolve({ value: m, done: false })
        if (this.done) return Promise.resolve({ value: undefined, done: true })
        return new Promise((r) => (this.waiter = r))
      }
    }
  }
}

interface PendingPermission {
  resolve: (r: PermissionResult) => void
  suggestions?: unknown[]
  /** Có giá trị khi đây là câu hỏi AskUserQuestion (input gốc của tool). */
  question?: Record<string, unknown>
}

/**
 * Một phiên chat Claude chạy headless qua Claude Agent SDK.
 * Process CLI chỉ khởi động khi gửi tin nhắn đầu tiên, và sống tới khi đóng khung.
 */
export class ClaudeChat {
  private input = new InputQueue()
  private q: Query | null = null
  private perms = new Map<string, PendingPermission>()
  private closed = false

  constructor(
    private profile: Profile,
    private opts: ChatOpenOptions,
    private emit: Emit
  ) {}

  async send(text: string, images: ChatImage[] = []) {
    if (this.closed) throw new Error('Phiên chat đã đóng')
    this.emit({ type: 'user-sent', text, images: images.length || undefined })
    // có ảnh → nội dung dạng khối: ảnh trước, chữ sau (giống Claude Code)
    const content = images.length
      ? [
          ...images.map((img) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: img.mediaType, data: img.data } })),
          ...(text ? [{ type: 'text' as const, text }] : [])
        ]
      : text
    this.input.push({ type: 'user', message: { role: 'user', content }, parent_tool_use_id: null })
    if (!this.q) await this.start()
  }

  private async start() {
    const { query } = await loadSdk()
    const cli = claudeExecutable(this.profile)
    const stderr: string[] = []
    this.q = query({
      prompt: this.input,
      options: {
        cwd: this.opts.cwd,
        resume: this.opts.resumeId,
        model: this.opts.model,
        // ghi session với entrypoint "cli": extension VS Code ẩn mọi session có entrypoint sdk-* khỏi danh sách,
        // đặt sẵn thì SDK không gán "sdk-ts" → session chat trong app mở được trong VS Code
        env: { ...buildEnv(this.profile), CLAUDE_CODE_ENTRYPOINT: 'cli' },
        pathToClaudeCodeExecutable: cli,
        includePartialMessages: true,
        permissionMode: this.opts.permissionMode as never,
        // hành xử giống Claude Code thường: system prompt gốc, CLAUDE.md, settings của user/project
        systemPrompt: { type: 'preset', preset: 'claude_code' },
        settingSources: ['user', 'project', 'local'],
        canUseTool: (toolName, input, { signal, suggestions }) => this.askPermission(toolName, input, signal, suggestions),
        stderr: (d) => {
          stderr.push(d)
          if (stderr.length > 50) stderr.shift()
        }
      }
    })
    void this.pump(stderr)
  }

  private async pump(stderr: string[]) {
    // giữ tham chiếu riêng: suspend() có thể tách query này ra trong khi vòng lặp còn chạy
    const q = this.q!
    try {
      for await (const msg of q) {
        if ((msg as any).type === 'rate_limit_event') recordRateLimit(this.profile.id, (msg as any).rate_limit_info)
        for (const e of normalizeSdkMessage(msg)) {
          if (e.type === 'init' || e.type === 'reset') this.setSessionId(e.sessionId)
          this.emit(e)
        }
      }
    } catch (err) {
      if (!this.closed && this.q === q) {
        const tail = stderr.join('').trim().split('\n').slice(-5).join('\n')
        this.emit({ type: 'error', message: `${(err as Error).message ?? err}${tail ? '\n' + tail : ''}` })
      }
    } finally {
      // chỉ dọn nếu query này vẫn là query hiện tại (không bị suspend() tách ra trước đó)
      if (this.q === q) {
        this.q = null
        this.cancelPermissions()
        if (!this.closed) this.emit({ type: 'closed' })
        // process đã thoát → lần gửi sau cần hàng đợi mới và resume đúng session
        this.input = new InputQueue()
      }
    }
  }

  /**
   * Đóng process CLI hiện tại (khi không có lượt nào đang chạy) để lần gửi sau resume lại từ file session.
   * Dùng khi session có tin mới từ nơi khác (VS Code): process cũ còn giữ hội thoại cũ trong bộ nhớ.
   */
  suspend() {
    const q = this.q
    if (!q) return
    this.q = null
    this.cancelPermissions()
    this.input.close()
    this.input = new InputQueue()
    try {
      q.close()
    } catch {
      /* đã đóng */
    }
  }

  /** Query đang chạy (nếu có), dùng để hỏi usage mà không cần mở CLI tạm. */
  runningQuery(): Query | null {
    return this.q
  }

  /** Cập nhật id để lần khởi động lại (sau khi process thoát) resume đúng session. */
  setSessionId(id: string) {
    this.opts = { ...this.opts, resumeId: id }
  }

  private askPermission(
    toolName: string,
    input: Record<string, unknown>,
    signal: AbortSignal,
    suggestions?: unknown[]
  ): Promise<PermissionResult> {
    const reqId = randomUUID()
    if (toolName === 'AskUserQuestion') {
      const questions = parseQuestions(input)
      if (questions.length) {
        return new Promise<PermissionResult>((resolve) => {
          this.perms.set(reqId, { resolve, question: input })
          signal.addEventListener('abort', () => this.finishPermission(reqId, 'cancelled'))
          this.emit({ type: 'question', reqId, questions })
        })
      }
    }
    return new Promise<PermissionResult>((resolve) => {
      this.perms.set(reqId, { resolve, suggestions })
      signal.addEventListener('abort', () => this.finishPermission(reqId, 'cancelled'))
      this.emit({
        type: 'permission',
        reqId,
        toolName,
        summary: summarizeToolInput(input),
        canAlways: !!suggestions?.length
      })
    })
  }

  respondPermission(reqId: string, decision: 'allow' | 'always' | 'deny') {
    this.finishPermission(reqId, decision === 'allow' ? 'allowed' : decision === 'always' ? 'always' : 'denied')
  }

  /** Trả lời AskUserQuestion: answers = { câu hỏi: đáp án }; null = bỏ qua. */
  answerQuestion(reqId: string, answers: Record<string, string> | null) {
    const p = this.perms.get(reqId)
    if (!p?.question) return
    if (!answers) return this.finishPermission(reqId, 'denied')
    this.perms.delete(reqId)
    p.resolve({ behavior: 'allow', updatedInput: { ...p.question, answers } })
    this.emit({ type: 'question-answered', reqId, answers })
  }

  private finishPermission(reqId: string, state: PermissionState) {
    const p = this.perms.get(reqId)
    if (!p) return
    this.perms.delete(reqId)
    if (state === 'allowed') p.resolve({ behavior: 'allow' })
    else if (state === 'always') p.resolve({ behavior: 'allow', updatedPermissions: p.suggestions as never })
    else if (p.question) p.resolve({ behavior: 'deny', message: 'Người dùng bỏ qua câu hỏi, không chọn đáp án nào.' })
    else p.resolve({ behavior: 'deny', message: state === 'cancelled' ? 'Đã huỷ' : 'Người dùng từ chối' })
    this.emit({ type: 'permission-resolved', reqId, state })
  }

  private cancelPermissions() {
    for (const id of [...this.perms.keys()]) this.finishPermission(id, 'cancelled')
  }

  async interrupt() {
    this.cancelPermissions()
    await this.q?.interrupt().catch(() => undefined)
  }

  async setPermissionMode(mode: string) {
    this.opts = { ...this.opts, permissionMode: mode }
    await this.q?.setPermissionMode(mode as never).catch(() => undefined)
  }

  /** Đổi model: áp dụng ngay cho phiên đang chạy, và cho lần khởi động lại sau. */
  async setModel(model: string | undefined) {
    this.opts = { ...this.opts, model }
    await this.q?.setModel(model).catch(() => undefined)
  }

  close() {
    this.closed = true
    this.cancelPermissions()
    this.input.close()
    try {
      this.q?.close()
    } catch {
      /* đã đóng */
    }
    this.q = null
  }
}
