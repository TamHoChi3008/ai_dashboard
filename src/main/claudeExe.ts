import { existsSync } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'
import { spawnSync } from 'child_process'
import type { Profile } from '@shared/types'

let found: string | null | undefined // undefined = chưa tìm

function where(name: string): string[] {
  const r = spawnSync('where', [name], { windowsHide: true, encoding: 'utf8' })
  return r.status === 0 ? r.stdout.split(/\r?\n/).filter(Boolean) : []
}

/** Tìm claude.exe của Claude Code đã cài trên máy (app không đóng gói kèm bản riêng). */
function findInstalled(): string | null {
  const npmPkg = (dir: string) => join(dir, 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe')
  const candidates = [
    // native installer
    join(homedir(), '.local', 'bin', 'claude.exe'),
    // npm i -g @anthropic-ai/claude-code (prefix mặc định)
    process.env.APPDATA ? npmPkg(join(process.env.APPDATA, 'npm')) : '',
    // npm với prefix khác: claude.cmd nằm cạnh node_modules
    ...where('claude.cmd').map((cmd) => npmPkg(dirname(cmd))),
    ...where('claude.exe')
  ]
  return candidates.find((c) => c && existsSync(c)) ?? null
}

/** Bản claude.exe đi kèm SDK (chỉ có khi chạy dev; bộ cài không đóng gói bản này). */
function bundledAvailable(): boolean {
  try {
    require.resolve('@anthropic-ai/claude-agent-sdk-win32-x64/package.json')
    return true
  } catch {
    return false
  }
}

/**
 * Đường dẫn claude.exe cho Agent SDK. Thứ tự: đường dẫn trong profile → bản đã cài trên máy → bản đi kèm SDK (dev).
 * Trả undefined = để SDK dùng bản đi kèm.
 */
export function claudeExecutable(p: Profile): string | undefined {
  if (p.cliPath && /\.(exe|js|cjs|mjs)$/i.test(p.cliPath) && existsSync(p.cliPath)) return p.cliPath
  if (found === undefined) found = findInstalled()
  if (found) return found
  if (bundledAvailable()) return undefined
  throw new Error(
    'Không tìm thấy Claude Code trên máy. Cài bằng: npm i -g @anthropic-ai/claude-code\n' +
      'hoặc nhập đường dẫn tới claude.exe trong "Sửa profile → Đường dẫn CLI".'
  )
}

/** Gọi lại khi người dùng vừa cài Claude Code mà app đang mở. */
export function resetClaudeExecutable() {
  found = undefined
}
