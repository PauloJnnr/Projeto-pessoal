const { contextBridge, ipcRenderer } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

contextBridge.exposeInMainWorld('piw', {
  siteUrl: 'https://poke.idleworld.online/login',
  guestPreloadUrl: pathToFileURL(path.join(__dirname, 'guest-preload.js')).toString(),
  getVersion: () => ipcRenderer.invoke('app:version'),
  loadCredentials: (slot) => ipcRenderer.invoke('credentials:load', slot),
  saveCredentials: (slot, credentials) => ipcRenderer.invoke('credentials:save', slot, credentials),
  onUpdateStatus: (callback) => ipcRenderer.on('updater:status', (_event, status) => callback(status))
});
