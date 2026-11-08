import { describe, expect, it } from 'vitest'
import { emptyChat, joinAnswer, parseQuestions, reduceChat, type ChatState } from '../src/shared/chat'
import { aggregateUsage, dayRange, formatTokens, localDay, totalTokens } from '../src/shared/stats'
import { parseClaudeUsage, parseCodexUsage } from '../src/main/providers/usageParse'
import { sanitizeLayout, toSavedLayout, type PaneLike } from '../src/shared/layout'
import { appendMention, relativeTo } from '../src/shared/fileMention'
import type { SessionSummary } from '../src/shared/types'

const ask = {
  questions: [
    {
      question: 'Dùng thư viện nào?',
      header: 'Thư viện',
      multiSelect: false,
      options: [
        { label: 'date-fns', description: 'nhẹ' },
        { label: 'dayjs', description: 'API giống moment' }
      ]
    }
  ]
}

describe('AskUserQuestion', () => {
  it('parseQuestions lấy câu hỏi hợp lệ, bỏ phần hỏng', () => {
    const q = parseQuestions({ questions: [...ask.questions, { header: 'x' }, null] })
    expect(q).toHaveLength(1)
    expect(q[0].options.map((o) => o.label)).toEqual(['date-fns', 'dayjs'])
    expect(parseQuestions({})).toEqual([])
  })

  it('joinAnswer nối các lựa chọn và câu tự nhập', () => {
    expect(joinAnswer(['A', 'B'], '')).toBe('A, B')
    expect(joinAnswer([], '  khác  ')).toBe('khác')
    expect(joinAnswer(['A'], 'C')).toBe('A, C')
    expect(joinAnswer([], ' ')).toBe('')
  })

  it('reducer: thẻ câu hỏi → trả lời / huỷ khi lượt kết thúc', () => {
    let s: ChatState = reduceChat(emptyChat, { type: 'user-sent', text: 'hi' })
    s = reduceChat(s, { type: 'tool', id: 't1', name: 'AskUserQuestion', summary: '' })
    expect(s.entries.some((e) => e.kind === 'tool')).toBe(false) // không lặp thẻ tool
    s = reduceChat(s, { type: 'question', reqId: 'r1', questions: parseQuestions(ask) })
    s = reduceChat(s, { type: 'question', reqId: 'r2', questions: parseQuestions(ask) })
    s = reduceChat(s, { type: 'question-answered', reqId: 'r1', answers: { 'Dùng thư viện nào?': 'dayjs' } })
    s = reduceChat(s, { type: 'result', isError: false })
    const qs = s.entries.filter((e) => e.kind === 'question')
    expect(qs.map((q) => q.kind === 'question' && q.state)).toEqual(['answered', 'cancelled'])
  })

  it('reducer: câu hỏi bị huỷ qua permission-resolved', () => {
    let s = reduceChat(emptyChat, { type: 'question', reqId: 'r1', questions: parseQuestions(ask) })
    s = reduceChat(s, { type: 'permission-resolved', reqId: 'r1', state: 'denied' })
    expect(s.entries[0].kind === 'question' && s.entries[0].state).toBe('cancelled')
  })

  it('reducer: tin nhắn kèm ảnh', () => {
    const s = reduceChat(emptyChat, { type: 'user-sent', text: 'xem ảnh', images: 2 })
    expect(s.entries[0]).toEqual({ kind: 'user', text: 'xem ảnh', images: 2 })
  })
})

const ts = (h: number) => new Date(2026, 9, 29, h).toISOString()

describe('thống kê token', () => {
  it('Claude: một message nhiều dòng chỉ tính một lần, bỏ <synthetic>', () => {
    const msg = (id: string, model: string, out: number) =>
      JSON.stringify({
        type: 'assistant',
        timestamp: ts(10),
        message: { id, model, usage: { input_tokens: 2, cache_creation_input_tokens: 100, cache_read_input_tokens: 1000, output_tokens: out } }
      })
    const recs = parseClaudeUsage([
      msg('m1', 'claude-opus-5-5', 50),
      msg('m1', 'claude-opus-5-5', 50),
      msg('m2', 'claude-sonnet-5-5', 7),
      msg('m3', '<synthetic>', 0),
      '{"type":"user","message":{"content":"không có usage"}}',
      'hỏng'
    ])
    expect(recs).toHaveLength(2)
    expect(recs[0].counts).toEqual({ input: 2, cacheWrite: 100, cacheRead: 1000, output: 50, calls: 1 })
    expect(recs[0].day).toBe('2026-10-29')
  })

  it('Codex: lấy phần tăng của tổng cộng dồn, event lặp không đếm hai lần', () => {
    const tc = (input: number, cached: number, output: number) =>
      JSON.stringify({
        timestamp: ts(9),
        type: 'event_msg',
        payload: { type: 'token_count', info: { total_token_usage: { input_tokens: input, cached_input_tokens: cached, output_tokens: output } } }
      })
    const recs = parseCodexUsage([
      JSON.stringify({ type: 'turn_context', payload: { model: 'gpt-5-codex' } }),
      tc(1000, 0, 100),
      tc(1000, 0, 100), // lặp
      tc(3000, 1500, 150)
    ])
    expect(recs).toHaveLength(2)
    expect(recs[1]).toMatchObject({ model: 'gpt-5-codex', counts: { input: 500, cacheRead: 1500, output: 50, calls: 1 } })
  })

  it('gộp theo ngày/model, bỏ trùng id giữa các file, không đếm agent phụ là session', () => {
    const now = new Date(2026, 9, 29, 12).getTime()
    const c = (output: number) => ({ input: 1, cacheWrite: 0, cacheRead: 0, output, calls: 1 })
    const st = aggregateUsage(
      'p1',
      [
        { session: true, records: [{ id: 'a', day: '2026-10-29', model: 'opus', counts: c(10) }, { id: 'b', day: '2026-10-28', model: 'sonnet', counts: c(5) }] },
        { session: true, records: [{ id: 'a', day: '2026-10-29', model: 'opus', counts: c(10) }] }, // trùng
        { session: false, records: [{ day: '2026-10-29', model: 'haiku', counts: c(1) }] },
        { session: true, records: [{ day: '2026-09-01', model: 'opus', counts: c(999) }] } // ngoài khoảng
      ],
      7,
      now
    )
    expect(st.days).toHaveLength(7)
    expect(st.days[6]).toMatchObject({ day: '2026-10-29' })
    expect(st.days[6].counts.output).toBe(11)
    expect(st.total.output).toBe(16)
    expect(st.sessions).toBe(1)
    expect(st.models.map((m) => m.model)).toEqual(['opus', 'sonnet', 'haiku'])
    expect(totalTokens(st.total)).toBe(19)
  })

  it('dayRange / localDay / formatTokens', () => {
    const now = new Date(2026, 2, 2, 8).getTime()
    expect(dayRange(3, now)).toEqual(['2026-02-28', '2026-03-01', '2026-03-02'])
    expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
    expect(formatTokens(950)).toBe('950')
    expect(formatTokens(1234)).toBe('1,2K')
    expect(formatTokens(3_400_000)).toBe('3,4M')
  })
})

describe('lưu bố cục khung', () => {
  const s: SessionSummary = {
    id: 's1',
    profileId: 'p',
    provider: 'claude',
    title: 'T',
    cwd: 'D:\\x',
    source: 'cli',
    updatedAt: 1,
    status: 'idle',
    filePath: 'D:\\f.jsonl'
  }

  it('chat giữ lại, terminal chuyển thành Xem, đăng nhập / terminal chưa có session bị bỏ', () => {
    const panes: PaneLike[] = [
      { key: 'a', session: s, mode: 'view' },
      { key: 'b', mode: 'chat', chat: { cwd: 'D:\\y', model: 'opus' }, sessionId: 'new-id', title: 'Mới' },
      { key: 'c', session: s, mode: 'term', spawn: { kind: 'resume' } },
      { key: 'd', mode: 'term', spawn: { kind: 'login' } },
      { key: 'e', mode: 'term', spawn: { kind: 'new', cwd: 'D:\\z' } }
    ]
    const l = toSavedLayout(panes, 'c', 3)
    expect(l.panes.map((p) => p.mode)).toEqual(['view', 'chat', 'view'])
    expect(l.panes[1].chat).toEqual({ cwd: 'D:\\y', resumeId: 'new-id', model: 'opus' })
    expect(l.focused).toBe(2)
    expect(l.days).toBe(3)
  })

  it('sanitizeLayout bỏ dữ liệu hỏng và giới hạn số khung', () => {
    expect(sanitizeLayout(null, 6)).toBeNull()
    expect(sanitizeLayout({ panes: 'x' }, 6)).toBeNull()
    const l = sanitizeLayout(
      { panes: [{ mode: 'chat' }, { mode: 'term', session: s }, { mode: 'view', session: s }, { mode: 'chat', chat: { cwd: 'D:\\' } }], focused: 1 },
      1
    )
    expect(l?.panes).toHaveLength(1)
    expect(l?.panes[0].mode).toBe('view')
  })
})

describe('đính kèm file', () => {
  it('appendMention thêm khoảng trắng và ngoặc kép khi cần', () => {
    expect(appendMention('', 'a.ts')).toBe('@a.ts ')
    expect(appendMention('xem', 'my file.ts')).toBe('xem @"my file.ts" ')
    expect(appendMention('xem ', 'b.ts')).toBe('xem @b.ts ')
  })

  it('relativeTo rút gọn đường dẫn nằm trong cwd', () => {
    expect(relativeTo('D:\\proj', 'D:\\proj\\src\\a.ts')).toBe('src/a.ts')
    expect(relativeTo('d:\\Proj\\', 'D:\\proj\\b.ts')).toBe('b.ts')
    expect(relativeTo('D:\\proj', 'D:\\other\\c.ts')).toBe('D:\\other\\c.ts')
    expect(relativeTo('D:\\proj', 'D:\\project\\c.ts')).toBe('D:\\project\\c.ts')
  })
})
