/** Phần "@..." ngay trước con trỏ: @ phải ở đầu dòng hoặc sau khoảng trắng. */
export function atQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret)
  const m = before.match(/(^|\s)@([^\s@]*)$/)
  if (!m) return null
  return { start: caret - m[2].length - 1, query: m[2] }
}

/** Thay "@query" tại vị trí start bằng "@path " và trả về text mới + vị trí con trỏ mới. */
export function insertMention(text: string, start: number, caret: number, path: string): { text: string; caret: number } {
  const mention = '@' + (/\s/.test(path) ? `"${path}"` : path) + ' '
  return { text: text.slice(0, start) + mention + text.slice(caret), caret: start + mention.length }
}

/** Các ký tự của q xuất hiện lần lượt trong s (VD "cvw" khớp "ChatView.tsx"). */
function subsequence(s: string, q: string): boolean {
  let i = 0
  for (const ch of s) if (ch === q[i]) i++
  return i === q.length
}

/**
 * Xếp hạng file (đường dẫn tương đối, dùng "/"): tên file bắt đầu bằng q > tên chứa q > đường dẫn chứa q > khớp rải rác.
 * Cùng hạng thì đường dẫn ngắn hơn đứng trước.
 */
export function rankFiles(files: string[], q: string, limit = 50): string[] {
  const s = q.toLowerCase().replace(/\\/g, '/')
  if (!s) return files.slice(0, limit)
  const scored: { f: string; r: number }[] = []
  for (const f of files) {
    const path = f.toLowerCase()
    const name = path.slice(path.lastIndexOf('/') + 1)
    let r = -1
    if (name.startsWith(s)) r = 0
    else if (name.includes(s)) r = 1
    else if (path.includes(s)) r = 2
    else if (subsequence(name, s)) r = 3
    else if (subsequence(path, s)) r = 4
    if (r >= 0) scored.push({ f, r })
  }
  scored.sort((a, b) => a.r - b.r || a.f.length - b.f.length || a.f.localeCompare(b.f))
  return scored.slice(0, limit).map((x) => x.f)
}

/** Thêm "@path " vào cuối ô nhập (dùng khi đính kèm file không phải ảnh). */
export function appendMention(text: string, path: string): string {
  const mention = '@' + (/\s/.test(path) ? `"${path}"` : path) + ' '
  return text + (text && !/\s$/.test(text) ? ' ' : '') + mention
}

/** Đường dẫn tương đối (dùng "/") nếu file nằm trong cwd, không thì giữ đường dẫn tuyệt đối. */
export function relativeTo(cwd: string, path: string): string {
  const norm = (s: string) => s.replace(/\\/g, '/').replace(/\/+$/, '')
  const c = norm(cwd)
  const p = norm(path)
  if (c && p.toLowerCase().startsWith(c.toLowerCase() + '/')) return p.slice(c.length + 1)
  return path
}
