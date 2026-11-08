import type { ChatEvent } from '@shared/chat'
import { clip, summarizeToolInput, toolDetail } from '../providers/common'

function toolResultText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((c) => (c && typeof c === 'object' && 'text' in c ? String((c as { text: unknown }).text) : ''))
      .filter(Boolean)
      .join('\n')
  }
  return ''
}

/**
 * Chuyển một message của Claude Agent SDK thành event chat.
 * Bỏ qua message của subagent (parent_tool_use_id khác null) để khung chat gọn.
 */
export function normalizeSdkMessage(msg: any): ChatEvent[] {
  if (!msg || typeof msg !== 'object') return []
  if (msg.parent_tool_use_id) return []

  switch (msg.type) {
    case 'system':
      if (msg.subtype === 'init') {
        return [{ type: 'init', sessionId: msg.session_id, model: msg.model, permissionMode: msg.permissionMode }]
      }
      // output của slash command chạy cục bộ (/context, /cost, ...)
      if (msg.subtype === 'local_command_output' && msg.content) return [{ type: 'info', text: String(msg.content) }]
      if (msg.subtype === 'compact_boundary') return [{ type: 'info', text: '— Đã nén hội thoại (compact) —' }]
      return []

    case 'conversation_reset':
      return msg.new_conversation_id ? [{ type: 'reset', sessionId: msg.new_conversation_id }] : []

    case 'stream_event': {
      const ev = msg.event
      if (ev?.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && ev.delta.text) {
        return [{ type: 'delta', text: ev.delta.text }]
      }
      return []
    }

    case 'assistant': {
      const out: ChatEvent[] = []
      for (const b of msg.message?.content ?? []) {
        if (b?.type === 'text' && b.text) out.push({ type: 'text', text: b.text })
        else if (b?.type === 'tool_use') out.push({ type: 'tool', id: b.id, name: b.name, summary: summarizeToolInput(b.input), ...toolDetail(b.name, b.input) })
      }
      if (msg.error && out.length === 0) out.push({ type: 'error', message: String(msg.error) })
      return out
    }

    case 'user': {
      const content = msg.message?.content
      if (!Array.isArray(content)) return []
      return content
        .filter((b: any) => b?.type === 'tool_result')
        .map((b: any) => ({
          type: 'tool-result' as const,
          id: b.tool_use_id,
          isError: !!b.is_error,
          preview: clip(toolResultText(b.content), 400)
        }))
    }

    case 'result': {
      const isError = !!msg.is_error || msg.subtype !== 'success'
      const message = isError
        ? (Array.isArray(msg.errors) && msg.errors.join('\n')) || (typeof msg.result === 'string' ? msg.result : '') || msg.subtype
        : undefined
      return [{ type: 'result', isError, costUsd: msg.total_cost_usd, durationMs: msg.duration_ms, message }]
    }

    default:
      return []
  }
}
