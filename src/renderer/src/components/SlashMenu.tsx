import { useEffect, useRef } from 'react'
import type { SlashCommandInfo } from '@shared/slash'

interface Props {
  items: SlashCommandInfo[]
  selected: number
  loading: boolean
  error: string
  onPick(c: SlashCommandInfo): void
  onHover(i: number): void
}

function badge(c: SlashCommandInfo): string {
  if (c.builtin) return 'built-in'
  return c.name.includes(':') ? c.name.split(':')[0] : 'skill'
}

/** Menu gợi ý slash command, hiện phía trên ô nhập khi gõ "/". */
export function SlashMenu({ items, selected, loading, error, onPick, onHover }: Props) {
  const list = useRef<HTMLUListElement>(null)

  // giữ dòng đang chọn trong tầm nhìn khi dùng phím mũi tên
  useEffect(() => {
    list.current?.children[selected]?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  return (
    <div className="slash-menu">
      {loading && <div className="muted small pad">Đang tải danh sách command…</div>}
      {error && <div className="error small pad">Không tải được command: {error}</div>}
      {!loading && !error && items.length === 0 && <div className="muted small pad">Không có command phù hợp.</div>}
      <ul ref={list}>
        {items.map((c, i) => (
          <li
            key={c.name + i}
            className={i === selected ? 'sel' : ''}
            // mousedown thay vì click để ô nhập không mất focus
            onMouseDown={(e) => {
              e.preventDefault()
              onPick(c)
            }}
            onMouseEnter={() => onHover(i)}
          >
            <div className="slash-head">
              <b>/{c.name}</b>
              {c.argumentHint && <span className="muted small">{c.argumentHint}</span>}
              {c.aliases?.length ? <span className="muted small">({c.aliases.map((a) => '/' + a).join(', ')})</span> : null}
              <span className="grow" />
              <span className={'slash-badge' + (c.builtin ? ' builtin' : '')}>{badge(c)}</span>
            </div>
            {c.description && <div className="slash-desc">{c.description.replace(/^\([^)]*\)\s*/, '')}</div>}
          </li>
        ))}
      </ul>
      <div className="slash-foot muted small">↑↓ chọn · Enter/Tab điền · Esc đóng</div>
    </div>
  )
}
