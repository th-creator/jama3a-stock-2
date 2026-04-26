const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  login(credentials) {
    return ipcRenderer.invoke('auth:login', credentials)
  },
  categories: {
    list(filters) {
      return ipcRenderer.invoke('categories:list', filters)
    },
    create(payload) {
      return ipcRenderer.invoke('categories:create', payload)
    },
    update(id, data) {
      return ipcRenderer.invoke('categories:update', { id, data })
    },
    delete(id) {
      return ipcRenderer.invoke('categories:delete', id)
    },
  },
  items: {
    list(filters) {
      return ipcRenderer.invoke('items:list', filters)
    },
    get(id) {
      return ipcRenderer.invoke('items:get', id)
    },
    create(payload) {
      return ipcRenderer.invoke('items:create', payload)
    },
    update(id, data) {
      return ipcRenderer.invoke('items:update', { id, data })
    },
    delete(id) {
      return ipcRenderer.invoke('items:delete', id)
    },
  },
  movements: {
    list(filters) {
      return ipcRenderer.invoke('movements:list', filters)
    },
    create(payload) {
      return ipcRenderer.invoke('movements:create', payload)
    },
    update(id, data) {
      return ipcRenderer.invoke('movements:update', { id, data })
    },
    delete(id) {
      return ipcRenderer.invoke('movements:delete', id)
    },
  },
  dashboard: {
    lowStock(filters) {
      return ipcRenderer.invoke('dashboard:low-stock', filters)
    },
    mostUsed(filters) {
      return ipcRenderer.invoke('dashboard:most-used', filters)
    },
  },
  reports: {
    list(filters) {
      return ipcRenderer.invoke('reports:list', filters)
    },
    logExport(payload) {
      return ipcRenderer.invoke('reports:log-export', payload)
    },
  },
  pdf: {
    save(payload) {
      return ipcRenderer.invoke('pdf:save', payload)
    },
  },
})
