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
    title: 'Everything Tracker',
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

/* ---------- data: one JSON file plus rolling backups, kept outside the app folder ----------
   <userData>/data/state.json          the live data (written atomically)
   <userData>/data/backups/            hourly copies, copies taken before an app update, and
                                       copies taken whenever a save would shrink the data a lot */
const dataDir = () => path.join(app.getPath('userData'), 'data');
const stateFile = () => path.join(dataDir(), 'state.json');
const backupDir = () => path.join(dataDir(), 'backups');

const parse = (txt) => { try { return JSON.parse(txt); } catch { return null; } };
// rough "how much stuff is in here", used to notice a save that would wipe most of it
function weight(txt) {
  const s = parse(txt);
  if (!s) return 0;
  const cats = (s.todo?.cats || []).reduce((n, c) => n + (c.tasks?.length || 0), 0);
  const diet = Object.values(s.diet?.log || {}).reduce((n, d) => n + d.length, 0);
  return (s.daily?.tasks?.length || 0) + cats + (s.todo?.cats?.length || 0) + (s.notes?.items?.length || 0) + diet + (s.diet?.recipes?.length || 0);
}
function prune(prefix, keep) {
  const files = fs.readdirSync(backupDir()).filter((f) => f.startsWith(prefix)).sort();
  for (const f of files.slice(0, Math.max(0, files.length - keep))) fs.unlinkSync(path.join(backupDir(), f));
}
function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}
function readState() {
  let txt = null;
  try { txt = fs.readFileSync(stateFile(), 'utf8'); } catch { /* none yet */ }
  if (txt && parse(txt)) return txt;
  // missing or corrupted: fall back to the newest readable backup
  try {
    const files = fs.readdirSync(backupDir()).filter((f) => f.endsWith('.json')).sort().reverse();
    for (const f of files) { const t = fs.readFileSync(path.join(backupDir(), f), 'utf8'); if (parse(t)) return t; }
  } catch { /* no backups */ }
  return null;
}
function writeState(json) {
  fs.mkdirSync(backupDir(), { recursive: true });
  let prev = null;
  try { prev = fs.readFileSync(stateFile(), 'utf8'); } catch { /* first save */ }
  if (prev && prev !== json && parse(prev)) {
    const hourly = path.join(backupDir(), `state-${stamp().slice(0, 11)}.json`); // one per hour: the state before that hour's first change
    if (!fs.existsSync(hourly)) fs.writeFileSync(hourly, prev);
    if (weight(prev) >= 4 && weight(json) < weight(prev) * 0.6) fs.writeFileSync(path.join(backupDir(), `before-shrink-${stamp()}.json`), prev);
    prune('state-', 96); prune('before-shrink-', 30);
  }
  const tmp = `${stateFile()}.tmp`;
  fs.writeFileSync(tmp, json);
  fs.renameSync(tmp, stateFile());
}
// keep a copy of the data every time the app version changes
function snapshotOnUpdate() {
  try {
    fs.mkdirSync(backupDir(), { recursive: true });
    const vfile = path.join(dataDir(), 'version.txt');
    let last = ''; try { last = fs.readFileSync(vfile, 'utf8').trim(); } catch { /* first run */ }
    if (last !== app.getVersion()) {
      if (fs.existsSync(stateFile())) fs.copyFileSync(stateFile(), path.join(backupDir(), `pre-update-${last || 'old'}-to-${app.getVersion()}-${stamp()}.json`));
      fs.writeFileSync(vfile, app.getVersion());
    }
  } catch { /* never block startup */ }
}

ipcMain.on('state-load', (e) => { try { e.returnValue = readState(); } catch { e.returnValue = null; } });
ipcMain.on('state-save', (e, json) => { try { writeState(json); } catch (err) { console.error('save failed', err); } e.returnValue = true; });
ipcMain.handle('data-export', async (_e, json) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: `everything-tracker-${stamp().slice(0, 8)}.json`, filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (r.canceled || !r.filePath) return false;
  fs.writeFileSync(r.filePath, json);
  return true;
});
ipcMain.handle('data-import', async () => {
  const r = await dialog.showOpenDialog(win, { defaultPath: backupDir(), properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (r.canceled || !r.filePaths[0]) return null;
  const txt = fs.readFileSync(r.filePaths[0], 'utf8');
  const s = parse(txt);
  if (!s || typeof s !== 'object' || !(s.daily || s.todo || s.notes || s.diet)) throw new Error('That file is not Everything Tracker data');
  // always keep what is being replaced
  try { fs.mkdirSync(backupDir(), { recursive: true }); if (fs.existsSync(stateFile())) fs.copyFileSync(stateFile(), path.join(backupDir(), `before-import-${stamp()}.json`)); prune('before-import-', 30); } catch { /* ignore */ }
  return txt;
});
ipcMain.handle('open-backups', async () => { fs.mkdirSync(backupDir(), { recursive: true }); return shell.openPath(backupDir()); });

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

// USDA FoodData Central lookup (generic foods only). Returns per-100 g values.
ipcMain.handle('food-search', async (_e, query, apiKey) => {
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(apiKey || 'DEMO_KEY')}&query=${encodeURIComponent(query)}&dataType=Foundation,SR%20Legacy&pageSize=12`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(res.status === 429 ? 'USDA rate limit reached (add your own API key at the bottom of Diet)' : `USDA error ${res.status}`);
  const data = await res.json();
  const pick = (f, ids) => { for (const id of ids) { const n = f.foodNutrients.find((x) => x.nutrientId === id); if (n) return n.value; } return 0; };
  return (data.foods || []).map((f) => ({
    name: f.description,
    k: pick(f, [1008, 2047, 2048]), p: pick(f, [1003]), c: pick(f, [1005]), f: pick(f, [1004]),
  }));
});

app.whenReady().then(() => { snapshotOnUpdate(); createWindow(); });
app.on('window-all-closed', () => app.quit());
