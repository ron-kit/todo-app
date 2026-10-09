const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  chooseBackground: () => ipcRenderer.invoke('choose-bg'),
  searchFoods: (q, key) => ipcRenderer.invoke('food-search', q, key),
  loadState: () => ipcRenderer.sendSync('state-load'),
  saveState: (json) => ipcRenderer.sendSync('state-save', json),
  exportData: (json) => ipcRenderer.invoke('data-export', json),
  importData: () => ipcRenderer.invoke('data-import'),
  openBackups: () => ipcRenderer.invoke('open-backups'),
});
