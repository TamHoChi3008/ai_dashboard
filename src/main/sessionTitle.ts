import { promises as fs } from 'fs'
import { join } from 'path'
import type { Profile } from '@shared/types'
import { MAX_NAME } from '@shared/sessionFlags'
import { autoTitleOf, sessionIdFromFile } from './providers/sessions'

/**
 * Đổi tên session ngay trong dữ liệu của CLI, để Claude Code / VS Code / Codex cùng thấy tên mới:
 *  - Claude Code: thêm dòng {"type":"custom-title"} vào cuối file session (giống lệnh /rename).
 *  - Codex: thêm dòng {id, thread_name} vào <CODEX_HOME>/session_index.jsonl (dòng mới nhất thắng).
 * Tên rỗng = về tên tự động (Claude Code bỏ qua custom-title rỗng nên phải ghi lại chính tên tự động).
 * Trả về tên đã ghi.
 */
export async function writeSessionTitle(p: Profile, file: string, name: string): Promise<string> {
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME)
  const title = clean || (await autoTitleOf(p, file))
  const id = sessionIdFromFile(p, file)
  if (p.provider === 'claude') {
    await appendLine(file, { type: 'custom-title', sessionId: id, customTitle: title })
  } else {
    await appendLine(join(p.configDir, 'session_index.jsonl'), { id, thread_name: title, updated_at: new Date().toISOString() })
  }
  return title
}

/** Thêm một dòng JSON vào cuối file JSONL; nếu dòng cuối chưa xuống dòng thì thêm trước. */
async function appendLine(file: string, obj: unknown) {
  let prefix = ''
  try {
    const fh = await fs.open(file, 'r')
    try {
      const { size } = await fh.stat()
      if (size > 0) {
        const b = Buffer.alloc(1)
        await fh.read(b, 0, 1, size - 1)
        if (b[0] !== 0x0a) prefix = '\n'
      }
    } finally {
      await fh.close()
    }
  } catch {
    /* file chưa có (index Codex) → tạo mới */
  }
  await fs.appendFile(file, prefix + JSON.stringify(obj) + '\n', 'utf8')
}

/**
 * Tên session trước đây chỉ lưu trong app (session-flags.json → names): chuyển vào file session của Claude Code
 * để đồng bộ với /rename và VS Code, rồi bỏ khỏi app. Chạy một lần lúc mở app; lỗi thì để nguyên.
 */
export async function migrateAppNames(
  profiles: Profile[],
  getNames: (profileId: string) => Promise<Record<string, string>>,
  clearName: (profileId: string, sessionId: string) => Promise<unknown>
) {
  for (const p of profiles) {
    if (p.provider !== 'claude') continue
    const names = await getNames(p.id).catch(() => ({}) as Record<string, string>)
    const ids = Object.keys(names)
    if (!ids.length) continue
    const root = join(p.configDir, 'projects')
    let dirs: string[] = []
    try {
      dirs = await fs.readdir(root)
    } catch {
      continue
    }
    for (const id of ids) {
      for (const d of dirs) {
        const file = join(root, d, id + '.jsonl')
        try {
          await fs.access(file)
        } catch {
          continue
        }
        try {
          await writeSessionTitle(p, file, names[id])
          await clearName(p.id, id)
        } catch {
          /* để lần sau */
        }
        break
      }
    }
  }
}
