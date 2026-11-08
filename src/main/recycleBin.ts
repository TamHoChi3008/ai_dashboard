import { promises as fs } from 'fs'
import { join, parse } from 'path'

/**
 * Đọc / khôi phục / xoá hẳn file trong Thùng rác của Windows mà không cần PowerShell.
 * Mỗi mục trong <ổ>:\$Recycle.Bin\<SID>\ gồm 2 phần:
 *   $Ixxxxxx.ext  — thông tin: đường dẫn gốc, thời điểm xoá
 *   $Rxxxxxx.ext  — nội dung (file hoặc thư mục)
 */

export interface BinItem {
  /** File thông tin $I. */
  infoPath: string
  /** Nội dung $R (file hoặc thư mục). */
  dataPath: string
  original: string
  deletedAt: number
}

/** FILETIME (100ns từ 1601) → ms từ 1970. */
const fileTimeToMs = (t: bigint) => Number(t / 10000n) - 11644473600000

/** Đọc file $I. Bản 1 (Vista–8.1): đường dẫn cố định 260 ký tự; bản 2 (Win10+): có độ dài. */
export function parseRecycleInfo(buf: Buffer): { original: string; deletedAt: number } | null {
  if (buf.length < 24) return null
  const version = buf.readBigInt64LE(0)
  const deletedAt = fileTimeToMs(buf.readBigInt64LE(16))
  let original = ''
  if (version === 2n) {
    if (buf.length < 28) return null
    const chars = buf.readUInt32LE(24)
    original = buf.toString('utf16le', 28, Math.min(buf.length, 28 + chars * 2))
  } else if (version === 1n) {
    original = buf.toString('utf16le', 24, Math.min(buf.length, 24 + 520))
  } else return null
  original = original.replace(/\0.*$/s, '')
  return original ? { original, deletedAt } : null
}

const same = (a: string, b: string) => a.replace(/\//g, '\\').toLowerCase() === b.replace(/\//g, '\\').toLowerCase()

/** Các thư mục thùng rác (theo SID) đọc được trên ổ chứa `path` — thường chỉ của user hiện tại. */
async function binDirs(path: string): Promise<string[]> {
  const root = join(parse(path).root, '$Recycle.Bin')
  let names: string[] = []
  try {
    names = await fs.readdir(root)
  } catch {
    return []
  }
  const out: string[] = []
  for (const n of names) {
    const d = join(root, n)
    try {
      await fs.readdir(d) // thùng rác của user khác: không có quyền → bỏ qua
      out.push(d)
    } catch {
      /* bỏ qua */
    }
  }
  return out
}

/** Tìm mục trong thùng rác có đường dẫn gốc = `original` (lấy lần xoá gần nhất). */
export async function findInBin(original: string): Promise<BinItem | null> {
  let best: BinItem | null = null
  for (const dir of await binDirs(original)) {
    let names: string[]
    try {
      names = await fs.readdir(dir)
    } catch {
      continue
    }
    for (const n of names) {
      if (!n.startsWith('$I')) continue
      try {
        const info = parseRecycleInfo(await fs.readFile(join(dir, n)))
        if (!info || !same(info.original, original)) continue
        const dataPath = join(dir, '$R' + n.slice(2))
        await fs.stat(dataPath) // phần nội dung phải còn
        if (!best || info.deletedAt > best.deletedAt) best = { infoPath: join(dir, n), dataPath, ...info }
      } catch {
        /* mục hỏng / vừa bị dọn */
      }
    }
  }
  return best
}

export type RestoreResult = 'restored' | 'missing' | 'exists'

/** Đưa một mục về chỗ cũ. 'missing' = thùng rác đã bị dọn; 'exists' = chỗ cũ đã có file khác. */
export async function restoreFromBin(original: string): Promise<RestoreResult> {
  const item = await findInBin(original)
  if (!item) return 'missing'
  try {
    await fs.stat(original)
    return 'exists'
  } catch {
    /* chỗ cũ trống → khôi phục được */
  }
  await fs.mkdir(parse(original).dir, { recursive: true })
  await fs.rename(item.dataPath, original) // cùng ổ đĩa nên chỉ là đổi tên
  await fs.rm(item.infoPath, { force: true })
  return 'restored'
}

/** Xoá hẳn khỏi thùng rác; trả về false nếu không còn trong thùng rác. */
export async function purgeFromBin(original: string): Promise<boolean> {
  const item = await findInBin(original)
  if (!item) return false
  await fs.rm(item.dataPath, { recursive: true, force: true })
  await fs.rm(item.infoPath, { force: true })
  return true
}
