import { homedir } from 'os'
import { join } from 'path'
import { readFileSync } from 'fs'
import type { Profile, UsageInfo, UsageWindow } from '@shared/types'
import { buildEnv } from '../pty'
import { LABELS, ORDER, eventToWindow, mapRateLimits } from './usageMap'
import { claudeExecutable } from '../claudeExe'

type SdkModule = typeof import('@anthropic-ai/claude-agent-sdk')
type Query = ReturnType<SdkModule['query']>

const CACHE_MS = 60_000
const cache = new Map<string, UsageInfo>()

/** Số liệu từ rate_limit_event (dự phòng khi API usage của SDK không dùng được). */
const lastEvents = new Map<string, Map<string, { utilization: number | null; resetsAt: string | null }>>()

export function recordRateLimit(profileId: string, info: any) {
  const w = eventToWindow(info)
  if (!w) return
  let m = lastEvents.get(profileId)
  if (!m) lastEvents.set(profileId, (m = new Map()))
  m.set(w.type, { utilization: w.utilization, resetsAt: w.resetsAt })
}

function fromEvents(profileId: string): UsageWindow[] {
  const m = lastEvents.get(profileId)
  if (!m) return []
  return ORDER.filter((k) => m.has(k)).map((k) => ({ key: k, label: LABELS[k], ...m.get(k)! }))
}

/** Model đặt trong settings.json của profile (nếu có). */
export function settingsModel(p: Profile): string | undefined {
  try {
    return JSON.parse(readFileSync(join(p.configDir, 'settings.json'), 'utf8')).model || undefined
  } catch {
    return undefined
  }
}

/** Query rỗng chỉ để hỏi thông tin: không gửi tin nhắn nên không tốn token. */
export async function withProbe<T>(
  p: Profile,
  fn: (q: Query) => Promise<T>,
  cwd: string = homedir(),
  settingSources: ('user' | 'project' | 'local')[] = ['user']
): Promise<T> {
  const { query } = await import('@anthropic-ai/claude-agent-sdk')
  let release!: () => void
  const idle = new Promise<void>((r) => (release = r))
  async function* noInput() {
    await idle // giữ stdin mở cho tới khi hỏi xong
  }
  const q = query({ prompt: noInput() as never, options: { cwd, env: buildEnv(p), settingSources, pathToClaudeCodeExecutable: claudeExecutable(p) } })
  try {
    return await fn(q)
  } finally {
    release()
    try {
      q.close()
    } catch {
      /* đã đóng */
    }
  }
}

export function timeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('Hết thời gian chờ CLI')), ms))])
}

export async function fetchUsage(p: Profile, running: Query | null, force: boolean): Promise<UsageInfo> {
  const hit = cache.get(p.id)
  if (!force && hit && Date.now() - hit.fetchedAt < CACHE_MS) return hit

  const ask = async (q: Query): Promise<UsageInfo> => {
    const info: UsageInfo = { available: false, windows: [], fetchedAt: Date.now(), source: 'api' }
    const usageFn = (q as any).usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET
    if (typeof usageFn === 'function') {
      const res = await usageFn.call(q, { skipBehaviors: true })
      info.available = !!res?.rate_limits_available
      info.subscription = res?.subscription_type ?? null
      info.windows = mapRateLimits(res?.rate_limits)
    }
    try {
      const init = await q.initializationResult()
      const def = init.models?.find((m) => m.value === 'default') ?? init.models?.[0]
      info.defaultModel = settingsModel(p) ?? def?.resolvedModel ?? def?.displayName
      info.subscription ??= init.account?.subscriptionType ?? null
    } catch {
      /* không bắt buộc */
    }
    return info
  }

  let info: UsageInfo
  try {
    info = await timeout(running ? ask(running) : withProbe(p, ask), 25_000)
  } catch (err) {
    info = { available: false, windows: [], fetchedAt: Date.now(), source: 'api', error: String((err as Error).message ?? err) }
  }
  if (info.windows.length === 0) {
    const ev = fromEvents(p.id)
    if (ev.length) info = { ...info, available: true, windows: ev, source: 'events' }
  }
  if (!info.error || info.windows.length) cache.set(p.id, info)
  return info
}
