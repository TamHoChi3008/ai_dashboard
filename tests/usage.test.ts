import { describe, it, expect } from 'vitest'
import { eventToWindow, mapRateLimits } from '../src/main/chat/usageMap'

describe('mapRateLimits', () => {
  it('phiên 5 giờ và tuần đứng đầu, bỏ cửa sổ rỗng, thêm cửa sổ theo model', () => {
    const r = mapRateLimits({
      seven_day: { utilization: 40, resets_at: '2026-11-03T00:00:00Z' },
      five_hour: { utilization: 12.5, resets_at: '2026-10-29T18:00:00Z' },
      seven_day_opus: null,
      seven_day_sonnet: { utilization: null, resets_at: null },
      model_scoped: [{ display_name: 'Fable', utilization: 3, resets_at: null }]
    })
    expect(r.map((w) => [w.key, w.utilization])).toEqual([
      ['five_hour', 12.5],
      ['seven_day', 40],
      ['model:Fable', 3]
    ])
    expect(r[0].label).toBe('Phiên (5 giờ)')
  })

  it('null → rỗng', () => expect(mapRateLimits(null)).toEqual([]))
})

describe('eventToWindow', () => {
  it('đổi tỉ lệ 0–1 sang % và giây epoch sang ISO', () => {
    expect(eventToWindow({ rateLimitType: 'five_hour', utilization: 0.4567, resetsAt: 1800000000 })).toEqual({
      type: 'five_hour',
      utilization: 45.7,
      resetsAt: new Date(1800000000 * 1000).toISOString()
    })
  })
  it('bỏ overage và event không có loại', () => {
    expect(eventToWindow({ rateLimitType: 'overage' })).toBeNull()
    expect(eventToWindow({ status: 'allowed' })).toBeNull()
  })
})
