import { describe, expect, it } from 'vitest'
import { parseRecycleInfo } from '../src/main/recycleBin'

const toFileTime = (ms: number) => (BigInt(ms) + 11644473600000n) * 10000n

function infoV2(path: string, ms: number): Buffer {
  const name = Buffer.from(path + '\0', 'utf16le')
  const head = Buffer.alloc(28)
  head.writeBigInt64LE(2n, 0)
  head.writeBigInt64LE(1234n, 8)
  head.writeBigInt64LE(toFileTime(ms), 16)
  head.writeUInt32LE(path.length + 1, 24)
  return Buffer.concat([head, name])
}

function infoV1(path: string, ms: number): Buffer {
  const buf = Buffer.alloc(24 + 520)
  buf.writeBigInt64LE(1n, 0)
  buf.writeBigInt64LE(toFileTime(ms), 16)
  buf.write(path, 24, 'utf16le')
  return buf
}

describe('đọc file $I của Thùng rác Windows', () => {
  const path = 'C:\\Users\\a\\.claude\\projects\\d--x\\0a1b-ảnh.jsonl'
  const ms = Date.UTC(2026, 9, 30, 1, 2, 3)

  it('bản 2 (Windows 10+)', () => {
    expect(parseRecycleInfo(infoV2(path, ms))).toEqual({ original: path, deletedAt: ms })
  })

  it('bản 1 (Vista–8.1)', () => {
    expect(parseRecycleInfo(infoV1(path, ms))).toEqual({ original: path, deletedAt: ms })
  })

  it('dữ liệu hỏng / phiên bản lạ', () => {
    expect(parseRecycleInfo(Buffer.alloc(10))).toBeNull()
    const bad = infoV2(path, ms)
    bad.writeBigInt64LE(9n, 0)
    expect(parseRecycleInfo(bad)).toBeNull()
  })
})
