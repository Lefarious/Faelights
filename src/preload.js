const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("fl", {
  loadDb: () => ipcRenderer.invoke("db:load"),
  saveDb: db => ipcRenderer.invoke("db:save", db),
  pendingFiles: () => ipcRenderer.invoke("app:pending"),
  ready: () => ipcRenderer.send("app:ready"),
  getTheme: () => ipcRenderer.invoke("theme:get"),
  setTheme: t => ipcRenderer.invoke("theme:set", t),
  choosePdfs: () => ipcRenderer.invoke("pdf:choose"),
  importPdf: p => ipcRenderer.invoke("pdf:import", p),
  readPdf: doc => ipcRenderer.invoke("pdf:read", doc),
  statPdf: p => ipcRenderer.invoke("pdf:stat", p),
  openPdf: doc => ipcRenderer.invoke("pdf:open", doc),
  revealPdf: doc => ipcRenderer.invoke("pdf:reveal", doc),
  relinkPdf: doc => ipcRenderer.invoke("pdf:relink", doc),
  removeStored: p => ipcRenderer.invoke("pdf:removeStored", p),
  writeStored: (storedPath, bytes) => ipcRenderer.invoke("pdf:writeStored", { storedPath, bytes }),
  savePdfAs: (name, bytes) => ipcRenderer.invoke("pdf:saveAs", { name, bytes }),
  exportFile: (name, text) => ipcRenderer.invoke("export:file", { name, text }),
  exportFolder: (folderName, files, assets) => ipcRenderer.invoke("export:folder", { folderName, files, assets }),
  // one file + images in "<file base> images/"; dirToken marks that folder's name in text and asset paths
  exportBundle: (name, text, assets, opts = {}) => ipcRenderer.invoke("export:bundle", { name, text, assets, dirToken: opts.dirToken, encode: opts.encode }),
  openFolder: p => ipcRenderer.invoke("export:openFolder", p),
  copy: text => ipcRenderer.invoke("clip:write", text),
  popup: items => ipcRenderer.invoke("menu:popup", items),
  confirm: (message, detail, ok) => ipcRenderer.invoke("ask:confirm", { message, detail, ok }),
  pathFor: file => { try { return webUtils.getPathForFile(file); } catch (_) { return file.path || ""; } },
  onMenu: fn => ipcRenderer.on("menu", (_e, ch) => fn(ch)),
  onOpenFiles: fn => ipcRenderer.on("open-files", (_e, files) => fn(files)),
  onTheme: fn => ipcRenderer.on("theme", (_e, t) => fn(t)),
  // add from DOI / link: the only network access, always user-initiated
  parseId: text => ipcRenderer.invoke("id:parse", text),
  fetchPdf: text => ipcRenderer.invoke("pdf:fetch", text),
  cancelFetch: () => ipcRenderer.invoke("pdf:fetchCancel"),
  onFetchProgress: fn => ipcRenderer.on("fetch-progress", (_e, p) => fn(p)),
  openExternal: url => ipcRenderer.invoke("app:openExternal", url),
  readClipboardText: () => ipcRenderer.invoke("clip:read")
});
