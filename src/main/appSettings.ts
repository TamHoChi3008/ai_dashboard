import { app } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

/** Cài đặt chung của app: userData/app-settings.json */
interface AppSettings {
  /** Thư mục chọn gần nhất cho session mới (hộp thoại sẽ mở sẵn ở đây). */
  lastFolder?: string
  /** Profile đã đóng tab (vẫn còn, mở lại được từ tab Tổng quan). */
  closedProfiles?: string[]
}

const file = () => join(app.getPath('userData'), 'app-settings.json')

export function readAppSettings(): AppSettings {
  try {
    return JSON.parse(readFileSync(file(), 'utf8'))
  } catch {
    return {}
  }
}

export function updateAppSettings(patch: Partial<AppSettings>) {
  try {
    writeFileSync(file(), JSON.stringify({ ...readAppSettings(), ...patch }, null, 2), 'utf8')
  } catch {
    /* không lưu được thì thôi, không ảnh hưởng chức năng */
  }
}
