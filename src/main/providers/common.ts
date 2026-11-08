import type { ChatItem, SessionStatus, ToolDetail } from '@shared/types'

export interface ParsedSession {
  title: string
  cwd: string
  source: string
  items: ChatItem[]
  status: SessionStatus
  /** Lượt cuối chưa xong (agent đang làm việc). */
  busy: boolean
}

/** Agent coi là "đang chạy" nếu file mới được ghi trong khoảng này. */
export const RUNNING_WINDOW_MS = 5 * 60_000
/** "Tới lượt bạn" chỉ tính khi có hoạt động gần đây. */
export const WAITING_WINDOW_MS = 60 * 60_000

export function safeJson(line: string): any | undefined {
  try {
    return JSON.parse(line)
  } catch {
    return undefined
  }
}

export function clip(s: string, n = 200): string {
  const one = s.replace(/\s+/g, ' ').trim()
  return one.length > n ? one.slice(0, n) + '…' : one
}

/** Tóm tắt input của tool thành một dòng. */
export function summarizeToolInput(input: unknown): string {
  if (input == null) return ''
  if (typeof input === 'string') {
    const j = safeJson(input)
    return j && typeof j === 'object' ? summarizeToolInput(j) : clip(input, 160)
  }
  if (typeof input === 'object') {
    const o = input as Record<string, unknown>
    // AskUserQuestion: hiện các câu hỏi thay vì JSON
    if (Array.isArray(o.questions)) {
      const qs = o.questions.map((q: any) => q?.question).filter((q: unknown) => typeof q === 'string')
      if (qs.length) return clip(qs.join(' · '), 160)
    }
    for (const k of ['command', 'cmd', 'file_path', 'path', 'pattern', 'url', 'query', 'description', 'prompt']) {
      const v = o[k]
      if (typeof v === 'string' && v) return clip(v, 160)
      if (Array.isArray(v)) return clip(v.join(' '), 160)
    }
    return clip(JSON.stringify(o), 160)
  }
  return String(input)
}

const MAX_DIFF_CHARS = 20_000

function cut(s: unknown): string {
  const t = typeof s === 'string' ? s : ''
  return t.length > MAX_DIFF_CHARS ? t.slice(0, MAX_DIFF_CHARS) + '\n… (đã cắt bớt)' : t
}

/** File và nội dung sửa của một lần gọi tool (để hiện link mở VS Code và diff). */
export function toolDetail(name: string, input: unknown): ToolDetail {
  if (!input || typeof input !== 'object') return {}
  const o = input as Record<string, any>
  const file: string | undefined = typeof o.file_path === 'string' ? o.file_path : typeof o.notebook_path === 'string' ? o.notebook_path : undefined
  if (!file) return {}
  switch (name) {
    case 'Edit':
      return { file, diff: [{ old: cut(o.old_string), new: cut(o.new_string) }] }
    case 'MultiEdit':
      return {
        file,
        diff: (Array.isArray(o.edits) ? o.edits : []).slice(0, 50).map((e: any) => ({ old: cut(e?.old_string), new: cut(e?.new_string) }))
      }
    case 'Write':
      return { file, diff: [{ old: '', new: cut(o.content) }] }
    case 'Read':
      return typeof o.offset === 'number' && o.offset > 0 ? { file, line: o.offset } : { file }
    default:
      return { file }
  }
}

export function decideStatus(busy: boolean, lastActivity: number, now: number): SessionStatus {
  const age = now - lastActivity
  if (busy && age < RUNNING_WINDOW_MS) return 'running'
  if (age < WAITING_WINDOW_MS) return 'waiting'
  return 'idle'
}
