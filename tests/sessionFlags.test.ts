import { describe, it, expect } from 'vitest'
import { arrangeSessions, emptyFlags, toggleFlag } from '../src/shared/sessionFlags'

const S = (...ids: string[]) => ids.map((id) => ({ id }))
const ids = (l: { id: string }[]) => l.map((x) => x.id)

describe('toggleFlag', () => {
  it('ghim / bỏ ghim', () => {
    const f = toggleFlag(emptyFlags, 'a', 'pinned', true)
    expect(f).toEqual({ pinned: ['a'], hidden: [] })
    expect(toggleFlag(f, 'a', 'pinned', false)).toEqual({ pinned: [], hidden: [] })
  })
  it('ẩn session đang ghim → bỏ ghim', () => {
    const f = toggleFlag({ pinned: ['a', 'b'], hidden: [] }, 'a', 'hidden', true)
    expect(f).toEqual({ pinned: ['b'], hidden: ['a'] })
  })
  it('ghim session đang ẩn → hiện lại', () => {
    expect(toggleFlag({ pinned: [], hidden: ['a'] }, 'a', 'pinned', true)).toEqual({ pinned: ['a'], hidden: [] })
  })
  it('bỏ ẩn không đụng tới ghim của session khác, không trùng lặp', () => {
    const f = toggleFlag({ pinned: ['x'], hidden: ['a'] }, 'a', 'hidden', false)
    expect(f).toEqual({ pinned: ['x'], hidden: [] })
    expect(toggleFlag({ pinned: ['a'], hidden: [] }, 'a', 'pinned', true).pinned).toEqual(['a'])
  })
})

describe('arrangeSessions', () => {
  it('chia ghim / thường / ẩn; ghim theo thứ tự đã ghim', () => {
    const r = arrangeSessions(S('a', 'b', 'c', 'd'), { pinned: ['c', 'a'], hidden: ['d'] })
    expect(ids(r.pinned)).toEqual(['c', 'a'])
    expect(ids(r.normal)).toEqual(['b'])
    expect(ids(r.hidden)).toEqual(['d'])
  })
})

import { applyNames, setSessionName, toggleFlag as toggle2 } from '../src/shared/sessionFlags'

describe('đổi tên session', () => {
  const f = { pinned: ['a'], hidden: [] as string[] }
  it('đặt tên, gọn khoảng trắng; rỗng hoặc trùng tên gốc thì về tên gốc', () => {
    const g = setSessionName(f, 'a', '  Sửa   lỗi  đăng nhập ', 'Gốc')
    expect(g.names).toEqual({ a: 'Sửa lỗi đăng nhập' })
    expect(g.pinned).toEqual(['a'])
    expect(setSessionName(g, 'a', '   ', 'Gốc').names).toEqual({})
    expect(setSessionName(g, 'a', 'Gốc', 'Gốc').names).toEqual({})
  })
  it('applyNames thay tiêu đề, ghim/ẩn vẫn giữ tên', () => {
    const g = setSessionName(f, 'b', 'Tên mới')
    const list = [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }]
    expect(applyNames(list, g).map((x) => x.title)).toEqual(['A', 'Tên mới'])
    expect(toggle2(g, 'b', 'hidden', true).names).toEqual({ b: 'Tên mới' })
  })
})
