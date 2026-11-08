/** Slash command hiển thị trong menu "/" của khung chat. */
export interface SlashCommandInfo {
  name: string
  description: string
  argumentHint: string
  aliases?: string[]
  builtin?: boolean
}

/**
 * Phần đang gõ của command: text bắt đầu bằng "/" và chưa có khoảng trắng.
 * Trả về null nếu không ở chế độ gõ command.
 */
export function slashQuery(text: string): string | null {
  const m = text.match(/^\/(\S*)$/)
  return m ? m[1] : null
}

/** Lọc + xếp hạng: khớp đầu tên > khớp đầu alias / sau dấu ":" > chứa trong tên > chứa trong mô tả. */
export function filterCommands(list: SlashCommandInfo[], q: string, limit = 300): SlashCommandInfo[] {
  const s = q.toLowerCase()
  const rank = (c: SlashCommandInfo): number => {
    if (!s) return c.builtin ? 0 : 1
    const name = c.name.toLowerCase()
    const short = name.includes(':') ? name.slice(name.indexOf(':') + 1) : name
    if (name === s || (c.aliases ?? []).some((a) => a.toLowerCase() === s)) return 0
    if (name.startsWith(s)) return 1
    if (short.startsWith(s) || (c.aliases ?? []).some((a) => a.toLowerCase().startsWith(s))) return 2
    if (name.includes(s)) return 3
    if (c.description.toLowerCase().includes(s)) return 4
    return -1
  }
  return list
    .map((c) => ({ c, r: rank(c) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.c.name.localeCompare(b.c.name))
    .slice(0, limit)
    .map((x) => x.c)
}

/** Tên command (không có "/") khi tin nhắn là một lệnh app tự xử lý, VD /usage. */
export function localCommand(text: string): 'usage' | null {
  const m = text.trim().match(/^\/(\S+)\s*$/)
  if (!m) return null
  return ['usage', 'cost', 'stats'].includes(m[1].toLowerCase()) ? 'usage' : null
}
