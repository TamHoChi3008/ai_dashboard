import { useCallback, useEffect, useRef, useState } from 'react'
import type { ProfileInfo, SessionSummary } from '@shared/types'
import { api } from './api'
import { Workspace } from './components/Workspace'
import { ProfileDialog } from './components/ProfileDialog'
import { cycleTab, moveById, tabAfterClose } from '@shared/order'
import { confirmDialog, DialogHost } from './dialogs'
import { Overview } from './components/Overview'

/** Id của tab tổng quan (không phải profile). */
const OVERVIEW = '__overview__'

const TAB_DRAG = 'application/x-aiboard-tab'

/** filePath → số lần thay đổi; dùng để báo các khung transcript tải lại. */
export type FileVersions = Record<string, number>

export function App() {
  const [profiles, setProfiles] = useState<ProfileInfo[]>([])
  const [active, setActive] = useState<string>('')
  const [editing, setEditing] = useState<ProfileInfo | 'new' | null>(null)
  const [fileVersions, setFileVersions] = useState<FileVersions>({})
  const [profileTicks, setProfileTicks] = useState<Record<string, number>>({})
  const [anyTick, setAnyTick] = useState(0)
  // yêu cầu mở session từ tab tổng quan: n tăng mỗi lần để mở lại cùng session cũng được
  const [openReq, setOpenReq] = useState<{ profileId: string; session: SessionSummary; n: number } | null>(null)
  // profile đã đóng tab: không mount workspace (chat/terminal dừng), mở lại từ tab Tổng quan
  const [closed, setClosed] = useState<string[]>([])
  // số khung đang chạy Chat/Terminal của từng profile (để hỏi lại trước khi đóng tab)
  const live = useRef<Record<string, number>>({})

  useEffect(() => {
    if (typeof api.getClosedProfiles === 'function') api.getClosedProfiles().then(setClosed, () => undefined)
  }, [])

  const openProfiles = profiles.filter((p) => !closed.includes(p.id))
  /** Thứ tự tab trên thanh: Tổng quan rồi các profile đang mở. */
  const tabOrder = [OVERVIEW, ...openProfiles.map((p) => p.id)]

  const saveClosed = (next: string[]) => {
    setClosed(next)
    api.setClosedProfiles?.(next)
  }

  const closeTab = async (id: string) => {
    if (id === OVERVIEW) return
    const p = profiles.find((x) => x.id === id)
    const n = live.current[id] ?? 0
    if (n > 0) {
      const ok = await confirmDialog(
        `Đóng tab "${p?.name ?? id}"?\n${n} khung đang mở Chat/Terminal sẽ bị dừng. Bố cục khung được giữ lại, mở lại tab từ trang Tổng quan.`,
        { okLabel: 'Đóng tab', danger: true }
      )
      if (!ok) return
    }
    if (active === id) setActive(tabAfterClose(tabOrder, id) ?? OVERVIEW)
    live.current[id] = 0
    saveClosed([...closed.filter((x) => x !== id), id])
  }

  const reopen = (id: string) => {
    saveClosed(closed.filter((x) => x !== id))
    setActive(id)
  }

  // phím tắt (bắt ở main, kể cả khi đang gõ trong terminal)
  const shortcut = useRef<(a: string) => void>(() => undefined)
  shortcut.current = (a: string) => {
    if (a === 'close-tab') return void closeTab(active)
    if (a === 'next-tab' || a === 'prev-tab') return setActive(cycleTab(tabOrder, active, a === 'next-tab' ? 1 : -1))
    const m = a.match(/^tab-(\d)$/)
    if (m) {
      const id = tabOrder[Number(m[1]) - 1]
      if (id) setActive(id)
    }
  }
  useEffect(() => {
    if (typeof api.onShortcut !== 'function') return
    return api.onShortcut((a) => shortcut.current(a))
  }, [])

  const reload = useCallback(async () => {
    const list = await api.listProfiles()
    setProfiles(list)
    setActive((cur) => (cur === OVERVIEW || list.some((p) => p.id === cur) ? cur : list[0]?.id ?? ''))
  }, [])

  useEffect(() => {
    void reload()
    return api.onFilesChanged((profileId, files) => {
      setProfileTicks((t) => ({ ...t, [profileId]: (t[profileId] ?? 0) + 1 }))
      setAnyTick((n) => n + 1)
      setFileVersions((v) => {
        const n = { ...v }
        for (const f of files) n[f] = (n[f] ?? 0) + 1
        return n
      })
    })
  }, [reload])

  // kéo thả tab profile: thả lên tab khác → chuyển tới vị trí đó, lưu thứ tự
  const [dragTab, setDragTab] = useState('')
  const [overTab, setOverTab] = useState('')
  const indexOf = (id: string) => openProfiles.findIndex((p) => p.id === id)
  const tabDragClass = (id: string, i: number) => {
    if (id === dragTab) return ' dragging'
    if (!dragTab || id !== overTab) return ''
    return indexOf(dragTab) < i ? ' drop-after' : ' drop-before'
  }
  const dropTab = (target: string) => {
    if (dragTab && dragTab !== target) {
      const next = moveById(profiles, dragTab, target, (p) => p.id)
      setProfiles(next)
      void api.reorderProfiles(next.map((p) => p.id))
    }
    setDragTab('')
    setOverTab('')
  }

  return (
    <div className="app">
      <header className="tabs">
        <span className="brand">AI Board</span>
        <button
          className={'tab overview-tab' + (active === OVERVIEW ? ' active' : '')}
          onClick={() => setActive(OVERVIEW)}
          title={'Tổng quan: session đang hoạt động của mọi profile và thống kê token\nPhím tắt: Ctrl+Tab / Ctrl+Shift+Tab đổi tab · Ctrl+1…9 tới tab thứ N · Ctrl+W đóng tab'}
        >
          <span className="tab-name">⌂ Tổng quan</span>
        </button>
        {openProfiles.map((p, i) => (
          <button
            key={p.id}
            className={'tab' + (p.id === active ? ' active' : '') + tabDragClass(p.id, i)}
            style={{ ['--c' as string]: p.color }}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(TAB_DRAG, p.id)
              e.dataTransfer.effectAllowed = 'move'
              setDragTab(p.id)
            }}
            onDragEnd={() => (setDragTab(''), setOverTab(''))}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes(TAB_DRAG)) return
              e.preventDefault()
              if (overTab !== p.id) setOverTab(p.id)
            }}
            onDrop={(e) => {
              if (!e.dataTransfer.types.includes(TAB_DRAG)) return
              e.preventDefault()
              dropTab(p.id)
            }}
            onClick={() => setActive(p.id)}
            onDoubleClick={() => setEditing(p)}
            onMouseUp={(e) => e.button === 1 && void closeTab(p.id)}
            title={`${p.provider} · ${p.account ?? 'chưa đăng nhập'}\n${p.configDir}\n(nhấp đúp để sửa · Ctrl+W hoặc chuột giữa để đóng tab)`}
          >
            <span className="dot" />
            <span className="tab-name">{p.name}</span>
            <span className="tab-acc">{p.account ?? 'chưa đăng nhập'}</span>
            <span
              className="tab-close"
              role="button"
              title="Đóng tab (Ctrl+W) — mở lại từ Tổng quan"
              onClick={(e) => {
                e.stopPropagation()
                void closeTab(p.id)
              }}
            >
              ✕
            </span>
          </button>
        ))}
        <button className="tab add" onClick={() => setEditing('new')} title="Thêm profile (tài khoản)">
          +
        </button>
      </header>

      <main className="content">
        {profiles.length === 0 && <div className="empty">Chưa có profile. Bấm + để thêm.</div>}
        <div className="ws-host" style={{ display: active === OVERVIEW ? 'flex' : 'none' }}>
          <Overview
            profiles={profiles}
            closed={closed}
            onReopen={reopen}
            onDeleted={() => void reload()}
            visible={active === OVERVIEW}
            tick={anyTick}
            onOpen={(profileId, session) => {
              if (closed.includes(profileId)) saveClosed(closed.filter((x) => x !== profileId))
              setActive(profileId)
              setOpenReq((r) => ({ profileId, session, n: (r?.n ?? 0) + 1 }))
            }}
          />
        </div>
        {openProfiles.map((p) => (
          // giữ mọi workspace (của tab đang mở) luôn mounted để terminal không bị ngắt khi đổi tab
          <div key={p.id} className="ws-host" style={{ display: p.id === active ? 'flex' : 'none' }}>
            <Workspace
              profile={p}
              visible={p.id === active}
              tick={profileTicks[p.id] ?? 0}
              fileVersions={fileVersions}
              onEditProfile={() => setEditing(p)}
              openRequest={openReq?.profileId === p.id ? openReq : undefined}
              onLiveChange={(n) => (live.current[p.id] = n)}
            />
          </div>
        ))}
      </main>

      <DialogHost />

      {editing && (
        <ProfileDialog
          profile={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async (id) => {
            setEditing(null)
            await reload()
            if (id) setActive(id)
          }}
        />
      )}
    </div>
  )
}
