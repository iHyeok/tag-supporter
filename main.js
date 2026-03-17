const { app, BrowserWindow, ipcMain, dialog, protocol } = require('electron');
const path = require('path');
const fs = require('fs');

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'];

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
  protocol.registerFileProtocol('local-image', (request, callback) => {
    const filePath = decodeURIComponent(request.url.replace('local-image://', ''));
    callback({ path: filePath });
  });
  createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});

// Select folder dialog
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

// List image files in a folder
ipcMain.handle('list-images', async (event, folderPath) => {
  try {
    const files = fs.readdirSync(folderPath);
    return files
      .filter((f) => IMAGE_EXTENSIONS.includes(path.extname(f).toLowerCase()))
      .sort();
  } catch (e) {
    return [];
  }
});

// Read tags from a tag file
ipcMain.handle('read-tags', async (event, tagFilePath) => {
  try {
    if (!fs.existsSync(tagFilePath)) return [];
    const content = fs.readFileSync(tagFilePath, 'utf-8').trim();
    if (!content) return [];
    return content
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
  } catch (e) {
    return [];
  }
});

// Save tags to a tag file
ipcMain.handle('save-tags', async (event, tagFilePath, tags) => {
  try {
    const content = tags.join(', ') + (tags.length > 0 ? ',' : '');
    fs.writeFileSync(tagFilePath, content, 'utf-8');
    return true;
  } catch (e) {
    return false;
  }
});

// Get all unique tags from all tag files in a folder
ipcMain.handle('get-all-tags', async (event, tagFolderPath) => {
  try {
    const files = fs.readdirSync(tagFolderPath);
    const tagSet = new Set();
    for (const file of files) {
      if (path.extname(file).toLowerCase() !== '.txt') continue;
      const content = fs.readFileSync(path.join(tagFolderPath, file), 'utf-8').trim();
      if (!content) continue;
      content
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0)
        .forEach((t) => tagSet.add(t));
    }
    return Array.from(tagSet).sort();
  } catch (e) {
    return [];
  }
});

// Get image file path for display
ipcMain.handle('get-image-path', async (event, imageFolderPath, fileName) => {
  return path.join(imageFolderPath, fileName);
});
