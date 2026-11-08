import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import type { ProfileInfo, SessionSummary } from '@shared/types'
import { api } from '../api'
import { SpawnSpec, toSpawnRequest } from './Workspace'

interface Props {
  profile: ProfileInfo
  spec: SpawnSpec
  session?: SessionSummary
  /** Đang hiển thị trên màn hình (để fit lại kích thước). */
  active: boolean
  focused: boolean
}

export function TerminalView({ profile, spec, session, active, focused }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const term = useRef<Terminal | null>(null)
  const fit = useRef<FitAddon | null>(null)
  const ptyId = useRef('')

  // tạo terminal + PTY đúng một lần cho mỗi khung
  useEffect(() => {
    const t = new Terminal({
      fontFamily: 'Cascadia Mono, Consolas, monospace',
      fontSize: 13,
      cursorBlink: true,
      allowProposedApi: true,
      scrollback: 5000,
      theme: { background: '#101114' }
    })
    const f = new FitAddon()
    t.loadAddon(f)
    t.open(host.current!)
    term.current = t
    fit.current = f
    try {
      f.fit()
    } catch {
      /* chưa hiển thị */
    }

    const id = crypto.randomUUID()
    ptyId.current = id
    // đăng ký nghe trước khi spawn để không mất output đầu tiên
    const offData = api.onPtyData((pid, d) => pid === id && t.write(d))
    const offExit = api.onPtyExit((pid, code) => pid === id && t.write(`\r\n\x1b[90m[đã thoát, mã ${code}]\x1b[0m\r\n`))
    const offInput = t.onData((d) => api.ptyWrite(id, d))

    void api.ptySpawn(toSpawnRequest(profile, id, spec, session, t.cols, t.rows)).then((r) => {
      if (!r.ok) t.write(`\x1b[31m${r.error ?? 'Không chạy được CLI'}\x1b[0m\r\n`)
    })

    const ro = new ResizeObserver(() => {
      if (!host.current || host.current.offsetParent === null) return
      try {
        f.fit()
        api.ptyResize(id, t.cols, t.rows)
      } catch {
        /* bỏ qua */
      }
    })
    ro.observe(host.current!)

    return () => {
      ro.disconnect()
      offData()
      offExit()
      offInput.dispose()
      api.ptyKill(id)
      t.dispose()
    }
    // chỉ chạy một lần khi mount; đổi profile/session không spawn lại
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!active) return
    requestAnimationFrame(() => {
      try {
        fit.current?.fit()
        if (term.current) api.ptyResize(ptyId.current, term.current.cols, term.current.rows)
      } catch {
        /* bỏ qua */
      }
      if (focused) term.current?.focus()
    })
  }, [active, focused])

  return <div className="terminal" ref={host} />
}
