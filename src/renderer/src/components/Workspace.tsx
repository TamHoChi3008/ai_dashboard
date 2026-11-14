import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ProfileInfo, PtySpawnRequest, SessionSummary, TrashedSession } from '@shared/types'
import { api, baseName, STATUS_LABEL, timeAgo } from '../api'
import type { FileVersions } from '../App'
import { Pane, PaneState } from './Pane'
import { swapById } from '@shared/order'
import { alertDialog, choiceDialog, confirmDialog } from '../dialogs'
import { applyNames, arrangeSessions, emptyFlags, toggleFlag, type FlagName, type SessionFlags } from '@shared/sessionFlags'
import { InlineEdit } from './InlineEdit'
import { sanitizeLayout, toSavedLayout } from '@shared/layout'

interface Props {
  profile: ProfileInfo
  visible: boolean
  tick: number
  fileVersions: FileVersions
  onEditProfile(): void
  /** Mở một session (từ tab tổng quan); n đổi mỗi lần yêu cầu. */
  openRequest?: { session: SessionSummary; n: number }
  /** Báo số khung đang chạy Chat/Terminal (App hỏi lại trước khi đóng tab). */
  onLiveChange?(n: number): void
}

const DAY_OPTIONS = [1, 3, 7, 30, 0]
const SIDEBAR_DEFAULT = 310
const SIDEBAR_MIN = 200
const SIDEBAR_KEY = 'aiboard.sidebarWidth'

/** Độ rộng sidebar tối đa: chừa ít nhất 360px cho vùng khung. */
const sidebarMax = () => Math.max(SIDEBAR_MIN, Math.min(700, window.innerWidth - 360))
const clampSidebar = (w: number) => Math.round(Math.min(sidebarMax(), Math.max(SIDEBAR_MIN, w)))

function readSidebarWidth(): number {
  try {
    const v = Number(localStorage.getItem(SIDEBAR_KEY))
    return v > 0 ? clampSidebar(v) : SIDEBAR_DEFAULT
  } catch {
    return SIDEBAR_DEFAULT
  }
}
const MAX_PANES = 6

export function Workspace({ profile, visible, tick, fileVersions, onEditProfile, openRequest, onLiveChange }: Props) {
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [days, setDays] = useState(7)
  const [q, setQ] = useState('')
  const [panes, setPanes] = useState<PaneState[]>([])
  const [focused, setFocused] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [clock, setClock] = useState(0)
  const [flags, setFlags] = useState<SessionFlags>(emptyFlags)
  const [showHidden, setShowHidden] = useState(false)
  const [sideWidth, setSideWidth] = useState(readSidebarWidth)
  const [resizing, setResizing] = useState(false)

  // kéo thanh chia để đổi độ rộng sidebar; lưu lại cho lần sau (dùng chung mọi profile)
  const startResize = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = sideWidth
    let last = startW
    setResizing(true)
    const move = (ev: PointerEvent) => {
      last = clampSidebar(startW + ev.clientX - startX)
      setSideWidth(last)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setResizing(false)
      try {
        localStorage.setItem(SIDEBAR_KEY, String(last))
      } catch {
        /* không lưu được thì thôi */
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  const resetWidth = () => {
    setSideWidth(SIDEBAR_DEFAULT)
    try {
      localStorage.removeItem(SIDEBAR_KEY)
    } catch {
      /* bỏ qua */
    }
  }

  // cửa sổ thu nhỏ → giữ sidebar trong giới hạn
  useEffect(() => {
    const onResize = () => setSideWidth((w) => clampSidebar(w))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  // bố cục khung đã nạp xong chưa (chưa nạp thì không lưu, tránh ghi đè bố cục cũ bằng danh sách rỗng)
  const [restored, setRestored] = useState(false)

  // mở lại các khung của lần trước
  useEffect(() => {
    let cancelled = false
    const load = typeof api.getLayout === 'function' ? api.getLayout(profile.id) : Promise.resolve(null)
    load
      .then((raw) => {
        if (cancelled) return
        const layout = sanitizeLayout(raw, MAX_PANES)
        if (!layout) return
        if (layout.days !== undefined && DAY_OPTIONS.includes(layout.days)) setDays(layout.days)
        const restoredPanes: PaneState[] = layout.panes.map((p) => ({ ...p, key: crypto.randomUUID() }))
        setPanes(restoredPanes)
        const f = layout.focused !== undefined ? restoredPanes[layout.focused] : undefined
        if (f) setFocused(f.key)
      })
      .catch(() => undefined)
      .finally(() => !cancelled && setRestored(true))
    return () => {
      cancelled = true
    }
  }, [profile.id])

  // lưu bố cục mỗi khi khung thay đổi (gom các thay đổi liên tiếp)
  useEffect(() => {
    if (!restored || typeof api.saveLayout !== 'function') return
    const t = setTimeout(() => api.saveLayout(profile.id, toSavedLayout(panes, focused, days)), 400)
    return () => clearTimeout(t)
  }, [restored, panes, focused, days, profile.id])

  useEffect(() => {
    api.getSessionFlags(profile.id).then(setFlags, () => undefined)
  }, [profile.id])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setSessions(await api.listSessions(profile.id, days))
    } finally {
      setLoading(false)
    }
  }, [profile.id, days])

  useEffect(() => {
    void load()
  }, [load, tick])

  // trạng thái phụ thuộc thời gian → làm mới định kỳ
  useEffect(() => {
    const t = setInterval(() => {
      setClock((c) => c + 1)
      if (visible) void load()
    }, 30_000)
    return () => clearInterval(t)
  }, [load, visible])

  // tiêu đề hiển thị = tên đặt trong app (nếu có), không thì tiêu đề gốc
  const named = useMemo(() => applyNames(sessions, flags), [sessions, flags])
  const originalTitle = (id: string) => sessions.find((x) => x.id === id)?.title

  // ---- đổi tên ----
  const [renaming, setRenaming] = useState('')
  const rename = async (s: SessionSummary, name: string) => {
    setRenaming('')
    if (name.trim() === s.title) return // không đổi gì
    try {
      setFlags(await api.renameSession(profile.id, s.filePath, name))
      // CLI đang chạy trong khung chat còn giữ tên cũ trong bộ nhớ → đóng để lần gửi sau đọc lại từ file
      for (const p of panes) if (p.chat && sessionOf(p)?.filePath === s.filePath) api.chatSuspend(p.key)
      await load()
    } catch (e) {
      void alertDialog(`Không đổi tên được: ${String((e as Error).message ?? e)}`)
    }
  }

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return named
    return named.filter((x) => (x.title + ' ' + x.cwd + ' ' + x.id).toLowerCase().includes(s))
  }, [named, q])

  const groups = useMemo(() => arrangeSessions(filtered, flags), [filtered, flags])

  // không đếm session đã ẩn
  const counts = useMemo(() => {
    const c = { running: 0, waiting: 0, idle: 0 }
    const hidden = new Set(flags.hidden)
    for (const s of sessions) if (!hidden.has(s.id)) c[s.status]++
    return c
  }, [sessions, flags])

  const setFlag = async (s: SessionSummary, flag: FlagName, on: boolean) => {
    setFlags((f) => toggleFlag(f, s.id, flag, on)) // cập nhật ngay trên giao diện
    try {
      setFlags(await api.setSessionFlag(profile.id, s.id, flag, on))
      if (flag === 'pinned') void load() // session ghim cũ hơn bộ lọc ngày cần tải thêm
    } catch {
      setFlags(await api.getSessionFlags(profile.id)) // lưu lỗi → lấy lại trạng thái thật
    }
  }

  const deleteSession = async (s: SessionSummary) => {
    if (s.status === 'running') {
      return alertDialog('Session này đang chạy. Hãy đợi agent làm xong (hoặc dừng nó) rồi mới xoá.')
    }
    const openHere = panes.filter((p) => sessionOf(p)?.filePath === s.filePath)
    const choice = await choiceDialog(
      `Xoá session "${s.title}"?\n${s.cwd}\n\n` +
        (openHere.length ? 'Khung đang mở session này sẽ được đóng.\n' : '') +
        'Nếu session còn mở trong VS Code, hãy đóng ở đó trước (chat tiếp sẽ tạo lại file).\n\n' +
        'Thùng rác: khôi phục được trong mục "Đã xoá gần đây" ở cuối danh sách; tự xoá vĩnh viễn sau 30 ngày.\nXoá vĩnh viễn: không khôi phục được.',
      [
        { value: 'trash', label: 'Chuyển vào Thùng rác', kind: 'primary' },
        { value: 'permanent', label: 'Xoá vĩnh viễn', kind: 'danger' },
        { value: 'cancel', label: 'Huỷ' }
      ],
      'trash'
    )
    if (choice !== 'trash' && choice !== 'permanent') return
    const keys = new Set(openHere.map((p) => p.key))
    setPanes((cur) => cur.filter((p) => !keys.has(p.key)))
    try {
      await api.deleteSession(profile.id, { filePath: s.filePath, title: s.title, cwd: s.cwd }, choice)
    } catch (e) {
      void alertDialog(`Không xoá được: ${String((e as Error).message ?? e)}`)
    }
    setFlags(await api.getSessionFlags(profile.id))
    void load()
    void loadTrash()
  }

  // ---- đã xoá gần đây (nằm trong Thùng rác Windows, tự xoá hẳn sau 30 ngày) ----
  const [trash, setTrash] = useState<TrashedSession[]>([])
  const [showTrash, setShowTrash] = useState(false)
  const loadTrash = useCallback(async () => {
    if (typeof api.listTrash !== 'function') return
    try {
      setTrash(await api.listTrash(profile.id))
    } catch {
      /* bỏ qua */
    }
  }, [profile.id])
  useEffect(() => {
    void loadTrash()
  }, [loadTrash, showTrash])

  const restore = async (t: TrashedSession) => {
    const r = await api.restoreTrash(t.trashId)
    if (!r.ok) {
      const msg =
        r.reason === 'exists'
          ? 'Chỗ cũ đã có file cùng tên (session đã được tạo lại, VD do chat tiếp trong VS Code). Không khôi phục để tránh ghi đè.'
          : r.reason === 'missing'
            ? 'Không còn trong Thùng rác của Windows (đã bị dọn). Đã bỏ khỏi danh sách.'
            : `Không khôi phục được: ${r.message ?? ''}`
      void alertDialog(msg)
    }
    void loadTrash()
    void load()
  }

  const purge = async (t: TrashedSession) => {
    const ok = await confirmDialog(`Xoá vĩnh viễn "${t.title}"?\nKhông khôi phục được nữa.`, { okLabel: 'Xoá vĩnh viễn', danger: true })
    if (!ok) return
    await api.purgeTrash(t.trashId)
    void loadTrash()
  }

  const renderTrashed = (t: TrashedSession) => {
    const daysLeft = Math.max(0, Math.ceil(30 - (Date.now() - t.deletedAt) / 86400_000))
    return (
      <li key={t.trashId} className="session is-hidden trashed" title={`${t.title}\n${t.cwd}\n${t.paths[0]}`}>
        <span className="st-dot idle" />
        <div className="s-main">
          <div className="s-title">{t.title || t.sessionId}</div>
          <div className="s-meta">
            <span>{baseName(t.cwd) || '—'}</span>
            <span>{timeAgo(t.deletedAt) === 'vừa xong' ? 'vừa xoá' : `xoá ${timeAgo(t.deletedAt)} trước`}</span>
            <span className={daysLeft <= 3 ? 'warn' : ''}>còn {daysLeft} ngày</span>
          </div>
        </div>
        <div className="s-actions">
          <button className="icon restore" title="Khôi phục về chỗ cũ" onClick={() => void restore(t)}>
            ↺
          </button>
          <button className="icon del" title="Xoá vĩnh viễn" onClick={() => void purge(t)}>
            <TrashIcon />
          </button>
        </div>
      </li>
    )
  }

  const renderSession = (s: SessionSummary, group: 'pinned' | 'normal' | 'hidden') => {
    const open = panes.some((p) => sessionOf(p)?.filePath === s.filePath)
    return (
      <li
        key={s.filePath}
        className={'session' + (open ? ' open' : '') + (group === 'hidden' ? ' is-hidden' : '')}
        onClick={() => openView(s)}
        title={`${s.title}${flags.names?.[s.id] ? `\n(tên gốc: ${originalTitle(s.id) ?? ''})` : ''}\n${s.cwd}\n${s.id}\nNhấp đúp vào tên để đổi tên`}
      >
        <span className={'st-dot ' + s.status} title={STATUS_LABEL[s.status]} />
        <div className="s-main">
          {renaming === s.id ? (
            <InlineEdit
              value={s.title}
              placeholder={originalTitle(s.id) ?? 'Tên session (để trống = tên gốc)'}
              onSave={(v) => void rename(s, v)}
              onCancel={() => setRenaming('')}
            />
          ) : (
            <div
              className="s-title"
              onDoubleClick={(e) => {
                e.stopPropagation()
                setRenaming(s.id)
              }}
            >
              {flags.names?.[s.id] && <span className="renamed" title="Tên đặt trong app">✎ </span>}
              {s.title}
            </div>
          )}
          <div className="s-meta">
            <span>{baseName(s.cwd) || '—'}</span>
            <span className="src">{s.source}</span>
            <span>{timeAgo(s.updatedAt)}</span>
          </div>
        </div>
        {/* stopPropagation: bấm nút không mở session */}
        <div className="s-actions" onClick={(e) => e.stopPropagation()}>
          {group === 'hidden' ? (
            <>
              <button className="icon" title="Hiện lại" onClick={() => void setFlag(s, 'hidden', false)}>
                ↩
              </button>
              <button className="icon del" title="Xoá session" onClick={() => void deleteSession(s)}>
                <TrashIcon />
              </button>
            </>
          ) : (
            <>
              <button
                className={'icon' + (group === 'pinned' ? ' on' : '')}
                title={group === 'pinned' ? 'Bỏ ghim' : 'Ghim lên đầu'}
                onClick={() => void setFlag(s, 'pinned', group !== 'pinned')}
              >
                📌
              </button>
              <button className="icon" title="Đổi tên (nhấp đúp vào tên cũng được)" onClick={() => setRenaming(s.id)}>
                ✎
              </button>
              <button className="icon" title="Ẩn (chuyển vào mục Đã ẩn)" onClick={() => void setFlag(s, 'hidden', true)}>
                ⊘
              </button>
              <button className="icon del" title="Xoá session" onClick={() => void deleteSession(s)}>
                <TrashIcon />
              </button>
            </>
          )}
        </div>
      </li>
    )
  }

  const addPane = (p: Omit<PaneState, 'key'>) => {
    if (panes.length >= MAX_PANES) {
      void alertDialog(`Tối đa ${MAX_PANES} khung. Đóng bớt một khung trước.`)
      return
    }
    const key = crypto.randomUUID()
    setPanes((cur) => [...cur, { ...p, key }])
    setFocused(key)
  }

  /** Session mà khung đang gắn: theo file, hoặc theo id mà khung chat vừa tạo. */
  const sessionOf = (p: PaneState): SessionSummary | undefined => {
    if (p.session) return named.find((s) => s.filePath === p.session!.filePath) ?? applyNames([p.session], flags)[0]
    if (p.sessionId) return named.find((s) => s.id === p.sessionId)
    return undefined
  }

  const openView = (s: SessionSummary) => {
    const existing = panes.find((p) => sessionOf(p)?.filePath === s.filePath)
    if (existing) return setFocused(existing.key)
    addPane({ session: s, mode: 'view' })
  }

  const newSession = async () => {
    const cwd = await api.pickFolder()
    if (!cwd) return
    const title = `Mới · ${baseName(cwd)}`
    if (profile.provider === 'claude') addPane({ mode: 'chat', chat: { cwd }, title })
    else addPane({ mode: 'term', spawn: { kind: 'new', cwd }, title })
  }

  const liveCount = panes.filter((p) => p.chat || p.spawn).length
  useEffect(() => {
    onLiveChange?.(liveCount)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveCount])

  // yêu cầu mở session từ tab tổng quan
  const lastReq = useRef(0)
  useEffect(() => {
    if (!openRequest || openRequest.n === lastReq.current || !restored) return
    lastReq.current = openRequest.n
    openView(openRequest.session)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequest, restored])

  const login = () => addPane({ mode: 'term', spawn: { kind: 'login' }, title: 'Đăng nhập' })

  const updatePane = (key: string, patch: Partial<PaneState>) =>
    setPanes((cur) => cur.map((p) => (p.key === key ? { ...p, ...patch } : p)))
  // đóng mọi khung; hỏi lại nếu có khung đang chạy chat/terminal (đóng sẽ dừng chúng)
  const closeAll = async () => {
    const live = panes.filter((p) => p.chat || p.spawn).length
    if (live > 0) {
      const ok = await confirmDialog(
        `Đóng tất cả ${panes.length} khung?\n${live} khung đang mở Chat/Terminal sẽ bị dừng (lượt agent đang trả lời sẽ bị ngắt). Lịch sử hội thoại vẫn giữ nguyên trong session.`,
        { okLabel: 'Đóng tất cả', danger: true }
      )
      if (!ok) return
    }
    setPanes([])
    setFocused('')
  }

  const closePane = (key: string) => setPanes((cur) => cur.filter((p) => p.key !== key))

  // kéo thả khung: thả lên khung khác → đổi chỗ. Khung giữ nguyên key nên chat/terminal không bị khởi động lại.
  const [dragKey, setDragKey] = useState('')
  const [overKey, setOverKey] = useState('')
  const dropOn = (target: string) => {
    if (dragKey && dragKey !== target) setPanes((cur) => swapById(cur, dragKey, target, (p) => p.key))
    setDragKey('')
    setOverKey('')
  }

  const cols = panes.length <= 1 ? 1 : panes.length <= 4 ? 2 : 3

  return (
    <div className={'workspace' + (resizing ? ' resizing' : '')}>
      <aside className="sidebar" style={{ width: sideWidth }}>
        <div className="side-head">
          <div className="side-title">
            <b>{profile.name}</b>
            <button className="icon" title="Sửa profile" onClick={onEditProfile}>
              ⚙
            </button>
          </div>
          <div className="acc">{profile.account ?? 'Chưa đăng nhập'}</div>
          <div className="row">
            <button className="primary grow" onClick={newSession}>
              + Session mới
            </button>
            <button onClick={login} title="Mở CLI để đăng nhập tài khoản cho profile này">
              Đăng nhập
            </button>
          </div>
          <div className="row">
            <input className="grow" placeholder="Tìm session…" value={q} onChange={(e) => setQ(e.target.value)} />
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} title="Khoảng thời gian">
              {DAY_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d === 0 ? 'Tất cả' : `${d} ngày`}
                </option>
              ))}
            </select>
          </div>
          <div className="counts">
            <span className="st running">● {counts.running} chạy</span>
            <span className="st waiting">● {counts.waiting} chờ bạn</span>
            <span className="st idle">● {counts.idle} nghỉ</span>
            {loading && <span className="muted">…</span>}
            <span className="grow" />
            {panes.length > 0 && (
              <button className="link-btn" onClick={() => void closeAll()} title="Đóng tất cả khung đang mở trong tab này">
                ✕ Đóng tất cả ({panes.length})
              </button>
            )}
          </div>
        </div>
        <ul className="sessions" data-clock={clock}>
          {groups.pinned.length > 0 && <li className="group-label">📌 Đã ghim</li>}
          {groups.pinned.map((s) => renderSession(s, 'pinned'))}
          {groups.pinned.length > 0 && groups.normal.length > 0 && <li className="group-label">Gần đây</li>}
          {groups.normal.map((s) => renderSession(s, 'normal'))}
          {!loading && groups.pinned.length + groups.normal.length === 0 && <li className="muted pad">Không có session.</li>}
          {groups.hidden.length > 0 && (
            <li className="group-label clickable" onClick={() => setShowHidden((v) => !v)}>
              {showHidden ? '▾' : '▸'} Đã ẩn ({groups.hidden.length})
            </li>
          )}
          {showHidden && groups.hidden.map((s) => renderSession(s, 'hidden'))}
          {trash.length > 0 && (
            <li
              className="group-label clickable"
              onClick={() => setShowTrash((v) => !v)}
              title="Session đã chuyển vào Thùng rác của Windows. Tự xoá vĩnh viễn sau 30 ngày nếu không khôi phục."
            >
              {showTrash ? '▾' : '▸'} Đã xoá gần đây ({trash.length})
            </li>
          )}
          {showTrash && trash.map(renderTrashed)}
        </ul>
      </aside>
      <div
        className={'splitter' + (resizing ? ' on' : '')}
        onPointerDown={startResize}
        onDoubleClick={resetWidth}
        title="Kéo để đổi độ rộng · nhấp đúp để về mặc định"
        role="separator"
        aria-orientation="vertical"
      />

      <section className="grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {panes.length === 0 && (
          <div className="empty">
            Chọn session bên trái để xem, hoặc bấm “+ Session mới”.
            <br />
            Có thể mở tối đa {MAX_PANES} khung cùng lúc.
          </div>
        )}
        {panes.map((p) => {
          const live = sessionOf(p)
          return (
          <Pane
            key={p.key}
            pane={p}
            profile={profile}
            liveSession={live}
            version={live ? fileVersions[live.filePath] ?? 0 : 0}
            focused={focused === p.key}
            visible={visible}
            onFocus={() => setFocused(p.key)}
            onChange={(patch) => updatePane(p.key, patch)}
            onClose={() => closePane(p.key)}
            onRename={live ? (name) => void rename(live, name) : undefined}
            originalTitle={live ? originalTitle(live.id) : undefined}
            drag={{
              dragging: dragKey === p.key,
              over: overKey === p.key && dragKey !== p.key,
              onStart: () => setDragKey(p.key),
              onEnd: () => (setDragKey(''), setOverKey('')),
              onOver: () => dragKey && overKey !== p.key && setOverKey(p.key),
              onDrop: () => dropOn(p.key)
            }}
          />
          )
        })}
      </section>
    </div>
  )
}

export type SpawnSpec = { kind: 'new'; cwd: string } | { kind: 'resume' } | { kind: 'login' }

export function toSpawnRequest(
  profile: ProfileInfo,
  ptyId: string,
  spec: SpawnSpec,
  session: SessionSummary | undefined,
  cols: number,
  rows: number
): PtySpawnRequest {
  if (spec.kind === 'login') return { ptyId, profileId: profile.id, mode: 'login', cols, rows }
  if (spec.kind === 'new') return { ptyId, profileId: profile.id, cwd: spec.cwd, cols, rows }
  return { ptyId, profileId: profile.id, cwd: session?.cwd, resumeSessionId: session?.id, cols, rows }
}

/** Icon thùng rác đơn sắc (theo màu chữ của nút). */
function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 4h11" />
      <path d="M6 4V2.75h4V4" />
      <path d="M3.75 4l.7 9.25h7.1l.7-9.25" />
      <path d="M6.75 6.75v4M9.25 6.75v4" />
    </svg>
  )
}
