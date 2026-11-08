import { describe, it, expect } from 'vitest'
import { parseFrontmatter } from '../src/main/catalog'

describe('parseFrontmatter', () => {
  it('đọc name/description, bỏ dấu ngoặc kép', () => {
    const t = '---\nname: brainstorming\ndescription: "Dùng trước khi làm việc sáng tạo"\n---\n# Nội dung'
    expect(parseFrontmatter(t)).toEqual({ name: 'brainstorming', description: 'Dùng trước khi làm việc sáng tạo' })
  })

  it('bỏ escape \\" trong chuỗi ngoặc kép', () => {
    expect(parseFrontmatter('---\ndescription: "gọi là \\"browser\\" đó"\n---').description).toBe('gọi là "browser" đó')
  })

  it('giá trị nhiều dòng dạng > hoặc |', () => {
    const t = '---\nname: x\ndescription: >\n  dòng một\n  dòng hai\nversion: 1\n---\n'
    expect(parseFrontmatter(t)).toMatchObject({ description: 'dòng một dòng hai', version: '1' })
  })

  it('CRLF và BOM', () => {
    expect(parseFrontmatter('﻿---\r\nname: a\r\n---\r\nbody')).toEqual({ name: 'a' })
  })

  it('không có frontmatter → rỗng', () => {
    expect(parseFrontmatter('# chỉ có tiêu đề')).toEqual({})
  })
})
