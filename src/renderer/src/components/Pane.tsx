import { useEffect, useRef, useState } from 'react'
import type { ProfileInfo, SessionSummary } from '@shared/types'
import { baseName, STATUS_LABEL } from '../api'
import { TranscriptView } from './TranscriptView'
import { TerminalView } from './TerminalView'
import { ChatView } from './ChatView'
import { confirmDialog } from '../dialogs'
import { ErrorBoundary } from './ErrorBoundary'
import { InlineEdit } from './InlineEdit'
import type { SpawnSpec } from './Workspace'
import { defaultPaneSettings, PaneSettingsContext, type PaneSettings } from '../paneSettings'

export type PaneMode = 'view' | 'chat' | 'term'

export interface PaneState {
  key: string
  session?: SessionSummary
  /** Id session do khung chat tạo ra (session mới) — dùng để gắn với danh sách. */
  sessionId?: string
  mode: PaneMode
  /** Có giá trị khi khung đã mở chat trực tiếp. */
  chat?: { cwd: string; resumeId?: string; model?: string }
  /** Có giá trị khi khung đã (hoặc sắp) chạy terminal. */
  spawn?: SpawnSpec
  title?: string
}

interface Props {
  pane: PaneState
  profile: ProfileInfo
  liveSession?: SessionSummary
  version: number
  focused: boolean
  visible: boolean
  onFocus(): void
  onChange(patch: Partial<PaneState>): void
  onClose(): void
  /** Đổi tên session của khung (chỉ có khi khung đã gắn một session). */
  onRename?(name: string): void
  originalTitle?: string
  drag: PaneDrag
}

export interface PaneDrag {
  dragging: boolean
  over: boolean
  onStart(): void
  onEnd(): void
  onOver(): void
  onDrop(): void
}

const DRAG_TYPE = 'application/x-aiboard-pane'

/** Hỏi lại khi mở chat/terminal cho session đang hoạt động ở nơi khác. */
async function confirmTakeover(s: SessionSummary): Promise<boolean> {
  if (s.status === 'idle') return true
  return confirmDialog(
    `Session này đang hoạt động (${STATUS_LABEL[s.status]}, nguồn: ${s.source}).\n` +
      'Nếu nó vẫn mở trong VS Code, hãy đóng ở đó trước — hai nơi cùng ghi một session sẽ làm lẫn lịch sử.\n\nVẫn tiếp tục?',
    { okLabel: 'Vẫn mở' }
  )
}

export function Pane({ pane, profile, liveSession, version, focused, visible, onFocus, onChange, onClose, onRename, originalTitle, drag }: Props) {
  const [editingTitle, setEditingTitle] = useState(false)
  const s = liveSession
  const title = s?.title ?? pane.title ?? 'Session'
  const canChat = profile.provider === 'claude'

  // nút ↻: nạp lại nội dung mới nhất từ file session
  const [reloadTick, setReloadTick] = useState(0)
  const [spin, setSpin] = useState(false)
  const [settings, setSettings] = useState<PaneSettings>(defaultPaneSettings)
  const [showSettings, setShowSettings] = useState(false)
  const reload = () => {
    setReloadTick((t) => t + 1)
    setSpin(true)
    setTimeout(() => setSpin(false), 600)
  }

  // Chat và Terminal không chạy cùng lúc trong một khung (cùng ghi một session sẽ làm lẫn lịch sử):
  // chuyển qua lại thì dừng cái đang chạy. Hoạt động gần đây là của chính khung này nên không hỏi lại về VS Code.
  const openChat = async () => {
    if (pane.chat) return onChange({ mode: 'chat' })
    if (pane.spawn) {
      const ok = await confirmDialog(
        'Chuyển khung này sang Chat?\nTerminal đang chạy trong khung sẽ bị dừng. Lịch sử hội thoại vẫn giữ nguyên trong session.',
        { okLabel: 'Dừng Terminal và mở Chat' }
      )
      if (!ok) return
      const cwd = s?.cwd || (pane.spawn.kind === 'new' ? pane.spawn.cwd : '')
      // bỏ spawn → TerminalView bị gỡ → terminal dừng
      return onChange({ mode: 'chat', spawn: undefined, chat: { cwd, resumeId: s?.id } })
    }
    if (!s || !(await confirmTakeover(s))) return
    onChange({ mode: 'chat', chat: { cwd: s.cwd, resumeId: s.id } })
  }

  const openTerminal = async () => {
    if (pane.spawn) return onChange({ mode: 'term' })
    if (pane.chat) {
      const ok = await confirmDialog(
        'Chuyển khung này sang Terminal?\nPhiên chat trực tiếp trong khung sẽ bị dừng (nếu agent đang trả lời, lượt đó sẽ bị ngắt). Lịch sử hội thoại vẫn giữ nguyên trong session.',
        { okLabel: 'Dừng Chat và mở Terminal' }
      )
      if (!ok) return
      // bỏ chat → ChatView bị gỡ → phiên chat dừng; session đã có file thì resume, chưa có thì mở mới ở cùng thư mục
      const spawn: SpawnSpec = s ? { kind: 'resume' } : { kind: 'new', cwd: pane.chat.cwd }
      return onChange({ mode: 'term', chat: undefined, spawn })
    }
    if (s && !(await confirmTakeover(s))) return
    onChange({ mode: 'term', spawn: { kind: 'resume' } })
  }

  const showSeg = !!s || !!pane.chat

  return (
    <div
      className={'pane' + (focused ? ' focused' : '') + (drag.dragging ? ' dragging' : '') + (drag.over ? ' drop-target' : '')}
      onMouseDown={onFocus}
      style={{ ['--c' as string]: profile.color }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(DRAG_TYPE)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        drag.onOver()
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes(DRAG_TYPE)) return
        e.preventDefault()
        drag.onDrop()
      }}
    >
      {/* thanh tiêu đề là tay nắm để kéo khung đổi chỗ */}
      <div
        className="pane-head"
        draggable
        title="Kéo để đổi chỗ khung"
        onDragStart={(e) => {
          e.dataTransfer.setData(DRAG_TYPE, pane.key)
          e.dataTransfer.effectAllowed = 'move'
          drag.onStart()
        }}
        onDragEnd={drag.onEnd}
      >
        {s && <span className={'st-dot ' + s.status} title={STATUS_LABEL[s.status]} />}
        <div
          className="pane-title"
          title={s ? `${s.title}\n${s.cwd}\n${s.id}${onRename ? '\nNhấp đúp vào tên để đổi tên' : ''}` : title}
          onDoubleClick={() => onRename && setEditingTitle(true)}
        >
          {editingTitle && onRename ? (
            <InlineEdit
              value={title}
              placeholder={originalTitle ?? 'Tên session (để trống = tên gốc)'}
              onSave={(v) => {
                setEditingTitle(false)
                onRename(v)
              }}
              onCancel={() => setEditingTitle(false)}
            />
          ) : (
            <b>{title}</b>
          )}
          {(s?.cwd || pane.chat?.cwd) && <span className="muted"> · {baseName(s?.cwd || pane.chat!.cwd)}</span>}
        </div>
        {showSeg && (
          <div className="seg">
            {s && (
              <button className={pane.mode === 'view' ? 'on' : ''} onClick={() => onChange({ mode: 'view' })}>
                Xem
              </button>
            )}
            {canChat && (
              <button className={pane.mode === 'chat' ? 'on' : ''} onClick={openChat} title="Chat trực tiếp trong app">
                Chat
              </button>
            )}
            {(s || pane.chat) && (
              <button className={pane.mode === 'term' ? 'on' : ''} onClick={openTerminal} title="Mở trong terminal (CLI đầy đủ)">
                Terminal
              </button>
            )}
          </div>
        )}
        {(pane.mode === 'view' || pane.mode === 'chat') && (
          <div className="settings-anchor">
            <button
              className={'icon' + (showSettings ? ' on' : '')}
              title="Cài đặt khung"
              onClick={() => setShowSettings((v) => !v)}
            >
              ⚙
            </button>
            {showSettings && (
              <PaneSettingsMenu value={settings} onChange={setSettings} onClose={() => setShowSettings(false)} />
            )}
          </div>
        )}
        {(pane.mode === 'view' || pane.mode === 'chat') && s && (
          <button
            className={'icon reload' + (spin ? ' spin' : '')}
            title="Tải lại nội dung mới nhất của session (kể cả tin nhắn từ VS Code)"
            onClick={reload}
          >
            ↻
          </button>
        )}
        <button className="icon" title="Đóng khung (dừng chat/terminal nếu có)" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="pane-body">
        <PaneSettingsContext.Provider value={settings}>
        <ErrorBoundary label="Khung này">
        {s && (
          <div className="fill" style={{ display: pane.mode === 'view' ? 'flex' : 'none' }}>
            <TranscriptView profileId={profile.id} filePath={s.filePath} version={version + reloadTick} active={visible && pane.mode === 'view'} />
          </div>
        )}
        {pane.chat && (
          <div className="fill" style={{ display: pane.mode === 'chat' ? 'flex' : 'none' }}>
            <ChatView
              chatId={pane.key}
              profile={profile}
              cwd={pane.chat.cwd}
              resumeId={pane.chat.resumeId}
              historyFile={s?.filePath}
              version={version}
              reloadTick={reloadTick}
              active={visible && focused && pane.mode === 'chat'}
              model={pane.chat.model}
              onModelChange={(model) => onChange({ chat: { ...pane.chat!, model } })}
              onSessionId={(id) => id !== pane.sessionId && onChange({ sessionId: id })}
            />
          </div>
        )}
        {pane.spawn && (
          <div className="fill" style={{ display: pane.mode === 'term' ? 'flex' : 'none' }}>
            <TerminalView
              profile={profile}
              spec={pane.spawn}
              session={s}
              active={visible && pane.mode === 'term'}
              focused={focused}
            />
          </div>
        )}
        </ErrorBoundary>
        </PaneSettingsContext.Provider>
      </div>
    </div>
  )
}

/** Bảng cài đặt của một khung (mở từ nút ⚙ trên thanh tiêu đề). */
function PaneSettingsMenu({
  value,
  onChange,
  onClose
}: {
  value: PaneSettings
  onChange(v: PaneSettings): void
  onClose(): void
}) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // bấm ra ngoài → đóng
    const onDown = (e: MouseEvent) => !box.current?.parentElement?.contains(e.target as Node) && onClose()
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [onClose])

  return (
    <div className="pane-settings" ref={box} onMouseDown={(e) => e.stopPropagation()}>
      <div className="ps-title">Cài đặt khung</div>
      <label className="switch-row">
        <span className="grow">
          Mở rộng diff code
          <span className="muted small">{value.diffExpanded ? 'Thẻ Edit/Write mở sẵn phần diff' : 'Thu gọn, chỉ hiện tên file và +/−'}</span>
        </span>
        <input
          type="checkbox"
          className="switch"
          checked={value.diffExpanded}
          onChange={(e) => onChange({ ...value, diffExpanded: e.target.checked })}
        />
      </label>
    </div>
  )
}
