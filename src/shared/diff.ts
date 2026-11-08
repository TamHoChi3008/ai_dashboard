/** Một lần sửa: nội dung cũ → mới (Edit: một đoạn; MultiEdit: nhiều đoạn; Write: cũ rỗng). */
export interface DiffHunk {
  old: string
  new: string
}

export type DiffLine = { type: 'same' | 'del' | 'add'; text: string } | { type: 'gap'; count: number }

const MAX_CELLS = 400_000 // giới hạn bảng LCS để không treo giao diện với đoạn rất dài

function splitLines(s: string): string[] {
  if (!s) return []
  return s.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n')
}

/** Diff theo dòng (LCS). Đoạn quá dài → coi như xoá hết rồi thêm hết. */
export function diffLines(oldText: string, newText: string): DiffLine[] {
  const a = splitLines(oldText)
  const b = splitLines(newText)
  if (a.length * b.length > MAX_CELLS) {
    return [...a.map((text) => ({ type: 'del' as const, text })), ...b.map((text) => ({ type: 'add' as const, text }))]
  }
  // lcs[i][j] = độ dài LCS của a[i..] và b[j..]
  const lcs: Uint32Array[] = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }
  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ type: 'same', text: a[i] })
      i++
      j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ type: 'del', text: a[i++] })
    } else {
      out.push({ type: 'add', text: b[j++] })
    }
  }
  while (i < a.length) out.push({ type: 'del', text: a[i++] })
  while (j < b.length) out.push({ type: 'add', text: b[j++] })
  return out
}

/** Thu gọn các đoạn không đổi dài, chỉ giữ `context` dòng quanh chỗ sửa. */
export function collapse(lines: DiffLine[], context = 3): DiffLine[] {
  const changed = lines.map((l) => l.type === 'del' || l.type === 'add')
  const keep = lines.map((_, i) => {
    for (let k = Math.max(0, i - context); k <= Math.min(lines.length - 1, i + context); k++) if (changed[k]) return true
    return false
  })
  const out: DiffLine[] = []
  let skipped = 0
  lines.forEach((l, i) => {
    if (keep[i]) {
      if (skipped) out.push({ type: 'gap', count: skipped })
      skipped = 0
      out.push(l)
    } else skipped++
  })
  if (skipped) out.push({ type: 'gap', count: skipped })
  return out
}

export function diffStats(hunks: DiffHunk[]): { add: number; del: number } {
  let add = 0
  let del = 0
  for (const h of hunks) {
    for (const l of diffLines(h.old, h.new)) {
      if (l.type === 'add') add++
      else if (l.type === 'del') del++
    }
  }
  return { add, del }
}
