import type { Profile } from '@shared/types'
import type { ModelOption } from '@shared/chat'
import { timeout, withProbe } from './usage'

type Query = ReturnType<(typeof import('@anthropic-ai/claude-agent-sdk'))['query']>

const CACHE_MS = 10 * 60_000
const cache = new Map<string, { at: number; list: ModelOption[] }>()

/**
 * Model chọn được cho profile (theo gói của tài khoản).
 * Dùng phiên chat đang chạy nếu có, không thì mở CLI tạm (không gửi tin nhắn, không tốn token).
 */
export async function listModels(p: Profile, running: Query | null): Promise<ModelOption[]> {
  const hit = cache.get(p.id)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.list
  const raw = await timeout(running ? running.supportedModels() : withProbe(p, (q) => q.supportedModels()), 25_000)
  const list = raw
    .filter((m) => m?.value)
    .map((m) => ({ value: m.value, displayName: m.displayName || m.value, description: m.description ?? '' }))
  cache.set(p.id, { at: Date.now(), list })
  return list
}
