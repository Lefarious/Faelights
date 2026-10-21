# Module: main-process
> Path: src/main.js, src/exportPaths.js · Last synced commit: 1167137 · Related features: F-001, F-003, F-004, F-005, F-007, F-008, F-011, F-014, F-016, F-018, F-019, F-020, F-023, F-025, F-027, F-028

## Purpose
This is the Electron main process. It owns the on-disk library (`faelights.json` plus copied PDFs, through core `Library.at(app.getPath("userData"))`), the splash and main windows, the theme, the native app menu, native dialogs, shell actions, the clipboard, and the only network access in the app: downloading a PDF when the user submits an identifier (DOI, arXiv ID, PMID, PMCID, ISBN, ADS Bibcode) or a link (`pdf:fetch`; a book's result also carries `edition`), and fetching a paper's details from CrossRef or arXiv when the user asks (`meta:lookup`). It does not parse PDFs or hold UI state. The renderer sends the whole DB object and this module persists it as-is. Resolving identifiers to PDFs and the CrossRef/arXiv lookup live in core `fetch.js`; this module supplies the Electron transport (`fetchUrl`) and progress events.

## Public interface
IPC handlers, called only through `preload.js`:
- `db:load` → DB object with transient `sourceMissing` / `stale` flags set on each doc (`stale` is always false for `annotated` docs)
- `db:save(db)` → `true` once the write is queued
- `app:pending` → drains `pendingOpen` paths
- `pdf:choose` → multi-select open dialog → `string[]`
- `pdf:import(srcPath)` → `store().importPdf(srcPath)`: copies into `files/`, returns `{id, hash, fileName, sourcePath, storedPath, mtime, size}`
- `pdf:fetch(text)` → parses with `identify.parseIdentifier`, resolves and downloads the PDF (core `resolver(fetchUrl, sendProgress).resolvePdf` → `pdfFrom` → `fetchUrl`), writes a temp `faelights-*.pdf`, runs `store().importPdf` on it, deletes the temp file. Returns `{ok:true, info (sourcePath:null, fileName from fileNameFor), origin:{kind,value,url}, title}` or `{ok:false, reason: invalid|paywalled|not-pdf|not-found|no-free-copy|network|too-large|offline|unreachable|cancelled, landingUrl}`. A new call aborts the previous one
- `pdf:fetchCancel` → aborts the in-flight fetch
- `meta:lookup({doi, arxiv, origin})` → strings capped at 300 chars → core `lookupMeta(fetchUrl, …)` (`lookupTarget` picks CrossRef `api.crossref.org/works/<doi>` / `fromCrossref`, or arXiv `export.arxiv.org/api/query?id_list=<id>` / `fromArxivAtom`) → `{ok:true, meta, source: crossref|arxiv, id}` or `{ok:false, reason: invalid|not-found|offline|network|paywalled}`. Own `AbortController` (20 s `META_MS` cap) and `quiet` fetches, so it neither cancels nor is cancelled by `pdf:fetch` and sends no `fetch-progress`
- `id:parse(text)` → `{kind, value, url, label}` or `null`
- `id:parseMany(text)` → `[{text, id: {kind, value, url, label} | null}]` (`identify.parseIdentifiers`, capped at 201: one past the dialog's `ADD_MAX` 200, so it can tell a list that was too long)
- `app:openExternal(url)` → `shell.openExternal` for http(s) only, else `false`
- `clip:read` → clipboard text (first 4096 chars)
- `pdf:read(doc)` → `{bytes: Uint8Array, mtime, from: "source"|"copy"}`; `doc.annotated` forces the stored copy
- `pdf:writeStored({storedPath, bytes})` → `true|false`: atomic tmp+rename write, serialised, only for paths inside the store's `files/` (core `writeStored`)
- `pdf:saveAs({name, bytes})` → save dialog (PDF filter), writes the bytes, returns the path or `null`
- `pdf:stat(path)` → `{mtime}|null` (exposed but not called by the renderer)
- `pdf:open(doc)` / `pdf:reveal(doc)`: `shell.openPath` / `showItemInFolder`, preferring the original file and falling back to the stored copy
- `pdf:relink(doc)` → chosen path or `null`
- `pdf:removeStored(storedPath)` → unlinks the file only if it is inside the store's `files/` (core `isStored()`)
- `export:file({name, text})`, `export:folder({folderName, files, assets?})` (assets = `[{path, bytes}]` under the library folder; every name checked by `exportPaths`), `export:bundle({name, text, assets, dirToken?, encode?})` → save dialog (md/txt/html filter), writes assets under `<file base> images/` (the `dirToken` in text and asset paths is replaced by that folder name, URL-encoded when `encode: "url"`), then the text file; returns the path or `null`. `export:openFolder(path)`
- `clip:write(text)`, `clip:image(pngBytes)` (`nativeImage.createFromBuffer` → `clipboard.writeImage`; `false` when the bytes aren't an image) id, `ask:confirm({message, detail, ok})` → boolean
- `theme:get` → `"system"|"light"|"dark"`; `theme:set(t)` → applies and returns the theme
- `app:ready` (one-way `ipcMain.on`) → `revealMain()`

Pushes to the renderer: `menu` (channel strings; File menu adds `add-id` on CmdOrCtrl+Shift+O; View menu adds `pane:side`, `pane:list`, `pane:rail`, `layout-reset`; Help menu (`role: help`) sends `tour` from Show Tour), `open-files` (path arrays), `theme`, and `fetch-progress` (`{stage: find|download|import}`).

## Dependencies
- **Uses:** electron (`app`, `BrowserWindow`, `ipcMain`, `dialog`, `shell`, `Menu`, `clipboard`, `nativeImage`, `nativeTheme`, `session`, `net`), node `fs`, `path`, `crypto`; core `library` (store), `identify` (`parseIdentifier`, `parseIdentifiers`, `describe`, `fileNameFor`, `fetchFailureReason`), `fetch` (`FetchFail`, `resolver`, `lookupMeta`, `statusFail`, limits); internal `./exportPaths`
- **Used by:** preload-bridge (all channels)
- **Loads:** `src/preload.js`, `renderer/index.html`, `renderer/splash.html`, `renderer/assets/brand/app-icon.ico` (window icon on Windows) or `app-icon.png` (other platforms)

## Data & state owned
- `app.getPath("userData")/library/faelights.json` is the single JSON DB `{version:1, libraries[], docs[], settings{mode,fmt,sort}}`, read and written by core `library.js` (atomic writes under `faelights.json.lock`, shared with the CLI)
- `…/library/files/<docId>.pdf` holds the copied PDFs; for annotated docs it holds the annotated bytes (`<docId>.pdf.tmp` during a write)
- `app.getPath("userData")/theme.json` holds `{theme}`. It sits outside `library/` and is read synchronously at startup.
- `…/faelights.json.<pid>-<hex>.tmp` is the atomic write temp file, and `…/faelights.json.broken-<ts>` is a backup of an unparseable DB (both from core `library.js`)
- Temp files `app.getPath("temp")/faelights-<random>.pdf` exist only during a `pdf:fetch`
- In-memory session partition `faelights-fetch` (no `persist:` prefix) holds publisher cookies for fetches, kept apart from the window's session
- In memory: `fetchCtl` (AbortController of the in-flight fetch), `fetchSes`, `resolvePdf` (bound once to `fetchUrl` + `sendProgress`), `win`, `splash`, `splashShownAt`, `pendingOpen[]`, and `nativeTheme.themeSource`; save and stored-PDF write queues live in the core store

## Files

### `src/main.js`
- **Role:** the entire main process
- **Exports:** none (CommonJS entry)
- **Key functions:** `store()` (= `Library.at(app.getPath("userData"))`), `DATA_DIR()`, `saveDb(db)` (store save, errors logged), `fetchUrl(url, accept, maxBytes, opts)` (the Electron transport for core `fetch.js`: `net.request` on the `faelights-fetch` session with `redirect: "manual"`, ≤10 hops each checked to be http(s), status → reason via `statusFail`, `FETCH_HEAD_MS` / `FETCH_STALL_MS` timers and `MAX_PDF` / `MAX_HTML` caps from core; `opts.signal` overrides the current download's `fetchCtl.signal`, `opts.quiet` suppresses progress), `header(res, k)`, `sendProgress()`, `resolvePdf` (from `resolver(fetchUrl, sendProgress)`), `writeAtomic(p, data)` (tmp + rename, for exports), `EXPORT_FILTERS`, `statOrNull(p)`, `createSplash()`, `revealMain()`, `createWindow()`, `themeBg()`, `loadTheme()`, `applyTheme(t)`, `pdfArgs(argv)`, `buildAppMenu()`, `THEME_PATH()`; constants `ICON`, `THEMES`, `SPLASH_MIN_MS`, `SPLASH_MAX_MS`, `META_MS`
- **Imports (internal):** `../core/library`, `../core/identify`, `../core/fetch`, `./exportPaths`; loads `preload.js` and `index.html` by path
- **Used by:** Electron runtime (`package.json` `"main"`); renderer through preload
- **Side effects:** reads and writes the files above; network requests only inside `pdf:fetch` and `meta:lookup` (export.arxiv.org, arxiv.org, doi.org and publisher hosts, api.crossref.org, pmc.ncbi.nlm.nih.gov, eutils.ncbi.nlm.nih.gov, ui.adsabs.harvard.edu, openlibrary.org, archive.org, pmc-oa-opendata.s3.amazonaws.com, europepmc.org); opens dialogs; `shell.openExternal` for http(s) links (in-window navigation away from `file:` is blocked); sets the application menu; takes the single-instance lock; writes the session marker `library/faelights.app` in `whenReady` (`store().openSession()`) and removes it on `will-quit` (`closeSession()`), which tells the MCP server not to write
- **Change impact:** renaming an IPC channel breaks `preload.js`. Changing the DB shape affects every `S.db` reader in `app.js` and existing user data, and there is no migration besides the `loadDb` repair. Changing menu `send("…")` strings breaks the `fl.onMenu` handler in `app.js`.

### `src/exportPaths.js`
- **Role:** pure path safety for exports (CommonJS, no electron)
- **Exports:** `MAX_ASSET_BYTES` (500 MB total), `pathProblem(rel)` (rejects absolute/UNC/drive paths, `..`/`.` segments, Windows-reserved characters and names, trailing dots/spaces), `resolveInside(dir, rel)`, `planAssets(dir, assets)` → `[{abs, bytes}]` (throws on any bad path, duplicate or size overflow), `mdSeg(name)`, `imagesDirFor(filePath)` (`<base> images`), `fillToken(text, token, value)`, `isToken(t)`
- **Used by:** `main.js` `export:bundle` / `export:folder`; `mcp/tools.js export_library` (`resolveInside`); `test/export.test.js`
- **Change impact:** loosening a check here lets renderer-supplied names write outside the chosen folder.

## Gotchas
- `saveDb` swallows errors (`console.error` only). The renderer always sees `true`. It writes the renderer's whole copy, so it overwrites changes the CLI made after the app loaded.
- `db:load` writes `sourceMissing` / `stale` onto docs, and these get persisted on the next `db:save`. They are recomputed at every load.
- `pdf:read` silently overwrites the stored copy when the original is more than 1 s newer than `scannedMtime`, unless the doc is `annotated` (then the original is ignored entirely).
- Nothing in main ever writes to a doc's `sourcePath`; `pdf:writeStored` refuses any path outside the store's `files/` (`isStored`).
- `pdf:removeStored` relies on core `isStored`, a string compare of `path.dirname(storedPath)` with the store's `files/`. A path stored with different casing or separators would not be deleted.
- On macOS, an `open-file` event before the window loads is queued in `pendingOpen`. After that it is sent straight away as `open-files`.
- `themeBg()` hard-codes the same hex values as the `--bg` tokens in `styles.css` and `splash.html`.
- The main window starts hidden and is shown only by `revealMain()`, on `app:ready` or the 8 s fallback timer. A renderer crash before `fl.ready()` therefore means an 8 s wait.
- `applyTheme()` rebuilds the whole application menu so the View → Theme radio items stay in sync.
- The theme is applied before `createSplash()`, so the splash already uses the saved choice.
- Nothing else in main touches the network; the app works offline except for `pdf:fetch` and `meta:lookup`. `meta:lookup` maps its own timeout (`cancelled`) to `network`; a CrossRef 404 becomes `not-found` via `fetchUrl`. `fetchUrl` errors pass `finalUrl` (the current hop) to `fetchFailureReason`, so a mistyped or dead host reports `unreachable` and a DNS failure on a service host `offline`.
- Fetch uses `net.request` rather than `net.fetch`, because the latter didn't expose the post-redirect URL needed to resolve relative `citation_pdf_url`s and to record `origin.url`.
- ISBN downloads can be a scan of a different edition: Open Library's `ia` list covers every edition of the work.
- PMC and europepmc.org answer non-browser clients with bot-check pages, so PMCIDs are fetched from the PMC Open Access bucket first (core `pmcPdf`); papers outside the open-access set end in `no-free-copy`.
- Bare 6–8 digit numbers parse as PMIDs (shorter ones need a `PMID:` prefix); 10/13-digit numbers with a valid ISBN checksum parse as ISBNs first.
