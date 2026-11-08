import { contextBridge, ipcRenderer, IpcRendererEvent, webUtils } from 'electron'
import type { BoardApi } from '@shared/types'

function listen<A extends unknown[]>(channel: string, cb: (...args: A) => void) {
  const h = (_e: IpcRendererEvent, ...args: unknown[]) => cb(...(args as A))
  ipcRenderer.on(channel, h)
  return () => {
    ipcRenderer.removeListener(channel, h)
  }
}

const api: BoardApi = {
  listProfiles: () => ipcRenderer.invoke('profiles:list'),
  saveProfile: (p) => ipcRenderer.invoke('profiles:save', p),
  deleteProfile: (id, removeData) => ipcRenderer.invoke('profiles:delete', id, !!removeData),
  reorderProfiles: (ids) => ipcRenderer.invoke('profiles:reorder', ids),
  listCatalog: (profileId) => ipcRenderer.invoke('catalog:list', profileId),
  openCatalogPath: (path) => ipcRenderer.invoke('catalog:open', path),
  listSessions: (profileId, days) => ipcRenderer.invoke('sessions:list', profileId, days),
  readTranscript: (profileId, file) => ipcRenderer.invoke('sessions:transcript', profileId, file),
  getSessionFlags: (profileId) => ipcRenderer.invoke('sessions:flags', profileId),
  setSessionFlag: (profileId, sessionId, flag, on) => ipcRenderer.invoke('sessions:setFlag', profileId, sessionId, flag, on),
  deleteSession: (profileId, session, mode) => ipcRenderer.invoke('sessions:delete', profileId, session, mode),
  listTrash: (profileId) => ipcRenderer.invoke('trash:list', profileId),
  restoreTrash: (trashId) => ipcRenderer.invoke('trash:restore', trashId),
  purgeTrash: (trashId) => ipcRenderer.invoke('trash:purge', trashId),
  renameSession: (profileId, sessionId, name, original) => ipcRenderer.invoke('sessions:rename', profileId, sessionId, name, original),
  pickFolder: () => ipcRenderer.invoke('dialog:folder'),
  ptySpawn: (req) => ipcRenderer.invoke('pty:spawn', req),
  ptyWrite: (id, data) => ipcRenderer.send('pty:write', id, data),
  ptyResize: (id, c, r) => ipcRenderer.send('pty:resize', id, c, r),
  ptyKill: (id) => ipcRenderer.send('pty:kill', id),
  onPtyData: (cb) => listen('pty:data', cb),
  onPtyExit: (cb) => listen('pty:exit', cb),
  onFilesChanged: (cb) => listen('files-changed', cb),
  chatSend: (chatId, opts, text, images) => ipcRenderer.invoke('chat:send', chatId, opts, text, images ?? []),
  chatAnswer: (chatId, reqId, answers) => ipcRenderer.send('chat:answer', chatId, reqId, answers),
  chatSetModel: (chatId, model) => ipcRenderer.invoke('chat:setModel', chatId, model),
  chatModels: (profileId, chatId) => ipcRenderer.invoke('chat:models', profileId, chatId),
  pickAttachments: () => ipcRenderer.invoke('dialog:files'),
  readAttachments: (paths) => ipcRenderer.invoke('files:attachments', paths),
  pathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file)
    } catch {
      return ''
    }
  },
  getLayout: (profileId) => ipcRenderer.invoke('layout:get', profileId),
  saveLayout: (profileId, layout) => ipcRenderer.send('layout:set', profileId, layout),
  getStats: (profileId, days) => ipcRenderer.invoke('stats:get', profileId, days),
  appInfo: () => ipcRenderer.invoke('app:info'),
  getClosedProfiles: () => ipcRenderer.invoke('profiles:closed'),
  setClosedProfiles: (ids) => ipcRenderer.send('profiles:setClosed', ids),
  onShortcut: (cb) => listen('shortcut', cb),
  chatInterrupt: (chatId) => ipcRenderer.invoke('chat:interrupt', chatId),
  chatSetMode: (chatId, mode) => ipcRenderer.invoke('chat:mode', chatId, mode),
  chatPermission: (chatId, reqId, d) => ipcRenderer.send('chat:permission', chatId, reqId, d),
  chatClose: (chatId) => ipcRenderer.send('chat:close', chatId),
  chatSuspend: (chatId) => ipcRenderer.send('chat:suspend', chatId),
  listProjectFiles: (cwd) => ipcRenderer.invoke('files:list', cwd),
  openInVscode: (file, opts) => ipcRenderer.invoke('files:openInVscode', file, opts ?? {}),
  chatUsage: (profileId, chatId, force) => ipcRenderer.invoke('chat:usage', profileId, chatId, force),
  chatDefaultModel: (profileId) => ipcRenderer.invoke('chat:defaultModel', profileId),
  chatCommands: (profileId, cwd, chatId) => ipcRenderer.invoke('chat:commands', profileId, cwd, chatId),
  onChatEvent: (cb) => listen('chat:event', cb)
}

contextBridge.exposeInMainWorld('board', api)
