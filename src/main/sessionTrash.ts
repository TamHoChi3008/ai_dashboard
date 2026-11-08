import { app } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import type { TrashedSession } from '@shared/types'
import { findInBin, purgeFromBin, restoreFromBin } from './recycleBin'

/** Session đã chuyển vào Thùng rác của Windows: userData/session-trash.json */
const file = () => join(app.getPath('userData'), 'session-trash.json')

/** Quá hạn này chưa khôi phục → xoá hẳn khỏi thùng rác. */
export const TRASH_DAYS = 30

let writing = Promise.resolve()

async function readAll(): Promise<TrashedSession[]> {
  try {
    const v = JSON.parse(await fs.readFile(file(), 'utf8'))
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

/** Ghi tuần tự để hai thao tác liền nhau không ghi đè nhau. */
function update(fn: (list: TrashedSession[]) => TrashedSession[]): Promise<void> {
  writing = writing.then(async () => {
    const next = fn(await readAll())
    await fs.writeFile(file(), JSON.stringify(next, null, 1), 'utf8').catch((err) => console.error('[trash] không lưu được', err))
  })
  return writing
}

export async function addTrashed(e: Omit<TrashedSession, 'trashId' | 'deletedAt'>) {
  await update((list) => [...list, { ...e, trashId: randomUUID(), deletedAt: Date.now() }])
}

/** Session trong thùng rác của profile; mục mà Thùng rác Windows đã dọn mất thì bỏ luôn khỏi danh sách. */
export async function listTrashed(profileId: string): Promise<TrashedSession[]> {
  const mine = (await readAll()).filter((e) => e.profileId === profileId)
  const gone = new Set<string>()
  for (const e of mine) if (!(await findInBin(e.paths[0]).catch(() => null))) gone.add(e.trashId)
  if (gone.size) await update((list) => list.filter((x) => !gone.has(x.trashId)))
  return mine.filter((e) => !gone.has(e.trashId)).sort((a, b) => b.deletedAt - a.deletedAt)
}

export type TrashRestore = { ok: true } | { ok: false; reason: 'missing' | 'exists' | 'error'; message?: string }

/** Khôi phục session từ thùng rác về chỗ cũ (gồm cả thư mục session phụ nếu có). */
export async function restoreTrashed(trashId: string): Promise<TrashRestore> {
  const e = (await readAll()).find((x) => x.trashId === trashId)
  if (!e) return { ok: false, reason: 'missing' }
  try {
    // file chính quyết định kết quả; thư mục đi kèm khôi phục được thì tốt
    const main = await restoreFromBin(e.paths[0])
    if (main === 'exists') return { ok: false, reason: 'exists' }
    for (const p of e.paths.slice(1)) await restoreFromBin(p).catch(() => undefined)
    // khôi phục xong hoặc thùng rác đã bị dọn → bỏ khỏi danh sách
    await update((list) => list.filter((x) => x.trashId !== trashId))
    return main === 'restored' ? { ok: true } : { ok: false, reason: 'missing' }
  } catch (err) {
    return { ok: false, reason: 'error', message: String((err as Error).message ?? err) }
  }
}

/** Xoá vĩnh viễn một session khỏi thùng rác. */
export async function purgeTrashed(trashId: string) {
  const e = (await readAll()).find((x) => x.trashId === trashId)
  if (!e) return
  for (const p of e.paths) await purgeFromBin(p).catch(() => undefined)
  await update((list) => list.filter((x) => x.trashId !== trashId))
}

/** Xoá hẳn các session đã nằm trong thùng rác quá TRASH_DAYS ngày. */
export async function purgeExpired(now = Date.now()) {
  const expired = (await readAll()).filter((e) => now - e.deletedAt > TRASH_DAYS * 86400_000)
  for (const e of expired) await purgeTrashed(e.trashId)
}
