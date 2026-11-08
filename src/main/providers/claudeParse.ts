import type { ChatItem } from '@shared/types'
import { ParsedSession, clip, decideStatus, safeJson, summarizeToolInput, toolDetail } from './common'

/** Parse các dòng JSONL của session Claude Code (<configDir>/projects/<proj>/<id>.jsonl). */
export function parseClaude(lines: string[], mtime: number, now: number): ParsedSession {
  const items: ChatItem[] = []
  let aiTitle = ''
  let summary = ''
  let firstPrompt = ''
  let cwd = ''
  let source = ''
  // busy = lượt cuối chưa xong (user vừa gửi, hoặc agent đang gọi tool)
  let busy = false

  for (const line of lines) {
    const d = safeJson(line)
    if (!d || typeof d !== 'object') continue
    if (d.type === 'ai-title' && d.aiTitle) aiTitle = d.aiTitle
    if (d.type === 'summary' && d.summary) summary = d.summary
    if (d.type !== 'user' && d.type !== 'assistant') continue
    if (d.isSidechain) continue
    if (!cwd && d.cwd) cwd = d.cwd
    if (!source && d.entrypoint) source = d.entrypoint
    if (d.isMeta) continue

    const msg = d.message ?? {}
    const content = typeof msg.content === 'string' ? [{ type: 'text', text: msg.content }] : msg.content ?? []

    if (d.type === 'user') {
      busy = true
      // ảnh đính kèm: ghi chú số ảnh trước nội dung chữ
      const imgs = content.filter((c: any) => c?.type === 'image').length
      if (imgs) items.push({ role: 'user', text: `🖼 ${imgs} ảnh`, ts: d.timestamp })
      for (const c of content) {
        if (c?.type !== 'text' || typeof c.text !== 'string') continue
        const t = c.text.trim()
        // bỏ các khối hệ thống chèn vào (system-reminder, lệnh nội bộ, ...)
        if (!t || /^<(system-reminder|local-command|command-|ide_)/.test(t)) continue
        items.push({ role: 'user', text: t, ts: d.timestamp })
        if (!firstPrompt) firstPrompt = clip(t, 80)
      }
    } else {
      busy = msg.stop_reason !== 'end_turn' && msg.stop_reason !== 'stop_sequence'
      for (const c of content) {
        if (c?.type === 'text' && c.text?.trim()) {
          items.push({ role: 'assistant', text: c.text.trim(), ts: d.timestamp })
        } else if (c?.type === 'tool_use') {
          items.push({ role: 'tool', text: `${c.name}: ${summarizeToolInput(c.input)}`, ts: d.timestamp, ...toolDetail(c.name, c.input) })
        }
      }
    }
  }

  return {
    title: aiTitle || summary || firstPrompt || '(chưa có tiêu đề)',
    cwd,
    source: source || 'claude',
    items,
    status: decideStatus(busy, mtime, now),
    busy
  }
}
