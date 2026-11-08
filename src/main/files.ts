import { execFile } from 'child_process'
import { promises as fs, existsSync, statSync } from 'fs'
import { isAbsolute, join, relative, resolve, sep } from 'path'
import { shell } from 'electron'

const CACHE_MS = 30_000
const MAX_FILES = 30_000
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'out', 'dist', 'build', '.next', '.nuxt', '.venv', 'venv', '__pycache__',
  '.idea', '.vscode-test', 'target', 'bin', 'obj', '.gradle', '.cache', 'coverage', 'vendor'
])
const cache = new Map<string, { at: number; files: string[] }>()

function gitFiles(cwd: string): Promise<string[] | null> {
  return new Promise((done) => {
    execFile(
      'git',
      ['-C', cwd, 'ls-files', '--cached', '--others', '--exclude-standard'],
      { windowsHide: true, timeout: 8000, maxBuffer: 64 * 1024 * 1024 },
      (err, stdout) => (err ? done(null) : done(stdout.split('\n').filter(Boolean).slice(0, MAX_FILES)))
    )
  })
}

async function walkFiles(root: string): Promise<string[]> {
  const out: string[] = []
  async function walk(dir: string, depth: number) {
    if (out.length >= MAX_FILES || depth > 15) return
    let entries: import('fs').Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (out.length >= MAX_FILES) return
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) await walk(join(dir, e.name), depth + 1)
      } else if (e.isFile()) {
        out.push(relative(root, join(dir, e.name)).split(sep).join('/'))
      }
    }
  }
  await walk(root, 0)
  return out
}

/** Đường dẫn tương đối (dùng "/") của các file trong thư mục session, cho menu "@". */
export async function listProjectFiles(cwd: string): Promise<string[]> {
  if (!cwd || !existsSync(cwd)) return []
  const key = cwd.toLowerCase()
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.files
  // repo git: tôn trọng .gitignore; không phải repo: tự duyệt, bỏ các thư mục build/thư viện
  const files = (await gitFiles(cwd)) ?? (await walkFiles(cwd))
  cache.set(key, { at: Date.now(), files })
  return files
}

/** Dòng (1-based) đầu tiên chứa đoạn text, để mở đúng chỗ vừa sửa. */
async function findLine(file: string, needle: string): Promise<number | undefined> {
  const first = needle.split(/\r?\n/).find((l) => l.trim())
  if (!first) return undefined
  try {
    const text = await fs.readFile(file, 'utf8')
    const idx = text.indexOf(first)
    return idx < 0 ? undefined : text.slice(0, idx).split('\n').length
  } catch {
    return undefined
  }
}

/** Mở file trong VS Code (đúng dòng nếu biết) qua URL vscode://file/... */
export async function openInVscode(file: string, opts: { cwd?: string; line?: number; needle?: string } = {}) {
  const abs = isAbsolute(file) ? file : resolve(opts.cwd ?? '', file)
  if (!existsSync(abs) || !statSync(abs).isFile()) throw new Error('Không tìm thấy file: ' + abs)
  const line = opts.line ?? (opts.needle ? await findLine(abs, opts.needle) : undefined) ?? 1
  const url = `vscode://file/${encodeURI(abs.replace(/\\/g, '/'))}:${line}:1`
  await shell.openExternal(url)
}
