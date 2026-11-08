import { useEffect, useRef, useState } from 'react'
import { MAX_NAME } from '@shared/sessionFlags'

interface Props {
  value: string
  placeholder?: string
  /** Lưu: Enter hoặc bấm ra ngoài. */
  onSave(v: string): void
  /** Huỷ: Esc. */
  onCancel(): void
}

/** Ô sửa tên tại chỗ (đổi tên session ở sidebar / thanh tiêu đề khung). */
export function InlineEdit({ value, placeholder, onSave, onCancel }: Props) {
  const [v, setV] = useState(value)
  const ref = useRef<HTMLInputElement>(null)
  const done = useRef(false)

  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])

  const finish = (save: boolean) => {
    if (done.current) return
    done.current = true
    if (save) onSave(v)
    else onCancel()
  }

  return (
    <input
      ref={ref}
      className="inline-edit"
      value={v}
      maxLength={MAX_NAME}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') finish(true)
        if (e.key === 'Escape') finish(false)
      }}
      onBlur={() => finish(true)}
    />
  )
}
