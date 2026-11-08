import { app } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import { emptyFlags, setSessionName, toggleFlag, type FlagName, type SessionFlags } from '@shared/sessionFlags'

/** Ghim / ẩn session, theo từng profile: userData/session-flags.json */
let data: Record<string, SessionFlags> | null = null
let writing: Promise<void> = Promise.resolve()

const file = () => join(app.getPath('userData'), 'session-flags.json')

async function load(): Promise<Record<string, SessionFlags>> {
  if (data) return data
  try {
    data = JSON.parse(await fs.readFile(file(), 'utf8'))
  } catch {
    data = {}
  }
  return data!
}

function persist() {
  // ghi tuần tự để hai lần bấm nhanh không ghi đè nhau
  writing = writing.then(async () => {
    const tmp = file() + '.tmp'
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
    await fs.rename(tmp, file())
  })
  return writing
}

export async function getFlags(profileId: string): Promise<SessionFlags> {
  const d = await load()
  return d[profileId] ?? emptyFlags
}

export async function setFlag(profileId: string, sessionId: string, flag: FlagName, on: boolean): Promise<SessionFlags> {
  const d = await load()
  d[profileId] = toggleFlag(d[profileId] ?? emptyFlags, sessionId, flag, on)
  await persist()
  return d[profileId]
}

/** Đổi tên session trong app; tên rỗng = về tên gốc. */
export async function renameSession(profileId: string, sessionId: string, name: string, original?: string): Promise<SessionFlags> {
  const d = await load()
  d[profileId] = setSessionName(d[profileId] ?? emptyFlags, sessionId, String(name ?? ''), original)
  await persist()
  return d[profileId]
}
