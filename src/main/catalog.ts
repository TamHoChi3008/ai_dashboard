import { promises as fs } from 'fs'
import { basename, dirname, join, relative, sep } from 'path'
import type { CatalogItem, Profile } from '@shared/types'

/** Đọc name/description trong frontmatter YAML đơn giản (--- ... ---) của SKILL.md / command / agent. */
export function parseFrontmatter(text: string): Record<string, string> {
  const m = text.match(/^﻿?---\r?\n([\s\S]*?)\r?\n---/)
  if (!m) return {}
  const out: Record<string, string> = {}
  const lines = m[1].split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i].match(/^([A-Za-z_-]+):\s*(.*)$/)
    if (!kv) continue
    let v = kv[2].trim()
    // giá trị nhiều dòng: "key: |" / "key: >" hoặc để trống rồi thụt lề
    if (v === '' || v === '|' || v === '>' || v === '>-' || v === '|-') {
      const parts: string[] = []
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) parts.push(lines[++i].trim())
      v = parts.join(' ')
    }
    // bỏ ngoặc bao ngoài; chuỗi "..." trong YAML có thể chứa \" → "
    const dq = v.match(/^"([\s\S]*)"$/)
    if (dq) v = dq[1].replace(/\\(["\\])/g, '$1')
    else v = v.replace(/^'([\s\S]*)'$/, '$1')
    out[kv[1]] = v
  }
  return out
}

async function readText(file: string): Promise<string> {
  try {
    const fh = await fs.open(file, 'r')
    try {
      const buf = Buffer.alloc(8192) // frontmatter nằm ở đầu file
      const { bytesRead } = await fh.read(buf, 0, buf.length, 0)
      return buf.subarray(0, bytesRead).toString('utf8')
    } finally {
      await fh.close()
    }
  } catch {
    return ''
  }
}

async function readJson(file: string): Promise<any> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch {
    return undefined
  }
}

/** Tìm mọi SKILL.md dưới dir (bỏ thư mục ẩn, trừ .system của Codex). */
async function findSkillFiles(dir: string, depth: number, out: string[] = []): Promise<string[]> {
  let entries: import('fs').Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (e.isFile() && e.name === 'SKILL.md') out.push(join(dir, e.name))
    else if (e.isDirectory() && depth > 0 && (!e.name.startsWith('.') || e.name === '.system')) {
      await findSkillFiles(join(dir, e.name), depth - 1, out)
    }
  }
  return out
}

async function mdFiles(dir: string): Promise<string[]> {
  try {
    return (await fs.readdir(dir)).filter((n) => n.endsWith('.md')).map((n) => join(dir, n))
  } catch {
    return []
  }
}

async function skillItem(file: string, source: string, prefix: string, enabled = true): Promise<CatalogItem> {
  const fm = parseFrontmatter(await readText(file))
  const name = fm.name || basename(dirname(file))
  return { kind: 'skill', name: prefix + name, description: fm.description ?? '', source, path: file, enabled }
}

async function mdItem(kind: 'command' | 'agent', file: string, source: string, prefix: string, enabled: boolean): Promise<CatalogItem> {
  const fm = parseFrontmatter(await readText(file))
  const name = fm.name || basename(file, '.md')
  return { kind, name: prefix + name, description: fm.description ?? '', source, path: file, enabled }
}

async function claudeCatalog(p: Profile): Promise<CatalogItem[]> {
  const items: CatalogItem[] = []

  // skill riêng của user (kể cả skill đồng bộ từ claude.ai trong skills/synced)
  const userSkills = join(p.configDir, 'skills')
  for (const f of await findSkillFiles(userSkills, 3)) {
    const synced = relative(userSkills, f).split(sep)[0] === 'synced'
    items.push(await skillItem(f, synced ? 'claude.ai (đồng bộ)' : 'user', ''))
  }

  // plugin đã cài
  const installed = await readJson(join(p.configDir, 'plugins', 'installed_plugins.json'))
  const settings = (await readJson(join(p.configDir, 'settings.json'))) ?? {}
  const enabledMap: Record<string, boolean> = settings.enabledPlugins ?? {}
  for (const [key, entries] of Object.entries<any[]>(installed?.plugins ?? {})) {
    const entry = [...(entries ?? [])].sort((a, b) => String(b.lastUpdated).localeCompare(String(a.lastUpdated)))[0]
    if (!entry?.installPath) continue
    const dir: string = entry.installPath
    const manifest = (await readJson(join(dir, '.claude-plugin', 'plugin.json'))) ?? {}
    const pluginName: string = manifest.name || key.split('@')[0]
    const enabled = enabledMap[key] !== false
    items.push({
      kind: 'plugin',
      name: pluginName,
      description: manifest.description ?? '',
      source: key.split('@')[1] ?? 'plugin',
      path: dir,
      enabled,
      version: entry.version ?? manifest.version
    })
    const prefix = pluginName + ':'
    for (const f of await findSkillFiles(join(dir, 'skills'), 2)) items.push(await skillItem(f, pluginName, prefix, enabled))
    for (const f of await mdFiles(join(dir, 'commands'))) items.push(await mdItem('command', f, pluginName, prefix, enabled))
    for (const f of await mdFiles(join(dir, 'agents'))) items.push(await mdItem('agent', f, pluginName, prefix, enabled))
  }
  return items
}

async function codexCatalog(p: Profile): Promise<CatalogItem[]> {
  const items: CatalogItem[] = []
  const root = join(p.configDir, 'skills')
  for (const f of await findSkillFiles(root, 3)) {
    const sys = relative(root, f).split(sep)[0] === '.system'
    items.push(await skillItem(f, sys ? 'hệ thống' : 'user', ''))
  }
  return items
}

const ORDER = { plugin: 0, skill: 1, command: 2, agent: 3 } as const

export async function listCatalog(p: Profile): Promise<CatalogItem[]> {
  const items = p.provider === 'claude' ? await claudeCatalog(p) : await codexCatalog(p)
  return items.sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || a.name.localeCompare(b.name))
}
