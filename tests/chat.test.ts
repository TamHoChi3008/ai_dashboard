import { describe, it, expect } from 'vitest'
import { ChatEvent, ChatState, emptyChat, reduceChat } from '../src/shared/chat'
import { normalizeSdkMessage } from '../src/main/chat/normalize'

const run = (events: ChatEvent[], s: ChatState = emptyChat) => events.reduce(reduceChat, s)

describe('normalizeSdkMessage', () => {
  it('init', () => {
    expect(normalizeSdkMessage({ type: 'system', subtype: 'init', session_id: 's1', model: 'm', permissionMode: 'default' })).toEqual([
      { type: 'init', sessionId: 's1', model: 'm', permissionMode: 'default' }
    ])
  })

  it('text delta, bỏ thinking delta', () => {
    const d = (delta: unknown) => normalizeSdkMessage({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_delta', delta } })
    expect(d({ type: 'text_delta', text: 'ab' })).toEqual([{ type: 'delta', text: 'ab' }])
    expect(d({ type: 'thinking_delta', thinking: 'x' })).toEqual([])
  })

  it('assistant: text + tool_use; bỏ thinking và subagent', () => {
    const m = {
      type: 'assistant', parent_tool_use_id: null,
      message: { content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: 'hi' }, { type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls' } }] }
    }
    expect(normalizeSdkMessage(m)).toEqual([
      { type: 'text', text: 'hi' },
      { type: 'tool', id: 't1', name: 'Bash', summary: 'ls' }
    ])
    expect(normalizeSdkMessage({ ...m, parent_tool_use_id: 'x' })).toEqual([])
  })

  it('tool_result', () => {
    const m = { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', is_error: true, content: [{ type: 'text', text: 'lỗi' }] }] } }
    expect(normalizeSdkMessage(m)).toEqual([{ type: 'tool-result', id: 't1', isError: true, preview: 'lỗi' }])
  })

  it('result thành công và lỗi', () => {
    expect(normalizeSdkMessage({ type: 'result', subtype: 'success', is_error: false, total_cost_usd: 0.1, duration_ms: 5 })).toEqual([
      { type: 'result', isError: false, costUsd: 0.1, durationMs: 5, message: undefined }
    ])
    expect(normalizeSdkMessage({ type: 'result', subtype: 'error_max_turns', is_error: true, errors: ['quá lượt'] })[0]).toMatchObject({
      isError: true,
      message: 'quá lượt'
    })
  })
})

describe('reduceChat', () => {
  it('stream text rồi chốt bằng bản đầy đủ', () => {
    const s = run([
      { type: 'user-sent', text: 'hỏi' },
      { type: 'delta', text: 'Xin ' },
      { type: 'delta', text: 'chào' },
      { type: 'text', text: 'Xin chào!' },
      { type: 'result', isError: false, costUsd: 0.02 }
    ])
    expect(s.entries).toEqual([
      { kind: 'user', text: 'hỏi' },
      { kind: 'assistant', text: 'Xin chào!', streaming: false }
    ])
    expect(s.busy).toBe(false)
    expect(s.costUsd).toBeCloseTo(0.02)
  })

  it('tool chạy → kết quả; quyền pending bị huỷ khi lượt kết thúc', () => {
    const s = run([
      { type: 'user-sent', text: 'x' },
      { type: 'tool', id: 't1', name: 'Bash', summary: 'ls' },
      { type: 'tool-result', id: 't1', isError: false, preview: 'a.txt' },
      { type: 'permission', reqId: 'r1', toolName: 'Write', summary: 'f', canAlways: true },
      { type: 'result', isError: true, message: 'bị dừng' }
    ])
    expect(s.entries[1]).toMatchObject({ kind: 'tool', status: 'ok', output: 'a.txt' })
    expect(s.entries[2]).toMatchObject({ kind: 'permission', state: 'cancelled' })
    expect(s.entries[3]).toEqual({ kind: 'error', text: 'bị dừng' })
  })

  it('synced: bỏ tin đã có trong file, giữ lỗi và thông báo', () => {
    const s = run([
      { type: 'user-sent', text: 'x' },
      { type: 'text', text: 'trả lời' },
      { type: 'tool', id: 't1', name: 'Read', summary: 'a' },
      { type: 'error', message: 'lỗi mạng' },
      { type: 'info', text: 'ghi chú' },
      { type: 'synced' }
    ])
    expect(s.entries).toEqual([
      { kind: 'error', text: 'lỗi mạng' },
      { kind: 'info', text: 'ghi chú' }
    ])
  })

  it('synced: chỉ giữ thông báo đồng bộ mới nhất', () => {
    const s = run([
      { type: 'info', text: '↻ Đã đồng bộ 2 tin mới từ VS Code' },
      { type: 'synced' },
      { type: 'info', text: '↻ Đã đồng bộ 1 tin mới từ VS Code' }
    ])
    expect(s.entries).toEqual([{ kind: 'info', text: '↻ Đã đồng bộ 1 tin mới từ VS Code' }])
  })

  it('permission-resolved cập nhật đúng yêu cầu', () => {
    const s = run([
      { type: 'permission', reqId: 'r1', toolName: 'Bash', summary: 'rm', canAlways: false },
      { type: 'permission-resolved', reqId: 'r1', state: 'denied' }
    ])
    expect(s.entries[0]).toMatchObject({ state: 'denied' })
  })
})
