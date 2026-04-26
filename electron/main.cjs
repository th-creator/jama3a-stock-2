const { app, BrowserWindow, dialog, ipcMain } = require('electron')
const fs = require('fs/promises')
const path = require('path')
const {
  initializeDatabase,
  login,
  closeDatabase,
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  listItems,
  getItemById,
  createItem,
  updateItem,
  deleteItem,
  listMovements,
  createMovement,
  updateMovement,
  deleteMovement,
  listLowStockItems,
  listMostUsedItems,
  listOperationLogs,
  logReportExport,
} = require('./db.cjs')

const isDev = !app.isPackaged
const devServerUrl = 'http://localhost:5173'

app.setName('inventory-desktop2')

async function loadRenderer(window) {
  if (!isDev) {
    await window.loadFile(path.join(__dirname, '../dist/index.html'))
    return
  }

  const maxAttempts = 20

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await window.loadURL(devServerUrl)
      return
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error
      }

      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }
}

function registerIpcHandlers() {
  ipcMain.handle('auth:login', async (_event, credentials) => login(credentials))
  ipcMain.handle('categories:list', (_event, filters) => listCategories(filters))
  ipcMain.handle('categories:create', (_event, payload) => createCategory(payload))
  ipcMain.handle('categories:update', (_event, { id, data }) => updateCategory(id, data))
  ipcMain.handle('categories:delete', (_event, id) => deleteCategory(id))
  ipcMain.handle('items:list', (_event, filters) => listItems(filters))
  ipcMain.handle('items:get', (_event, id) => getItemById(id))
  ipcMain.handle('items:create', (_event, payload) => createItem(payload))
  ipcMain.handle('items:update', (_event, { id, data }) => updateItem(id, data))
  ipcMain.handle('items:delete', (_event, id) => deleteItem(id))
  ipcMain.handle('movements:list', (_event, filters) => listMovements(filters))
  ipcMain.handle('movements:create', (_event, payload) => createMovement(payload))
  ipcMain.handle('movements:update', (_event, { id, data }) => updateMovement(id, data))
  ipcMain.handle('movements:delete', (_event, id) => deleteMovement(id))
  ipcMain.handle('dashboard:low-stock', (_event, filters) => listLowStockItems(filters))
  ipcMain.handle('dashboard:most-used', (_event, filters) => listMostUsedItems(filters))
  ipcMain.handle('reports:list', (_event, filters) => listOperationLogs(filters))
  ipcMain.handle('reports:log-export', (_event, payload) => logReportExport(payload))
  ipcMain.handle('pdf:save', async (_event, payload) => savePdfDocument(payload))
}

async function savePdfDocument(payload = {}) {
  const html = typeof payload.html === 'string' ? payload.html : ''
  const suggestedName = typeof payload.fileName === 'string' && payload.fileName.trim()
    ? payload.fileName.trim()
    : `export-${new Date().toISOString().slice(0, 10)}.pdf`

  if (!html) {
    throw new Error('Contenu PDF manquant.')
  }

  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Enregistrer le PDF',
    defaultPath: path.join(app.getPath('documents'), suggestedName),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  })

  if (canceled || !filePath) {
    return { canceled: true }
  }

  const printWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: false,
    },
  })

  try {
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    const pdfBuffer = await printWindow.webContents.printToPDF({
      printBackground: true,
      landscape: payload.landscape !== false,
      pageSize: 'A4',
      margins: {
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
      },
      preferCSSPageSize: true,
    })

    await fs.writeFile(filePath, pdfBuffer)
    return { canceled: false, filePath }
  } finally {
    if (!printWindow.isDestroyed()) {
      printWindow.close()
    }
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  loadRenderer(win).catch((error) => {
    console.error('Failed to load renderer', error)
    win.destroy()
  })
}

app
  .whenReady()
  .then(async () => {
    await initializeDatabase(app.getPath('userData'))
    registerIpcHandlers()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })
  })
  .catch((error) => {
    console.error('Failed to initialize application', error)
    app.quit()
  })

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  closeDatabase()
})
