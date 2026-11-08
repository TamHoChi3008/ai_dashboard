import { Component, type ReactNode } from 'react'

interface Props {
  /** Tên vùng bị lỗi, hiện trong thông báo. */
  label: string
  children: ReactNode
}

/**
 * Bắt lỗi render của một vùng (một khung, hoặc cả app) để lỗi không làm trắng toàn bộ cửa sổ.
 */
export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error(`[${this.props.label}]`, error)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    // preload cũ (app chưa khởi động lại sau khi cập nhật) → hàm API không tồn tại
    const stale = /is not a function/.test(error.message)
    return (
      <div className="crash">
        <b>⚠ {this.props.label} gặp lỗi</b>
        <code>{error.message}</code>
        {stale && <div className="muted small">App vừa được cập nhật nhưng chưa khởi động lại. Hãy tắt app và chạy lại.</div>}
        <div className="row">
          <button onClick={() => this.setState({ error: null })}>Thử lại</button>
          <button onClick={() => location.reload()}>Tải lại giao diện</button>
        </div>
      </div>
    )
  }
}
