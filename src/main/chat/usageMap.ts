import type { UsageWindow } from '@shared/types'

export const LABELS: Record<string, string> = {
  five_hour: 'Phiên (5 giờ)',
  seven_day: 'Tuần · tất cả model',
  seven_day_opus: 'Tuần · Opus',
  seven_day_sonnet: 'Tuần · Sonnet',
  seven_day_oauth_apps: 'Tuần · ứng dụng OAuth'
}
// thanh chính (phiên, tuần) hiện trước; các thanh theo model hiện sau
export const ORDER = ['five_hour', 'seven_day', 'seven_day_opus', 'seven_day_sonnet', 'seven_day_oauth_apps']

/** Chuyển rate_limits của SDK (giống lệnh /usage) thành các thanh hiển thị. */
export function mapRateLimits(rl: any): UsageWindow[] {
  if (!rl || typeof rl !== 'object') return []
  const out: UsageWindow[] = []
  for (const key of ORDER) {
    const w = rl[key]
    if (w && (w.utilization != null || w.resets_at)) {
      out.push({ key, label: LABELS[key], utilization: w.utilization ?? null, resetsAt: w.resets_at ?? null })
    }
  }
  for (const m of Array.isArray(rl.model_scoped) ? rl.model_scoped : []) {
    if (m?.display_name) {
      out.push({
        key: 'model:' + m.display_name,
        label: `Tuần · ${m.display_name}`,
        utilization: m.utilization ?? null,
        resetsAt: m.resets_at ?? null
      })
    }
  }
  return out
}

/** rate_limit_event: utilization là tỉ lệ 0–1, resetsAt là giây epoch. */
export function eventToWindow(info: any): { type: string; utilization: number | null; resetsAt: string | null } | null {
  if (!info?.rateLimitType || info.rateLimitType === 'overage') return null
  return {
    type: info.rateLimitType,
    utilization: typeof info.utilization === 'number' ? Math.round(info.utilization * 1000) / 10 : null,
    resetsAt: typeof info.resetsAt === 'number' ? new Date(info.resetsAt * 1000).toISOString() : null
  }
}
