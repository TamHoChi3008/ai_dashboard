import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react'
import { emptyChat, IMAGE_TYPES, MAX_IMAGE_BYTES, PERMISSION_MODES, reduceChat, SYNC_NOTICE, type Attachment, type ChatEntry, type ChatImage } from '@shared/chat'
import type { ChatItem, ProfileInfo } from '@shared/types'
import { api } from '../api'
import { Markdown } from './Markdown'
import { UsagePopover } from './UsagePopover'
import { SlashMenu } from './SlashMenu'
import { ToolCard, splitToolText } from './ToolCard'
import { FileMenu } from './FileMenu'
import { appendMention, atQuery, insertMention, rankFiles, relativeTo } from '@shared/fileMention'
import { QuestionCard } from './QuestionCard'
import { ModelMenu } from './ModelMenu'
import { filterCommands, localCommand, slashQuery, type SlashCommandInfo } from '@shared/slash'

interface Props {
  chatId: string
  profile: ProfileInfo
  cwd: string
  resumeId?: string
  /** File session: nguồn lịch sử, được đồng bộ lại khi thay đổi. */
  historyFile?: string
  /** Tăng mỗi khi file session thay đổi (watcher). */
  version: number
  /** Tăng mỗi khi bấm nút ↻ trên khung. */
  reloadTick: number
  active: boolean
  /** Model chọn cho khung (lưu cùng bố cục); undefined = mặc định. */
  model?: string
  onModelChange(model: string | undefined): void
  onSessionId(id: string): void
}

/** Đọc ảnh dán / kéo vào (không có đường dẫn) thành base64. */
function readImageBlob(file: File): Promise<ChatImage | string> {
  const mediaType = IMAGE_TYPES[(file.type.split('/')[1] ?? '').toLowerCase()]
  if (!mediaType) return Promise.resolve(`${file.name || 'file'}: không phải ảnh PNG/JPEG/GIF/WebP`)
  if (file.size > MAX_IMAGE_BYTES) return Promise.resolve(`${file.name || 'Ảnh'} lớn hơn 5 MB`)
  return new Promise((resolve) => {
    const r = new FileReader()
    r.onload = () => resolve({ name: file.name || 'ảnh dán', mediaType, data: String(r.result).split(',')[1] ?? '' })
    r.onerror = () => resolve(`Không đọc được ${file.name || 'ảnh'}`)
    r.readAsDataURL(file)
  })
}

const DEFAULT_MODE = 'default'
const HISTORY_LIMIT = 150

export function ChatView({ chatId, profile, cwd, resumeId, historyFile, version, reloadTick, active, model, onModelChange, onSessionId }: Props) {
  const [state, dispatch] = useReducer(reduceChat, emptyChat)
  const [history, setHistory] = useState<ChatItem[]>([])
  const [text, setText] = useState('')
  const [mode, setMode] = useState(DEFAULT_MODE)
  const box = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const root = useRef<HTMLDivElement>(null)

  // ô nhập tự cao theo nội dung, tối đa 50% chiều cao khung chat; vượt quá thì cuộn
  const fitInput = useCallback(() => {
    const ta = input.current
    const box = root.current
    if (!ta || !box || box.clientHeight === 0) return // khung đang ẩn: đo sau
    const max = Math.max(60, Math.floor(box.clientHeight * 0.5))
    ta.style.height = 'auto'
    const want = ta.scrollHeight + 2 // + viền
    ta.style.height = Math.min(want, max) + 'px'
    ta.style.overflowY = want > max ? 'auto' : 'hidden'
  }, [])
  const stick = useRef(true)
  const [showUsage, setShowUsage] = useState(false)
  const [defaultModel, setDefaultModel] = useState<string>()

  // ---- đính kèm: ảnh gửi kèm tin nhắn, file khác chèn "@đường dẫn" ----
  const [images, setImages] = useState<ChatImage[]>([])
  const [attachError, setAttachError] = useState('')
  const [dropping, setDropping] = useState(false)

  const addAttachments = (list: (Attachment | ChatImage | string)[]) => {
    const errs: string[] = []
    const imgs: ChatImage[] = []
    let t = text
    for (const a of list) {
      if (typeof a === 'string') errs.push(a)
      else if ('data' in a) imgs.push(a)
      else if (a.error) errs.push(`${a.name}: ${a.error}`)
      else if (a.image) imgs.push(a.image)
      else t = appendMention(t, relativeTo(cwd, a.path))
    }
    if (t !== text) {
      setText(t)
      setFileClosed(true)
    }
    if (imgs.length) setImages((cur) => [...cur, ...imgs].slice(0, 20))
    setAttachError(errs.join('\n'))
    input.current?.focus()
  }

  const pickAttachments = async () => addAttachments(await api.pickAttachments())

  const addFiles = async (files: File[]) => {
    const withPath = files.map((f) => ({ f, path: api.pathForFile(f) }))
    const fromDisk = withPath.filter((x) => x.path).map((x) => x.path)
    const blobs = withPath.filter((x) => !x.path).map((x) => x.f)
    const [disk, mem] = await Promise.all([
      fromDisk.length ? api.readAttachments(fromDisk) : Promise.resolve([] as Attachment[]),
      Promise.all(blobs.map(readImageBlob))
    ])
    addAttachments([...disk, ...mem])
  }

  // ---- slash command ----
  const [commands, setCommands] = useState<SlashCommandInfo[] | null>(null)
  const [cmdLoading, setCmdLoading] = useState(false)
  const [cmdError, setCmdError] = useState('')
  const [sel, setSel] = useState(0)
  const [menuClosed, setMenuClosed] = useState(false)
  const query = slashQuery(text)
  const menuOpen = query !== null && !menuClosed
  const matches = useMemo(() => (commands ? filterCommands(commands, query ?? '') : []), [commands, query])
  // gợi ý tham số khi đã gõ xong tên command, VD "/review <pr>"
  const argHint = useMemo(() => {
    const m = text.match(/^\/(\S+) /)
    const c = m && commands?.find((x) => x.name === m[1] || x.aliases?.includes(m[1]))
    return c?.argumentHint ? `/${c.name} ${c.argumentHint}` : ''
  }, [text, commands])

  useEffect(() => {
    if (!menuOpen || commands !== null || cmdLoading) return
    setCmdLoading(true)
    setCmdError('')
    // bọc trong Promise: nếu preload cũ chưa có hàm này thì báo lỗi trong menu thay vì làm sập khung
    Promise.resolve()
      .then(() => {
        if (typeof api.chatCommands !== 'function') throw new Error('App vừa cập nhật, hãy tắt và mở lại app.')
        return api.chatCommands(profile.id, cwd, chatId)
      })
      .then(setCommands, (e) => setCmdError(String((e as Error).message ?? e)))
      .finally(() => setCmdLoading(false))
  }, [menuOpen, commands, cmdLoading, profile.id, cwd, chatId])

  useEffect(() => setSel(0), [query])

  // ---- "@" chọn file ----
  const [caret, setCaret] = useState(0)
  const [files, setFiles] = useState<string[] | null>(null)
  const [filesLoading, setFilesLoading] = useState(false)
  const [fileClosed, setFileClosed] = useState(false)
  const [fsel, setFsel] = useState(0)
  const mention = useMemo(() => atQuery(text, caret), [text, caret])
  const fileOpen = !!mention && !fileClosed && !menuOpen
  const fileMatches = useMemo(() => (files && mention ? rankFiles(files, mention.query) : []), [files, mention])

  useEffect(() => {
    if (!fileOpen || files !== null || filesLoading) return
    setFilesLoading(true)
    Promise.resolve()
      .then(() => {
        if (typeof api.listProjectFiles !== 'function') throw new Error('App vừa cập nhật, hãy tắt và mở lại app.')
        return api.listProjectFiles(cwd)
      })
      .then(setFiles, () => setFiles([]))
      .finally(() => setFilesLoading(false))
  }, [fileOpen, files, filesLoading, cwd])

  useEffect(() => setFsel(0), [mention?.query])

  const pickFile = (path: string) => {
    if (!mention) return
    const r = insertMention(text, mention.start, caret, path)
    setText(r.text)
    setCaret(r.caret)
    setFileClosed(true) // đóng hẳn; gõ "@" mới thì mở lại
    // đặt con trỏ ngay sau đường dẫn vừa chèn (sau khi React cập nhật ô nhập)
    requestAnimationFrame(() => {
      input.current?.focus()
      input.current?.setSelectionRange(r.caret, r.caret)
    })
  }

  const pickCommand = (c: SlashCommandInfo) => {
    // đã gõ đủ tên một command không cần tham số → gửi luôn
    if (text.trim() === '/' + c.name && !c.argumentHint) return void send('/' + c.name)
    setText('/' + c.name + ' ')
    input.current?.focus()
  }

  // model trước khi phiên bắt đầu: lấy từ settings của profile
  useEffect(() => {
    api.chatDefaultModel(profile.id).then((m) => m && setDefaultModel(m), () => undefined)
  }, [profile.id])

  // nhận event của đúng phiên chat này; đóng phiên khi khung bị đóng
  useEffect(() => {
    const off = api.onChatEvent((id, e) => {
      if (id !== chatId) return
      dispatch(e)
      if (e.type === 'init' || e.type === 'reset') onSessionId(e.sessionId)
    })
    return () => {
      off()
      api.chatClose(chatId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId])

  // ---- đồng bộ với file session (VS Code và app cùng ghi vào đây) ----
  const busyRef = useRef(false)
  busyRef.current = state.busy
  const knownTotal = useRef<number | null>(null) // số tin đã biết trong file
  const ownUntil = useRef(0) // thay đổi file trước mốc này là do lượt chat của app

  async function sync(reason: 'auto' | 'manual' | 'own') {
    if (!historyFile) return
    // app đang chạy lượt của chính nó: file đang được ghi dở → chờ lượt xong rồi đồng bộ một lần
    if (busyRef.current && reason !== 'manual') return
    try {
      const t = await api.readTranscript(profile.id, historyFile)
      const prev = knownTotal.current
      knownTotal.current = t.total
      setHistory(t.items.slice(-HISTORY_LIMIT))
      dispatch({ type: 'synced' })
      const fromOutside = reason === 'auto' && prev !== null && t.total > prev && Date.now() > ownUntil.current
      if (fromOutside) {
        dispatch({ type: 'info', text: `${SYNC_NOTICE} ${t.total - prev} tin mới từ VS Code` })
      }
      // process ngầm còn giữ hội thoại cũ → đóng để lần gửi sau resume từ file mới nhất
      if (fromOutside || reason === 'manual') api.chatSuspend(chatId)
    } catch {
      /* file chưa có (session mới chưa gửi tin) */
    }
  }

  // lần đầu + mỗi khi file session thay đổi (watcher) → đồng bộ tự động
  useEffect(() => {
    void sync('auto')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyFile, version])

  // bấm nút ↻ trên khung
  useEffect(() => {
    if (reloadTick > 0) void sync('manual')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadTick])

  // lượt chat của app vừa xong (đang chạy → xong) → đồng bộ một lần (file đã có đủ tin của lượt này)
  const wasBusy = useRef(false)
  useEffect(() => {
    const finished = wasBusy.current && !state.busy
    wasBusy.current = state.busy
    if (!finished) return
    ownUntil.current = Date.now() + 3000
    const t = setTimeout(() => void sync('own'), 600)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.busy])

  useEffect(() => {
    const el = box.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [state.entries, history])

  useEffect(() => {
    if (active) input.current?.focus()
  }, [active])

  useLayoutEffect(fitInput, [text, fitInput])
  // khung đổi kích thước (kéo sidebar, đổi bố cục, hiện lại tab) → tính lại giới hạn
  useEffect(() => {
    const box = root.current
    if (!box) return
    const ro = new ResizeObserver(() => fitInput())
    ro.observe(box)
    return () => ro.disconnect()
  }, [fitInput])

  async function send(override?: string) {
    const t = (override ?? text).trim()
    const imgs = override === undefined ? images : []
    if (!t && !imgs.length) return
    setText('')
    setMenuClosed(false)
    // lệnh app tự xử lý
    if (!imgs.length && localCommand(t) === 'usage') return setShowUsage(true)
    if (imgs.length) setImages([])
    setAttachError('')
    stick.current = true
    const r = await api.chatSend(chatId, { profileId: profile.id, cwd, resumeId, permissionMode: mode, model }, t, imgs)
    if (!r.ok) dispatch({ type: 'error', message: r.error ?? 'Không gửi được' })
  }

  const changeModel = (m: string | undefined) => {
    onModelChange(m)
    void api.chatSetModel(chatId, m)
  }

  const changeMode = (m: string) => {
    setMode(m)
    void api.chatSetMode(chatId, m)
  }

  return (
    <div className="chat" ref={root}>
      <div
        className="chat-log"
        ref={box}
        onScroll={(e) => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
        }}
      >
        {history.length > 0 && (
          <div className="history">
            {history.map((it, i) =>
              it.role === 'tool' ? (
                <ToolCard key={i} {...splitToolText(it.text)} file={it.file} line={it.line} diff={it.diff} cwd={cwd} />
              ) : (
                <div key={i} className={'msg ' + it.role}>
                  <div className="text">{it.role === 'assistant' ? <Markdown text={it.text} /> : it.text}</div>
                </div>
              )
            )}
          </div>
        )}
        {history.length === 0 && state.entries.length === 0 && (
          <div className="muted pad">
            {resumeId ? 'Gửi tin nhắn để tiếp tục session này.' : `Session mới trong ${cwd}`}
          </div>
        )}
        {state.entries.map((e, i) => (
          <Entry
            key={i}
            e={e}
            cwd={cwd}
            onDecide={(reqId, d) => api.chatPermission(chatId, reqId, d)}
            onAnswer={(reqId, a) => api.chatAnswer(chatId, reqId, a)}
          />
        ))}
        {state.busy && <div className="typing">Agent đang làm việc…</div>}
      </div>

      <div
        className={'composer' + (dropping ? ' dropping' : '')}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
          if (!dropping) setDropping(true)
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropping(false)
        }}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return
          e.preventDefault()
          setDropping(false)
          void addFiles([...e.dataTransfer.files])
        }}
      >
        {menuOpen && (
          <SlashMenu
            items={matches}
            selected={sel}
            loading={cmdLoading}
            error={cmdError}
            onPick={pickCommand}
            onHover={setSel}
          />
        )}
        {fileOpen && (
          <FileMenu
            items={fileMatches}
            selected={fsel}
            loading={filesLoading}
            total={files?.length ?? 0}
            onPick={pickFile}
            onHover={setFsel}
          />
        )}
        {argHint && !menuOpen && <div className="arg-hint muted small">{argHint}</div>}
        {images.length > 0 && (
          <div className="attach-row">
            {images.map((img, i) => (
              <div key={i} className="attach-thumb" title={img.name}>
                <img src={`data:${img.mediaType};base64,${img.data}`} alt={img.name} />
                <button className="icon" title="Bỏ ảnh này" onClick={() => setImages((cur) => cur.filter((_, j) => j !== i))}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
        {attachError && <div className="error small attach-error">{attachError}</div>}
        <textarea
          ref={input}
          value={text}
          rows={2}
          placeholder="Nhắn cho agent… (/ command · @ chọn file · dán/kéo ảnh vào · Enter gửi · Shift+Enter xuống dòng)"
          onChange={(e) => {
            setText(e.target.value)
            setCaret(e.target.selectionStart)
            if (e.target.value === '/') setMenuClosed(false) // gõ lại "/" → mở menu
            const m = atQuery(e.target.value, e.target.selectionStart)
            if (m && m.query === '') setFileClosed(false) // vừa gõ "@" → mở menu file
          }}
          onPaste={(e) => {
            const files = [...e.clipboardData.files].filter((f) => f.type.startsWith('image/'))
            if (!files.length) return
            e.preventDefault()
            void addFiles(files)
          }}
          onSelect={(e) => {
            // bỏ qua sự kiện chọn đến trước khi React cập nhật nội dung ô nhập (vị trí con trỏ là của nội dung cũ)
            if (e.currentTarget.value === text) setCaret(e.currentTarget.selectionStart)
          }}
          onKeyDown={(e) => {
            if (fileOpen && !e.nativeEvent.isComposing) {
              if (e.key === 'Escape') {
                e.preventDefault()
                return setFileClosed(true)
              }
              if (fileMatches.length > 0) {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  e.preventDefault()
                  const d = e.key === 'ArrowDown' ? 1 : -1
                  return setFsel((i) => (i + d + fileMatches.length) % fileMatches.length)
                }
                if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
                  e.preventDefault()
                  return pickFile(fileMatches[Math.min(fsel, fileMatches.length - 1)])
                }
              }
            }
            if (menuOpen && !e.nativeEvent.isComposing) {
              if (e.key === 'Escape') {
                e.preventDefault()
                return setMenuClosed(true)
              }
              if (matches.length > 0) {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  e.preventDefault()
                  const d = e.key === 'ArrowDown' ? 1 : -1
                  return setSel((i) => (i + d + matches.length) % matches.length)
                }
                if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
                  e.preventDefault()
                  return pickCommand(matches[Math.min(sel, matches.length - 1)])
                }
              }
            }
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              void send()
            }
          }}
        />
        <div className="composer-bar">
          <select value={mode} onChange={(e) => changeMode(e.target.value)} title="Chế độ quyền">
            {PERMISSION_MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <button className="icon attach-btn" title="Đính kèm ảnh hoặc file (ảnh gửi kèm, file khác chèn @đường dẫn)" onClick={() => void pickAttachments()}>
            📎
          </button>
          <ModelMenu
            profileId={profile.id}
            chatId={chatId}
            value={model}
            activeModel={state.model}
            defaultModel={defaultModel}
            onChange={changeModel}
          />
          {state.costUsd > 0 && <span className="muted small">${state.costUsd.toFixed(3)}</span>}
          <span className="grow" />
          <div className="usage-anchor">
            <button onClick={() => setShowUsage((v) => !v)} className={showUsage ? 'on' : ''} title="Usage của gói: phiên 5 giờ và tuần">
              📊 Usage
            </button>
            {showUsage && (
              <UsagePopover
                profileId={profile.id}
                chatId={chatId}
                onModel={(m) => setDefaultModel(m)}
                onClose={() => setShowUsage(false)}
              />
            )}
          </div>
          {state.busy && (
            <button onClick={() => void api.chatInterrupt(chatId)} title="Dừng lượt hiện tại">
              ■ Dừng
            </button>
          )}
          <button className="primary" onClick={() => void send()} disabled={!text.trim() && !images.length}>
            Gửi
          </button>
        </div>
      </div>
    </div>
  )
}

const PERM_LABEL = { allowed: 'Đã cho phép', always: 'Luôn cho phép', denied: 'Đã từ chối', cancelled: 'Đã huỷ' } as const

function Entry({
  e,
  cwd,
  onDecide,
  onAnswer
}: {
  e: ChatEntry
  cwd: string
  onDecide(reqId: string, d: 'allow' | 'always' | 'deny'): void
  onAnswer(reqId: string, answers: Record<string, string> | null): void
}) {
  switch (e.kind) {
    case 'user':
      return (
        <div className="msg user">
          <div className="text">
            {e.images ? <span className="img-chip">🖼 {e.images} ảnh</span> : null}
            {e.text}
          </div>
        </div>
      )
    case 'question':
      return <QuestionCard questions={e.questions} state={e.state} answers={e.answers} onAnswer={(a) => onAnswer(e.reqId, a)} />
    case 'assistant':
      return (
        <div className="msg assistant">
          {e.streaming ? <div className="text">{e.text}</div> : <Markdown text={e.text} />}
        </div>
      )
    case 'tool':
      return (
        <ToolCard
          name={e.name}
          summary={e.summary}
          status={e.status}
          output={e.output}
          file={e.file}
          line={e.line}
          diff={e.diff}
          cwd={cwd}
        />
      )
    case 'permission':
      return (
        <div className={'perm ' + e.state}>
          <div>
            🔐 Agent muốn dùng <b>{e.toolName}</b>
          </div>
          {e.summary && <code>{e.summary}</code>}
          {e.state === 'pending' ? (
            <div className="row">
              <button className="primary" onClick={() => onDecide(e.reqId, 'allow')}>
                Cho phép
              </button>
              {e.canAlways && <button onClick={() => onDecide(e.reqId, 'always')}>Luôn cho phép</button>}
              <button className="danger" onClick={() => onDecide(e.reqId, 'deny')}>
                Từ chối
              </button>
            </div>
          ) : (
            <div className="muted small">{PERM_LABEL[e.state]}</div>
          )}
        </div>
      )
    case 'info':
      return <div className="muted small">{e.text}</div>
    case 'error':
      return <div className="error">⚠ {e.text}</div>
  }
}
