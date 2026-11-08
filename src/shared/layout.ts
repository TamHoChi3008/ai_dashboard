import type { SessionSummary } from './types'

export type SavedMode = 'view' | 'chat'

/** Một khung được lưu lại để mở lại lần sau. */
export interface SavedPane {
  session?: SessionSummary
  /** Id session do khung chat tạo ra (chưa có trong `session`). */
  sessionId?: string
  mode: SavedMode
  chat?: { cwd: string; resumeId?: string; model?: string }
  title?: string
}

export interface WorkspaceLayout {
  panes: SavedPane[]
  /** Vị trí khung đang chọn. */
  focused?: number
  /** Bộ lọc số ngày của danh sách session. */
  days?: number
}

/** Hình dạng tối thiểu của một khung trong renderer cần để lưu. */
export interface PaneLike {
  key: string
  session?: SessionSummary
  sessionId?: string
  mode: 'view' | 'chat' | 'term'
  chat?: { cwd: string; resumeId?: string; model?: string }
  spawn?: { kind: 'new'; cwd: string } | { kind: 'resume' } | { kind: 'login' }
  title?: string
}

/**
 * Chuyển các khung đang mở thành dạng lưu được.
 * Terminal không được lưu (mở lại sẽ tự chạy CLI): khung terminal của một session được mở lại ở chế độ Xem,
 * khung đăng nhập hoặc terminal chưa có session thì bỏ.
 */
export function toSavedLayout(panes: PaneLike[], focusedKey: string, days: number): WorkspaceLayout {
  const out: SavedPane[] = []
  let focused: number | undefined
  for (const p of panes) {
    const hasSession = !!p.session || !!p.sessionId
    let saved: SavedPane | null = null
    if (p.chat) {
      saved = {
        mode: p.mode === 'view' && hasSession ? 'view' : 'chat',
        chat: { cwd: p.chat.cwd, resumeId: p.sessionId ?? p.chat.resumeId, model: p.chat.model }
      }
    } else if (hasSession) {
      saved = { mode: 'view' }
    }
    if (!saved) continue
    if (p.session) saved.session = p.session
    if (p.sessionId) saved.sessionId = p.sessionId
    if (p.title) saved.title = p.title
    if (p.key === focusedKey) focused = out.length
    out.push(saved)
  }
  return { panes: out, focused, days }
}

/** Kiểm tra dữ liệu đọc từ file (có thể hỏng hoặc của phiên bản cũ). */
export function sanitizeLayout(v: unknown, maxPanes: number): WorkspaceLayout | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  if (!Array.isArray(o.panes)) return null
  const panes = o.panes
    .filter((p): p is SavedPane => {
      if (!p || typeof p !== 'object') return false
      const x = p as SavedPane
      if (x.mode !== 'view' && x.mode !== 'chat') return false
      if (x.mode === 'chat' && (!x.chat || typeof x.chat.cwd !== 'string')) return false
      if (x.mode === 'view' && !x.session && !x.sessionId) return false
      return true
    })
    .slice(0, maxPanes)
  return {
    panes,
    focused: typeof o.focused === 'number' ? o.focused : undefined,
    days: typeof o.days === 'number' ? o.days : undefined
  }
}
