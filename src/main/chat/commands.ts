import { existsSync } from 'fs'
import { homedir } from 'os'
import type { Profile } from '@shared/types'
import type { SlashCommandInfo } from '@shared/slash'
import { timeout, withProbe } from './usage'

type Query = ReturnType<(typeof import('@anthropic-ai/claude-agent-sdk'))['query']>

const CACHE_MS = 5 * 60_000
const cache = new Map<string, { at: number; list: SlashCommandInfo[] }>()

function clean(list: any[]): SlashCommandInfo[] {
  return list
    .filter((c) => c?.name && !String(c.name).startsWith('__')) // bỏ command nội bộ
    .map((c) => ({
      name: String(c.name),
      description: String(c.description ?? ''),
      argumentHint: String(c.argumentHint ?? ''),
      aliases: Array.isArray(c.aliases) ? c.aliases.map(String) : undefined,
      builtin: !!c.builtin
    }))
}

/**
 * Danh sách slash command của Claude Code cho profile + thư mục (command của project phụ thuộc cwd).
 * Dùng phiên chat đang chạy nếu có, không thì mở CLI tạm (không gửi tin nhắn, không tốn token).
 */
export async function listCommands(p: Profile, cwd: string, running: Query | null): Promise<SlashCommandInfo[]> {
  const key = `${p.id}|${cwd.toLowerCase()}`
  const hit = cache.get(key)
  if (!running && hit && Date.now() - hit.at < CACHE_MS) return hit.list

  const dir = cwd && existsSync(cwd) ? cwd : homedir()
  const raw = await timeout(
    running ? running.supportedCommands() : withProbe(p, (q) => q.supportedCommands(), dir, ['user', 'project', 'local']),
    25_000
  )
  const list = clean(raw)
  cache.set(key, { at: Date.now(), list })
  return list
}
