import { useEffect, useRef, useState } from 'react'
import type { ModelOption } from '@shared/chat'
import { api } from '../api'

interface Props {
  profileId: string
  chatId: string
  /** Model đang chọn trong khung (alias/id), undefined = mặc định. */
  value?: string
  /** Model thật của phiên đang chạy (từ CLI). */
  activeModel?: string
  defaultModel?: string
  onChange(model: string | undefined): void
}

/** Nút hiện model + menu chọn model (danh sách lấy từ Claude Code theo gói của tài khoản). */
export function ModelMenu({ profileId, chatId, value, activeModel, defaultModel, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [list, setList] = useState<ModelOption[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    if (list === null && !loading) {
      setLoading(true)
      setError('')
      api
        .chatModels(profileId, chatId)
        .then(setList, (e) => setError(String((e as Error).message ?? e)))
        .finally(() => setLoading(false))
    }
    const onDown = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const chosen = value ? list?.find((m) => m.value === value)?.displayName ?? value : undefined
  const label = chosen ?? activeModel ?? defaultModel ?? 'mặc định'

  const pick = (m: string | undefined) => {
    setOpen(false)
    if (m !== value) onChange(m)
  }

  return (
    <div className="model-anchor" ref={box}>
      <button
        className={'model-badge' + (open ? ' on' : '')}
        title={value ? 'Model đã chọn cho khung này (bấm để đổi)' : 'Model mặc định của profile (bấm để đổi)'}
        onClick={() => setOpen((v) => !v)}
      >
        ◆ {label} ▾
      </button>
      {open && (
        <div className="model-pop">
          <div className="muted small">Model cho khung này</div>
          {loading && <div className="muted small">Đang hỏi Claude Code… (vài giây)</div>}
          {error && <div className="error small">Không tải được danh sách model: {error}</div>}
          {list && list.length === 0 && <div className="muted small">Không có model nào để chọn.</div>}
          {list?.map((m) => {
            const on = value ? m.value === value : m.value === 'default'
            return (
              <button key={m.value} className={'model-opt' + (on ? ' on' : '')} onClick={() => pick(m.value === 'default' ? undefined : m.value)}>
                <span>
                  {on ? '● ' : ''}
                  <b>{m.displayName}</b> <span className="muted small">{m.value}</span>
                </span>
                {m.description && <span className="muted small">{m.description}</span>}
              </button>
            )
          })}
          {value && list && !list.some((m) => m.value === value) && (
            <button className="model-opt" onClick={() => pick(undefined)}>
              Về mặc định
            </button>
          )}
        </div>
      )}
    </div>
  )
}
