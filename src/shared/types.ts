export type Provider = 'claude' | 'codex'

/** Một profile = một tài khoản của một agent. Mỗi profile có thư mục cấu hình riêng. */
export interface Profile {
  id: string
  name: string
  provider: Provider
  /** Thư mục cấu hình (CLAUDE_CONFIG_DIR / CODEX_HOME). */
  configDir: string
  color: string
  /** Đường dẫn CLI tuỳ chọn; để trống thì tự tìm. */
  cliPath?: string
}

export interface ProfileInfo extends Profile {
  /** Email tài khoản đang đăng nhập (nếu đọc được). */
  account?: string
  isDefaultDir: boolean
  /** Thư mục cấu hình do app tạo (userData/accounts/...) → được phép xoá cùng profile. */
  appManagedDir: boolean
}

/** running: agent đang làm việc · waiting: tới lượt bạn · idle: không hoạt động gần đây */
export type SessionStatus = 'running' | 'waiting' | 'idle'

export interface SessionSummary {
  id: string
  profileId: string
  provider: Provider
  title: string
  cwd: string
  /** Nơi tạo session: claude-vscode, cli, vscode, ... */
  source: string
  updatedAt: number
  status: SessionStatus
  filePath: string
}

export type ChatRole = 'user' | 'assistant' | 'tool'

/** Thông tin thêm của một lần gọi tool: file liên quan và nội dung đã sửa. */
export interface ToolDetail {
  file?: string
  /** Dòng nên mở trong VS Code (nếu biết). */
  line?: number
  diff?: DiffHunk[]
}

export interface ChatItem extends ToolDetail {
  role: ChatRole
  text: string
  ts?: string
}

export interface Transcript {
  items: ChatItem[]
  total: number
}

/** Một plugin / skill / command / agent cài cho profile. */
export interface CatalogItem {
  kind: 'plugin' | 'skill' | 'command' | 'agent'
  /** Tên dùng để gọi; skill/command của plugin có dạng "plugin:tên". */
  name: string
  description: string
  /** Nguồn: user, tên plugin, marketplace... */
  source: string
  path: string
  enabled: boolean
  version?: string
}

/** Session đã chuyển vào Thùng rác của Windows (app nhớ để khôi phục). */
export interface TrashedSession {
  trashId: string
  profileId: string
  sessionId: string
  title: string
  cwd: string
  /** Đường dẫn gốc đã chuyển vào thùng rác; phần tử đầu là file session chính. */
  paths: string[]
  deletedAt: number
}

/** Trạng thái tự cập nhật (GitHub Releases). */
export interface UpdateState {
  /**
   * unsupported: bản dev · idle: chưa kiểm tra · checking · latest: đang là bản mới nhất ·
   * available: có bản mới · downloading · downloaded: chờ khởi động lại để cài · error
   */
  status: 'unsupported' | 'idle' | 'checking' | 'latest' | 'available' | 'downloading' | 'downloaded' | 'error'
  /** Phiên bản đang chạy. */
  current: string
  /** Phiên bản mới (khi có). */
  version?: string
  notes?: string
  releaseDate?: string
  percent?: number
  checkedAt?: number
  error?: string
}

export interface UsageWindow {
  key: string
  label: string
  /** Phần trăm đã dùng, 0–100. */
  utilization: number | null
  /** ISO 8601 */
  resetsAt: string | null
}

export interface UsageInfo {
  /** false: tài khoản không có giới hạn theo gói (API key...) hoặc không lấy được. */
  available: boolean
  subscription?: string | null
  windows: UsageWindow[]
  defaultModel?: string
  fetchedAt: number
  /** api: hỏi trực tiếp CLI · events: suy từ các lượt chat gần nhất */
  source: 'api' | 'events'
  error?: string
}

export interface PtySpawnRequest {
  ptyId: string
  profileId: string
  cwd?: string
  /** Có thì resume session đó, không có thì mở session mới. */
  resumeSessionId?: string
  /** 'login' để mở luồng đăng nhập. */
  mode?: 'chat' | 'login'
  cols: number
  rows: number
}

export interface BoardApi {
  listProfiles(): Promise<ProfileInfo[]>
  saveProfile(p: Omit<Profile, 'id' | 'configDir'> & { id?: string; configDir?: string }): Promise<ProfileInfo>
  /** Xoá profile; removeData = chuyển luôn thư mục đăng nhập (chỉ thư mục do app tạo) vào Thùng rác. */
  deleteProfile(id: string, removeData?: boolean): Promise<void>
  reorderProfiles(ids: string[]): Promise<void>
  listCatalog(profileId: string): Promise<CatalogItem[]>
  /** Mở file/thư mục của một mục trong catalog bằng ứng dụng mặc định. */
  openCatalogPath(path: string): Promise<void>
  listSessions(profileId: string, days: number): Promise<SessionSummary[]>
  readTranscript(profileId: string, filePath: string): Promise<Transcript>
  getSessionFlags(profileId: string): Promise<SessionFlags>
  /** Ghim / ẩn một session; trả về cờ mới của profile. */
  setSessionFlag(profileId: string, sessionId: string, flag: FlagName, on: boolean): Promise<SessionFlags>
  /**
   * Đổi tên session: ghi vào file của CLI nên Claude Code (/resume, VS Code) và Codex cùng thấy.
   * Tên rỗng = về tên tự động. Trả về cờ mới của profile.
   */
  renameSession(profileId: string, filePath: string, name: string): Promise<SessionFlags>
  /** Xoá session: chuyển vào Thùng rác hoặc xoá vĩnh viễn; trả về số file/thư mục đã xoá. */
  deleteSession(profileId: string, session: { filePath: string; title: string; cwd: string }, mode: 'trash' | 'permanent'): Promise<number>
  /** Session trong thùng rác của profile (mới xoá trước). */
  listTrash(profileId: string): Promise<TrashedSession[]>
  restoreTrash(trashId: string): Promise<{ ok: boolean; reason?: 'missing' | 'exists' | 'error'; message?: string }>
  purgeTrash(trashId: string): Promise<void>
  pickFolder(): Promise<string | null>
  ptySpawn(req: PtySpawnRequest): Promise<{ ok: boolean; error?: string }>
  ptyWrite(ptyId: string, data: string): void
  ptyResize(ptyId: string, cols: number, rows: number): void
  ptyKill(ptyId: string): void
  onPtyData(cb: (ptyId: string, data: string) => void): () => void
  onPtyExit(cb: (ptyId: string, code: number) => void): () => void
  onFilesChanged(cb: (profileId: string, filePaths: string[]) => void): () => void

  chatSend(chatId: string, opts: ChatOpenOptions, text: string, images?: ChatImage[]): Promise<{ ok: boolean; error?: string }>
  /** Trả lời câu hỏi AskUserQuestion; null = bỏ qua. */
  chatAnswer(chatId: string, reqId: string, answers: Record<string, string> | null): void
  /** Đổi model của phiên chat (undefined = mặc định). */
  chatSetModel(chatId: string, model: string | undefined): Promise<void>
  chatModels(profileId: string, chatId: string | null): Promise<ModelOption[]>
  /** Mở hộp thoại chọn file để đính kèm. */
  pickAttachments(): Promise<Attachment[]>
  /** Đọc file kéo thả vào ô chat. */
  readAttachments(paths: string[]): Promise<Attachment[]>
  /** Đường dẫn thật của file kéo thả (rỗng nếu không có). */
  pathForFile(file: File): string
  getLayout(profileId: string): Promise<WorkspaceLayout | null>
  saveLayout(profileId: string, layout: WorkspaceLayout): void
  getStats(profileId: string, days: number): Promise<ProfileStats>
  appInfo(): Promise<{ isDev: boolean; version: string }>
  getUpdateState(): Promise<UpdateState>
  checkForUpdate(): Promise<UpdateState>
  downloadUpdate(): Promise<void>
  /** Thoát app và cài bản đã tải (cài xong tự mở lại). */
  installUpdate(): Promise<void>
  onUpdateState(cb: (s: UpdateState) => void): () => void
  /** Id các profile đã đóng tab. */
  getClosedProfiles(): Promise<string[]>
  setClosedProfiles(ids: string[]): void
  /** Phím tắt bắt ở main: close-tab, next-tab, prev-tab, tab-1…tab-9. */
  onShortcut(cb: (action: string) => void): () => void
  chatInterrupt(chatId: string): Promise<void>
  chatSetMode(chatId: string, mode: string): Promise<void>
  chatPermission(chatId: string, reqId: string, decision: 'allow' | 'always' | 'deny'): void
  chatClose(chatId: string): void
  /** Đóng process CLI (giữ khung chat) để lần gửi sau resume từ file session mới nhất. */
  chatSuspend(chatId: string): void
  /** File trong thư mục session (đường dẫn tương đối, "/"), cho menu "@". */
  listProjectFiles(cwd: string): Promise<string[]>
  /** Mở file trong VS Code; needle = đoạn text để tìm đúng dòng vừa sửa. */
  openInVscode(file: string, opts?: { cwd?: string; line?: number; needle?: string }): Promise<void>
  /** Usage của gói (phiên 5 giờ, tuần). chatId (nếu có) dùng phiên đang chạy thay vì mở CLI tạm. */
  chatUsage(profileId: string, chatId: string | null, force: boolean): Promise<UsageInfo>
  /** Model đặt trong settings của profile, hoặc undefined = mặc định. */
  chatDefaultModel(profileId: string): Promise<string | undefined>
  /** Slash command của Claude Code cho profile + thư mục. */
  chatCommands(profileId: string, cwd: string, chatId: string | null): Promise<SlashCommandInfo[]>
  onChatEvent(cb: (chatId: string, e: ChatEvent) => void): () => void
}

import type { Attachment, ChatEvent, ChatImage, ChatOpenOptions, ModelOption } from './chat'
import type { WorkspaceLayout } from './layout'
import type { ProfileStats } from './stats'
import type { SlashCommandInfo } from './slash'
import type { FlagName, SessionFlags } from './sessionFlags'
import type { DiffHunk } from './diff'
