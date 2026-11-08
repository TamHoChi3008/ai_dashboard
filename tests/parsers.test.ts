import { describe, it, expect } from 'vitest'
import { parseClaude } from '../src/main/providers/claudeParse'
import { parseCodex } from '../src/main/providers/codexParse'

const L = (o: unknown) => JSON.stringify(o)
const NOW = Date.parse('2026-10-29T12:00:00Z')

describe('parseClaude', () => {
  const lines = [
    L({ type: 'queue-operation' }),
    L({
      type: 'user', isSidechain: false, cwd: 'd:\\proj', entrypoint: 'claude-vscode', timestamp: 't1',
      message: { role: 'user', content: [{ type: 'text', text: 'xin chào' }] }
    }),
    L({ type: 'user', isMeta: true, message: { role: 'user', content: 'meta bỏ qua' } }),
    L({
      type: 'assistant', isSidechain: false,
      message: {
        role: 'assistant', stop_reason: 'tool_use',
        content: [{ type: 'thinking', thinking: '' }, { type: 'tool_use', name: 'Bash', input: { command: 'ls' } }]
      }
    }),
    L({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: 'a.txt' }] } }),
    L({ type: 'assistant', isSidechain: true, message: { role: 'assistant', content: [{ type: 'text', text: 'sub agent' }] } }),
    L({ type: 'ai-title', aiTitle: 'Tiêu đề AI' }),
    L({ type: 'assistant', message: { role: 'assistant', stop_reason: 'end_turn', content: [{ type: 'text', text: 'chào bạn' }] } })
  ]

  it('lấy tiêu đề, cwd, nguồn và các tin nhắn chính', () => {
    const r = parseClaude(lines, NOW, NOW)
    expect(r.title).toBe('Tiêu đề AI')
    expect(r.cwd).toBe('d:\\proj')
    expect(r.source).toBe('claude-vscode')
    expect(r.items.map((i) => [i.role, i.text])).toEqual([
      ['user', 'xin chào'],
      ['tool', 'Bash: ls'],
      ['assistant', 'chào bạn']
    ])
  })

  it('end_turn gần đây → waiting; cũ → idle', () => {
    expect(parseClaude(lines, NOW, NOW).status).toBe('waiting')
    expect(parseClaude(lines, NOW - 2 * 3600_000, NOW).status).toBe('idle')
  })

  it('đang chờ tool → running', () => {
    expect(parseClaude(lines.slice(0, 5), NOW, NOW).status).toBe('running')
  })

  it('không có ai-title thì dùng prompt đầu tiên', () => {
    expect(parseClaude(lines.slice(0, 2), NOW, NOW).title).toBe('xin chào')
  })

  it('bỏ qua dòng hỏng', () => {
    expect(parseClaude(['{hỏng', ...lines.slice(0, 2)], NOW, NOW).items).toHaveLength(1)
  })
})

describe('parseCodex', () => {
  const lines = [
    L({ type: 'session_meta', payload: { id: 'abc', cwd: 'd:\\p2', source: 'vscode' } }),
    L({ type: 'response_item', payload: { type: 'message', role: 'developer', content: [{ type: 'input_text', text: 'sys' }] } }),
    L({
      type: 'response_item',
      payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '<environment_context>x</environment_context>' }] }
    }),
    L({ type: 'event_msg', payload: { type: 'task_started' } }),
    L({ type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'đọc file' }] } }),
    L({ type: 'response_item', payload: { type: 'function_call', name: 'exec_command', arguments: '{"cmd":"cat a"}' } }),
    L({ type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'xong' }] } }),
    L({ type: 'event_msg', payload: { type: 'task_complete' } })
  ]

  it('lấy cwd, nguồn, tin nhắn và bỏ context hệ thống', () => {
    const r = parseCodex(lines, NOW, NOW)
    expect(r.cwd).toBe('d:\\p2')
    expect(r.source).toBe('vscode')
    expect(r.title).toBe('đọc file')
    expect(r.items.map((i) => [i.role, i.text])).toEqual([
      ['user', 'đọc file'],
      ['tool', 'exec_command: cat a'],
      ['assistant', 'xong']
    ])
  })

  it('source dạng object của session phụ → "subagent"', () => {
    const meta = L({ type: 'session_meta', payload: { cwd: 'x', source: { subagent: { other: 'guardian' } } } })
    expect(parseCodex([meta], NOW, NOW).source).toBe('subagent')
  })

  it('task_started chưa complete → running; complete → waiting', () => {
    expect(parseCodex(lines.slice(0, 6), NOW, NOW).status).toBe('running')
    expect(parseCodex(lines, NOW, NOW).status).toBe('waiting')
  })
})
