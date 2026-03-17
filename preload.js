const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  listImages: (folderPath) => ipcRenderer.invoke('list-images', folderPath),
  readTags: (tagFilePath) => ipcRenderer.invoke('read-tags', tagFilePath),
  saveTags: (tagFilePath, tags) => ipcRenderer.invoke('save-tags', tagFilePath, tags),
  getAllTags: (tagFolderPath) => ipcRenderer.invoke('get-all-tags', tagFolderPath),
  getImagePath: (imageFolderPath, fileName) =>
    ipcRenderer.invoke('get-image-path', imageFolderPath, fileName),
});
