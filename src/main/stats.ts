import { promises as fs } from 'fs'
import type { Profile } from '@shared/types'
import { aggregateUsage, type ProfileStats, type UsageRecord } from '@shared/stats'
import { readLines, sessionRoot, walk } from './providers/sessions'
import { parseClaudeUsage, parseCodexUsage } from './providers/usageParse'

/** Kết quả đọc từng file, theo mtime + size (file không đổi thì không đọc lại). */
const cache = new Map<string, { mtime: number; size: number; records: UsageRecord[] }>()

async function fileRecords(p: Profile, file: string): Promise<UsageRecord[]> {
  const st = await fs.stat(file)
  const hit = cache.get(file)
  if (hit && hit.mtime === st.mtimeMs && hit.size === st.size) return hit.records
  const lines = await readLines(file)
  const records = p.provider === 'claude' ? parseClaudeUsage(lines) : parseCodexUsage(lines)
  cache.set(file, { mtime: st.mtimeMs, size: st.size, records })
  return records
}

/** Thống kê token của một profile trong `days` ngày gần nhất (gồm cả session phụ của agent). */
export async function getStats(p: Profile, days: number): Promise<ProfileStats> {
  // file sửa lần cuối trước khoảng này thì không thể có lượt gọi nào trong khoảng
  const since = Date.now() - (days + 1) * 86400_000
  const files: string[] = []
  const keep = (_f: string, mtime: number) => mtime >= since
  if (p.provider === 'claude') {
    // projects/<proj>/<id>.jsonl và projects/<proj>/<id>/subagents/*.jsonl
    await walk(sessionRoot(p), 3, (n) => n.endsWith('.jsonl'), keep, files)
  } else {
    await walk(sessionRoot(p), 4, (n) => n.startsWith('rollout-') && /\.jsonl(\.zst)?$/.test(n), keep, files)
  }
  // Codex có thể có cả bản .jsonl và .jsonl.zst của cùng session → chỉ đọc một bản (ưu tiên .jsonl đang ghi)
  const picked = new Map<string, string>()
  for (const f of files) {
    const k = f.replace(/\.zst$/, '')
    if (!picked.has(k) || f.endsWith('.jsonl')) picked.set(k, f)
  }
  const all = await Promise.all(
    [...picked.values()].map(async (f) => ({
      records: await fileRecords(p, f).catch(() => [] as UsageRecord[]),
      session: !/[\\/]subagents[\\/]/.test(f)
    }))
  )
  return aggregateUsage(p.id, all, days)
}
