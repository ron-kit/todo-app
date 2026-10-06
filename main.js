const { app, BrowserWindow, Menu, nativeTheme } = require('electron');

function createWindow() {
  Menu.setApplicationMenu(null);
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 720,
    minHeight: 480,
    title: 'Tasks',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1a1c20' : '#f4f3f0',
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  win.loadFile('index.html');
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
