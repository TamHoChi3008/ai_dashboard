import type { BoardApi } from '@shared/types'

declare global {
  interface Window {
    board: BoardApi
  }
}

export const api = window.board

export function timeAgo(ms: number): string {
  const s = Math.max(0, (Date.now() - ms) / 1000)
  if (s < 60) return 'vừa xong'
  if (s < 3600) return `${Math.floor(s / 60)} phút`
  if (s < 86400) return `${Math.floor(s / 3600)} giờ`
  return `${Math.floor(s / 86400)} ngày`
}

export function baseName(p: string): string {
  return p.split(/[\\/]/).filter(Boolean).pop() ?? p
}

export const STATUS_LABEL = { running: 'Đang chạy', waiting: 'Tới lượt bạn', idle: 'Nghỉ' } as const
