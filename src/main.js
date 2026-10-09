// Faelights — main process
// Owns the library file on disk, file dialogs, native menus and file access.
const { app, BrowserWindow, ipcMain, dialog, shell, Menu, clipboard, nativeTheme } = require("electron");
const path = require("path");
const fs = require("fs");
const fsp = fs.promises;
const crypto = require("crypto");

const DATA_DIR = () => path.join(app.getPath("userData"), "library");
const DB_PATH = () => path.join(DATA_DIR(), "faelights.json");
const FILES_DIR = () => path.join(DATA_DIR(), "files");

let win = null;
let splash = null, splashShownAt = 0;
const ICON = path.join(__dirname, "..", "renderer", "assets", "brand", "app-icon.png");
const SPLASH_MIN_MS = 900;   // long enough to read, short enough not to get in the way
const SPLASH_MAX_MS = 8000;  // show the app even if the renderer never reports ready
let pendingOpen = []; // PDFs passed on the command line / "Open with"

/* ---------------- storage ---------------- */
const EMPTY_DB = () => ({
  version: 1,
  libraries: [{ id: "inbox", name: "Inbox", createdAt: Date.now(), system: true }],
  docs: [],
  settings: { mode: "full", fmt: "md", sort: "added" }
});

async function loadDb() {
  try {
    const raw = await fsp.readFile(DB_PATH(), "utf8");
    const db = JSON.parse(raw);
    if (!db.libraries?.some(l => l.id === "inbox")) db.libraries.unshift(EMPTY_DB().libraries[0]);
    db.settings = { ...EMPTY_DB().settings, ...(db.settings || {}) };
    db.docs = db.docs || [];
    return db;
  } catch (e) {
    if (e.code !== "ENOENT") {
      // keep a copy of an unreadable file instead of overwriting it
      try { await fsp.copyFile(DB_PATH(), DB_PATH() + ".broken-" + Date.now()); } catch (_) {}
    }
    return EMPTY_DB();
  }
}

let writeChain = Promise.resolve();
function saveDb(db) {
  writeChain = writeChain.then(async () => {
    await fsp.mkdir(DATA_DIR(), { recursive: true });
    const tmp = DB_PATH() + ".tmp";
    await fsp.writeFile(tmp, JSON.stringify(db), "utf8");
    await fsp.rename(tmp, DB_PATH());
  }).catch(err => console.error("save failed", err));
  return writeChain;
}

async function statOrNull(p) { try { return await fsp.stat(p); } catch (_) { return null; } }

/* ---------------- window ---------------- */
const themeBg = () => nativeTheme.shouldUseDarkColors ? "#14121B" : "#F2F0F6";

/* ---------------- theme ---------------- */
// "system" follows the OS; "light"/"dark" force prefers-color-scheme in every window.
// Kept in its own small file so it can be applied before the splash appears.
const THEMES = ["system", "light", "dark"];
const THEME_PATH = () => path.join(app.getPath("userData"), "theme.json");
function loadTheme() {
  try { const t = JSON.parse(fs.readFileSync(THEME_PATH(), "utf8")).theme; if (THEMES.includes(t)) return t; } catch (_) {}
  return "system";
}
function applyTheme(t) {
  nativeTheme.themeSource = t;
  for (const w of BrowserWindow.getAllWindows()) w.setBackgroundColor(themeBg());
  fsp.writeFile(THEME_PATH(), JSON.stringify({ theme: t }), "utf8").catch(err => console.error("theme save failed", err));
  if (win && !win.isDestroyed()) win.webContents.send("theme", t);
  buildAppMenu(); // keep the View → Theme radio items in sync
}

function createSplash() {
  splash = new BrowserWindow({
    width: 440, height: 280, frame: false, resizable: false, maximizable: false, minimizable: false, fullscreenable: false,
    center: true, show: false, title: "Faelights", icon: ICON, backgroundColor: themeBg(),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  splash.once("ready-to-show", () => { if (splash) { splash.show(); splashShownAt = Date.now(); } });
  splash.on("closed", () => { splash = null; });
  splash.loadFile(path.join(__dirname, "..", "renderer", "splash.html"));
}

// Swap the splash for the main window once the renderer has loaded the library
function revealMain() {
  if (!win || win.isDestroyed() || win.isVisible()) return;
  const wait = splash && splashShownAt ? Math.max(0, SPLASH_MIN_MS - (Date.now() - splashShownAt)) : 0;
  setTimeout(() => {
    if (!win || win.isDestroyed()) return;
    win.show(); win.focus();
    if (splash) splash.destroy();
  }, wait);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1360, height: 860, minWidth: 900, minHeight: 560,
    title: "Faelights",
    backgroundColor: themeBg(),
    icon: ICON,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });
  setTimeout(revealMain, SPLASH_MAX_MS);
  win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  // external links open in the system browser
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith("file:")) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
}

function pdfArgs(argv) { return argv.filter(a => /\.pdf$/i.test(a) && fs.existsSync(a)).map(a => path.resolve(a)); }

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
else {
  app.on("second-instance", (_e, argv) => {
    const files = pdfArgs(argv);
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); if (files.length) win.webContents.send("open-files", files); }
  });
  app.on("open-file", (e, p) => { // macOS "Open with"
    e.preventDefault();
    if (win && win.webContents && !win.webContents.isLoading()) win.webContents.send("open-files", [p]);
    else pendingOpen.push(p);
  });
  app.whenReady().then(() => {
    pendingOpen.push(...pdfArgs(process.argv.slice(1)));
    nativeTheme.themeSource = loadTheme();
    buildAppMenu();
    createSplash();
    createWindow();
    app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
  app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
}

function buildAppMenu() {
  const send = ch => () => win && win.webContents.send("menu", ch);
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac ? [{ role: "appMenu" }] : []),
    { label: "File", submenu: [
      { label: "Add PDFs…", accelerator: "CmdOrCtrl+O", click: send("add") },
      { label: "New Library", accelerator: "CmdOrCtrl+Shift+N", click: send("new-library") },
      { type: "separator" },
      { label: "Export Current PDF…", accelerator: "CmdOrCtrl+E", click: send("export-doc") },
      { label: "Export Library to Folder…", accelerator: "CmdOrCtrl+Shift+E", click: send("export-library") },
      { type: "separator" },
      { label: "Rescan All PDFs", click: send("rescan-all") },
      { label: "Show Library Folder", click: () => shell.openPath(DATA_DIR()) },
      { type: "separator" },
      isMac ? { role: "close" } : { role: "quit" }
    ] },
    { role: "editMenu" },
    { label: "View", submenu: [
      { label: "Search All Highlights", accelerator: "CmdOrCtrl+F", click: send("search") },
      { label: "Toggle Full Sentence / Highlights Only", accelerator: "CmdOrCtrl+T", click: send("toggle-mode") },
      { label: "Theme", submenu: THEMES.map(t => ({ label: t[0].toUpperCase() + t.slice(1), type: "radio", checked: nativeTheme.themeSource === t, click: () => applyTheme(t) })) },
      { type: "separator" },
      { role: "reload" }, { role: "toggleDevTools" }, { type: "separator" },
      { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { type: "separator" }, { role: "togglefullscreen" }
    ] },
    { role: "windowMenu" }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ---------------- IPC ---------------- */
ipcMain.handle("db:load", async () => {
  const db = await loadDb();
  // flag docs whose source PDF changed or went missing since the last scan
  await Promise.all(db.docs.map(async d => {
    const st = d.sourcePath ? await statOrNull(d.sourcePath) : null;
    d.sourceMissing = !!d.sourcePath && !st;
    d.stale = !!st && st.mtimeMs > (d.scannedMtime || 0) + 1000;
  }));
  return db;
});
ipcMain.handle("db:save", async (_e, db) => { await saveDb(db); return true; });
ipcMain.on("app:ready", revealMain);
ipcMain.handle("theme:get", () => nativeTheme.themeSource);
ipcMain.handle("theme:set", (_e, t) => { if (THEMES.includes(t)) applyTheme(t); return nativeTheme.themeSource; });
ipcMain.handle("app:pending", () => { const p = pendingOpen; pendingOpen = []; return p; });

ipcMain.handle("pdf:choose", async () => {
  const r = await dialog.showOpenDialog(win, { title: "Add PDFs", properties: ["openFile", "multiSelections"], filters: [{ name: "PDF", extensions: ["pdf"] }] });
  return r.canceled ? [] : r.filePaths;
});

// Copy a PDF into the library folder and return info about it
ipcMain.handle("pdf:import", async (_e, srcPath) => {
  const st = await fsp.stat(srcPath);
  const buf = await fsp.readFile(srcPath);
  const hash = crypto.createHash("sha1").update(buf).digest("hex");
  const id = "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  await fsp.mkdir(FILES_DIR(), { recursive: true });
  const stored = path.join(FILES_DIR(), id + ".pdf");
  await fsp.writeFile(stored, buf);
  return { id, hash, fileName: path.basename(srcPath), sourcePath: srcPath, storedPath: stored, mtime: st.mtimeMs, size: st.size };
});

// Read the freshest copy: the original if it still exists, otherwise the stored copy.
// When the original is newer, refresh the stored copy too.
ipcMain.handle("pdf:read", async (_e, doc) => {
  const src = doc.sourcePath ? await statOrNull(doc.sourcePath) : null;
  if (src) {
    const buf = await fsp.readFile(doc.sourcePath);
    if (src.mtimeMs > (doc.scannedMtime || 0) + 1000 && doc.storedPath) { try { await fsp.writeFile(doc.storedPath, buf); } catch (_) {} }
    return { bytes: new Uint8Array(buf), mtime: src.mtimeMs, from: "source" };
  }
  const buf = await fsp.readFile(doc.storedPath);
  return { bytes: new Uint8Array(buf), mtime: doc.scannedMtime || 0, from: "copy" };
});

ipcMain.handle("pdf:stat", async (_e, p) => { const st = await statOrNull(p); return st ? { mtime: st.mtimeMs } : null; });
ipcMain.handle("pdf:open", async (_e, doc) => {
  const p = doc.sourcePath && fs.existsSync(doc.sourcePath) ? doc.sourcePath : doc.storedPath;
  const err = await shell.openPath(p); return err || true;
});
ipcMain.handle("pdf:reveal", async (_e, doc) => {
  const p = doc.sourcePath && fs.existsSync(doc.sourcePath) ? doc.sourcePath : doc.storedPath;
  shell.showItemInFolder(p); return true;
});
ipcMain.handle("pdf:relink", async (_e, doc) => {
  const r = await dialog.showOpenDialog(win, { title: `Find “${doc.fileName}”`, properties: ["openFile"], filters: [{ name: "PDF", extensions: ["pdf"] }] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle("pdf:removeStored", async (_e, storedPath) => {
  if (storedPath && path.dirname(storedPath) === FILES_DIR()) { try { await fsp.unlink(storedPath); } catch (_) {} }
  return true;
});

ipcMain.handle("export:file", async (_e, { name, text }) => {
  const r = await dialog.showSaveDialog(win, { title: "Export highlights", defaultPath: name, filters: [{ name: "Markdown", extensions: ["md"] }, { name: "Text", extensions: ["txt"] }] });
  if (r.canceled || !r.filePath) return null;
  await fsp.writeFile(r.filePath, text, "utf8"); return r.filePath;
});
ipcMain.handle("export:folder", async (_e, { folderName, files }) => {
  const r = await dialog.showOpenDialog(win, { title: "Choose where to export (e.g. your Obsidian vault)", properties: ["openDirectory", "createDirectory"] });
  if (r.canceled || !r.filePaths[0]) return null;
  const dir = path.join(r.filePaths[0], folderName);
  await fsp.mkdir(dir, { recursive: true });
  for (const f of files) await fsp.writeFile(path.join(dir, f.name), f.text, "utf8");
  return dir;
});
ipcMain.handle("export:openFolder", async (_e, p) => { shell.openPath(p); return true; });

ipcMain.handle("clip:write", (_e, text) => { clipboard.writeText(text); return true; });

// Native context menu: renderer sends items, gets back the chosen id
ipcMain.handle("menu:popup", (_e, items) => new Promise(resolve => {
  let chosen = null;
  const build = list => list.map(it => it.type === "separator" ? { type: "separator" } : ({
    label: it.label, enabled: it.enabled !== false, type: it.checked !== undefined ? "checkbox" : "normal", checked: !!it.checked,
    submenu: it.submenu ? build(it.submenu) : undefined,
    click: it.submenu ? undefined : () => { chosen = it.id; }
  }));
  const menu = Menu.buildFromTemplate(build(items));
  menu.popup({ window: win, callback: () => setTimeout(() => resolve(chosen), 0) });
}));

ipcMain.handle("ask:confirm", async (_e, { message, detail, ok }) => {
  const r = await dialog.showMessageBox(win, { type: "question", buttons: [ok || "OK", "Cancel"], defaultId: 0, cancelId: 1, message, detail });
  return r.response === 0;
});
