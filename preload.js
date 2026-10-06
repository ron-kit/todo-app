const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', { chooseBackground: () => ipcRenderer.invoke('choose-bg') });
