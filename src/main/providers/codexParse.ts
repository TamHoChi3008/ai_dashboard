import type { ChatItem } from '@shared/types'
import { ParsedSession, clip, decideStatus, safeJson, summarizeToolInput } from './common'

/** Parse các dòng JSONL của session Codex (<CODEX_HOME>/sessions/YYYY/MM/DD/rollout-*.jsonl[.zst]). */
export function parseCodex(lines: string[], mtime: number, now: number): ParsedSession {
  const items: ChatItem[] = []
  let cwd = ''
  let source = ''
  let firstPrompt = ''
  let busy = false

  for (const line of lines) {
    const d = safeJson(line)
    if (!d || typeof d !== 'object') continue
    const p = d.payload ?? {}
    const ts = d.timestamp

    if (d.type === 'session_meta') {
      cwd = cwd || p.cwd || ''
      // source có thể là object với session phụ, VD { subagent: {...} }
      const src = typeof p.source === 'string' ? p.source : p.source?.subagent ? 'subagent' : ''
      source = source || src || p.originator || ''
      continue
    }
    if (d.type === 'event_msg') {
      if (p.type === 'task_started') busy = true
      if (p.type === 'task_complete' || p.type === 'turn_aborted') busy = false
      continue
    }
    if (d.type !== 'response_item') continue

    if (p.type === 'message' && (p.role === 'user' || p.role === 'assistant')) {
      const text = (p.content ?? [])
        .filter((c: any) => typeof c?.text === 'string')
        .map((c: any) => c.text)
        .join('\n')
        .trim()
      // bỏ context do Codex tự chèn (<environment_context>, <user_instructions>, AGENTS.md...)
      if (!text || /^<[a-z_]+>/.test(text) || text.startsWith('# AGENTS.md')) continue
      items.push({ role: p.role, text, ts })
      if (p.role === 'user' && !firstPrompt) firstPrompt = clip(text, 80)
    } else if (p.type === 'function_call' || p.type === 'custom_tool_call' || p.type === 'local_shell_call') {
      const input = p.arguments ?? p.input ?? p.action
      items.push({ role: 'tool', text: `${p.name ?? p.type}: ${summarizeToolInput(input)}`, ts })
    }
  }

  return {
    title: firstPrompt || '(chưa có tiêu đề)',
    cwd,
    source: source || 'codex',
    items,
    status: decideStatus(busy, mtime, now),
    busy
  }
}
