// Faelights — main process
// Owns the library file on disk, file dialogs, native menus and file access.
const { app, BrowserWindow, ipcMain, dialog, shell, Menu, clipboard, nativeTheme, session, net } = require("electron");
const path = require("path");
const fs = require("fs");
const fsp = fs.promises;
const crypto = require("crypto");
const { parseIdentifier, parseIdentifiers, describe, findPdfLink, isPdf, fileNameFor, fetchFailureReason } = require("./identify");

const DATA_DIR = () => path.join(app.getPath("userData"), "library");
const DB_PATH = () => path.join(DATA_DIR(), "faelights.json");
const FILES_DIR = () => path.join(DATA_DIR(), "files");

let win = null;
let splash = null, splashShownAt = 0;
const ICON = path.join(__dirname, "..", "renderer", "assets", "brand", "app-icon.png");
const SPLASH_MIN_MS = 2300;  // lets the splash animation write in the full wordmark (~2.2 s)
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
      { label: "Add by Identifier…", accelerator: "CmdOrCtrl+Shift+O", click: send("add-id") },
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
      { type: "separator" },
      { label: "Show / Hide Sidebar", accelerator: "CmdOrCtrl+B", click: send("pane:side") },
      { label: "Show / Hide PDF List", accelerator: "CmdOrCtrl+Shift+B", click: send("pane:list") },
      { label: "Show / Hide Topics", accelerator: "CmdOrCtrl+Alt+B", click: send("pane:rail") },
      { label: "Reset Column Widths", click: send("layout-reset") },
      { type: "separator" },
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
    // annotated docs live on in the library copy, so edits to the original no longer apply
    d.stale = !d.annotated && !!st && st.mtimeMs > (d.scannedMtime || 0) + 1000;
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
async function importPdf(srcPath) {
  const st = await fsp.stat(srcPath);
  const buf = await fsp.readFile(srcPath);
  const hash = crypto.createHash("sha1").update(buf).digest("hex");
  const id = "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  await fsp.mkdir(FILES_DIR(), { recursive: true });
  const stored = path.join(FILES_DIR(), id + ".pdf");
  await fsp.writeFile(stored, buf);
  return { id, hash, fileName: path.basename(srcPath), sourcePath: srcPath, storedPath: stored, mtime: st.mtimeMs, size: st.size };
}
ipcMain.handle("pdf:import", (_e, srcPath) => importPdf(srcPath));

/* ---------------- add from DOI / link ---------------- */
// The only code that touches the network, and only when the user asks for a paper (no background calls).
// Requests go through an in-memory session so publisher cookies never mix with the app's own session; it still uses the system proxy.
const FETCH_HEAD_MS = 15000, FETCH_STALL_MS = 30000, MAX_PDF = 150 * 1024 * 1024, MAX_HTML = 5 * 1024 * 1024;
let fetchSes = null, fetchCtl = null;
class FetchFail extends Error { constructor(reason) { super(reason); this.reason = reason; } }
const sendProgress = p => { if (win && !win.isDestroyed()) win.webContents.send("fetch-progress", p); };

// GET one http(s) URL, streaming the body with a size cap and a no-progress timeout.
// net.request (Chromium's stack: system proxy, session cookies) with manual redirects, so every hop is checked
// to be http(s) and the final URL is known (session.fetch leaves Response.url empty).
const header = (res, k) => { const v = res.headers[k]; return String((Array.isArray(v) ? v[0] : v) || ""); };
function fetchUrl(url, accept, maxBytes) {
  return new Promise((resolve, reject) => {
    if (!/^https?:\/\//i.test(url)) return reject(new FetchFail("invalid"));
    fetchSes = fetchSes || session.fromPartition("faelights-fetch");
    const outer = fetchCtl.signal;
    let finalUrl = url, hops = 0, settled = false, timer = null;
    const req = net.request({ url, session: fetchSes, useSessionCookies: true, redirect: "manual" });
    req.setHeader("User-Agent", `Faelights/${app.getVersion()} (desktop PDF highlights app)`);
    req.setHeader("Accept", accept);
    const done = (err, val) => {
      if (settled) return; settled = true;
      clearTimeout(timer); outer.removeEventListener("abort", onAbort);
      if (err) { try { req.abort(); } catch (_) {} reject(err); } else resolve(val);
    };
    const arm = ms => { clearTimeout(timer); timer = setTimeout(() => done(new FetchFail("network")), ms); };
    const onAbort = () => done(new FetchFail("cancelled"));
    if (outer.aborted) return onAbort();
    outer.addEventListener("abort", onAbort);
    arm(FETCH_HEAD_MS);
    req.on("redirect", (_status, _method, next) => {
      if (++hops > 10 || !/^https?:\/\//i.test(next)) return done(new FetchFail(hops > 10 ? "network" : "not-pdf"));
      finalUrl = next; req.followRedirect();
    });
    req.on("error", e => done(new FetchFail(fetchFailureReason(e))));
    req.on("response", res => {
      const status = res.statusCode, type = header(res, "content-type").toLowerCase(), len = +header(res, "content-length") || 0;
      const html = /html|xml/.test(type), cap = html ? MAX_HTML : maxBytes;
      if (status === 404 || status === 410) return done(new FetchFail("not-found"));
      if ([401, 402, 403, 451].includes(status)) return done(new FetchFail("paywalled"));
      if (status < 200 || status > 299) return done(new FetchFail("network"));
      if (len > cap) return done(new FetchFail(html ? "not-pdf" : "too-large"));
      const chunks = []; let got = 0;
      arm(FETCH_STALL_MS);
      res.on("data", c => {
        if (settled) return;
        arm(FETCH_STALL_MS); got += c.length; chunks.push(c);
        if (got > cap) return done(new FetchFail(html ? "not-pdf" : "too-large"));
        if (!html && got > 65536) sendProgress({ stage: "download", got, total: len });
      });
      res.on("end", () => done(null, { url: finalUrl, type, html, buf: Buffer.concat(chunks) }));
      res.on("error", e => done(new FetchFail(fetchFailureReason(e))));
    });
    req.end();
  });
}

const ACCEPT_ANY = "application/pdf,text/html;q=0.9,*/*;q=0.8";
// Fetch a URL; if it is a landing page, follow its citation_pdf_url (or a meta refresh) once
async function pdfFrom(url, hops = 2) {
  const r = await fetchUrl(url, ACCEPT_ANY, MAX_PDF);
  if (isPdf(r.buf)) return r;
  if (!r.html || !hops) throw new FetchFail(r.html ? "paywalled" : "not-pdf");  // a PDF link that serves a page is usually a login wall
  const { pdf, refresh, title } = findPdfLink(r.buf.toString("utf8"), r.url);
  if (pdf) { sendProgress({ stage: "download" }); return { ...(await pdfFrom(pdf, 0)), title }; }
  if (refresh && refresh !== r.url) return pdfFrom(refresh, hops - 1);
  throw new FetchFail("not-pdf");
}

const hardFail = e => e.reason === "cancelled" || e.reason === "offline";   // stop trying alternatives
async function fetchJson(url) {
  const r = await fetchUrl(url, "application/json", MAX_HTML);
  try { return JSON.parse(r.buf.toString("utf8")) || {}; } catch (_) { throw new FetchFail("network"); }
}

async function resolvePdf(id) {
  sendProgress({ stage: "find" });
  const ax = id.kind === "doi" && /^10\.48550\/arxiv\.(.+)$/i.exec(id.value);  // arXiv's own DOIs
  if (id.kind === "arxiv" || ax) {   // the abs page gives the title too; fall back to the PDF URL if it has no citation link
    const aid = ax ? ax[1] : id.value;
    try { return await pdfFrom("https://arxiv.org/abs/" + aid, 1); }
    catch (err) { if (err.reason !== "not-pdf") throw err; return pdfFrom("https://arxiv.org/pdf/" + aid, 0); }
  }
  if (id.kind === "pmid") {   // PubMed itself has no PDFs: NCBI's ID converter maps to a PMC copy or a DOI
    const rec = (await fetchJson(`https://pmc.ncbi.nlm.nih.gov/tools/idconv/api/v1/articles/?ids=${id.value}&format=json&tool=faelights`)).records?.[0] || {};
    const pmc = rec.pmcid && parseIdentifier(rec.pmcid), viaDoi = rec.doi && parseIdentifier("doi:" + rec.doi);
    if (pmc && pmc.kind === "pmcid") {
      try { return await resolvePdf(pmc); } catch (e) { if (!viaDoi || hardFail(e)) throw e; }
    }
    if (viaDoi && viaDoi.kind === "doi") return resolvePdf(viaDoi);
    throw new FetchFail("no-free-copy");
  }
  if (id.kind === "ads") {
    const ax = /^\d{4}arXiv(\d{4})\.?(\d{4,5})[A-Z.]$/.exec(id.value);   // e.g. 2020arXiv200112345A → 2001.12345
    if (ax) return resolvePdf({ kind: "arxiv", value: ax[1] + "." + ax[2] });
    // ADS's link gateway redirects to the e-print, the publisher's PDF or ADS's own scan; no API token needed
    let big = null;
    for (const t of ["EPRINT_PDF", "PUB_PDF", "ADS_PDF"]) {
      try { return await pdfFrom(`https://ui.adsabs.harvard.edu/link_gateway/${encodeURIComponent(id.value)}/${t}`, 1); }
      catch (e) { if (hardFail(e)) throw e; if (e.reason === "too-large") big = e; }
    }
    throw big || new FetchFail("paywalled");
  }
  if (id.kind === "isbn") {   // only public-domain scans on Open Library / Internet Archive are free to download
    const docs = (await fetchJson(`https://openlibrary.org/search.json?isbn=${id.value}&fields=key,title,ia,ebook_access`)).docs || [];
    const book = docs.find(d => d.ebook_access === "public" && Array.isArray(d.ia) && d.ia.length);
    // a work lists every scan, some lending-only: try a few until one serves its PDF
    for (const ia of (book ? book.ia : []).filter(x => /^[\w.-]+$/.test(x)).slice(0, 5)) {
      try {
        sendProgress({ stage: "download" });
        const r = await fetchUrl(`https://archive.org/download/${ia}/${ia}.pdf`, "application/pdf", MAX_PDF);
        if (isPdf(r.buf)) return { ...r, title: typeof book.title === "string" ? book.title.slice(0, 500) : null };
      } catch (e) { if (hardFail(e) || e.reason === "too-large") throw e; }
    }
    throw new FetchFail("no-free-copy");
  }
  if (id.kind !== "doi") return pdfFrom(id.url);
  try { return await pdfFrom("https://doi.org/" + id.value.split("/").map(encodeURIComponent).join("/").replace(/%2F/g, "/")); }
  catch (err) {
    if (!["paywalled", "not-pdf"].includes(err.reason)) throw err;
    // CrossRef sometimes lists a full-text PDF link the landing page doesn't expose
    try {
      const cr = await fetchUrl("https://api.crossref.org/works/" + encodeURIComponent(id.value), "application/json", MAX_HTML);
      const links = (JSON.parse(cr.buf.toString("utf8")).message?.link || []).filter(l => /application\/pdf/i.test(l["content-type"] || "") && /^https?:/i.test(l.URL || ""));
      for (const l of links) { try { return await pdfFrom(l.URL, 0); } catch (e) { if (e.reason === "cancelled" || e.reason === "offline") throw e; } }
    } catch (e) { if (e.reason === "cancelled" || e.reason === "offline") throw e; }
    // a publisher page with no reachable PDF is access-controlled (or bot-walled) far more often than PDF-less
    throw new FetchFail("paywalled");
  }
}

ipcMain.handle("pdf:fetch", async (_e, text) => {
  const id = parseIdentifier(text);
  if (!id) return { ok: false, reason: "invalid" };
  if (fetchCtl) fetchCtl.abort();
  const ctl = fetchCtl = new AbortController();
  let tmp = null;
  try {
    const r = await resolvePdf(id);
    sendProgress({ stage: "import" });
    tmp = path.join(app.getPath("temp"), `faelights-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}.pdf`);
    await fsp.writeFile(tmp, r.buf);
    const info = await importPdf(tmp);
    // no original on disk to track, like the sample PDF
    Object.assign(info, { sourcePath: null, fileName: fileNameFor(id, r.url) });
    return { ok: true, info, origin: { kind: id.kind, value: id.value, url: r.url }, title: r.title || null };
  } catch (err) {
    if (!(err instanceof FetchFail)) console.error("fetch failed", err);
    return { ok: false, reason: err instanceof FetchFail ? err.reason : "network", landingUrl: id.url };
  } finally {
    if (tmp) fsp.unlink(tmp).catch(() => {});
    if (fetchCtl === ctl) fetchCtl = null;
  }
});
ipcMain.handle("pdf:fetchCancel", () => { if (fetchCtl) fetchCtl.abort(); return true; });
ipcMain.handle("id:parse", (_e, text) => { const id = parseIdentifier(text); return id && { ...id, label: describe(id) }; });
ipcMain.handle("id:parseMany", (_e, text) => parseIdentifiers(text).slice(0, 200).map(({ text, id }) => ({ text, id: id && { ...id, label: describe(id) } })));
ipcMain.handle("app:openExternal", (_e, url) => {
  let u; try { u = new URL(String(url)); } catch (_) { return false; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  shell.openExternal(u.href); return true;
});
ipcMain.handle("clip:read", () => clipboard.readText().slice(0, 4096));

// Read the freshest copy: the original if it still exists, otherwise the stored copy.
// When the original is newer, refresh the stored copy too. Docs annotated in the app always read the stored copy.
ipcMain.handle("pdf:read", async (_e, doc) => {
  const src = doc.sourcePath && !doc.annotated ? await statOrNull(doc.sourcePath) : null;
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
const isStored = p => !!p && path.dirname(p) === FILES_DIR();
// Annotated bytes only ever replace the library's copy, never the user's original
let pdfWrites = Promise.resolve();
ipcMain.handle("pdf:writeStored", (_e, { storedPath, bytes }) => {
  if (!isStored(storedPath) || !(bytes instanceof Uint8Array)) return false;
  const job = pdfWrites.then(async () => {
    const tmp = storedPath + ".tmp";
    await fsp.writeFile(tmp, bytes);
    await fsp.rename(tmp, storedPath);
    return true;
  });
  pdfWrites = job.catch(err => { console.error("pdf write failed", err); return false; });
  return pdfWrites;
});
ipcMain.handle("pdf:saveAs", async (_e, { name, bytes }) => {
  const r = await dialog.showSaveDialog(win, { title: "Save PDF", defaultPath: name, filters: [{ name: "PDF", extensions: ["pdf"] }] });
  if (r.canceled || !r.filePath) return null;
  await fsp.writeFile(r.filePath, bytes); return r.filePath;
});
ipcMain.handle("pdf:removeStored", async (_e, storedPath) => {
  if (isStored(storedPath)) { try { await fsp.unlink(storedPath); } catch (_) {} }
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
