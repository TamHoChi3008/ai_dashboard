import { memo, useMemo } from 'react'
import type { ToolDetail } from '@shared/types'
import { collapse, diffLines, diffStats, type DiffHunk } from '@shared/diff'
import { api, baseName } from '../api'
import { alertDialog } from '../dialogs'
import { usePaneSettings } from '../paneSettings'

interface Props extends ToolDetail {
  name: string
  summary: string
  status?: 'running' | 'ok' | 'error'
  output?: string
  /** Thư mục session, để mở được đường dẫn tương đối. */
  cwd?: string
}

const MAX_ROWS = 400
const STATUS_ICON = { running: '⏳', ok: '✓', error: '✕' } as const

/** Tách "Tên: tóm tắt" (dạng lưu trong lịch sử) thành tên tool và phần tóm tắt. */
export function splitToolText(text: string): { name: string; summary: string } {
  const i = text.indexOf(': ')
  return i < 0 ? { name: text, summary: '' } : { name: text.slice(0, i), summary: text.slice(i + 2) }
}

function DiffView({ hunks }: { hunks: DiffHunk[] }) {
  const rows = useMemo(() => {
    const all = hunks.flatMap((h, i) => {
      const lines = collapse(diffLines(h.old, h.new), 3)
      // ngăn cách giữa các lần sửa của MultiEdit
      return i > 0 ? [{ type: 'gap' as const, count: 0 }, ...lines] : lines
    })
    return all
  }, [hunks])
  const shown = rows.slice(0, MAX_ROWS)
  return (
    <div className="diff">
      {shown.map((l, i) =>
        l.type === 'gap' ? (
          <div key={i} className="d-gap">
            {l.count > 0 ? `⋯ ${l.count} dòng không đổi` : '⋯'}
          </div>
        ) : (
          <div key={i} className={'d-' + l.type}>
            <span className="d-sign">{l.type === 'add' ? '+' : l.type === 'del' ? '−' : ' '}</span>
            <span className="d-text">{l.text || ' '}</span>
          </div>
        )
      )}
      {rows.length > MAX_ROWS && <div className="d-gap">… còn {rows.length - MAX_ROWS} dòng</div>}
    </div>
  )
}

/** Thẻ một lần gọi tool: link mở file trong VS Code, diff đỏ/xanh của lần sửa, output. */
export const ToolCard = memo(function ToolCard({ name, summary, status, output, file, line, diff, cwd }: Props) {
  const stats = useMemo(() => (diff?.length ? diffStats(diff) : null), [diff])
  const { diffExpanded } = usePaneSettings()
  const hasBody = !!diff?.length || !!output

  const open = (e: React.MouseEvent) => {
    e.preventDefault() // không mở/đóng thẻ
    e.stopPropagation()
    // dòng vừa sửa: tìm theo nội dung mới của lần sửa đầu tiên
    const needle = diff?.find((h) => h.new.trim())?.new
    api.openInVscode(file!, { cwd, line, needle }).catch((err) => alertDialog(String((err as Error).message ?? err)))
  }

  const head = (
    <>
      {status && <span className="tool-st">{STATUS_ICON[status]}</span>}
      <b>{name}</b>{' '}
      {file ? (
        <a className="file-link" href="#" onClick={open} title={`Mở trong VS Code\n${file}`}>
          {baseName(file)}
          <span className="muted"> {file.slice(0, Math.max(0, file.length - baseName(file).length - 1))}</span>
        </a>
      ) : (
        <span className="muted">{summary}</span>
      )}
      {stats && (
        <span className="d-stats">
          {stats.add > 0 && <span className="add">+{stats.add}</span>}
          {stats.del > 0 && <span className="del">−{stats.del}</span>}
        </span>
      )}
    </>
  )

  if (!hasBody) return <div className={'tool-card flat ' + (status ?? '')}>{head}</div>
  return (
    // key theo cài đặt: đổi công tắc thì mọi thẻ theo lại cài đặt (kể cả thẻ đã bấm mở/đóng riêng)
    <details key={String(diffExpanded)} className={'tool-card ' + (status ?? '')} open={diffExpanded && !!diff?.length}>
      <summary>{head}</summary>
      {diff?.length ? <DiffView hunks={diff} /> : null}
      {output && <pre>{output}</pre>}
    </details>
  )
})
