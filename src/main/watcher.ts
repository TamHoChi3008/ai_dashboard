import { watch, FSWatcher } from 'chokidar'
import type { Profile } from '@shared/types'
import { sessionRoot } from './providers/sessions'

type Notify = (profileId: string, files: string[]) => void

const watchers = new Map<string, { root: string; w: FSWatcher }>()
const pending = new Map<string, Set<string>>()
const timers = new Map<string, NodeJS.Timeout>()

/** Gom các thay đổi file trong 400ms rồi báo một lần. */
function queue(profileId: string, file: string, notify: Notify) {
  let set = pending.get(profileId)
  if (!set) pending.set(profileId, (set = new Set()))
  set.add(file)
  if (timers.has(profileId)) return
  timers.set(
    profileId,
    setTimeout(() => {
      timers.delete(profileId)
      const files = [...(pending.get(profileId) ?? [])]
      pending.delete(profileId)
      notify(profileId, files)
    }, 400)
  )
}

export function syncWatchers(profiles: Profile[], notify: Notify) {
  const ids = new Set(profiles.map((p) => p.id))
  for (const [id, { w }] of watchers) {
    if (!ids.has(id)) {
      void w.close()
      watchers.delete(id)
    }
  }
  for (const p of profiles) {
    const root = sessionRoot(p)
    const cur = watchers.get(p.id)
    if (cur && cur.root === root) continue
    if (cur) void cur.w.close()
    const w = watch(root, {
      ignoreInitial: true,
      depth: p.provider === 'claude' ? 2 : 5,
      ignored: (path, stats) => !!stats?.isFile() && !/\.jsonl(\.zst)?$/.test(path)
    })
    const on = (file: string) => queue(p.id, file, notify)
    w.on('add', on).on('change', on).on('unlink', on).on('error', () => {})
    watchers.set(p.id, { root, w })
  }
}

export async function closeWatchers() {
  await Promise.all([...watchers.values()].map(({ w }) => w.close()))
  watchers.clear()
}
