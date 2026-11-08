import { useCallback, useEffect, useState } from 'react'
import type { ProfileInfo, SessionSummary } from '@shared/types'
import { formatTokens, totalTokens, type ProfileStats } from '@shared/stats'
import { api, baseName, STATUS_LABEL, timeAgo } from '../api'
import { applyNames } from '@shared/sessionFlags'
import { deleteProfileFlow } from '../profileActions'

interface Props {
  profiles: ProfileInfo[]
  /** Id profile đã đóng tab. */
  closed: string[]
  onReopen(profileId: string): void
  /** Sau khi xoá profile → App tải lại danh sách. */
  onDeleted(): void
  visible: boolean
  /** Tăng khi có file session thay đổi (bất kỳ profile nào). */
  tick: number
  onOpen(profileId: string, s: SessionSummary): void
}

const STAT_DAYS = [7, 30]

/** Tab tổng quan: session đang chạy / chờ bạn của mọi profile, và thống kê token theo profile. */
export function Overview({ profiles, closed, onReopen, onDeleted, visible, tick, onOpen }: Props) {
  const [active, setActive] = useState<Record<string, SessionSummary[]>>({})
  const [stats, setStats] = useState<Record<string, ProfileStats | { error: string }>>({})
  const [days, setDays] = useState(7)
  const [loadingStats, setLoadingStats] = useState(false)
  const [, setClock] = useState(0)

  const loadActive = useCallback(async () => {
    const entries = await Promise.all(
      profiles.map(async (p) => {
        try {
          const list = await api.listSessions(p.id, 1)
          const flags = await api.getSessionFlags(p.id)
          const hidden = new Set(flags.hidden)
          return [p.id, applyNames(list, flags).filter((s) => s.status !== 'idle' && !hidden.has(s.id))] as const
        } catch {
          return [p.id, []] as const
        }
      })
    )
    setActive(Object.fromEntries(entries))
  }, [profiles])

  const loadStats = useCallback(async () => {
    if (typeof api.getStats !== 'function') return
    setLoadingStats(true)
    const entries = await Promise.all(
      profiles.map(async (p) => {
        try {
          return [p.id, await api.getStats(p.id, days)] as const
        } catch (e) {
          return [p.id, { error: String((e as Error).message ?? e) }] as const
        }
      })
    )
    setStats(Object.fromEntries(entries))
    setLoadingStats(false)
  }, [profiles, days])

  // danh sách hoạt động: khi mở tab, khi file đổi, và mỗi 30 giây (trạng thái phụ thuộc thời gian)
  useEffect(() => {
    if (visible) void loadActive()
  }, [visible, tick, loadActive])
  useEffect(() => {
    if (!visible) return
    const t = setInterval(() => {
      setClock((c) => c + 1)
      void loadActive()
    }, 30_000)
    return () => clearInterval(t)
  }, [visible, loadActive])

  // thống kê đọc nhiều file hơn → chỉ khi mở tab hoặc đổi khoảng ngày
  useEffect(() => {
    if (visible) void loadStats()
  }, [visible, loadStats])

  const totalActive = Object.values(active).reduce((n, l) => n + l.length, 0)

  return (
    <div className="overview">
      <section>
        {closed.some((id) => profiles.some((p) => p.id === id)) && (
          <div className="ov-closed">
            <span className="muted small">Tab đã đóng:</span>
            {profiles
              .filter((p) => closed.includes(p.id))
              .map((p) => (
                <button key={p.id} className="ov-reopen" style={{ ['--c' as string]: p.color }} onClick={() => onReopen(p.id)} title={`Mở lại tab ${p.name}`}>
                  <span className="dot" /> {p.name} <span className="muted small">{p.account ?? ''}</span> ↗
                </button>
              ))}
          </div>
        )}
        <div className="ov-head">
          <h2>Đang hoạt động</h2>
          <span className="muted small">{totalActive} session đang chạy hoặc chờ bạn · 24 giờ qua</span>
        </div>
        <div className="ov-cards">
          {profiles.map((p) => {
            const list = active[p.id] ?? []
            const running = list.filter((s) => s.status === 'running').length
            return (
              <div key={p.id} className="ov-card" style={{ ['--c' as string]: p.color }}>
                <div className="ov-card-head">
                  <span className="dot" />
                  <b>{p.name}</b>
                  <span className="muted small grow">{p.account ?? 'chưa đăng nhập'}</span>
                  <span className="st running small">● {running}</span>
                  <span className="st waiting small">● {list.length - running}</span>
                  {closed.includes(p.id) ? (
                    <button className="primary small-btn" onClick={() => onReopen(p.id)} title="Mở lại tab của profile này">
                      Mở lại tab
                    </button>
                  ) : (
                    <button className="small-btn" onClick={() => onReopen(p.id)} title="Chuyển tới tab của profile này">
                      Tới tab
                    </button>
                  )}
                  <button
                    className="small-btn link-btn"
                    title="Xoá profile này"
                    onClick={async () => {
                      if (await deleteProfileFlow(p)) onDeleted()
                    }}
                  >
                    Xoá
                  </button>
                </div>
                {list.length === 0 && <div className="muted small pad">Không có session nào đang hoạt động.</div>}
                <ul className="sessions">
                  {list.map((s) => (
                    <li key={s.filePath} className="session" onClick={() => onOpen(p.id, s)} title={`${s.title}\n${s.cwd}\nBấm để mở`}>
                      <span className={'st-dot ' + s.status} title={STATUS_LABEL[s.status]} />
                      <div className="s-main">
                        <div className="s-title">{s.title}</div>
                        <div className="s-meta">
                          <span>{baseName(s.cwd) || '—'}</span>
                          <span className="src">{s.source}</span>
                          <span>{STATUS_LABEL[s.status]}</span>
                          <span>{timeAgo(s.updatedAt)}</span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      </section>

      <section>
        <div className="ov-head">
          <h2>Token đã dùng</h2>
          <div className="seg">
            {STAT_DAYS.map((d) => (
              <button key={d} className={d === days ? 'on' : ''} onClick={() => setDays(d)}>
                {d} ngày
              </button>
            ))}
          </div>
          <button className="icon" title="Tính lại" disabled={loadingStats} onClick={() => void loadStats()}>
            ↻
          </button>
          {loadingStats && <span className="muted small">Đang đọc file session…</span>}
        </div>
        <p className="muted small ov-note">
          Đếm từ file session trên máy (gồm cả agent phụ). Không hiện chi phí: gói Pro/Max không tính tiền theo token, và file
          session không ghi giá.
        </p>
        <div className="ov-cards">
          {profiles.map((p) => (
            <StatsCard key={p.id} profile={p} stats={stats[p.id]} />
          ))}
        </div>
      </section>
    </div>
  )
}

function StatsCard({ profile, stats }: { profile: ProfileInfo; stats?: ProfileStats | { error: string } }) {
  const [hover, setHover] = useState<number | null>(null)
  if (!stats) {
    return (
      <div className="ov-card" style={{ ['--c' as string]: profile.color }}>
        <CardHead profile={profile} />
        <div className="muted small pad">Đang tính…</div>
      </div>
    )
  }
  if ('error' in stats) {
    return (
      <div className="ov-card" style={{ ['--c' as string]: profile.color }}>
        <CardHead profile={profile} />
        <div className="error small">{stats.error}</div>
      </div>
    )
  }

  const t = stats.total
  const max = Math.max(1, ...stats.days.map((d) => totalTokens(d.counts)))
  const today = stats.days[stats.days.length - 1]
  const shown = hover != null ? stats.days[hover] : null

  return (
    <div className="ov-card" style={{ ['--c' as string]: profile.color }}>
      <CardHead profile={profile} />
      <div className="ov-tiles">
        <Tile label="Tổng" value={formatTokens(totalTokens(t))} />
        <Tile label="Hôm nay" value={formatTokens(totalTokens(today.counts))} />
        <Tile label="Output" value={formatTokens(t.output)} />
        <Tile label="Session" value={String(stats.sessions)} />
      </div>

      {/* biểu đồ cột: tổng token mỗi ngày */}
      <div className="ov-chart-wrap">
        <div className="ov-tip small">
          {shown ? (
            <>
              <b>{fmtDay(shown.day)}</b> · {formatTokens(totalTokens(shown.counts))} token · {shown.counts.calls} lượt gọi
              <span className="muted">
                {' '}
                (input {formatTokens(shown.counts.input)}, ghi cache {formatTokens(shown.counts.cacheWrite)}, đọc cache{' '}
                {formatTokens(shown.counts.cacheRead)}, output {formatTokens(shown.counts.output)})
              </span>
            </>
          ) : (
            <span className="muted">Rê chuột lên cột để xem chi tiết từng ngày · cao nhất {formatTokens(max)}</span>
          )}
        </div>
        <div className="ov-chart" onMouseLeave={() => setHover(null)} role="img" aria-label={`Token mỗi ngày, ${stats.days.length} ngày`}>
          {stats.days.map((d, i) => {
            const v = totalTokens(d.counts)
            return (
              <div key={d.day} className={'ov-col' + (hover === i ? ' on' : '')} onMouseEnter={() => setHover(i)}>
                <div className="ov-bar" style={{ height: v ? `${Math.max(2, (v / max) * 100)}%` : 0 }} />
              </div>
            )
          })}
        </div>
        <div className="ov-axis muted small">
          <span>{fmtDay(stats.days[0].day)}</span>
          <span>hôm nay</span>
        </div>
      </div>

      {stats.models.length > 0 ? (
        <table className="ov-table">
          <thead>
            <tr>
              <th>Model</th>
              <th>Lượt</th>
              <th>Input</th>
              <th title="Input ghi vào cache">Ghi cache</th>
              <th title="Input đọc từ cache">Đọc cache</th>
              <th>Output</th>
            </tr>
          </thead>
          <tbody>
            {stats.models.map((m) => (
              <tr key={m.model}>
                <td title={m.model}>{m.model}</td>
                <td>{m.counts.calls.toLocaleString('vi-VN')}</td>
                <td>{formatTokens(m.counts.input)}</td>
                <td>{formatTokens(m.counts.cacheWrite)}</td>
                <td>{formatTokens(m.counts.cacheRead)}</td>
                <td>{formatTokens(m.counts.output)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="muted small">Chưa dùng token nào trong khoảng này.</div>
      )}
    </div>
  )
}

function CardHead({ profile }: { profile: ProfileInfo }) {
  return (
    <div className="ov-card-head">
      <span className="dot" />
      <b>{profile.name}</b>
      <span className="muted small grow">
        {profile.provider} · {profile.account ?? 'chưa đăng nhập'}
      </span>
    </div>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="ov-tile">
      <div className="muted small">{label}</div>
      <b>{value}</b>
    </div>
  )
}

const fmtDay = (d: string) => {
  const [, m, day] = d.split('-')
  return `${day}/${m}`
}
