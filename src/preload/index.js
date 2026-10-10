import { contextBridge, ipcRenderer } from 'electron'

// Safe bridge between the UI (renderer) and the Node side (main).
function listen(channel) {
  return (cb) => {
    const handler = (_e, payload) => cb(payload)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  }
}

contextBridge.exposeInMainWorld('api', {
  getLibrary: () => ipcRenderer.invoke('library:get'),
  onLibrary: listen('library:update'),
  getFolders: () => ipcRenderer.invoke('folders:get'),
  addFolder: () => ipcRenderer.invoke('folders:add'),
  removeFolder: (path) => ipcRenderer.invoke('folders:remove', path),
  rescan: () => ipcRenderer.invoke('library:rescan'),
  addFiles: () => ipcRenderer.invoke('files:add'),
  nowPlaying: () => ipcRenderer.invoke('player:now'),
  play: (fileId, opts) => ipcRenderer.invoke('player:play', fileId, opts),
  titleDetails: (id) => ipcRenderer.invoke('title:details', id),
  updateTitle: (id, patch) => ipcRenderer.invoke('title:update', id, patch),
  setWatched: (fileIds, watched) => ipcRenderer.invoke('files:setWatched', fileIds, watched),
  revealFile: (fileId) => ipcRenderer.invoke('files:reveal', fileId),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  drive: {
    status: () => ipcRenderer.invoke('drive:status'),
    connect: () => ipcRenderer.invoke('drive:connect'),
    sync: () => ipcRenderer.invoke('drive:sync'),
    disconnect: () => ipcRenderer.invoke('drive:disconnect')
  },
  win: {
    minimize: () => ipcRenderer.send('win:minimize'),
    maximize: () => ipcRenderer.send('win:maximize'),
    close: () => ipcRenderer.send('win:close')
  }
})
