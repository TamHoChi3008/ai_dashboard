/** Số token của một lần gọi model (hoặc tổng của nhiều lần). */
export interface TokenCounts {
  /** Input không lấy từ cache. */
  input: number
  /** Input ghi vào cache (Claude: cache_creation). */
  cacheWrite: number
  /** Input đọc từ cache. */
  cacheRead: number
  output: number
  /** Số lần gọi model. */
  calls: number
}

/** Một lần gọi model đọc được từ file session. */
export interface UsageRecord {
  /** Id message (Claude) để bỏ trùng giữa các file; Codex không có. */
  id?: string
  /** Ngày theo giờ máy, dạng YYYY-MM-DD. */
  day: string
  model: string
  counts: TokenCounts
}

export interface ProfileStats {
  profileId: string
  /** Mỗi ngày trong khoảng, cũ → mới, kể cả ngày không dùng. */
  days: { day: string; counts: TokenCounts }[]
  /** Theo model, nhiều token nhất trước. */
  models: { model: string; counts: TokenCounts }[]
  total: TokenCounts
  /** Số session có dùng token trong khoảng. */
  sessions: number
  generatedAt: number
}

export const zeroCounts = (): TokenCounts => ({ input: 0, cacheWrite: 0, cacheRead: 0, output: 0, calls: 0 })

export function addCounts(a: TokenCounts, b: TokenCounts): TokenCounts {
  return {
    input: a.input + b.input,
    cacheWrite: a.cacheWrite + b.cacheWrite,
    cacheRead: a.cacheRead + b.cacheRead,
    output: a.output + b.output,
    calls: a.calls + b.calls
  }
}

export const totalTokens = (c: TokenCounts) => c.input + c.cacheWrite + c.cacheRead + c.output

const pad = (n: number) => String(n).padStart(2, '0')

/** Ngày theo giờ máy (YYYY-MM-DD) của một thời điểm. */
export function localDay(t: string | number | Date): string {
  const d = new Date(t)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Danh sách ngày từ (hôm nay - days + 1) tới hôm nay. */
export function dayRange(days: number, now = Date.now()): string[] {
  const out: string[] = []
  const today = new Date(now)
  for (let i = days - 1; i >= 0; i--) {
    out.push(localDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() - i)))
  }
  return out
}

/**
 * Gộp các lần gọi model của nhiều file thành thống kê theo ngày và theo model.
 * Message Claude có thể xuất hiện ở nhiều file (session rẽ nhánh) → bỏ trùng theo id.
 */
export function aggregateUsage(
  profileId: string,
  /** session = false với file của agent phụ (vẫn tính token, nhưng không đếm là một session). */
  files: { records: UsageRecord[]; session: boolean }[],
  days: number,
  now = Date.now()
): ProfileStats {
  const range = dayRange(days, now)
  const first = range[0]
  const byDay = new Map(range.map((d) => [d, zeroCounts()]))
  const byModel = new Map<string, TokenCounts>()
  const seen = new Set<string>()
  let total = zeroCounts()
  let sessions = 0

  for (const { records, session } of files) {
    let used = false
    for (const r of records) {
      if (r.day < first || !byDay.has(r.day)) continue
      if (r.id) {
        if (seen.has(r.id)) continue
        seen.add(r.id)
      }
      used = true
      byDay.set(r.day, addCounts(byDay.get(r.day)!, r.counts))
      byModel.set(r.model, addCounts(byModel.get(r.model) ?? zeroCounts(), r.counts))
      total = addCounts(total, r.counts)
    }
    if (used && session) sessions++
  }

  return {
    profileId,
    days: range.map((day) => ({ day, counts: byDay.get(day)! })),
    models: [...byModel.entries()]
      .map(([model, counts]) => ({ model, counts }))
      .sort((a, b) => totalTokens(b.counts) - totalTokens(a.counts)),
    total,
    sessions,
    generatedAt: now
  }
}

/** 1234 → "1,2K", 3400000 → "3,4M". */
export function formatTokens(n: number): string {
  const f = (v: number, unit: string) => `${(Math.round(v * 10) / 10).toLocaleString('vi-VN')}${unit}`
  if (n >= 1e9) return f(n / 1e9, 'B')
  if (n >= 1e6) return f(n / 1e6, 'M')
  if (n >= 1e3) return f(n / 1e3, 'K')
  return String(n)
}
