import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import type { PtySpawnRequest } from '@shared/types'
import type { ChatImage, ChatOpenOptions } from '@shared/chat'
import {
  chatAnswer,
  chatClose,
  chatModels,
  chatSetModel,
  chatCommands,
  chatDefaultModel,
  chatInterrupt,
  chatPermission,
  chatSend,
  chatSetMode,
  chatSuspend,
  chatUsage,
  closeAllChats
} from './chat/manager'
import { deleteProfile, getProfile, isAppManagedDir, loadProfiles, reorderProfiles, saveProfile, toInfo } from './profiles'
import { listSessions, readTranscript, sessionFiles, sessionIdFromFile, sessionRoot } from './providers/sessions'
import { rm } from 'fs/promises'
import { killAll, killPty, resizePty, spawnPty, writePty } from './pty'
import { closeWatchers, syncWatchers } from './watcher'
import { listCatalog } from './catalog'
import { getFlags, renameSession, setFlag } from './sessionFlags'
import { listProjectFiles, openInVscode } from './files'
import { readAppSettings, updateAppSettings } from './appSettings'
import type { FlagName } from '@shared/sessionFlags'
import type { WorkspaceLayout } from '@shared/layout'
import { getLayout, setLayout } from './layout'
import { getStats } from './stats'
import { readAttachments } from './attachments'
import { migrateAppNames, writeSessionTitle } from './sessionTitle'
import { checkForUpdate, downloadUpdate, getUpdateState, initUpdater, installUpdate } from './updater'
import { addTrashed, listTrashed, purgeExpired, purgeTrashed, restoreTrashed } from './sessionTrash'

/** Bản chạy bằng `npm run dev` / `npm start` (không phải bản đã cài). */
const isDev = !app.isPackaged

let win: BrowserWindow | null = null
const catalogPaths = new Set<string>()

function send(channel: string, ...args: unknown[]) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args)
}

async function refreshWatchers() {
  syncWatchers(await loadProfiles(), (profileId, files) => send('files-changed', profileId, files))
}

/** Chỉ cho đọc file nằm trong thư mục session của profile. */
function assertInside(root: string, file: string) {
  const r = root.toLowerCase().replace(/\//g, '\\')
  const f = file.toLowerCase().replace(/\//g, '\\')
  if (!f.startsWith(r + '\\')) throw new Error('Đường dẫn không hợp lệ')
}

function registerIpc() {
  ipcMain.handle('profiles:list', async () => (await loadProfiles()).map(toInfo))
  ipcMain.handle('profiles:save', async (_e, input) => {
    const p = await saveProfile(input)
    await refreshWatchers()
    return toInfo(p)
  })
  ipcMain.handle('profiles:reorder', (_e, ids: string[]) => reorderProfiles(ids))
  ipcMain.handle('catalog:list', async (_e, profileId: string) => {
    const items = await listCatalog(await getProfile(profileId))
    for (const it of items) catalogPaths.add(it.path)
    return items
  })
  // chỉ mở những đường dẫn mà catalog đã trả về, không mở đường dẫn tuỳ ý từ renderer
  ipcMain.handle('catalog:open', async (_e, path: string) => {
    if (!catalogPaths.has(path)) throw new Error('Đường dẫn không hợp lệ')
    const err = await shell.openPath(path)
    if (err) throw new Error(err)
  })
  ipcMain.handle('profiles:delete', async (_e, id: string, removeData: boolean) => {
    const p = (await loadProfiles()).find((x) => x.id === id)
    await deleteProfile(id)
    // dọn dấu vết của profile trong cài đặt của app
    const s = readAppSettings()
    if (s.closedProfiles?.includes(id)) updateAppSettings({ closedProfiles: s.closedProfiles.filter((x) => x !== id) })
    // thư mục đăng nhập: chỉ xoá thư mục do app tạo, và chỉ chuyển vào Thùng rác (khôi phục được)
    if (removeData && p && isAppManagedDir(p) && existsSync(p.configDir)) await shell.trashItem(p.configDir)
    await refreshWatchers()
  })
  ipcMain.handle('sessions:list', async (_e, profileId: string, days: number) =>
    listSessions(await getProfile(profileId), days, (await getFlags(profileId)).pinned)
  )
  ipcMain.handle('sessions:flags', (_e, profileId: string) => getFlags(profileId))
  ipcMain.handle('sessions:setFlag', (_e, profileId: string, sessionId: string, flag: FlagName, on: boolean) =>
    setFlag(profileId, sessionId, flag, on)
  )
  // đổi tên: ghi vào dữ liệu của CLI (Claude Code / Codex cùng thấy), bỏ tên cũ chỉ lưu trong app (nếu có)
  ipcMain.handle('sessions:rename', async (_e, profileId: string, file: string, name: string) => {
    const p = await getProfile(profileId)
    assertInside(sessionRoot(p), file)
    await writeSessionTitle(p, file, String(name ?? ''))
    return renameSession(profileId, sessionIdFromFile(p, file), '')
  })
  ipcMain.handle('sessions:transcript', async (_e, profileId: string, file: string) => {
    const p = await getProfile(profileId)
    assertInside(sessionRoot(p), file)
    return readTranscript(p, file)
  })
  // xoá session: 'trash' = chuyển vào Thùng rác (khôi phục được), 'permanent' = xoá hẳn
  ipcMain.handle('sessions:delete', async (_e, profileId: string, meta: { filePath: string; title: string; cwd: string }, mode: 'trash' | 'permanent') => {
    const file = meta.filePath
    const p = await getProfile(profileId)
    assertInside(sessionRoot(p), file)
    const targets = await sessionFiles(p, file)
    for (const t of targets) {
      assertInside(sessionRoot(p), t)
      if (mode === 'trash') await shell.trashItem(t)
      else await rm(t, { recursive: true, force: true })
    }
    // gỡ ghim / ẩn của session đã xoá
    const id = sessionIdFromFile(p, file)
    if (mode === 'trash' && targets.length) {
      await addTrashed({ profileId, sessionId: id, title: String(meta.title ?? ''), cwd: String(meta.cwd ?? ''), paths: targets })
    }
    await setFlag(profileId, id, 'pinned', false)
    await setFlag(profileId, id, 'hidden', false)
    return targets.length
  })
  ipcMain.handle('trash:list', (_e, profileId: string) => listTrashed(profileId))
  ipcMain.handle('trash:restore', (_e, trashId: string) => restoreTrashed(trashId))
  ipcMain.handle('trash:purge', (_e, trashId: string) => purgeTrashed(trashId))
  ipcMain.handle('dialog:folder', async () => {
    // mở sẵn ở thư mục chọn lần trước (nếu còn tồn tại), không thì để Windows tự chọn
    const last = readAppSettings().lastFolder
    const defaultPath = last && existsSync(last) ? last : undefined
    const r = await dialog.showOpenDialog(win!, { properties: ['openDirectory'], defaultPath })
    if (r.canceled) return null
    updateAppSettings({ lastFolder: r.filePaths[0] })
    return r.filePaths[0]
  })
  ipcMain.handle('pty:spawn', async (_e, req: PtySpawnRequest) => {
    const p = await getProfile(req.profileId)
    return spawnPty(
      p,
      req,
      (d) => send('pty:data', req.ptyId, d),
      (code) => send('pty:exit', req.ptyId, code)
    )
  })
  ipcMain.on('pty:write', (_e, id: string, data: string) => writePty(id, data))
  ipcMain.on('pty:resize', (_e, id: string, c: number, r: number) => resizePty(id, c, r))
  ipcMain.on('pty:kill', (_e, id: string) => killPty(id))

  ipcMain.handle('chat:send', async (_e, chatId: string, opts: ChatOpenOptions, text: string, images?: ChatImage[]) => {
    try {
      await chatSend(chatId, opts, text, images ?? [], (id, ev) => send('chat:event', id, ev))
      return { ok: true }
    } catch (err) {
      return { ok: false, error: String((err as Error).message ?? err) }
    }
  })
  ipcMain.handle('chat:interrupt', (_e, chatId: string) => chatInterrupt(chatId))
  ipcMain.handle('chat:mode', (_e, chatId: string, mode: string) => chatSetMode(chatId, mode))
  ipcMain.on('chat:permission', (_e, chatId: string, reqId: string, d: 'allow' | 'always' | 'deny') =>
    chatPermission(chatId, reqId, d)
  )
  ipcMain.on('chat:answer', (_e, chatId: string, reqId: string, answers: Record<string, string> | null) =>
    chatAnswer(chatId, reqId, answers)
  )
  ipcMain.handle('chat:setModel', (_e, chatId: string, model: string | undefined) => chatSetModel(chatId, model))
  ipcMain.handle('chat:models', (_e, profileId: string, chatId: string | null) => chatModels(profileId, chatId))
  ipcMain.handle('dialog:files', async () => {
    const r = await dialog.showOpenDialog(win!, { properties: ['openFile', 'multiSelections'], title: 'Đính kèm file' })
    return r.canceled ? [] : readAttachments(r.filePaths)
  })
  ipcMain.handle('files:attachments', (_e, paths: string[]) => readAttachments(paths))
  ipcMain.handle('layout:get', (_e, profileId: string) => getLayout(profileId))
  ipcMain.on('layout:set', (_e, profileId: string, layout: WorkspaceLayout) => setLayout(profileId, layout))
  ipcMain.handle('stats:get', async (_e, profileId: string, days: number) => getStats(await getProfile(profileId), days))
  ipcMain.handle('profiles:closed', () => readAppSettings().closedProfiles ?? [])
  ipcMain.on('profiles:setClosed', (_e, ids: string[]) => updateAppSettings({ closedProfiles: Array.isArray(ids) ? ids.map(String) : [] }))
  ipcMain.handle('update:state', () => getUpdateState())
  ipcMain.handle('update:check', () => checkForUpdate())
  ipcMain.handle('update:download', () => downloadUpdate())
  ipcMain.handle('update:install', () => installUpdate())
  ipcMain.handle('app:info', () => ({ isDev, version: app.getVersion() }))
  ipcMain.on('chat:close', (_e, chatId: string) => chatClose(chatId))
  ipcMain.on('chat:suspend', (_e, chatId: string) => chatSuspend(chatId))
  ipcMain.handle('files:list', (_e, cwd: string) => listProjectFiles(cwd))
  ipcMain.handle('files:openInVscode', (_e, file: string, opts: { cwd?: string; line?: number; needle?: string }) =>
    openInVscode(file, opts)
  )
  ipcMain.handle('chat:usage', (_e, profileId: string, chatId: string | null, force: boolean) =>
    chatUsage(profileId, chatId, force)
  )
  ipcMain.handle('chat:defaultModel', (_e, profileId: string) => chatDefaultModel(profileId))
  ipcMain.handle('chat:commands', (_e, profileId: string, cwd: string, chatId: string | null) =>
    chatCommands(profileId, cwd, chatId)
  )
}

/** URL của chính giao diện app (dev server hoặc file đã build). */
function isAppUrl(url: string): boolean {
  const dev = process.env.ELECTRON_RENDERER_URL
  if (dev && url.startsWith(dev)) return true
  return url.startsWith('file://') && /[\\/]renderer[\\/]index\.html/i.test(decodeURIComponent(url))
}

/** http(s) → cửa sổ xem web riêng (đóng được như cửa sổ thường); mailto → app mặc định; còn lại bỏ qua. */
function openLink(url: string) {
  if (/^https?:\/\//i.test(url)) openWebWindow(url)
  else if (/^mailto:/i.test(url)) void shell.openExternal(url)
}

function openWebWindow(url: string) {
  const w = new BrowserWindow({
    width: 1100,
    height: 800,
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    title: url,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
  })
  // link mở tab mới trong trang → thêm cửa sổ cùng loại
  w.webContents.setWindowOpenHandler(({ url: u }) => {
    if (/^https?:\/\//i.test(u)) openWebWindow(u)
    return { action: 'deny' }
  })
  // Ctrl+W đóng cửa sổ web; Ctrl+Shift+O mở trang đang xem bằng trình duyệt mặc định
  w.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown' || !input.control) return
    const k = input.key.toLowerCase()
    if (k === 'w') {
      e.preventDefault()
      w.close()
    } else if (k === 'o' && input.shift) {
      e.preventDefault()
      void shell.openExternal(w.webContents.getURL())
    }
  })
  void w.loadURL(url)
}

function createWindow() {
  win = new BrowserWindow({
    width: 1500,
    height: 920,
    minWidth: 900,
    minHeight: 560,
    backgroundColor: '#15161a',
    title: isDev ? 'AI Board (dev)' : 'AI Board',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false
    }
  })
  // link trong app (markdown, nguồn tham khảo...): mở ở cửa sổ riêng, không cho cửa sổ chính rời khỏi app
  win.webContents.setWindowOpenHandler(({ url }) => {
    openLink(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (isAppUrl(url)) return
    e.preventDefault()
    openLink(url)
  })
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
  // phím tắt của app: bắt trước khi trang (kể cả terminal) nhận phím; Ctrl+W mặc định của Electron là đóng cửa sổ
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown' || !input.control || input.alt || input.meta) return
    const k = input.key.toLowerCase()
    let action = ''
    if (k === 'w' && !input.shift) action = 'close-tab'
    else if (k === 'tab' || k === 'pagedown' || k === 'pageup') action = input.shift || k === 'pageup' ? 'prev-tab' : 'next-tab'
    else if (/^[1-9]$/.test(input.key) && !input.shift) action = 'tab-' + input.key
    if (!action) return
    e.preventDefault()
    send('shortcut', action)
  })
  // giữ tiêu đề "(dev)" thay vì để <title> của trang ghi đè
  if (isDev) win.on('page-title-updated', (e) => e.preventDefault())
  win.on('closed', () => {
    win = null
    // đóng app thì đóng luôn các cửa sổ web đã mở từ link (để app thoát hẳn)
    for (const w of BrowserWindow.getAllWindows()) w.close()
  })
}

// cố định thư mục dữ liệu (%APPDATA%\ai-board) cho cả bản dev và bản cài,
// để profile, ghim/ẩn và cài đặt không bị mất khi đổi tên hiển thị của app
app.setPath('userData', join(app.getPath('appData'), 'ai-board'))
if (isDev) {
  // bản dev chạy song song với bản đã cài: dữ liệu Chromium (cache, localStorage) để riêng
  // cho hai process không tranh nhau khoá; profile, ghim/ẩn và cài đặt vẫn dùng chung
  app.setPath('sessionData', join(app.getPath('userData'), 'dev-session'))
} else if (!app.requestSingleInstanceLock()) {
  // bản đã cài chỉ chạy một cửa sổ: mở lần nữa thì đưa cửa sổ cũ lên
  app.quit()
}
app.on('second-instance', () => {
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.focus()
})

app.whenReady().then(async () => {
  registerIpc()
  await refreshWatchers()
  createWindow()
  initUpdater((s) => send('update:changed', s))
  // tên session cũ chỉ lưu trong app → ghi vào file session để Claude Code cùng thấy
  void migrateAppNames(
    await loadProfiles(),
    async (id) => (await getFlags(id)).names ?? {},
    (pid, sid) => renameSession(pid, sid, '')
  ).catch(() => undefined)
  // session nằm trong thùng rác quá 30 ngày → xoá hẳn (lúc mở app và mỗi 6 giờ)
  const sweep = () => void purgeExpired().catch(() => undefined)
  setTimeout(sweep, 10_000)
  setInterval(sweep, 6 * 3600_000)
})

app.on('window-all-closed', async () => {
  killAll()
  closeAllChats()
  await closeWatchers()
  app.quit()
})
