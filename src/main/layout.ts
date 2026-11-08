import { app } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { WorkspaceLayout } from '@shared/layout'

/**
 * Bố cục khung của từng profile: userData/layout.json.
 * Bản dev lưu file riêng để chạy song song với bản cài mà không ghi đè bố cục của nhau.
 */
const file = () => join(app.getPath('userData'), app.isPackaged ? 'layout.json' : 'layout-dev.json')

function readAll(): Record<string, WorkspaceLayout> {
  try {
    const v = JSON.parse(readFileSync(file(), 'utf8'))
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

export const getLayout = (profileId: string): WorkspaceLayout | null => readAll()[profileId] ?? null

export function setLayout(profileId: string, layout: WorkspaceLayout) {
  try {
    writeFileSync(file(), JSON.stringify({ ...readAll(), [profileId]: layout }), 'utf8')
  } catch {
    /* không lưu được thì thôi */
  }
}
