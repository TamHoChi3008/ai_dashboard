import { useEffect, useRef, useState } from 'react'
import type { UpdateState } from '@shared/types'
import { api } from '../api'

const RELEASES = 'https://github.com/TamHoChi3008/ai_dashboard/releases'

/** Nút phiên bản ở góc phải thanh tab: kiểm tra, tải và cài bản mới từ GitHub Releases. */
export function UpdateButton() {
  const [s, setS] = useState<UpdateState | null>(null)
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (typeof api.getUpdateState !== 'function') return
    api.getUpdateState().then(setS, () => undefined)
    return api.onUpdateState(setS)
  }, [])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  if (!s) return null
  const hasNew = s.status === 'available' || s.status === 'downloading' || s.status === 'downloaded'

  return (
    <div className="update-anchor" ref={box}>
      <button
        className={'update-btn' + (hasNew ? ' has-new' : '')}
        title={hasNew ? `Có bản mới v${s.version}` : 'Phiên bản / kiểm tra cập nhật'}
        onClick={() => setOpen((v) => !v)}
      >
        v{s.current}
        {hasNew && <span className="update-dot">● Cập nhật</span>}
      </button>
      {open && (
        <div className="update-pop">
          <div className="row">
            <b className="grow">AI Board v{s.current}</b>
            <a href={RELEASES} className="muted small" title="Xem các bản đã phát hành trên GitHub">
              Releases ↗
            </a>
          </div>
          <Body s={s} />
        </div>
      )}
    </div>
  )
}

function Body({ s }: { s: UpdateState }) {
  const check = (
    <button onClick={() => void api.checkForUpdate()} disabled={s.status === 'checking'}>
      {s.status === 'checking' ? 'Đang kiểm tra…' : 'Kiểm tra cập nhật'}
    </button>
  )
  switch (s.status) {
    case 'unsupported':
      return (
        <div className="muted small">
          Bản dev (npm run dev) không tự cập nhật. Dùng <code>git pull</code> để lấy code mới, hoặc cài bản .exe để dùng tự cập nhật.
        </div>
      )
    case 'idle':
    case 'checking':
      return check
    case 'latest':
      return (
        <>
          <div className="small">✔ Đang dùng bản mới nhất.</div>
          {check}
        </>
      )
    case 'error':
      return (
        <>
          <div className="error small">Không kiểm tra / tải được: {s.error}</div>
          {check}
        </>
      )
    case 'available':
      return (
        <>
          <div className="small">
            Có bản mới <b>v{s.version}</b>
            {s.releaseDate && <span className="muted"> · {new Date(s.releaseDate).toLocaleDateString('vi-VN')}</span>}
          </div>
          {s.notes && <div className="update-notes small">{s.notes}</div>}
          <button className="primary" onClick={() => void api.downloadUpdate()}>
            Tải bản v{s.version}
          </button>
        </>
      )
    case 'downloading':
      return (
        <>
          <div className="small">
            Đang tải v{s.version}… {s.percent ?? 0}%
          </div>
          <div className="bar">
            <div className="fill low" style={{ width: `${s.percent ?? 0}%` }} />
          </div>
        </>
      )
    case 'downloaded':
      return (
        <>
          <div className="small">
            Đã tải xong <b>v{s.version}</b>. Khởi động lại để cài (chat / terminal đang chạy sẽ dừng; bố cục khung được giữ).
          </div>
          <button className="primary" onClick={() => void api.installUpdate()}>
            Khởi động lại để cài
          </button>
          <div className="muted small">Hoặc để đó: bản mới sẽ được cài khi bạn tắt app.</div>
        </>
      )
  }
}
