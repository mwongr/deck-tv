'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Expose safe, isolated auto-updater IPC APIs to the Next.js renderer process
contextBridge.exposeInMainWorld('electronUpdater', {
  onUpdateAvailable: (callback) => {
    const handler = (_event, info) => callback(info);
    ipcRenderer.on('update-available', handler);
    return () => ipcRenderer.removeListener('update-available', handler);
  },
  onUpdateProgress: (callback) => {
    const handler = (_event, progress) => callback(progress);
    ipcRenderer.on('update-progress', handler);
    return () => ipcRenderer.removeListener('update-progress', handler);
  },
  onUpdateDownloaded: (callback) => {
    const handler = (_event, info) => callback(info);
    ipcRenderer.on('update-downloaded', handler);
    return () => ipcRenderer.removeListener('update-downloaded', handler);
  },
  onUpdateError: (callback) => {
    const handler = (_event, error) => callback(error);
    ipcRenderer.on('update-error', handler);
    return () => ipcRenderer.removeListener('update-error', handler);
  },
  restartApp: () => {
    ipcRenderer.send('restart_app');
  },
  checkForUpdates: () => {
    ipcRenderer.send('check_for_updates');
  },
});
