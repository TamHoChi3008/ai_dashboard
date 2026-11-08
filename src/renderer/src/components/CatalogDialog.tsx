import { useEffect, useMemo, useState } from 'react'
import type { CatalogItem, ProfileInfo } from '@shared/types'
import { api } from '../api'
import { alertDialog } from '../dialogs'

const KINDS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'plugin', label: 'Plugin' },
  { value: 'skill', label: 'Skill' },
  { value: 'command', label: 'Command' },
  { value: 'agent', label: 'Agent' }
] as const
type KindFilter = (typeof KINDS)[number]['value']

interface Props {
  profile: ProfileInfo
  onClose(): void
}

/** Tìm plugin / skill / command / agent đã cài cho một profile. */
export function CatalogDialog({ profile, onClose }: Props) {
  const [items, setItems] = useState<CatalogItem[] | null>(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [kind, setKind] = useState<KindFilter>('all')

  useEffect(() => {
    api.listCatalog(profile.id).then(setItems, (e) => setError(String(e)))
  }, [profile.id])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items?.length ?? 0 }
    for (const it of items ?? []) c[it.kind] = (c[it.kind] ?? 0) + 1
    return c
  }, [items])

  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean)
    return (items ?? []).filter((it) => {
      if (kind !== 'all' && it.kind !== kind) return false
      const hay = `${it.name} ${it.description} ${it.source}`.toLowerCase()
      return words.every((w) => hay.includes(w))
    })
  }, [items, q, kind])

  return (
    <div className="modal-bg" onMouseDown={onClose}>
      <div className="modal catalog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="row">
          <h3 className="grow">Plugin & Skill · {profile.name}</h3>
          <button className="icon" onClick={onClose} title="Đóng">
            ✕
          </button>
        </div>
        <input autoFocus placeholder="Tìm theo tên, mô tả, nguồn…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="chips">
          {KINDS.map((k) => (
            <button key={k.value} className={kind === k.value ? 'on' : ''} onClick={() => setKind(k.value)}>
              {k.label} <span className="muted">{counts[k.value] ?? 0}</span>
            </button>
          ))}
        </div>
        {error && <div className="error">{error}</div>}
        <ul className="catalog-list">
          {items === null && !error && <li className="muted pad">Đang quét…</li>}
          {items !== null && shown.length === 0 && <li className="muted pad">Không tìm thấy.</li>}
          {shown.map((it) => (
            <li key={it.kind + it.path} className={it.enabled ? '' : 'disabled'}>
              <div className="cat-head">
                <span className={'kind ' + it.kind}>{it.kind}</span>
                <b className="cat-name">{it.name}</b>
                {it.version && (
                  <span className="muted small" title={it.version}>
                    {/^\d+\.\d+/.test(it.version) ? 'v' + it.version : '#' + it.version.slice(0, 7)}
                  </span>
                )}
                {!it.enabled && <span className="muted small">(đang tắt)</span>}
                <span className="grow" />
                <span className="muted small">{it.source}</span>
                <button
                  className="icon"
                  title={`Mở ${it.kind === 'plugin' ? 'thư mục' : 'file'}\n${it.path}`}
                  onClick={() => api.openCatalogPath(it.path).catch((e) => alertDialog(String(e)))}
                >
                  ↗
                </button>
              </div>
              {it.description && <div className="cat-desc">{it.description}</div>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
