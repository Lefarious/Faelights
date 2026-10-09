# Module: main-process
> Path: src/main.js, src/identify.js, src/exportPaths.js, src/metadata.js · Last synced commit: 736ffd2 · Related features: F-001, F-003, F-004, F-005, F-007, F-008, F-011, F-014, F-016, F-018, F-019, F-020

## Purpose
This is the Electron main process. It owns the on-disk library (`faelights.json` plus copied PDFs), the splash and main windows, the theme, the native app menu, native dialogs, context-menu popups, shell actions, the clipboard, and the only network access in the app: downloading a PDF when the user submits an identifier (DOI, arXiv ID, PMID, PMCID, ISBN, ADS Bibcode) or a link (`pdf:fetch`), and fetching a paper's details from CrossRef or arXiv when the user asks (`meta:lookup`). It does not parse PDFs or hold UI state. The renderer sends the whole DB object and this module persists it as-is.

## Public interface
IPC handlers, called only through `preload.js`:
- `db:load` → DB object with transient `sourceMissing` / `stale` flags set on each doc (`stale` is always false for `annotated` docs)
- `db:save(db)` → `true` once the write is queued
- `app:pending` → drains `pendingOpen` paths
- `pdf:choose` → multi-select open dialog → `string[]`
- `pdf:import(srcPath)` → `importPdf(srcPath)`: copies into `files/`, returns `{id, hash, fileName, sourcePath, storedPath, mtime, size}`
- `pdf:fetch(text)` → parses with `identify.parseIdentifier`, resolves and downloads the PDF (`resolvePdf` → `pdfFrom` → `fetchUrl`), writes a temp `faelights-*.pdf`, runs `importPdf` on it, deletes the temp file. Returns `{ok:true, info (sourcePath:null, fileName from fileNameFor), origin:{kind,value,url}, title}` or `{ok:false, reason: invalid|paywalled|not-pdf|not-found|no-free-copy|network|too-large|offline|cancelled, landingUrl}`. A new call aborts the previous one
- `pdf:fetchCancel` → aborts the in-flight fetch
- `meta:lookup({doi, arxiv, origin})` → `metadata.lookupTarget` picks CrossRef (`api.crossref.org/works/<doi>`, parsed by `fromCrossref`) or arXiv (`export.arxiv.org/api/query?id_list=<id>`, parsed by `fromArxivAtom`) → `{ok:true, meta, source: crossref|arxiv, id}` or `{ok:false, reason: invalid|not-found|offline|network|paywalled}`. Own `AbortController` (20 s `META_MS` cap) and `quiet` fetches, so it neither cancels nor is cancelled by `pdf:fetch` and sends no `fetch-progress`
- `id:parse(text)` → `{kind, value, url, label}` or `null`
- `id:parseMany(text)` → `[{text, id: {kind, value, url, label} | null}]` (`identify.parseIdentifiers`, capped at 200)
- `app:openExternal(url)` → `shell.openExternal` for http(s) only, else `false`
- `clip:read` → clipboard text (first 4096 chars)
- `pdf:read(doc)` → `{bytes: Uint8Array, mtime, from: "source"|"copy"}`; `doc.annotated` forces the stored copy
- `pdf:writeStored({storedPath, bytes})` → `true|false`: atomic tmp+rename write, serialised, only for paths inside `FILES_DIR`
- `pdf:saveAs({name, bytes})` → save dialog (PDF filter), writes the bytes, returns the path or `null`
- `pdf:stat(path)` → `{mtime}|null` (exposed but not called by the renderer)
- `pdf:open(doc)` / `pdf:reveal(doc)`: `shell.openPath` / `showItemInFolder`, preferring the original file and falling back to the stored copy
- `pdf:relink(doc)` → chosen path or `null`
- `pdf:removeStored(storedPath)` → unlinks the file only if it is inside `FILES_DIR` (`isStored()`)
- `export:file({name, text})`, `export:folder({folderName, files, assets?})` (assets = `[{path, bytes}]` under the library folder; every name checked by `exportPaths`), `export:bundle({name, text, assets, dirToken?, encode?})` → save dialog (md/txt/html filter), writes assets under `<file base> images/` (the `dirToken` in text and asset paths is replaced by that folder name, URL-encoded when `encode: "url"`), then the text file; returns the path or `null`. `export:openFolder(path)`
- `clip:write(text)`, `clip:image(pngBytes)` (`nativeImage.createFromBuffer` → `clipboard.writeImage`; `false` when the bytes aren't an image), `menu:popup(items)` → chosen item id, `ask:confirm({message, detail, ok})` → boolean
- `theme:get` → `"system"|"light"|"dark"`; `theme:set(t)` → applies and returns the theme
- `app:ready` (one-way `ipcMain.on`) → `revealMain()`

Pushes to the renderer: `menu` (channel strings; File menu adds `add-id` on CmdOrCtrl+Shift+O; View menu adds `pane:side`, `pane:list`, `pane:rail`, `layout-reset`), `open-files` (path arrays), `theme`, and `fetch-progress` (`{stage: find|download|import}`).

## Dependencies
- **Uses:** electron (`app`, `BrowserWindow`, `ipcMain`, `dialog`, `shell`, `Menu`, `clipboard`, `nativeTheme`, `session`, `net`), node `fs`, `path`, `crypto`; internal `./identify`
- **Used by:** preload-bridge (all channels)
- **Loads:** `src/preload.js`, `renderer/index.html`, `renderer/splash.html`, `renderer/assets/brand/app-icon.ico` (window icon on Windows) or `app-icon.png` (other platforms)

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
- **Key functions:** `importPdf(srcPath)`, `fetchUrl(url, accept, maxBytes, opts)` (`opts.signal` overrides the current download's `fetchCtl.signal`, `opts.quiet` suppresses progress; `net.request` with `redirect: "manual"`, ≤10 hops, each checked to be http(s); `FETCH_HEAD_MS` 15 s, `FETCH_STALL_MS` 30 s, `MAX_PDF` 150 MB, `MAX_HTML` 5 MB), `pdfFrom(url, hops)`, `resolvePdf(id)` (arXiv → `arxiv.org/abs` then `/pdf`; DOI → `doi.org` landing page → `citation_pdf_url`, then CrossRef `api.crossref.org/works/<doi>` `link[]` PDF entries; PMID → NCBI ID converter (`pmc.ncbi.nlm.nih.gov/tools/idconv`) → PMCID or DOI, falling back to PubMed `eutils esummary` for the DOI, else `no-free-copy`; ADS → arXiv bibcodes to arXiv, else ADS link gateway `EPRINT_PDF` → `PUB_PDF` → `ADS_PDF`; ISBN → Open Library `search.json` public scan → `archive.org/download/<ia>/<ia>.pdf` (up to 5 scans), else `no-free-copy`; URL → as given), `fetchJson(url)`, `hardFail(e)` (cancelled/offline stop alternatives), `writeAtomic(p, data)` (tmp + rename, for exports), `EXPORT_FILTERS`, `FetchFail`, `sendProgress()`, `loadDb()`, `saveDb(db)`, `statOrNull(p)`, `isStored(p)`, `createSplash()`, `revealMain()`, `createWindow()`, `themeBg()`, `loadTheme()`, `applyTheme(t)`, `pdfArgs(argv)`, `buildAppMenu()`, `EMPTY_DB()`, path helpers `DATA_DIR()`, `DB_PATH()`, `FILES_DIR()`, `THEME_PATH()`; constants `ICON`, `THEMES`, `SPLASH_MIN_MS`, `SPLASH_MAX_MS`
- **Imports (internal):** `./identify` (`parseIdentifier`, `parseIdentifiers`, `describe`, `findPdfLink`, `isPdf`, `fileNameFor`, `fetchFailureReason`), `./exportPaths`, `./metadata` (`lookupTarget`, `fromCrossref`, `fromArxivAtom`); loads `preload.js` and `index.html` by path
- **Used by:** Electron runtime (`package.json` `"main"`); renderer through preload
- **Side effects:** reads and writes the files above; network requests only inside `pdf:fetch` and `meta:lookup` (export.arxiv.org, arxiv.org, doi.org and publisher hosts, api.crossref.org, pmc.ncbi.nlm.nih.gov, eutils.ncbi.nlm.nih.gov, ui.adsabs.harvard.edu, openlibrary.org, archive.org); opens dialogs; `shell.openExternal` for http(s) links (in-window navigation away from `file:` is blocked); sets the application menu; takes the single-instance lock
- **Change impact:** renaming an IPC channel breaks `preload.js`. Changing the DB shape affects every `S.db` reader in `app.js` and existing user data, and there is no migration besides the `loadDb` repair. Changing menu `send("…")` strings breaks the `fl.onMenu` handler in `app.js`.

### `src/identify.js`
- **Role:** pure helpers for add-by-identifier (no electron imports; CommonJS)
- **Exports:** `parseIdentifier(text)` → `{kind: doi|arxiv|pmcid|pmid|isbn|ads|url, value, url}` or `null` (accepts bare, `doi:` and doi.org DOIs, new and old arXiv ids, `arXiv:` prefix, arxiv.org abs/pdf links, `PMC…` ids, other http(s) URLs; rejects other schemes, hosts without a dot, URLs with credentials); `parseIdentifiers(text)` → `[{text, id}]` (splits a pasted list on newlines, whitespace, `,`/`;`; keeps `doi: 10…` / `PMID: 1` pairs and URLs whole; drops duplicates); `describe(id)` (hint label, incl. ISBN/PMID/ADS); `findPdfLink(html, baseUrl)` → `{pdf, refresh, title}` from `citation_pdf_url` / meta refresh / `citation_title`; `isPdf(buf)` (`%PDF-` magic); `fileNameFor(id, pdfUrl)`; `fetchFailureReason(err)` → `offline` for DNS/connection error codes (`OFFLINE_CODES`), else `network`
- **Used by:** `main.js`; `test/identify.test.js`
- **Change impact:** `parseIdentifier` / `parseIdentifiers` decide what the renderer's hint, paste and link-drop handlers accept (through `id:parse` / `id:parseMany`).

### `src/metadata.js`
- **Role:** pure mapping of online metadata to the doc `meta` shape (no electron imports, no network; CommonJS)
- **Exports:** `lookupTarget(meta, origin)` → `{source: "crossref", id: doi}` | `{source: "arxiv", id}` | `null` (origin wins over the PDF's own `doi`/`arxiv`; arXiv DOIs `10.48550/arXiv.*` go to arXiv); `fromCrossref(json)` → meta incl. `itemType` (from CrossRef `type`), JATS abstract stripped, `page` dashes → en dash, partial dates; `fromArxivAtom(xml)` → meta (`itemType: "Preprint"`, categories as `keywords`) or `null` for no entry / the API's error entry
- **Used by:** `main.js` (`meta:lookup`); `test/metadata.test.js`
- **Change impact:** field names must match `app.js readMeta()` output, since `infoEl` overlays `d.lookup.meta` on `d.meta`.

### `src/exportPaths.js`
- **Role:** pure path safety for exports (CommonJS, no electron)
- **Exports:** `MAX_ASSET_BYTES` (500 MB total), `pathProblem(rel)` (rejects absolute/UNC/drive paths, `..`/`.` segments, Windows-reserved characters and names, trailing dots/spaces), `resolveInside(dir, rel)`, `planAssets(dir, assets)` → `[{abs, bytes}]` (throws on any bad path, duplicate or size overflow), `mdSeg(name)`, `imagesDirFor(filePath)` (`<base> images`), `fillToken(text, token, value)`, `isToken(t)`
- **Used by:** `main.js` `export:bundle` / `export:folder`; `test/export.test.js`
- **Change impact:** loosening a check here lets renderer-supplied names write outside the chosen folder.

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
- Nothing else in main touches the network; the app works offline except for `pdf:fetch` and `meta:lookup`. `meta:lookup` maps its own timeout (`cancelled`) to `network`; a CrossRef 404 becomes `not-found` via `fetchUrl`. `ERR_NAME_NOT_RESOLVED` maps to `offline`, so a mistyped hostname also reports offline.
- Fetch uses `net.request` rather than `net.fetch`, because the latter didn't expose the post-redirect URL needed to resolve relative `citation_pdf_url`s and to record `origin.url`.
- `menu:popup` is no longer called by the renderer (F-010 replaced it with an in-app menu) but is still exposed.
- ISBN downloads can be a scan of a different edition: Open Library's `ia` list covers every edition of the work.
- PMC currently answers non-browser clients with a bot-check page, so PMCID (and PMIDs that resolve to PMC) may end in `not-pdf`/`paywalled`; PMIDs then fall back to the DOI path.
- Bare 6–8 digit numbers parse as PMIDs (shorter ones need a `PMID:` prefix); 10/13-digit numbers with a valid ISBN checksum parse as ISBNs first.
