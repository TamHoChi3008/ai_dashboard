import { promises as fs } from 'fs'
import { join, basename } from 'path'
import { zstdDecompressSync } from 'zlib'
import type { Profile, SessionSummary, Transcript } from '@shared/types'
import { parseClaude } from './claudeParse'
import { parseCodex } from './codexParse'
import { decideStatus, type ParsedSession } from './common'

const MAX_TRANSCRIPT_ITEMS = 400

interface CacheEntry {
  mtime: number
  size: number
  parsed: ParsedSession
}
const cache = new Map<string, CacheEntry>()

export async function readLines(file: string): Promise<string[]> {
  let buf = await fs.readFile(file)
  if (file.endsWith('.zst')) buf = zstdDecompressSync(buf)
  return buf.toString('utf8').split('\n')
}

async function parseFile(provider: Profile['provider'], file: string): Promise<{ parsed: ParsedSession; mtime: number }> {
  const st = await fs.stat(file)
  const mtime = st.mtimeMs
  const now = Date.now()
  let hit = cache.get(file)
  if (!hit || hit.mtime !== mtime || hit.size !== st.size) {
    const lines = await readLines(file)
    const parsed = provider === 'claude' ? parseClaude(lines, mtime, now) : parseCodex(lines, mtime, now)
    hit = { mtime, size: st.size, parsed }
    cache.set(file, hit)
  }
  // trạng thái phụ thuộc thời gian hiện tại → luôn tính lại
  return { parsed: { ...hit.parsed, status: decideStatus(hit.parsed.busy, mtime, now) }, mtime }
}

/** Liệt kê file (đệ quy tới maxDepth) có mtime trong cửa sổ thời gian. */
export async function walk(dir: string, maxDepth: number, accept: (name: string) => boolean, keep: (file: string, mtime: number) => boolean, out: string[]) {
  let entries: import('fs').Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) {
      if (maxDepth > 0) await walk(full, maxDepth - 1, accept, keep, out)
    } else if (accept(e.name)) {
      try {
        const st = await fs.stat(full)
        if (keep(full, st.mtimeMs)) out.push(full)
      } catch {
        /* file vừa bị xoá */
      }
    }
  }
}

export function sessionRoot(p: Profile): string {
  return p.provider === 'claude' ? join(p.configDir, 'projects') : join(p.configDir, 'sessions')
}

export function sessionIdFromFile(p: Profile, file: string): string {
  const name = basename(file).replace(/\.zst$/, '').replace(/\.jsonl$/, '')
  if (p.provider === 'claude') return name
  // rollout-2026-09-16T23-23-36-<uuid>
  const m = name.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i)
  return m ? m[1] : name
}

async function codexTitles(p: Profile): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  try {
    const txt = await fs.readFile(join(p.configDir, 'session_index.jsonl'), 'utf8')
    for (const line of txt.split('\n')) {
      try {
        const d = JSON.parse(line)
        if (d.id && d.thread_name) map.set(d.id, d.thread_name)
      } catch {
        /* bỏ qua dòng hỏng */
      }
    }
  } catch {
    /* chưa có index */
  }
  return map
}

export async function listSessions(p: Profile, days: number, alwaysIds: string[] = []): Promise<SessionSummary[]> {
  const since = days > 0 ? Date.now() - days * 86400_000 : 0
  // session đã ghim luôn được lấy, kể cả khi cũ hơn khoảng thời gian đang lọc
  const always = new Set(alwaysIds)
  const keep = (file: string, mtime: number) => mtime >= since || always.has(sessionIdFromFile(p, file))
  const files: string[] = []
  if (p.provider === 'claude') {
    await walk(sessionRoot(p), 1, (n) => n.endsWith('.jsonl'), keep, files)
  } else {
    await walk(sessionRoot(p), 4, (n) => n.startsWith('rollout-') && /\.jsonl(\.zst)?$/.test(n), keep, files)
  }
  const titles = p.provider === 'codex' ? await codexTitles(p) : new Map<string, string>()

  const out: SessionSummary[] = []
  await Promise.all(
    files.map(async (file) => {
      try {
        const { parsed, mtime } = await parseFile(p.provider, file)
        // bỏ session rỗng và session phụ do agent tự sinh
        if (parsed.items.length === 0 || parsed.source === 'subagent') return
        const id = sessionIdFromFile(p, file)
        out.push({
          id,
          profileId: p.id,
          provider: p.provider,
          title: titles.get(id) || parsed.title,
          cwd: parsed.cwd,
          source: parsed.source,
          updatedAt: mtime,
          status: parsed.status,
          filePath: file
        })
      } catch {
        /* file đang ghi dở hoặc không đọc được */
      }
    })
  )
  // Một session Codex có thể có cả bản .jsonl và .jsonl.zst → giữ bản mới nhất
  const byId = new Map<string, SessionSummary>()
  for (const s of out) {
    const old = byId.get(s.id)
    if (!old || old.updatedAt < s.updatedAt) byId.set(s.id, s)
  }
  return [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt)
}

/** Tiêu đề tự động của một file session (bỏ qua tên người dùng đặt). */
export async function autoTitleOf(p: Profile, file: string): Promise<string> {
  return (await parseFile(p.provider, file)).parsed.autoTitle
}

export async function readTranscript(p: Profile, file: string): Promise<Transcript> {
  const { parsed } = await parseFile(p.provider, file)
  const items = parsed.items
  return { items: items.slice(-MAX_TRANSCRIPT_ITEMS), total: items.length }
}

/**
 * Các file/thư mục thuộc một session, dùng khi xoá.
 * Claude: <id>.jsonl và thư mục <id>/ (session phụ của agent). Codex: cả bản .jsonl và .jsonl.zst.
 */
export async function sessionFiles(p: Profile, file: string): Promise<string[]> {
  const candidates =
    p.provider === 'claude'
      ? [file, file.replace(/\.jsonl$/, '')]
      : [file.replace(/\.zst$/, ''), file.replace(/\.zst$/, '') + '.zst']
  const out: string[] = []
  for (const c of new Set(candidates)) {
    try {
      await fs.stat(c)
      out.push(c)
    } catch {
      /* không có */
    }
  }
  return out
}
