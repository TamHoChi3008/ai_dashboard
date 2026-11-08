import { describe, it, expect } from 'vitest'
import { moveById, swapById } from '../src/shared/order'

const id = (x: string) => x
const L = ['a', 'b', 'c', 'd']

describe('swapById', () => {
  it('đổi chỗ hai phần tử', () => expect(swapById(L, 'a', 'd', id)).toEqual(['d', 'b', 'c', 'a']))
  it('id không tồn tại hoặc trùng → giữ nguyên', () => {
    expect(swapById(L, 'a', 'x', id)).toBe(L)
    expect(swapById(L, 'b', 'b', id)).toBe(L)
  })
})

describe('moveById', () => {
  it('kéo về sau', () => expect(moveById(L, 'a', 'c', id)).toEqual(['b', 'c', 'a', 'd']))
  it('kéo lên trước', () => expect(moveById(L, 'd', 'b', id)).toEqual(['a', 'd', 'b', 'c']))
  it('không đổi mảng gốc', () => {
    moveById(L, 'a', 'd', id)
    expect(L).toEqual(['a', 'b', 'c', 'd'])
  })
})

import { cycleTab, tabAfterClose } from '../src/shared/order'

describe('phím tắt đổi / đóng tab', () => {
  const order = ['ov', 'a', 'b', 'c']
  it('cycleTab vòng quanh hai chiều', () => {
    expect(cycleTab(order, 'a', 1)).toBe('b')
    expect(cycleTab(order, 'c', 1)).toBe('ov')
    expect(cycleTab(order, 'ov', -1)).toBe('c')
    expect(cycleTab(order, 'x', 1)).toBe('ov')
    expect(cycleTab([], 'a', 1)).toBe('a')
  })
  it('tabAfterClose chọn tab bên phải, không có thì bên trái', () => {
    expect(tabAfterClose(order, 'a')).toBe('b')
    expect(tabAfterClose(order, 'c')).toBe('b')
    expect(tabAfterClose(['a'], 'a')).toBeUndefined()
  })
})
