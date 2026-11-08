import type { ChatEvent, ChatImage, ChatOpenOptions } from '@shared/chat'
import { getProfile } from '../profiles'
import { ClaudeChat } from './claudeChat'
import { fetchUsage, settingsModel } from './usage'
import { listCommands } from './commands'
import { listModels } from './models'

const chats = new Map<string, ClaudeChat>()

export async function chatSend(
  chatId: string,
  opts: ChatOpenOptions,
  text: string,
  images: ChatImage[],
  emit: (chatId: string, e: ChatEvent) => void
) {
  let c = chats.get(chatId)
  if (!c) {
    const p = await getProfile(opts.profileId)
    if (p.provider !== 'claude') throw new Error('Chat trực tiếp hiện chỉ hỗ trợ Claude. Codex dùng chế độ Terminal.')
    c = new ClaudeChat(p, opts, (e) => emit(chatId, e))
    chats.set(chatId, c)
  }
  await c.send(text, images)
}

export const chatInterrupt = (id: string) => chats.get(id)?.interrupt()
export const chatSetMode = (id: string, mode: string) => chats.get(id)?.setPermissionMode(mode)
export const chatPermission = (id: string, reqId: string, d: 'allow' | 'always' | 'deny') =>
  chats.get(id)?.respondPermission(reqId, d)

export const chatAnswer = (id: string, reqId: string, answers: Record<string, string> | null) =>
  chats.get(id)?.answerQuestion(reqId, answers)
export const chatSetModel = (id: string, model: string | undefined) => chats.get(id)?.setModel(model)

export async function chatModels(profileId: string, chatId: string | null) {
  const p = await getProfile(profileId)
  if (p.provider !== 'claude') return []
  const running = chatId ? chats.get(chatId)?.runningQuery() ?? null : null
  return listModels(p, running)
}

export async function chatUsage(profileId: string, chatId: string | null, force: boolean) {
  const p = await getProfile(profileId)
  if (p.provider !== 'claude') throw new Error('Usage hiện chỉ hỗ trợ Claude.')
  const running = chatId ? chats.get(chatId)?.runningQuery() ?? null : null
  return fetchUsage(p, running, force)
}

export async function chatCommands(profileId: string, cwd: string, chatId: string | null) {
  const p = await getProfile(profileId)
  if (p.provider !== 'claude') return []
  const running = chatId ? chats.get(chatId)?.runningQuery() ?? null : null
  return listCommands(p, cwd, running)
}

export async function chatDefaultModel(profileId: string) {
  return settingsModel(await getProfile(profileId))
}

export const chatSuspend = (id: string) => chats.get(id)?.suspend()

export function chatClose(id: string) {
  chats.get(id)?.close()
  chats.delete(id)
}

export function closeAllChats() {
  for (const id of [...chats.keys()]) chatClose(id)
}
