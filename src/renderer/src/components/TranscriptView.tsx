import { useEffect, useRef, useState } from 'react'
import type { Transcript } from '@shared/types'
import { api } from '../api'
import { ToolCard, splitToolText } from './ToolCard'
import { Markdown } from './Markdown'

interface Props {
  profileId: string
  filePath: string
  version: number
  /** Khung đang hiển thị ở chế độ Xem. */
  active: boolean
}

export function TranscriptView({ profileId, filePath, version, active }: Props) {
  const [data, setData] = useState<Transcript | null>(null)
  const [error, setError] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  useEffect(() => {
    let alive = true
    api
      .readTranscript(profileId, filePath)
      .then((t) => alive && (setData(t), setError('')))
      .catch((e) => alive && setError(String(e)))
    return () => {
      alive = false
    }
  }, [profileId, filePath, version])

  const toBottom = () => {
    const el = box.current
    if (el) el.scrollTop = el.scrollHeight
  }

  // có tin mới: tự cuộn xuống nếu người dùng đang ở cuối
  useEffect(() => {
    if (active && stick.current) toBottom()
  }, [data, active])

  // mỗi lần mở chế độ Xem (hoặc khung/tab hiện lại): luôn xuống cuối.
  // Phần tử bị display:none mất vị trí cuộn, nên phải đặt lại sau khi đã hiển thị.
  useEffect(() => {
    if (!active) return
    stick.current = true
    const id = requestAnimationFrame(toBottom)
    return () => cancelAnimationFrame(id)
  }, [active])

  return (
    <div
      className="transcript"
      ref={box}
      onScroll={(e) => {
        const el = e.currentTarget
        if (!active || el.clientHeight === 0) return // đang ẩn: bỏ qua sự kiện cuộn giả
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
      }}
    >
      {error && <div className="error">{error}</div>}
      {data && data.total > data.items.length && (
        <div className="muted pad">… {data.total - data.items.length} tin nhắn cũ hơn được ẩn</div>
      )}
      {data?.items.map((it, i) =>
        it.role === 'tool' ? (
          <ToolCard key={i} {...splitToolText(it.text)} file={it.file} line={it.line} diff={it.diff} />
        ) : (
          <div key={i} className={'msg ' + it.role}>
            <div className="who">{it.role === 'user' ? 'Bạn' : 'Agent'}</div>
            <div className="text">{it.role === 'assistant' ? <Markdown text={it.text} /> : it.text}</div>
          </div>
        )
      )}
    </div>
  )
}
