import { describe, it, expect } from 'vitest'
import { collapse, diffLines, diffStats } from '../src/shared/diff'
import { atQuery, insertMention, rankFiles } from '../src/shared/fileMention'
import { toolDetail } from '../src/main/providers/common'

const show = (l: ReturnType<typeof diffLines>) =>
  l.map((x) => (x.type === 'gap' ? `…${x.count}` : (x.type === 'add' ? '+' : x.type === 'del' ? '-' : ' ') + x.text))

describe('diffLines', () => {
  it('sửa một dòng ở giữa', () => {
    expect(show(diffLines('a\nb\nc', 'a\nB\nc'))).toEqual([' a', '-b', '+B', ' c'])
  })
  it('thêm và xoá dòng; CRLF như LF', () => {
    expect(show(diffLines('a\r\nb\r\n', 'a\nx\nb\ny'))).toEqual([' a', '+x', ' b', '+y'])
  })
  it('Write: cũ rỗng → toàn bộ là dòng thêm', () => {
    expect(show(diffLines('', 'x\ny'))).toEqual(['+x', '+y'])
  })
  it('thống kê +/-', () => {
    expect(diffStats([{ old: 'a\nb', new: 'a\nc\nd' }, { old: '', new: 'z' }])).toEqual({ add: 3, del: 1 })
  })
})

describe('collapse', () => {
  it('chỉ giữ 1 dòng ngữ cảnh quanh chỗ sửa', () => {
    const lines = diffLines('1\n2\n3\n4\n5\n6\n7', '1\n2\n3\nX\n5\n6\n7')
    expect(show(collapse(lines, 1))).toEqual(['…2', ' 3', '-4', '+X', ' 5', '…2'])
  })
})

describe('atQuery / insertMention', () => {
  it('nhận @ ở đầu hoặc sau khoảng trắng', () => {
    expect(atQuery('@cha', 4)).toEqual({ start: 0, query: 'cha' })
    expect(atQuery('xem @src/ma', 11)).toEqual({ start: 4, query: 'src/ma' })
    expect(atQuery('mail@abc', 8)).toBeNull()
    expect(atQuery('@abc xong', 9)).toBeNull()
  })
  it('chèn đường dẫn và đặt con trỏ sau nó; có khoảng trắng thì bọc ngoặc', () => {
    expect(insertMention('xem @ma rồi', 4, 7, 'src/main.ts')).toEqual({ text: 'xem @src/main.ts  rồi', caret: 17 })
    expect(insertMention('@a', 0, 2, 'my dir/a.md').text).toBe('@"my dir/a.md" ')
  })
})

describe('rankFiles', () => {
  const F = ['src/renderer/src/components/ChatView.tsx', 'src/main/chat/claudeChat.ts', 'README.md', 'src/shared/chat.ts', 'tests/chat.test.ts']
  it('tên bắt đầu bằng q đứng trước, đường dẫn ngắn trước', () => {
    expect(rankFiles(F, 'chat')).toEqual(['src/shared/chat.ts', 'tests/chat.test.ts', 'src/renderer/src/components/ChatView.tsx', 'src/main/chat/claudeChat.ts'])
  })
  it('khớp rải rác và theo đường dẫn', () => {
    expect(rankFiles(F, 'cvw')).toEqual(['src/renderer/src/components/ChatView.tsx'])
    expect(rankFiles(F, 'main/chat')[0]).toBe('src/main/chat/claudeChat.ts')
  })
})

describe('toolDetail', () => {
  it('Edit / MultiEdit / Write / Read', () => {
    expect(toolDetail('Edit', { file_path: 'D:\\a.ts', old_string: 'x', new_string: 'y' })).toEqual({ file: 'D:\\a.ts', diff: [{ old: 'x', new: 'y' }] })
    expect(toolDetail('MultiEdit', { file_path: 'f', edits: [{ old_string: '1', new_string: '2' }, { old_string: '3', new_string: '4' }] }).diff).toHaveLength(2)
    expect(toolDetail('Write', { file_path: 'f', content: 'abc' })).toEqual({ file: 'f', diff: [{ old: '', new: 'abc' }] })
    expect(toolDetail('Read', { file_path: 'f', offset: 10 })).toEqual({ file: 'f', line: 10 })
    expect(toolDetail('Bash', { command: 'ls' })).toEqual({})
  })
  it('cắt nội dung quá dài', () => {
    const d = toolDetail('Write', { file_path: 'f', content: 'x'.repeat(50_000) })
    expect(d.diff![0].new.length).toBeLessThan(21_000)
  })
})
