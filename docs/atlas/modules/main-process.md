# Module: main-process
> Path: src/main.js, src/identify.js · Last synced commit: c5c0dbe · Related features: F-001, F-003, F-004, F-005, F-007, F-008, F-011

## Purpose
This is the Electron main process. It owns the on-disk library (`faelights.json` plus copied PDFs), the splash and main windows, the theme, the native app menu, native dialogs, context-menu popups, shell actions, the clipboard, and the only network access in the app: downloading a PDF when the user submits a DOI, arXiv ID or link (`pdf:fetch`). It does not parse PDFs or hold UI state. The renderer sends the whole DB object and this module persists it as-is.

## Public interface
IPC handlers, called only through `preload.js`:
- `db:load` → DB object with transient `sourceMissing` / `stale` flags set on each doc (`stale` is always false for `annotated` docs)
- `db:save(db)` → `true` once the write is queued
- `app:pending` → drains `pendingOpen` paths
- `pdf:choose` → multi-select open dialog → `string[]`
- `pdf:import(srcPath)` → `importPdf(srcPath)`: copies into `files/`, returns `{id, hash, fileName, sourcePath, storedPath, mtime, size}`
- `pdf:fetch(text)` → parses with `identify.parseIdentifier`, resolves and downloads the PDF (`resolvePdf` → `pdfFrom` → `fetchUrl`), writes a temp `faelights-*.pdf`, runs `importPdf` on it, deletes the temp file. Returns `{ok:true, info (sourcePath:null, fileName from fileNameFor), origin:{kind,value,url}, title}` or `{ok:false, reason: invalid|paywalled|not-pdf|not-found|network|too-large|offline|cancelled, landingUrl}`. A new call aborts the previous one
- `pdf:fetchCancel` → aborts the in-flight fetch
- `id:parse(text)` → `{kind, value, url, label}` or `null`
- `app:openExternal(url)` → `shell.openExternal` for http(s) only, else `false`
- `clip:read` → clipboard text (first 4096 chars)
- `pdf:read(doc)` → `{bytes: Uint8Array, mtime, from: "source"|"copy"}`; `doc.annotated` forces the stored copy
- `pdf:writeStored({storedPath, bytes})` → `true|false`: atomic tmp+rename write, serialised, only for paths inside `FILES_DIR`
- `pdf:saveAs({name, bytes})` → save dialog (PDF filter), writes the bytes, returns the path or `null`
- `pdf:stat(path)` → `{mtime}|null` (exposed but not called by the renderer)
- `pdf:open(doc)` / `pdf:reveal(doc)`: `shell.openPath` / `showItemInFolder`, preferring the original file and falling back to the stored copy
- `pdf:relink(doc)` → chosen path or `null`
- `pdf:removeStored(storedPath)` → unlinks the file only if it is inside `FILES_DIR` (`isStored()`)
- `export:file({name, text})`, `export:folder({folderName, files})`, `export:openFolder(path)`
- `clip:write(text)`, `menu:popup(items)` → chosen item id, `ask:confirm({message, detail, ok})` → boolean
- `theme:get` → `"system"|"light"|"dark"`; `theme:set(t)` → applies and returns the theme
- `app:ready` (one-way `ipcMain.on`) → `revealMain()`

Pushes to the renderer: `menu` (channel strings; File menu adds `add-id` on CmdOrCtrl+Shift+O; View menu adds `pane:side`, `pane:list`, `pane:rail`, `layout-reset`), `open-files` (path arrays), `theme`, and `fetch-progress` (`{stage: find|download|import}`).

## Dependencies
- **Uses:** electron (`app`, `BrowserWindow`, `ipcMain`, `dialog`, `shell`, `Menu`, `clipboard`, `nativeTheme`, `session`, `net`), node `fs`, `path`, `crypto`; internal `./identify`
- **Used by:** preload-bridge (all channels)
- **Loads:** `src/preload.js`, `renderer/index.html`, `renderer/splash.html`, `renderer/assets/brand/app-icon.png` (window icon)

## Data & state owned
- `app.getPath("userData")/library/faelights.json` is the single JSON DB `{version:1, libraries[], docs[], settings{mode,fmt,sort}}`
- `…/library/files/<docId>.pdf` holds the copied PDFs; for annotated docs it holds the annotated bytes (`<docId>.pdf.tmp` during a write)
- `app.getPath("userData")/theme.json` holds `{theme}`. It sits outside `library/` and is read synchronously at startup.
- `…/faelights.json.tmp` is the atomic write temp file, and `…/faelights.json.broken-<ts>` is a backup of an unparseable DB
- Temp files `app.getPath("temp")/faelights-<random>.pdf` exist only during a `pdf:fetch`
- In-memory session partition `faelights-fetch` (no `persist:` prefix) holds publisher cookies for fetches, kept apart from the window's session
- In memory: `fetchCtl` (AbortController of the in-flight fetch), `fetchSes`, `win`, `splash`, `splashShownAt`, `pendingOpen[]`, `writeChain` (a serialised promise chain of saves), `pdfWrites` (serialised stored-PDF writes), and `nativeTheme.themeSource`

## Files

### `src/main.js`
- **Role:** the entire main process
- **Exports:** none (CommonJS entry)
- **Key functions:** `importPdf(srcPath)`, `fetchUrl(url, accept, maxBytes)` (`net.request` with `redirect: "manual"`, ≤10 hops, each checked to be http(s); `FETCH_HEAD_MS` 15 s, `FETCH_STALL_MS` 30 s, `MAX_PDF` 150 MB, `MAX_HTML` 5 MB), `pdfFrom(url, hops)`, `resolvePdf(id)` (arXiv → `arxiv.org/abs` then `/pdf`; DOI → `doi.org` landing page → `citation_pdf_url`, then CrossRef `api.crossref.org/works/<doi>` `link[]` PDF entries; URL → as given), `FetchFail`, `sendProgress()`, `loadDb()`, `saveDb(db)`, `statOrNull(p)`, `isStored(p)`, `createSplash()`, `revealMain()`, `createWindow()`, `themeBg()`, `loadTheme()`, `applyTheme(t)`, `pdfArgs(argv)`, `buildAppMenu()`, `EMPTY_DB()`, path helpers `DATA_DIR()`, `DB_PATH()`, `FILES_DIR()`, `THEME_PATH()`; constants `ICON`, `THEMES`, `SPLASH_MIN_MS`, `SPLASH_MAX_MS`
- **Imports (internal):** `./identify` (`parseIdentifier`, `describe`, `findPdfLink`, `isPdf`, `fileNameFor`, `fetchFailureReason`); loads `preload.js` and `index.html` by path
- **Used by:** Electron runtime (`package.json` `"main"`); renderer through preload
- **Side effects:** reads and writes the files above; network requests only inside `pdf:fetch` (arxiv.org, doi.org and publisher hosts, api.crossref.org); opens dialogs; `shell.openExternal` for http(s) links (in-window navigation away from `file:` is blocked); sets the application menu; takes the single-instance lock
- **Change impact:** renaming an IPC channel breaks `preload.js`. Changing the DB shape affects every `S.db` reader in `app.js` and existing user data, and there is no migration besides the `loadDb` repair. Changing menu `send("…")` strings breaks the `fl.onMenu` handler in `app.js`.

### `src/identify.js`
- **Role:** pure helpers for add-by-identifier (no electron imports; CommonJS)
- **Exports:** `parseIdentifier(text)` → `{kind: doi|arxiv|pmcid|url, value, url}` or `null` (accepts bare, `doi:` and doi.org DOIs, new and old arXiv ids, `arXiv:` prefix, arxiv.org abs/pdf links, `PMC…` ids, other http(s) URLs; rejects other schemes, hosts without a dot, URLs with credentials); `describe(id)` (hint label); `findPdfLink(html, baseUrl)` → `{pdf, refresh, title}` from `citation_pdf_url` / meta refresh / `citation_title`; `isPdf(buf)` (`%PDF-` magic); `fileNameFor(id, pdfUrl)`; `fetchFailureReason(err)` → `offline` for DNS/connection error codes (`OFFLINE_CODES`), else `network`
- **Used by:** `main.js`; `test/identify.test.js`
- **Change impact:** `parseIdentifier` decides what the renderer's hint, paste and link-drop handlers accept (through `id:parse`).

## Gotchas
- `saveDb` swallows errors (`console.error` only). The renderer always sees `true`.
- `db:load` writes `sourceMissing` / `stale` onto docs, and these get persisted on the next `db:save`. They are recomputed at every load.
- `pdf:read` silently overwrites the stored copy when the original is more than 1 s newer than `scannedMtime`, unless the doc is `annotated` (then the original is ignored entirely).
- Nothing in main ever writes to a doc's `sourcePath`; `pdf:writeStored` refuses any path outside `FILES_DIR`.
- `pdf:removeStored` compares `path.dirname(storedPath) === FILES_DIR()` as a string. A path stored with different casing or separators would not be deleted.
- `menu:popup` resolves on the popup's close callback through `setTimeout(…, 0)` so that the click handler runs first.
- On macOS, an `open-file` event before the window loads is queued in `pendingOpen`. After that it is sent straight away as `open-files`.
- `themeBg()` hard-codes the same hex values as the `--bg` tokens in `styles.css` and `splash.html`.
- The main window starts hidden and is shown only by `revealMain()`, on `app:ready` or the 8 s fallback timer. A renderer crash before `fl.ready()` therefore means an 8 s wait.
- `applyTheme()` rebuilds the whole application menu so the View → Theme radio items stay in sync.
- The theme is applied before `createSplash()`, so the splash already uses the saved choice.
- Nothing else in main touches the network; the app works offline except for `pdf:fetch`. `ERR_NAME_NOT_RESOLVED` maps to `offline`, so a mistyped hostname also reports offline.
- Fetch uses `net.request` rather than `net.fetch`, because the latter didn't expose the post-redirect URL needed to resolve relative `citation_pdf_url`s and to record `origin.url`.
- `menu:popup` is no longer called by the renderer (F-010 replaced it with an in-app menu) but is still exposed.
