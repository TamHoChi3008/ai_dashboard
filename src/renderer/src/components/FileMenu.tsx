import { useEffect, useRef } from 'react'

interface Props {
  items: string[]
  selected: number
  loading: boolean
  total: number
  onPick(path: string): void
  onHover(i: number): void
}

/** Menu chọn file khi gõ "@" (dùng chung kiểu dáng với menu slash). */
export function FileMenu({ items, selected, loading, total, onPick, onHover }: Props) {
  const list = useRef<HTMLUListElement>(null)
  useEffect(() => {
    list.current?.children[selected]?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  return (
    <div className="slash-menu file-menu">
      {loading && <div className="muted small pad">Đang quét file trong thư mục…</div>}
      {!loading && items.length === 0 && <div className="muted small pad">Không có file phù hợp.</div>}
      <ul ref={list}>
        {items.map((p, i) => {
          const cut = p.lastIndexOf('/')
          return (
            <li
              key={p}
              className={i === selected ? 'sel' : ''}
              onMouseDown={(e) => {
                e.preventDefault() // giữ focus ở ô nhập
                onPick(p)
              }}
              onMouseEnter={() => onHover(i)}
            >
              <div className="slash-head">
                <b>{p.slice(cut + 1)}</b>
                <span className="muted small">{cut > 0 ? p.slice(0, cut) : ''}</span>
              </div>
            </li>
          )
        })}
      </ul>
      <div className="slash-foot muted small">
        {total > 0 && `${total} file · `}↑↓ chọn · Enter/Tab chèn · Esc đóng
      </div>
    </div>
  )
}
