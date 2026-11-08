import { useEffect, useRef, useState } from 'react'
import type { UsageInfo } from '@shared/types'
import { api } from '../api'

interface Props {
  profileId: string
  chatId: string
  onModel(model: string): void
  onClose(): void
}

function resetText(iso: string | null): string {
  if (!iso) return ''
  const ms = Date.parse(iso) - Date.now()
  if (!(ms > 0)) return 'đang reset'
  const h = Math.floor(ms / 3600_000)
  const m = Math.floor((ms % 3600_000) / 60_000)
  const when = new Date(iso).toLocaleString('vi-VN', { weekday: 'short', hour: '2-digit', minute: '2-digit' })
  return `reset sau ${h >= 24 ? `${Math.floor(h / 24)} ngày ${h % 24} giờ` : `${h} giờ ${m} phút`} (${when})`
}

const level = (u: number) => (u >= 90 ? 'high' : u >= 70 ? 'mid' : 'low')

/** Popup usage của gói Claude: thanh phiên 5 giờ và tuần (kèm các thanh theo model nếu có). */
export function UsagePopover({ profileId, chatId, onModel, onClose }: Props) {
  const [info, setInfo] = useState<UsageInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  const load = async (force: boolean) => {
    setLoading(true)
    try {
      const r = await api.chatUsage(profileId, chatId, force)
      setInfo(r)
      if (r.defaultModel) onModel(r.defaultModel)
    } catch (e) {
      setInfo({ available: false, windows: [], fetchedAt: Date.now(), source: 'api', error: String(e) })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load(false)
    // bấm ra ngoài → đóng
    const onDown = (e: MouseEvent) => !box.current?.contains(e.target as Node) && onClose()
    const t = setTimeout(() => document.addEventListener('mousedown', onDown), 0)
    return () => {
      clearTimeout(t)
      document.removeEventListener('mousedown', onDown)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="usage-pop" ref={box}>
      <div className="row">
        <b className="grow">Usage{info?.subscription ? ` · gói ${info.subscription}` : ''}</b>
        <button className="icon" title="Làm mới" disabled={loading} onClick={() => void load(true)}>
          ↻
        </button>
      </div>
      {loading && !info && <div className="muted small">Đang hỏi Claude Code… (vài giây)</div>}
      {info?.error && info.windows.length === 0 && <div className="error small">Không lấy được usage: {info.error}</div>}
      {info && !info.error && info.windows.length === 0 && (
        <div className="muted small">
          {info.available ? 'Chưa có số liệu.' : 'Tài khoản này không có giới hạn theo gói (VD: dùng API key).'}
        </div>
      )}
      {info?.windows.map((w) => {
        const u = Math.max(0, Math.min(100, w.utilization ?? 0))
        return (
          <div key={w.key} className="usage-row">
            <div className="row">
              <span className="grow">{w.label}</span>
              <b>{w.utilization == null ? '—' : `${Math.round(w.utilization)}%`}</b>
            </div>
            <div className="bar">
              <div className={'fill ' + level(u)} style={{ width: `${u}%` }} />
            </div>
            <div className="muted small">{resetText(w.resetsAt)}</div>
          </div>
        )
      })}
      {info && info.windows.length > 0 && (
        <div className="muted small">
          {info.source === 'events' ? 'Ước tính từ các lượt chat gần nhất · ' : ''}
          cập nhật {new Date(info.fetchedAt).toLocaleTimeString('vi-VN')}
        </div>
      )}
    </div>
  )
}
