import type { ToolDetail } from './types'

/** Event chat đã chuẩn hoá, gửi từ main sang renderer. Không phụ thuộc định dạng SDK. */
export type ChatEvent =
  | { type: 'user-sent'; text: string; images?: number }
  | { type: 'init'; sessionId: string; model?: string; permissionMode?: string }
  | { type: 'delta'; text: string }
  | { type: 'text'; text: string }
  | ({ type: 'tool'; id: string; name: string; summary: string } & ToolDetail)
  | { type: 'tool-result'; id: string; isError: boolean; preview: string }
  | { type: 'permission'; reqId: string; toolName: string; summary: string; canAlways: boolean }
  | { type: 'permission-resolved'; reqId: string; state: PermissionState }
  /** Tool AskUserQuestion: agent hỏi người dùng, chờ chọn đáp án. */
  | { type: 'question'; reqId: string; questions: AskQuestion[] }
  | { type: 'question-answered'; reqId: string; answers: Record<string, string> }
  | { type: 'result'; isError: boolean; costUsd?: number; durationMs?: number; message?: string }
  | { type: 'error'; message: string }
  | { type: 'info'; text: string }
  /** /clear: Claude Code chuyển sang hội thoại mới */
  | { type: 'reset'; sessionId: string }
  /** Renderer vừa nạp lại lịch sử từ file session: bỏ các tin tạm đã nằm trong file. */
  | { type: 'synced' }
  | { type: 'closed' }

export type PermissionState = 'pending' | 'allowed' | 'always' | 'denied' | 'cancelled'

export type ChatEntry =
  | { kind: 'user'; text: string; images?: number }
  | { kind: 'assistant'; text: string; streaming: boolean }
  | ({ kind: 'tool'; id: string; name: string; summary: string; status: 'running' | 'ok' | 'error'; output?: string } & ToolDetail)
  | { kind: 'permission'; reqId: string; toolName: string; summary: string; canAlways: boolean; state: PermissionState }
  | {
      kind: 'question'
      reqId: string
      questions: AskQuestion[]
      state: 'pending' | 'answered' | 'cancelled'
      answers?: Record<string, string>
    }
  | { kind: 'info'; text: string }
  | { kind: 'error'; text: string }

export interface ChatState {
  entries: ChatEntry[]
  busy: boolean
  sessionId?: string
  model?: string
  permissionMode?: string
  costUsd: number
}

export const emptyChat: ChatState = { entries: [], busy: false, costUsd: 0 }

/** Tiền tố thông báo khi đồng bộ tin mới từ nơi khác (VS Code). */
export const SYNC_NOTICE = '↻ Đã đồng bộ'

/** Chế độ quyền hiển thị trong UI (giá trị của Claude Code). */
export const PERMISSION_MODES = [
  { value: 'default', label: 'Hỏi trước khi chạy tool' },
  { value: 'acceptEdits', label: 'Tự cho phép sửa file' },
  { value: 'plan', label: 'Chỉ lập kế hoạch' },
  { value: 'auto', label: 'Tự động (classifier)' }
] as const

export interface ChatOpenOptions {
  profileId: string
  cwd: string
  /** Session có sẵn để tiếp tục; bỏ trống = session mới. */
  resumeId?: string
  permissionMode: string
  /** Model chọn trong khung chat (alias như "opus" hoặc id đầy đủ); bỏ trống = mặc định của profile. */
  model?: string
}

/** Một câu hỏi của tool AskUserQuestion. */
export interface AskQuestion {
  question: string
  header: string
  options: { label: string; description: string; preview?: string }[]
  multiSelect: boolean
}

/** Ảnh đính kèm tin nhắn (base64, không có tiền tố data:). */
export interface ChatImage {
  name: string
  mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'
  data: string
}

/** File người dùng đính kèm: ảnh thì gửi kèm tin nhắn, file khác thì chèn đường dẫn "@" vào ô nhập. */
export interface Attachment {
  path: string
  name: string
  image?: ChatImage
  /** Không đính kèm được (VD: ảnh quá lớn). */
  error?: string
}

/** Model chọn được trong khung chat. */
export interface ModelOption {
  value: string
  displayName: string
  description: string
}

export const IMAGE_TYPES: Record<string, ChatImage['mediaType']> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp'
}

/** Giới hạn của API cho một ảnh. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

/** Lấy danh sách câu hỏi hợp lệ từ input của AskUserQuestion. */
export function parseQuestions(input: Record<string, unknown>): AskQuestion[] {
  const list = Array.isArray(input.questions) ? input.questions : []
  return list
    .filter((q: any) => q && typeof q.question === 'string')
    .map((q: any) => ({
      question: q.question,
      header: typeof q.header === 'string' ? q.header : '',
      multiSelect: !!q.multiSelect,
      options: (Array.isArray(q.options) ? q.options : [])
        .filter((o: any) => o && typeof o.label === 'string')
        .map((o: any) => ({
          label: o.label,
          description: typeof o.description === 'string' ? o.description : '',
          preview: typeof o.preview === 'string' ? o.preview : undefined
        }))
    }))
}

/** Ghép câu trả lời cho AskUserQuestion: chọn nhiều thì nối bằng dấu phẩy (định dạng Claude Code dùng). */
export function joinAnswer(picked: string[], other: string): string {
  const all = [...picked, ...(other.trim() ? [other.trim()] : [])]
  return all.join(', ')
}

function finalizeStreaming(entries: ChatEntry[]): ChatEntry[] {
  const last = entries[entries.length - 1]
  if (last?.kind === 'assistant' && last.streaming) {
    return [...entries.slice(0, -1), { ...last, streaming: false }]
  }
  return entries
}

export function reduceChat(s: ChatState, e: ChatEvent): ChatState {
  const entries = s.entries
  const last = entries[entries.length - 1]
  switch (e.type) {
    case 'user-sent':
      return { ...s, busy: true, entries: [...finalizeStreaming(entries), { kind: 'user', text: e.text, images: e.images }] }
    case 'init':
      return { ...s, sessionId: e.sessionId, model: e.model ?? s.model, permissionMode: e.permissionMode ?? s.permissionMode }
    case 'delta':
      if (last?.kind === 'assistant' && last.streaming) {
        return { ...s, entries: [...entries.slice(0, -1), { ...last, text: last.text + e.text }] }
      }
      return { ...s, entries: [...entries, { kind: 'assistant', text: e.text, streaming: true }] }
    case 'text':
      // bản đầy đủ của khối text vừa stream xong → thay thế
      if (last?.kind === 'assistant' && last.streaming) {
        return { ...s, entries: [...entries.slice(0, -1), { kind: 'assistant', text: e.text, streaming: false }] }
      }
      return { ...s, entries: [...entries, { kind: 'assistant', text: e.text, streaming: false }] }
    case 'tool':
      // câu hỏi AskUserQuestion đã có thẻ riêng (event 'question')
      if (e.name === 'AskUserQuestion') return { ...s, entries: finalizeStreaming(entries) }
      return {
        ...s,
        entries: [...finalizeStreaming(entries), { kind: 'tool', id: e.id, name: e.name, summary: e.summary, status: 'running', file: e.file, line: e.line, diff: e.diff }]
      }
    case 'tool-result':
      return {
        ...s,
        entries: entries.map((x) =>
          x.kind === 'tool' && x.id === e.id ? { ...x, status: e.isError ? 'error' : 'ok', output: e.preview } : x
        )
      }
    case 'permission':
      return {
        ...s,
        entries: [
          ...finalizeStreaming(entries),
          { kind: 'permission', reqId: e.reqId, toolName: e.toolName, summary: e.summary, canAlways: e.canAlways, state: 'pending' }
        ]
      }
    case 'permission-resolved':
      return {
        ...s,
        entries: entries.map((x): ChatEntry => {
          if (x.kind === 'permission' && x.reqId === e.reqId) return { ...x, state: e.state }
          if (x.kind === 'question' && x.reqId === e.reqId && x.state === 'pending') return { ...x, state: 'cancelled' }
          return x
        })
      }
    case 'question':
      return {
        ...s,
        entries: [...finalizeStreaming(entries), { kind: 'question', reqId: e.reqId, questions: e.questions, state: 'pending' }]
      }
    case 'question-answered':
      return {
        ...s,
        entries: entries.map((x) => (x.kind === 'question' && x.reqId === e.reqId ? { ...x, state: 'answered', answers: e.answers } : x))
      }
    case 'result': {
      let next = finalizeStreaming(entries).map((x): ChatEntry => {
        if (x.kind === 'permission' && x.state === 'pending') return { ...x, state: 'cancelled' }
        if (x.kind === 'question' && x.state === 'pending') return { ...x, state: 'cancelled' }
        if (x.kind === 'tool' && x.status === 'running') return { ...x, status: 'error', output: x.output ?? '(đã dừng)' }
        return x
      })
      if (e.isError) next = [...next, { kind: 'error', text: e.message || 'Lượt chat kết thúc với lỗi.' }]
      return { ...s, busy: false, entries: next, costUsd: s.costUsd + (e.costUsd ?? 0) }
    }
    case 'error':
      return { ...s, busy: false, entries: [...finalizeStreaming(entries), { kind: 'error', text: e.message }] }
    case 'info':
      return { ...s, entries: [...finalizeStreaming(entries), { kind: 'info', text: e.text }] }
    case 'reset':
      return {
        ...s,
        sessionId: e.sessionId,
        entries: [...finalizeStreaming(entries), { kind: 'info', text: '— Đã bắt đầu hội thoại mới —' }]
      }
    case 'synced':
      // tin nhắn / tool đã được ghi vào file → hiện từ lịch sử; lỗi và thông báo không có trong file nên giữ lại
      // thông báo "↻ Đã đồng bộ" cũ cũng bỏ, chỉ giữ thông báo của lần đồng bộ mới nhất
      return {
        ...s,
        entries: entries.filter((x) => x.kind === 'error' || (x.kind === 'info' && !x.text.startsWith(SYNC_NOTICE)))
      }
    case 'closed':
      return { ...s, busy: false, entries: finalizeStreaming(entries) }
  }
}
