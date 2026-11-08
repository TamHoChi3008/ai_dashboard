/** Session được ghim / ẩn của một profile (lưu theo id session). */
export interface SessionFlags {
  pinned: string[]
  hidden: string[]
  /** Tên đặt trong app (id session → tên), thay cho tiêu đề gốc. */
  names?: Record<string, string>
}

export const emptyFlags: SessionFlags = { pinned: [], hidden: [] }

export type FlagName = 'pinned' | 'hidden'

/** Tối đa ký tự của tên đặt cho session. */
export const MAX_NAME = 120

/** Đặt tên cho session; tên rỗng (hoặc trùng tên gốc) thì bỏ, quay về tên gốc. */
export function setSessionName(f: SessionFlags, id: string, name: string, original?: string): SessionFlags {
  const names = { ...(f.names ?? {}) }
  const n = name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME)
  if (!n || n === original) delete names[id]
  else names[id] = n
  return { ...f, names }
}

/** Áp tên đã đặt lên danh sách session (giữ nguyên object nếu không đổi tên). */
export function applyNames<T extends { id: string; title: string }>(list: T[], f: SessionFlags): T[] {
  const names = f.names
  if (!names) return list
  return list.map((s) => (names[s.id] ? { ...s, title: names[s.id] } : s))
}

/** Bật/tắt một cờ. Ẩn thì bỏ ghim; ghim thì bỏ ẩn (hai trạng thái loại trừ nhau). */
export function toggleFlag(f: SessionFlags, id: string, flag: FlagName, on: boolean): SessionFlags {
  const without = (list: string[]) => list.filter((x) => x !== id)
  const next: SessionFlags = { ...f, pinned: without(f.pinned), hidden: without(f.hidden) }
  if (on) {
    next[flag] = [...next[flag], id]
  } else {
    // tắt một cờ không được đụng tới cờ còn lại
    const other: FlagName = flag === 'pinned' ? 'hidden' : 'pinned'
    next[other] = f[other]
  }
  return next
}

/** Chia danh sách thành ghim / thường / ẩn. Ghim giữ thứ tự lúc ghim; còn lại theo thời gian. */
export function arrangeSessions<T extends { id: string }>(list: T[], f: SessionFlags) {
  const hidden = new Set(f.hidden)
  const rank = new Map(f.pinned.map((id, i) => [id, i]))
  return {
    pinned: list.filter((s) => rank.has(s.id) && !hidden.has(s.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!),
    normal: list.filter((s) => !rank.has(s.id) && !hidden.has(s.id)),
    hidden: list.filter((s) => hidden.has(s.id))
  }
}
