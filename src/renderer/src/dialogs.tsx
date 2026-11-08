import { useEffect, useRef, useState } from 'react'

/**
 * Hộp thoại trong app thay cho window.confirm / window.alert.
 * Hộp thoại gốc của Electron chặn renderer và có thể nằm sau cửa sổ (app trông như trắng/treo).
 */
interface DialogButton {
  value: string
  label: string
  kind?: 'primary' | 'danger' | 'plain'
}

interface Request {
  message: string
  buttons: DialogButton[]
  /** Nút nhận focus khi mở. */
  focus?: string
  resolve(value: string | null): void
}

let push: ((r: Request) => void) | null = null
const queue: Request[] = []

/** Hộp thoại nhiều lựa chọn; trả về value của nút được bấm, null nếu đóng (Esc / bấm ra ngoài). */
export function choiceDialog(message: string, buttons: DialogButton[], focus?: string): Promise<string | null> {
  return new Promise((resolve) => {
    const req = { message, buttons, focus, resolve }
    if (push) push(req)
    else queue.push(req) // DialogHost chưa mount
  })
}

export function confirmDialog(message: string, opts: { okLabel?: string; danger?: boolean } = {}): Promise<boolean> {
  return choiceDialog(
    message,
    [
      { value: 'cancel', label: 'Huỷ' },
      { value: 'ok', label: opts.okLabel ?? 'Đồng ý', kind: opts.danger ? 'danger' : 'primary' }
    ],
    'ok'
  ).then((v) => v === 'ok')
}

export function alertDialog(message: string): Promise<void> {
  return choiceDialog(message, [{ value: 'ok', label: 'OK', kind: 'primary' }], 'ok').then(() => undefined)
}

/** Đặt một lần ở gốc App. */
export function DialogHost() {
  const [items, setItems] = useState<Request[]>([])
  const focusBtn = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    push = (r) => setItems((cur) => [...cur, r])
    if (queue.length) setItems((cur) => [...cur, ...queue.splice(0)])
    return () => {
      push = null
    }
  }, [])

  const cur = items[0]
  useEffect(() => {
    focusBtn.current?.focus()
  }, [cur])

  if (!cur) return null
  const close = (value: string | null) => {
    cur.resolve(value)
    setItems((list) => list.slice(1))
  }

  return (
    <div
      className="modal-bg top"
      onMouseDown={() => close(null)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') close(null)
      }}
    >
      <div className="modal dialog" role="alertdialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="dialog-msg">{cur.message}</div>
        <div className="row end">
          <span className="grow" />
          {cur.buttons.map((b) => (
            <button
              key={b.value}
              ref={b.value === cur.focus ? focusBtn : undefined}
              className={b.kind === 'danger' ? 'danger-fill' : b.kind === 'primary' ? 'primary' : ''}
              onClick={() => close(b.value)}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
