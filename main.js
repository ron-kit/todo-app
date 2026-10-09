const { app, BrowserWindow, Menu, nativeTheme, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

let win;
function createWindow() {
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 720,
    minHeight: 480,
    title: 'Tasks',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1a1c20' : '#f4f3f0',
    webPreferences: { contextIsolation: true, sandbox: true, preload: path.join(__dirname, 'preload.js') },
  });
  win.loadFile('index.html');
  // Links in task names open in the default browser, never inside the app.
  const external = (url) => { if (/^https?:\/\//i.test(url)) shell.openExternal(url); };
  win.webContents.setWindowOpenHandler(({ url }) => { external(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (url !== win.webContents.getURL()) { e.preventDefault(); external(url); } });
}

// Copies the chosen image into userData so it survives the original moving.
ipcMain.handle('choose-bg', async () => {
  const r = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif'] }],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  const dir = app.getPath('userData');
  for (const f of fs.readdirSync(dir)) if (f.startsWith('background.')) fs.unlinkSync(path.join(dir, f));
  const dest = path.join(dir, 'background' + path.extname(r.filePaths[0]).toLowerCase());
  fs.copyFileSync(r.filePaths[0], dest);
  return pathToFileURL(dest).href;
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
