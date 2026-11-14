import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { parseClaude } from '../src/main/providers/claudeParse'
import { writeSessionTitle } from '../src/main/sessionTitle'
import type { Profile } from '../src/shared/types'

const ID = '11111111-2222-3333-4444-555555555555'
const user = (t: string) => JSON.stringify({ type: 'user', cwd: 'D:\\x', message: { role: 'user', content: t } })

describe('tên session đồng bộ với Claude Code', () => {
  it('custom-title (/rename) thắng ai-title; dòng mới nhất thắng; autoTitle bỏ qua tên đặt', () => {
    const lines = [
      user('câu hỏi đầu'),
      JSON.stringify({ type: 'ai-title', aiTitle: 'Tên AI' }),
      JSON.stringify({ type: 'custom-title', sessionId: ID, customTitle: 'Tên 1' }),
      JSON.stringify({ type: 'custom-title', sessionId: ID, customTitle: 'Tên 2' }),
      JSON.stringify({ type: 'custom-title', sessionId: ID, customTitle: '  ' })
    ]
    const p = parseClaude(lines, Date.now(), Date.now())
    expect(p.title).toBe('Tên 2')
    expect(p.autoTitle).toBe('Tên AI')
  })

  let dir = ''
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'aib-title-'))
  })
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('Claude: thêm dòng custom-title (cả khi file không kết thúc bằng xuống dòng); tên rỗng = tên tự động', async () => {
    const file = join(dir, ID + '.jsonl')
    writeFileSync(file, user('xin chào') + '\n' + JSON.stringify({ type: 'ai-title', aiTitle: 'Chào hỏi' })) // không có \n cuối
    const p: Profile = { id: 'p', name: 'C', provider: 'claude', configDir: dir, color: '#000' }
    expect(await writeSessionTitle(p, file, '  Sửa   lỗi  ')).toBe('Sửa lỗi')
    let lines = readFileSync(file, 'utf8').trim().split('\n')
    expect(JSON.parse(lines[lines.length - 1])).toEqual({ type: 'custom-title', sessionId: ID, customTitle: 'Sửa lỗi' })
    expect(parseClaude(lines, 0, 0).title).toBe('Sửa lỗi')
    expect(await writeSessionTitle(p, file, '')).toBe('Chào hỏi')
    lines = readFileSync(file, 'utf8').trim().split('\n')
    expect(parseClaude(lines, 0, 0).title).toBe('Chào hỏi')
  })

  it('Claude: đổi tên thì đổi entrypoint sdk-* thành cli để VS Code hiện session', async () => {
    const file = join(dir, 'aaaaaaaa-2222-3333-4444-555555555555.jsonl')
    const rec = (e: string) => JSON.stringify({ type: 'user', entrypoint: e, cwd: 'D:\\x', message: { role: 'user', content: 'hi' } })
    writeFileSync(file, [rec('sdk-cli'), rec('sdk-ts'), rec('cli')].join('\n') + '\n')
    const p: Profile = { id: 'p', name: 'C', provider: 'claude', configDir: dir, color: '#000' }
    await writeSessionTitle(p, file, 'Tên mới')
    const text = readFileSync(file, 'utf8')
    expect(text).not.toMatch(/sdk-/)
    expect(text.match(/"entrypoint":"cli"/g)).toHaveLength(3)
    expect(parseClaude(text.trim().split('\n'), 0, 0).title).toBe('Tên mới')
  })

  it('Codex: thêm dòng thread_name vào session_index.jsonl', async () => {
    const file = join(dir, `rollout-2026-11-14T10-00-00-${ID}.jsonl`)
    writeFileSync(file, JSON.stringify({ type: 'session_meta', payload: { cwd: 'D:\\x' } }) + '\n')
    const p: Profile = { id: 'p', name: 'X', provider: 'codex', configDir: dir, color: '#000' }
    await writeSessionTitle(p, file, 'Việc Codex')
    const last = readFileSync(join(dir, 'session_index.jsonl'), 'utf8').trim().split('\n').pop()!
    expect(JSON.parse(last)).toMatchObject({ id: ID, thread_name: 'Việc Codex' })
  })
})
