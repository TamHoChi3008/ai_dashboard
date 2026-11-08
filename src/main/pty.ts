import { existsSync, readdirSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { spawnSync } from 'child_process'
import * as pty from '@lydell/node-pty'
import type { Profile, PtySpawnRequest } from '@shared/types'
import { isDefaultDir } from './profiles'

const terms = new Map<string, pty.IPty>()

function onPath(cmd: string): boolean {
  const r = spawnSync('where', [cmd], { windowsHide: true })
  return r.status === 0
}

/** Tìm codex.exe: PATH trước, sau đó bản đi kèm extension VS Code (openai.chatgpt-*). */
function findCodex(): string | undefined {
  if (onPath('codex')) return 'codex'
  const extDir = join(homedir(), '.vscode', 'extensions')
  try {
    const dirs = readdirSync(extDir)
      .filter((d) => d.startsWith('openai.chatgpt-'))
      .sort()
      .reverse()
    for (const d of dirs) {
      for (const sub of ['windows-x86_64', 'windows-aarch64']) {
        const exe = join(extDir, d, 'bin', sub, 'codex.exe')
        if (existsSync(exe)) return exe
      }
    }
  } catch {
    /* không có extension */
  }
  return undefined
}

export function resolveCli(p: Profile): string | undefined {
  if (p.cliPath) return p.cliPath
  if (p.provider === 'claude') return onPath('claude') ? 'claude' : undefined
  return findCodex()
}

/** Môi trường sạch cho CLI: bỏ biến của phiên Claude/Codex cha, gắn thư mục cấu hình của profile. */
export function buildEnv(p: Profile): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue
    if (/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_CONFIG_DIR$|CODEX_HOME$|CODEX_)/.test(k)) continue
    if (k === 'ELECTRON_RUN_AS_NODE') continue
    env[k] = v
  }
  if (!isDefaultDir(p)) {
    if (p.provider === 'claude') env.CLAUDE_CONFIG_DIR = p.configDir
    else env.CODEX_HOME = p.configDir
  }
  env.TERM = 'xterm-256color'
  env.COLORTERM = 'truecolor'
  return env
}

function quote(s: string) {
  return /[\s&()^|<>"]/.test(s) ? `"${s.replace(/"/g, '')}"` : s
}

export function buildArgs(p: Profile, req: PtySpawnRequest): string[] {
  if (req.mode === 'login') return p.provider === 'claude' ? ['/login'] : ['login']
  if (req.resumeSessionId) return p.provider === 'claude' ? ['--resume', req.resumeSessionId] : ['resume', req.resumeSessionId]
  return []
}

export function spawnPty(
  p: Profile,
  req: PtySpawnRequest,
  onData: (d: string) => void,
  onExit: (code: number) => void
): { ok: boolean; error?: string } {
  const cli = resolveCli(p)
  if (!cli) {
    return {
      ok: false,
      error:
        p.provider === 'claude'
          ? 'Không tìm thấy lệnh "claude". Cài: npm i -g @anthropic-ai/claude-code, hoặc nhập đường dẫn CLI trong profile.'
          : 'Không tìm thấy codex. Cài: npm i -g @openai/codex, hoặc nhập đường dẫn CLI trong profile.'
    }
  }
  const cwd = req.cwd && existsSync(req.cwd) ? req.cwd : homedir()
  const commandLine = [quote(cli), ...buildArgs(p, req).map(quote)].join(' ')
  // chạy qua cmd /k để vẫn giữ cửa sổ khi CLI thoát (xem được lỗi, gõ lại lệnh)
  // truyền chuỗi lệnh thô: cmd.exe tự xử lý dấu ngoặc kép, không để node-pty escape lại
  const term = pty.spawn('cmd.exe', `/d /k ${commandLine}`, {
    name: 'xterm-256color',
    cols: Math.max(20, req.cols),
    rows: Math.max(5, req.rows),
    cwd,
    env: buildEnv(p)
  })
  terms.set(req.ptyId, term)
  term.onData(onData)
  term.onExit(({ exitCode }) => {
    terms.delete(req.ptyId)
    onExit(exitCode)
  })
  return { ok: true }
}

export function writePty(id: string, data: string) {
  terms.get(id)?.write(data)
}

export function resizePty(id: string, cols: number, rows: number) {
  try {
    terms.get(id)?.resize(Math.max(20, cols), Math.max(5, rows))
  } catch {
    /* pty vừa thoát */
  }
}

export function killPty(id: string) {
  const t = terms.get(id)
  if (!t) return
  terms.delete(id)
  try {
    t.kill()
  } catch {
    /* đã thoát */
  }
}

export function killAll() {
  for (const id of [...terms.keys()]) killPty(id)
}
