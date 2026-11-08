import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateState } from '@shared/types'

/**
 * Tự cập nhật từ GitHub Releases (electron-updater).
 * Chỉ chạy ở bản đã cài; bản dev (`npm run dev`) báo "không hỗ trợ".
 * Không tự tải: người dùng bấm "Cập nhật" mới tải, tải xong bấm "Khởi động lại để cài".
 */
type Updater = typeof autoUpdater

let updater: Updater | null = null
let state: UpdateState = { status: app.isPackaged ? 'idle' : 'unsupported', current: app.getVersion() }
let notify: (s: UpdateState) => void = () => undefined

/** Lỗi thường gặp → câu dễ hiểu. */
function friendly(err: unknown): string {
  const m = String((err as Error)?.message ?? err).split('\n')[0]
  if (/No published versions/i.test(m)) return 'Chưa có bản nào được phát hành trên GitHub.'
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|net::ERR/i.test(m)) return 'Không kết nối được GitHub (kiểm tra mạng).'
  if (/404/.test(m)) return 'Không tìm thấy bản phát hành trên GitHub (404).'
  return m
}

function set(patch: Partial<UpdateState>) {
  state = { ...state, ...patch, current: app.getVersion() }
  notify(state)
}

/** Ghi chú phát hành: GitHub trả HTML hoặc danh sách theo phiên bản → gộp thành chữ thường. */
function notesText(n: unknown): string {
  const strip = (s: string) =>
    s
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|li|h\d)>/gi, '\n')
      .replace(/<li>/gi, '• ')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  if (typeof n === 'string') return strip(n)
  if (Array.isArray(n)) return n.map((x) => `v${x?.version ?? ''}\n${strip(String(x?.note ?? ''))}`).join('\n\n')
  return ''
}

async function load(): Promise<Updater | null> {
  if (!app.isPackaged) return null
  if (updater) return updater
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('checking-for-update', () => set({ status: 'checking', error: undefined }))
  autoUpdater.on('update-available', (info) =>
    set({ status: 'available', version: info.version, notes: notesText(info.releaseNotes), releaseDate: info.releaseDate })
  )
  autoUpdater.on('update-not-available', () => set({ status: 'latest', checkedAt: Date.now() }))
  autoUpdater.on('download-progress', (p) => set({ status: 'downloading', percent: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', (info) => set({ status: 'downloaded', version: info.version, percent: 100 }))
  autoUpdater.on('error', (err) => set({ status: 'error', error: friendly(err) }))
  updater = autoUpdater
  return updater
}

export function initUpdater(onChange: (s: UpdateState) => void) {
  notify = onChange
  // bản đã cài: tự kiểm tra sau khi mở app một lúc, rồi mỗi 6 giờ (chỉ kiểm tra, không tự tải)
  if (app.isPackaged) {
    setTimeout(() => void checkForUpdate(), 15_000)
    setInterval(() => void checkForUpdate(), 6 * 3600_000)
  }
}

export const getUpdateState = () => state

export async function checkForUpdate(): Promise<UpdateState> {
  const u = await load()
  if (!u) return state
  // đang tải / đã tải xong thì không kiểm tra lại (tránh mất trạng thái)
  if (state.status === 'downloading' || state.status === 'downloaded') return state
  try {
    await u.checkForUpdates()
  } catch (err) {
    set({ status: 'error', error: friendly(err) })
  }
  return state
}

export async function downloadUpdate() {
  const u = await load()
  if (!u || state.status !== 'available') return
  set({ status: 'downloading', percent: 0 })
  try {
    await u.downloadUpdate()
  } catch (err) {
    set({ status: 'error', error: friendly(err) })
  }
}

/** Thoát app và chạy bộ cài bản mới (cài xong tự mở lại). */
export async function installUpdate() {
  const u = await load()
  if (!u || state.status !== 'downloaded') return
  // cài im lặng (không hiện lại các bước của bộ cài), cài xong tự mở lại app
  setImmediate(() => u.quitAndInstall(true, true))
}
