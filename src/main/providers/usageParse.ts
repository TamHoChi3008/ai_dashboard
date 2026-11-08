import { localDay, type UsageRecord } from '@shared/stats'
import { safeJson } from './common'

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0)

/**
 * Các lần gọi model trong một file session Claude Code.
 * Một message được ghi thành nhiều dòng (mỗi khối nội dung một dòng) cùng usage → giữ một bản theo id.
 */
export function parseClaudeUsage(lines: string[]): UsageRecord[] {
  const byId = new Map<string, UsageRecord>()
  const noId: UsageRecord[] = []
  for (const line of lines) {
    if (!line.includes('"usage"')) continue // bỏ qua nhanh, không parse JSON
    const d = safeJson(line)
    if (d?.type !== 'assistant') continue
    const m = d.message
    const u = m?.usage
    if (!u || !d.timestamp) continue
    const model = typeof m.model === 'string' ? m.model : 'unknown'
    if (model === '<synthetic>') continue // tin do CLI tự tạo, không gọi API
    const rec: UsageRecord = {
      id: m.id || d.requestId || undefined,
      day: localDay(d.timestamp),
      model,
      counts: {
        input: num(u.input_tokens),
        cacheWrite: num(u.cache_creation_input_tokens),
        cacheRead: num(u.cache_read_input_tokens),
        output: num(u.output_tokens),
        calls: 1
      }
    }
    if (rec.id) byId.set(rec.id, rec)
    else noId.push(rec)
  }
  return [...byId.values(), ...noId]
}

/**
 * Các lần gọi model trong một file session Codex.
 * Event token_count mang tổng cộng dồn → lấy phần tăng thêm giữa hai event (event lặp lại không bị đếm hai lần).
 */
export function parseCodexUsage(lines: string[]): UsageRecord[] {
  const out: UsageRecord[] = []
  let model = 'unknown'
  let prev = { input: 0, cached: 0, write: 0, output: 0 }
  for (const line of lines) {
    if (!line.includes('token_count') && !line.includes('turn_context')) continue
    const d = safeJson(line)
    const p = d?.payload
    if (!p) continue
    if (d.type === 'turn_context' && typeof p.model === 'string') {
      model = p.model
      continue
    }
    if (d.type !== 'event_msg' || p.type !== 'token_count') continue
    const t = p.info?.total_token_usage
    if (!t || !d.timestamp) continue
    const cur = {
      input: num(t.input_tokens),
      cached: num(t.cached_input_tokens),
      write: num(t.cache_write_input_tokens),
      output: num(t.output_tokens)
    }
    const di = cur.input - prev.input
    const dc = cur.cached - prev.cached
    const dw = cur.write - prev.write
    const dout = cur.output - prev.output
    prev = cur
    if (di <= 0 && dout <= 0) continue
    out.push({
      day: localDay(d.timestamp),
      model,
      counts: {
        // input của Codex đã gồm phần đọc từ cache
        input: Math.max(0, di - Math.max(0, dc)),
        cacheWrite: Math.max(0, dw),
        cacheRead: Math.max(0, dc),
        output: Math.max(0, dout),
        calls: 1
      }
    })
  }
  return out
}
