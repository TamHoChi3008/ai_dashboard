import { app } from 'electron'
import { promises as fs, existsSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { join, resolve } from 'path'
import { randomUUID } from 'crypto'
import type { Profile, ProfileInfo } from '@shared/types'

const COLORS = ['#d97757', '#10a37f', '#6c8cff', '#c678dd', '#e5c07b', '#56b6c2']

export const DEFAULT_DIRS = {
  claude: join(homedir(), '.claude'),
  codex: join(homedir(), '.codex')
}

function storeFile() {
  return join(app.getPath('userData'), 'profiles.json')
}

let profiles: Profile[] | null = null

export async function loadProfiles(): Promise<Profile[]> {
  if (profiles) return profiles
  try {
    profiles = JSON.parse(await fs.readFile(storeFile(), 'utf8'))
  } catch {
    // lần chạy đầu: tạo sẵn 2 profile dùng thư mục mặc định
    profiles = [
      { id: randomUUID(), name: 'Claude', provider: 'claude', configDir: DEFAULT_DIRS.claude, color: COLORS[0] },
      { id: randomUUID(), name: 'Codex', provider: 'codex', configDir: DEFAULT_DIRS.codex, color: COLORS[1] }
    ]
    await persist()
  }
  return profiles!
}

async function persist() {
  const file = storeFile()
  await fs.mkdir(join(file, '..'), { recursive: true })
  const tmp = file + '.tmp'
  await fs.writeFile(tmp, JSON.stringify(profiles, null, 2), 'utf8')
  await fs.rename(tmp, file)
}

export async function getProfile(id: string): Promise<Profile> {
  const p = (await loadProfiles()).find((x) => x.id === id)
  if (!p) throw new Error('Không tìm thấy profile ' + id)
  return p
}

export function isDefaultDir(p: Profile): boolean {
  return resolve(p.configDir).toLowerCase() === resolve(DEFAULT_DIRS[p.provider]).toLowerCase()
}

/** Đọc email tài khoản đang đăng nhập. Chỉ đọc trường email, không đụng tới token. */
export function readAccount(p: Profile): string | undefined {
  try {
    if (p.provider === 'claude') {
      // thư mục mặc định: ~/.claude.json ; CLAUDE_CONFIG_DIR: <dir>/.claude.json
      const f = isDefaultDir(p) ? join(homedir(), '.claude.json') : join(p.configDir, '.claude.json')
      if (!existsSync(f)) return undefined
      return JSON.parse(readFileSync(f, 'utf8')).oauthAccount?.emailAddress
    }
    const f = join(p.configDir, 'auth.json')
    if (!existsSync(f)) return undefined
    const auth = JSON.parse(readFileSync(f, 'utf8'))
    const idt: string | undefined = auth.tokens?.id_token
    if (idt) return JSON.parse(Buffer.from(idt.split('.')[1], 'base64url').toString('utf8')).email
    if (auth.OPENAI_API_KEY) return 'API key'
  } catch {
    /* file hỏng hoặc định dạng khác */
  }
  return undefined
}

/** Thư mục cấu hình nằm trong userData/accounts (do app tạo khi thêm profile). */
export function isAppManagedDir(p: Profile): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/\//g, '\\').replace(/\\+$/, '')
  return norm(p.configDir).startsWith(norm(join(app.getPath('userData'), 'accounts')) + '\\')
}

export function toInfo(p: Profile): ProfileInfo {
  return { ...p, account: readAccount(p), isDefaultDir: isDefaultDir(p), appManagedDir: isAppManagedDir(p) }
}

export async function saveProfile(
  input: Omit<Profile, 'id' | 'configDir'> & { id?: string; configDir?: string }
): Promise<Profile> {
  const list = await loadProfiles()
  const id = input.id ?? randomUUID()
  const existing = list.find((x) => x.id === id)
  const configDir =
    input.configDir?.trim() || existing?.configDir || join(app.getPath('userData'), 'accounts', `${input.provider}-${id.slice(0, 8)}`)
  await fs.mkdir(configDir, { recursive: true })
  const p: Profile = {
    id,
    name: input.name.trim() || input.provider,
    provider: input.provider,
    configDir,
    color: input.color || COLORS[list.length % COLORS.length],
    cliPath: input.cliPath?.trim() || undefined
  }
  if (existing) Object.assign(existing, p)
  else list.push(p)
  await persist()
  return p
}

/** Sắp xếp lại theo danh sách id (thứ tự tab). Id lạ bị bỏ qua; profile thiếu trong danh sách giữ ở cuối. */
export async function reorderProfiles(ids: string[]) {
  const list = await loadProfiles()
  const rank = new Map(ids.map((id, i) => [id, i]))
  profiles = [...list].sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity))
  await persist()
}

/** Chỉ xoá profile khỏi danh sách; không xoá thư mục cấu hình/đăng nhập. */
export async function deleteProfile(id: string) {
  const list = await loadProfiles()
  profiles = list.filter((x) => x.id !== id)
  await persist()
}
