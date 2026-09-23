const { app, BrowserWindow, dialog, ipcMain, safeStorage, session, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('node:path');
const fs = require('node:fs');

const SITE_URL = 'https://poke.idleworld.online/login';
const cacheDirectory = path.join(app.getPath('userData'), 'Cache');
fs.mkdirSync(cacheDirectory, { recursive: true });
app.setPath('cache', cacheDirectory);
app.commandLine.appendSwitch('disk-cache-dir', cacheDirectory);
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

function credentialsFile() {
  return path.join(app.getPath('userData'), 'piw-credentials.json');
}

function readCredentials() {
  try {
    return JSON.parse(fs.readFileSync(credentialsFile(), 'utf8'));
  } catch {
    return {};
  }
}

function writeCredentials(credentials) {
  fs.mkdirSync(path.dirname(credentialsFile()), { recursive: true });
  fs.writeFileSync(credentialsFile(), JSON.stringify(credentials), { mode: 0o600 });
}

function setupAutoUpdater(window) {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => window.webContents.send('updater:status', { state: 'checking' }));
  autoUpdater.on('update-available', (info) => window.webContents.send('updater:status', { state: 'available', version: info.version }));
  autoUpdater.on('download-progress', (progress) => window.webContents.send('updater:status', { state: 'downloading', percent: Math.round(progress.percent) }));
  autoUpdater.on('update-downloaded', async (info) => {
    window.webContents.send('updater:status', { state: 'downloaded', version: info.version });
    const result = await dialog.showMessageBox(window, {
      type: 'info',
      buttons: ['Reiniciar agora', 'Depois'],
      defaultId: 0,
      cancelId: 1,
      title: 'Atualização pronta',
      message: `A versão ${info.version} foi baixada.`,
      detail: 'Reinicie o PIW Client para instalar a atualização.'
    });
    if (result.response === 0) autoUpdater.quitAndInstall();
  });
  autoUpdater.on('error', (error) => window.webContents.send('updater:status', { state: 'error', message: error.message }));
  autoUpdater.checkForUpdatesAndNotify();
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 620,
    title: `PIW Client v${app.getVersion()}`,
    backgroundColor: '#11151c',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true
    }
  });

  window.setMenuBarVisibility(false);
  window.on('page-title-updated', (event) => {
    event.preventDefault();
    window.setTitle(`PIW Client v${app.getVersion()}`);
  });
  window.loadFile(path.join(__dirname, 'index.html'));
  window.webContents.once('did-finish-load', () => setupAutoUpdater(window));
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://poke.idleworld.online/')) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('credentials:load', (_event, slot) => {
    const stored = readCredentials()[String(slot)];
    if (!stored || !safeStorage.isEncryptionAvailable()) return null;
    try {
      return JSON.parse(safeStorage.decryptString(Buffer.from(stored, 'base64')));
    } catch {
      return null;
    }
  });

  ipcMain.handle('credentials:save', (_event, slot, credentials) => {
    if (!safeStorage.isEncryptionAvailable() || !credentials?.username || !credentials?.password) return false;
    const stored = readCredentials();
    stored[String(slot)] = safeStorage.encryptString(JSON.stringify(credentials)).toString('base64');
    writeCredentials(stored);
    return true;
  });

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'notifications');
  });

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

module.exports = { SITE_URL };
