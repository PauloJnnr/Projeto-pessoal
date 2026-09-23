const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('piw', {
  siteUrl: 'https://poke.idleworld.online/login',
  loadCredentials: (slot) => ipcRenderer.invoke('credentials:load', slot),
  saveCredentials: (slot, credentials) => ipcRenderer.invoke('credentials:save', slot, credentials),
  onUpdateStatus: (callback) => ipcRenderer.on('updater:status', (_event, status) => callback(status))
});
