import { describe, it, expect } from 'vitest'
import { filterCommands, localCommand, slashQuery, type SlashCommandInfo } from '../src/shared/slash'
import { normalizeSdkMessage } from '../src/main/chat/normalize'
import { emptyChat, reduceChat } from '../src/shared/chat'

const C = (name: string, extra: Partial<SlashCommandInfo> = {}): SlashCommandInfo => ({ name, description: '', argumentHint: '', ...extra })
const LIST = [
  C('compact', { builtin: true, description: 'Nén hội thoại' }),
  C('context', { builtin: true }),
  C('clear', { builtin: true, aliases: ['reset', 'new'] }),
  C('superpowers:brainstorming', { aliases: ['brainstorming'] }),
  C('code-review:code-review', { description: 'Code review a pull request' })
]
const names = (l: SlashCommandInfo[]) => l.map((c) => c.name)

describe('slashQuery', () => {
  it('chỉ khi đang gõ tên command', () => {
    expect(slashQuery('/')).toBe('')
    expect(slashQuery('/comp')).toBe('comp')
    expect(slashQuery('/compact abc')).toBeNull()
    expect(slashQuery('hỏi /comp')).toBeNull()
  })
})

describe('filterCommands', () => {
  it('khớp đầu tên đứng trước khớp giữa tên', () => {
    expect(names(filterCommands(LIST, 'co'))).toEqual(['code-review:code-review', 'compact', 'context'])
  })
  it('khớp alias và phần sau dấu ":"', () => {
    expect(names(filterCommands(LIST, 'brain'))).toEqual(['superpowers:brainstorming'])
    expect(names(filterCommands(LIST, 'reset'))).toEqual(['clear'])
  })
  it('khớp mô tả xếp cuối', () => {
    expect(names(filterCommands(LIST, 'pull'))).toEqual(['code-review:code-review'])
  })
  it('rỗng → built-in trước', () => {
    expect(names(filterCommands(LIST, '')).slice(0, 3)).toEqual(['clear', 'compact', 'context'])
  })
})

describe('localCommand', () => {
  it('/usage và alias', () => {
    expect(localCommand('/usage')).toBe('usage')
    expect(localCommand(' /cost ')).toBe('usage')
    expect(localCommand('/usage abc')).toBeNull()
    expect(localCommand('/compact')).toBeNull()
  })
})

describe('event của slash command', () => {
  it('output lệnh cục bộ, nén hội thoại, reset', () => {
    expect(normalizeSdkMessage({ type: 'system', subtype: 'local_command_output', content: 'Context: 12%' })).toEqual([
      { type: 'info', text: 'Context: 12%' }
    ])
    expect(normalizeSdkMessage({ type: 'system', subtype: 'compact_boundary' })[0]).toMatchObject({ type: 'info' })
    expect(normalizeSdkMessage({ type: 'conversation_reset', new_conversation_id: 'n1' })).toEqual([{ type: 'reset', sessionId: 'n1' }])
  })
  it('reducer: info thêm dòng; reset đổi session', () => {
    let s = reduceChat(emptyChat, { type: 'info', text: 'xin chào' })
    expect(s.entries).toEqual([{ kind: 'info', text: 'xin chào' }])
    s = reduceChat({ ...s, sessionId: 'old' }, { type: 'reset', sessionId: 'n1' })
    expect(s.sessionId).toBe('n1')
    expect(s.entries[s.entries.length - 1].kind).toBe('info')
  })
})
