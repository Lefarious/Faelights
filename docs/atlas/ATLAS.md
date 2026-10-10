# Faelights — Codebase Atlas
> Last synced: 2026-10-10 · Synced at commit: 43721ca

## How to read this
Layer 0 (this file) → module docs in [modules/](modules/) → file entries inside each module doc.
History, rationale and roadmap live in [../PROJECT_COMPASS.md](../PROJECT_COMPASS.md), not here.

Faelights is an Electron 31 desktop app with no bundler and no framework. Tests are `node:test` files under `test/` (`npm test`). The renderer is plain browser scripts loaded by `<script>` tags in order; the main process is a single CommonJS file.

## Entry points
| Entry | File | What starts here |
|---|---|---|
| Electron main | `src/main.js` (`package.json` → `"main"`) | Single-instance lock, theme, app menu, splash + main `BrowserWindow`, all `ipcMain` channels |
| Splash | `renderer/splash.html` | Frameless window from `createSplash()`; destroyed by `revealMain()` |
| Preload | `src/preload.js` | Exposes `window.fl` bridge via `contextBridge` |
| Renderer page | `renderer/index.html` | Loads `pdf.min.js` → `pdf-lib.min.js` → `core.js` → `annotator.js` → `images.js` → `order.js` → `exportfmt.js` → `tour.js` → `app.js` |
| Renderer boot | `renderer/app.js` `boot()` IIFE | Loads DB + theme, renders UI, sends `app:ready`, consumes pending "Open with" files |
| CLI / OS file open | `src/main.js` `pdfArgs()`, `second-instance`, `open-file` | PDFs passed on argv or macOS "Open with" |
| CI build | `.github/workflows/build.yml` | On `v*` tag: `electron-builder` for win/mac/linux, files attached to a draft GitHub Release |
| Tests | `npm test` → `node --test "test/**/*.test.js"` | `test/core.test.js` (extraction on `sample.pdf`), `test/images.test.js` (image boxes on `test/fixtures/images.pdf`), `test/identify.test.js`, `test/metadata.test.js`, `test/reader-images.test.js`, `test/export.test.js`, `test/tour.test.js` |

## Module map
```mermaid
graph LR
  UI[renderer-ui<br/>app.js] -->|window.fl| PRE[preload-bridge<br/>preload.js]
  PRE -->|ipcRenderer.invoke| MAIN[main-process<br/>main.js]
  MAIN -->|webContents.send menu / open-files / theme| PRE
  UI -->|analyzePdf global| CORE[extraction-core<br/>core.js]
  UI -->|Annot global| ANN[annotator<br/>annotator.js]
  ANN -->|rescan, renderAll, DOM helpers| UI
  ANN -->|window.fl| PRE
  ANN -->|PDFLib global| PDFLIB[(pdf-lib 1.17.1)]
  ANN -->|normQuads| CORE
  ANN -->|render + text layer| PDFJS
  UI -->|pdfjsLib global| PDFJS[(pdfjs-dist 3.11.174)]
  CORE -.->|pdf proxy objects| PDFJS
  MAIN -->|require| ID[identify.js]
  MAIN -->|require| EP[exportPaths.js]
  MAIN -->|require| MD[metadata.js]
  TEST[tests<br/>test/] -.->|require| CORE & ID & EP & MD
  TEST -.->|require order.js, exportfmt.js, tour.js| UI
  TEST -.->|legacy build| PDFJS
  PKG[packaging<br/>package.json, CI] -.->|bundles| MAIN & UI & PDFJS
```
One deliberate two-way edge: renderer-ui ↔ annotator (app.js opens/mounts the viewer; annotator calls app.js helpers and `rescan` at call time). `core.js` has no imports; it only operates on the pdf.js document object passed to it.

| Module | Path | Responsibility | Depends on | Used by | Doc |
|---|---|---|---|---|---|
| main-process | `src/main.js`, `src/identify.js`, `src/exportPaths.js`, `src/metadata.js` | Library JSON + PDF copies on disk, splash/main windows, theme, dialogs, menus, shell, clipboard, exports (text + image assets, path-checked), PDF download by identifier (DOI/arXiv/PMID/PMCID/ISBN/ADS) or link, paper details from CrossRef/arXiv (the only network use) | electron (incl. `net`, `session`), node fs/path/crypto | preload-bridge (IPC), tests (`identify.js`, `metadata.js`) | [main-process.md](modules/main-process.md) |
| preload-bridge | `src/preload.js` | Maps `window.fl.*` → IPC channels | electron `contextBridge`, `ipcRenderer`, `webUtils` | renderer-ui | [preload-bridge.md](modules/preload-bridge.md) |
| extraction-core | `renderer/core.js` | Turns a pdf.js document into entries (sentences + highlight spans), topics, loose marks and image boxes (`images`) | pdf.js document API (passed in) | renderer-ui | [extraction-core.md](modules/extraction-core.md) |
| annotator | `renderer/annotator.js` | In-app PDF viewer; writes Highlight/Underline/StrikeOut/Text/Ink annotations and Square image boxes with pdf-lib into the library copy; undo/redo | pdf-lib, pdfjs-dist, preload-bridge, extraction-core, renderer-ui helpers | renderer-ui | [annotator.md](modules/annotator.md) |
| renderer-ui | `renderer/app.js`, `images.js`, `order.js`, `exportfmt.js`, `tour.js`, `index.html`, `splash.html`, `styles.css`, `assets/brand/*`, `sample.pdf` | State, three-pane UI, splash page, brand artwork, theme button, search, image crops + ordering, export formatting, first-run guided tour, drag/drop, keyboard | preload-bridge, extraction-core, pdfjs-dist, @fontsource | — (top of stack) | [renderer-ui.md](modules/renderer-ui.md) |
| packaging | `package.json`, `.github/workflows/build.yml` | Dependencies, scripts, electron-builder config, CI release builds | electron-builder | — | [packaging.md](modules/packaging.md) |
| tests | `test/` | `node:test` suites: extraction snapshot on `sample.pdf`, image boxes on `fixtures/images.pdf`, identifier parsing and offline mapping, CrossRef/arXiv metadata mapping, reader ordering, export formatting and path safety | extraction-core, `src/identify.js`, `src/metadata.js`, pdfjs-dist legacy build | `npm test` | [tests.md](modules/tests.md) |

## Key flows (code-level traces)

### Add a PDF (button, drag/drop, menu, or "Open with")
`chooseAndAdd()` (sidebar Add PDFs, list-header + button, empty state, menu) / window `drop` / `fl.onOpenFiles` / `boot()` pending → `app.js addPaths(paths)` →
existing `sourcePath` match? → `rescan()` (see below) ; else
`fl.importPdf(p)` → IPC `pdf:import` → `main.js` reads file, SHA-1 hash, writes `userData/library/files/<id>.pdf` → returns `{id, hash, storedPath, mtime…}` →
`fl.readPdf({...d, sourcePath:null})` → IPC `pdf:read` (reads stored copy) →
`app.js analyzeBytes()` → `pdfjsLib.getDocument` → `readMeta(pdf)` (`getMetadata` XMP + Info, page-1 text for DOI/arXiv) → `core.js analyzePdf(pdf)` → `{entries, loose, topics, topicSource, pages, count}` →
`summary()` adds `count`, `colours` → pushed to `S.db.docs` → `save()` (250 ms debounce) → `fl.saveDb` → IPC `db:save` → `main.js saveDb()` atomic tmp+rename write of `faelights.json`.

### Add by identifier (DOI, arXiv, PMID, PMCID, ISBN, ADS Bibcode, link)
Sidebar/list-header link button / empty-state button / File → "Add by Identifier…" (`menu` `add-id`) / Ctrl+V outside inputs / dropped `text/uri-list` → `app.js openAddId(prefill)` → typing in the textarea → `addIdHint()` → `fl.parseIds` → IPC `id:parseMany` → `identify.parseIdentifiers` + `describe` → hint (one label, or "N recognised · M not recognised"; "Offline" pill when `navigator.onLine` is false) →
`submitAddId()` → offline? fail at once with `offline` ; one item → `fl.fetchPdf(text)` ; several → `addIdBatch(D)` runs the same call per item, one at a time, with a status row each (`addIdRow`) →
IPC `pdf:fetch` → `resolvePdf(id)` (`fetch-progress` `find` → `download`): arXiv / DOI (+ CrossRef fallback) / PMID (NCBI idconv → PMCID or DOI; eutils esummary → DOI) / ADS (arXiv bibcode → arXiv; link gateway EPRINT_PDF → PUB_PDF → ADS_PDF) / ISBN (Open Library public scan → archive.org PDF) / URL → `fetchUrl` on the `faelights-fetch` session → temp file → `importPdf()` (`import`) → `{ok, info, origin, title}` →
duplicate by `origin` or `hash`? open the existing doc (single) / "already in library" row (batch) + `fl.removeStored(new copy)` ; else `addImported(info, target, {origin, title})` → `analyzeBytes` → `S.db.docs` → `save()`. Failures → `addIdFail(reason)` / failed row (Open in browser via `fl.openExternal`; Add PDFs from file… → `chooseAndAdd`). A batch with failures keeps the dialog open; otherwise it closes with "Added N PDFs".

### Capture an image box and show it
Viewer tool "Capture image" (`I`) → `annotator.js startBox` (drag preview `.pv-boxdraw`) → `edit([page], addAnnot(lib, i, "Square", {rect, c, width: 1.5}, {BS, CA, Subj: "Image"}))` → stored copy (see "Annotate a PDF") → `Annot.close()` → `rescan(d)` → `core.js analyzePdf` collects Squares → `imgStreamAt` (reading-order position) → `imgSnapToFacts` (inside a fact → fact start) → `result.images` →
reader "With images" (`settings.images`) → `renderReader` → `Order.groupItems(withImages(filtered(d), filteredImages(d)))` (image before entry when `img.at <= e.at`; `S.off` colour filter applies) → `figureEl(d, img)` → `Images.crop(d, img)` → `fl.readPdf({...d, sourcePath:null})` → pdf.js render of the box region with annotations disabled → PNG data URL (cached per doc version) → centred `<figure>`.

### Item action menu
Right-click / ⋯ (`moreBtn`) / Shift+F10 or ContextMenu (`menuKey`) on a library row (`navItem` `onMenu`) or PDF card (`.doc-row`) → `libraryMenu(id, at, opts)` / `docMenu(d, at, opts)` → `openMenu(at, items, opts)` builds `.amenu` panels on `document.body` → the choice resolves the Promise → same action handlers as before (`exportLibrary`, `deleteLibrary`, `annotate`, `setMine`, `moveDoc`, `removeDoc`…). The reader's library button uses `openMenu` with a "Move to" heading.

### Startup + staleness detection
`main.js whenReady` → `loadTheme()` reads `userData/theme.json` → `nativeTheme.themeSource` → `createSplash()` (shown on `ready-to-show`) + `createWindow()` (hidden) →
`app.js boot()` → `fl.loadDb()` + `fl.getTheme()` → IPC `db:load` → `main.js loadDb()` (repairs missing Inbox/settings; backs up unparseable file as `.broken-<ts>`) → for every doc `statOrNull(sourcePath)` sets `sourceMissing` and `stale` (mtime > `scannedMtime` + 1 s) → renderer `renderAll()` → `fl.ready()` → IPC `app:ready` → `main.js revealMain()` (keeps the splash up ≥ `SPLASH_MIN_MS` 2.3 s, then shows main and destroys splash; `SPLASH_MAX_MS` 8 s timer forces it) → `fl.pendingFiles()` → IPC `app:pending` drains `pendingOpen` → `addPaths()`.

### Rescan a changed PDF
`openDoc(id)` (if `d.stale && d.sourcePath`, or `outdated(d)`: result `v` < `ANALYZER_VERSION`) / doc menu "Rescan" / `rescanAll()` (stale or outdated docs, else all) → `app.js rescan(d)` → `fl.readPdf(d)` → IPC `pdf:read`: if original exists read it, and if newer than `scannedMtime` overwrite stored copy; else read stored copy → `analyzeBytes()` → `analyzePdf()` → doc fields replaced, `stale=false` → `save()`.

### Extraction pipeline (inside `core.js analyzePdf`)
per page: `getTextContent()` + `getAnnotations()` → keep Highlight/Underline/Squiggly/StrikeOut (`MARK_TYPES`) → `normQuads()` + `colorOf()` → build one char stream with line/paragraph breaks and de-hyphenation → per-char quad hit-test assigns annotation id → topics, first that succeeds: `resolveOutline()` (bookmarks, `topicSource:"outline"`) → font-size headings (`"headings"`) → if < 2, `patternTopics()` by wording (`"patterns"`) → `pageTopics()` one per page (`"pages"`) → snap highlight edges to whole words → `sentenceBounds()` (abbreviation-aware) → group & merge overlapping sentences → entries `{n, page, at, segs, spans, topic, sentence}`; annotations with no text hit go to `loose`. Result is stamped `v: ANALYZER_VERSION`. Entries before the first topic have `topic: null` and render under `PRE_TOPIC` ("Abstract") in `app.js`.

### Export
Reader "Export" → `exportMenu(d, eb)` (Markdown / Obsidian / HTML / Plain text; "Include images" toggles `settings.images`) / menu `export-doc` → `exportDoc(d, fmt)`:
no images and not html → `docText(d, fmt, frontmatter)` (`ExportFmt.docText`: `groupsOf`, `entryLines`, `settings.mode`) → `fl.exportFile` → IPC `export:file` save dialog → write (output identical to before F-016) ;
html → `exportImages` (data URLs via `Images.crop`) → `ExportFmt.docHtml` → `fl.exportBundle` ; md/obsidian/plain with images → `exportImages` (`Images.png` per box, "Preparing images… k/n" toast, failed crop → placeholder line) → `ExportFmt.docText(…, {images})` (`exportItems` → `Order.withImages`; `imageLines` per format, paths under a random `dirToken`) → `fl.exportBundle` → IPC `export:bundle` → save dialog → `exportPaths.imagesDirFor` (`<file base> images`) → `fillToken` / `planAssets` (rejects unsafe paths) → `writeAtomic` assets, then the text file.
Library menu / menu `export-library` → `exportLibrary(id)` → per doc the same text/html builders (images under `<doc file base> images/` when on) → `fl.exportFolder(name, files, assets)` → IPC `export:folder` (every name checked by `exportPaths`) → writes `<dir>/<library name>/…` → `fl.openFolder`.
Copy → `docText(d, fmt, false, filtered(d), filteredImages(d) when "With images" is on)` → `[Image, p. N]` placeholders → `fl.copy`.

### Column resize / collapse
Pointer down on a `.resizer[data-pane]` (window-level listener in `app.js`) → `pointermove` sets `layout()[pane].w` (clamped to `PANES` min/max) or `closed` when dragged below ~half the minimum → `applyLayout()` writes `--side-w/--list-w/--rail-w` and `*-closed` classes on `#app` (borrowing width from list then sidebar so the reader keeps `READER_MIN`) → `pointerup` → `save()`. Hide buttons (`paneBtn`), strips (`strip`), focused-handle keys (`resizerKey`), double-click (reset one pane) and menu `pane:*` / `layout-reset` all end in `togglePane()` / `resetLayout()` → `applyLayout()` + `save()`. No pane re-renders.

### Info card (PDF metadata)
Reader `.info-btn` (labelled "Metadata", left of the Full sentence / Highlights only switch) → toggles `settings.info` → `save()` + `renderReader()` → `infoEl(d)` prepended to `.r-main` → renders `d.meta` via `infoRows()`; if `d.meta` is missing → `loadMeta(d)` → `fl.readPdf({...d, sourcePath:null})` → `readMeta()` → `d.meta` → `save()` → `renderReader()`. `rescan()` also refreshes `d.meta` (not `d.lookup`). The card shows `metaOf(d)` = `d.meta` overlaid with `d.lookup.meta`.

### Look up paper details (CrossRef / arXiv)
Info card "Look up details" / "Refresh details" → `app.js lookUp(d)`; or `addImported(…, {origin})` after an add by identifier → `lookUp(d, true)` (no toasts) → `lookupQuery(d)` (`d.meta.doi`/`arxiv`, `d.origin`) → offline? stop → `fl.lookupMeta(q)` → IPC `meta:lookup` → `metadata.lookupTarget` → `fetchUrl(…, {signal, quiet})` CrossRef `works/<doi>` → `fromCrossref` | arXiv `api/query` → `fromArxivAtom` → `{ok, meta, source, id}` → `d.lookup = {source, id, at, meta}` (+ `d.title` if the PDF had none and `!d.titleEdited`) → `save()` → `renderAll()`.

### Copy a captured image
Reader figure Copy button / right-click → "Copy image" → `app.js copyImage(d, img)` → `Images.png(d, img)` (PNG bytes from the cached crop) → `fl.copyImage` → IPC `clip:image` → `nativeImage.createFromBuffer` → `clipboard.writeImage` → toast "Image copied".

### Annotate a PDF
Reader toolbar "View" button (first in the left-aligned `.r-tools`, before Info) / doc menu "Annotate" / clicking an extract's `p. N` → `app.js annotate(d, page)` → `Annot.open(d, page)` → `fl.readPdf(d)` (stored copy if `d.annotated`) → pdf.js doc + `PDFDocument.load` (pdf-lib, in the background) → `renderReader()` → `Annot.mount(#reader)` → pages drawn lazily (`drawPage`: canvas with `AnnotationMode.ENABLE` + `renderTextLayer`).
Edit (text selection + tool/popover, note click, ink drag, recolour, note, delete) → `edit(pages, fn)` on a serial queue → pdf-lib mutation (`addAnnot` / `recolorAnnot` / `setNote` / `deleteAnnot`, each writing an `/AP` stream) → `lib.save()` → push `{bytes, pages}` on `undo` → `swap()`: new pdf.js doc, bump `pageVer` for those pages, redraw them → `persist()`: `d.annotated = true`, `fl.writeStored(d.storedPath, bytes)` → IPC `pdf:writeStored` (atomic write inside `FILES_DIR`) + `save()`.
Undo/redo → `history()` swaps byte snapshots (pdf-lib doc reloaded lazily). "Download PDF" → `fl.savePdfAs` → IPC `pdf:saveAs`.
Leave (back button / Esc / another doc / search) → `Annot.close()` → after `queue` + `writing` settle → `rescan(d)` → `pdf:read` returns the stored copy → `analyzePdf` → new marks appear as extracts. Doc menu "Discard annotations made here…" → `useOriginal(d)`: `annotated=false`, `scannedMtime=0`, `rescan` → `pdf:read` re-copies the original over the stored copy.

### Theme change
Sidebar footer `themeSwitch()` (monitor / sun / moon icons, one click each) → `fl.setTheme(t)` → IPC `theme:set` → `main.js applyTheme(t)` sets `nativeTheme.themeSource`, `setBackgroundColor` on every window, writes `userData/theme.json`, rebuilds the menu, pushes `theme` → `fl.onTheme` → `S.theme`, `renderSide()`. View → Theme radio items call `applyTheme` directly. All styling and `<picture>` brand art react through `prefers-color-scheme`.

### First-run guided tour
`boot()` → after 900 ms `maybeTour()` (also `tourSoon()` at the end of `renderReader` and after `annotate`) → picks the first chapter with a pending step whose target is on screen: `app`, else `viewer` if `Annot.isOpen()`, else `reader` (`Tour.ready(Tour.pending(S.db.settings, ch))`) → `startTour(ch)` → `Tour.start(ch, {steps: pending})` → overlay spotlights each step's `[data-tour]`/class target, skipping ones not on screen → each shown step `Tour.markShown` → `save()` (`settings.tour[ch]` = shown ids). Skip tour / Esc → `Tour.skipAll` (every chapter `true`). Finishing `app` → `tourSoon()` so an open PDF continues into `reader`. Steps skipped for a missing target stay pending and run as a short follow-up the first time it appears. Help › Show Tour → menu `tour` → `settings.tour = {}` → `startTour("app")`.

## Cross-cutting couplings
| Kind | Key | Producers | Consumers |
|---|---|---|---|
| IPC invoke | `db:load`, `db:save`, `app:pending` | `preload.js` | `main.js` |
| IPC invoke | `pdf:choose`, `pdf:import`, `pdf:read`, `pdf:stat`, `pdf:open`, `pdf:reveal`, `pdf:relink`, `pdf:removeStored`, `pdf:writeStored`, `pdf:saveAs` | `preload.js` | `main.js` |
| IPC invoke | `export:file`, `export:folder` (+ `assets`), `export:bundle`, `export:openFolder`, `clip:write`, `clip:image`, `menu:popup`, `ask:confirm` | `preload.js` | `main.js` |
| IPC invoke | `theme:get`, `theme:set` | `preload.js` | `main.js` |
| IPC invoke | `id:parse`, `id:parseMany`, `pdf:fetch`, `pdf:fetchCancel`, `meta:lookup`, `app:openExternal`, `clip:read` | `preload.js` | `main.js` |
| IPC push | `fetch-progress` (`{stage}`) | `main.js sendProgress` | `app.js fl.onFetchProgress` |
| Network | arxiv.org, doi.org (+ publisher redirects), api.crossref.org, pmc.ncbi.nlm.nih.gov, eutils.ncbi.nlm.nih.gov, ui.adsabs.harvard.edu (+ redirects), openlibrary.org, archive.org — only from `pdf:fetch` | `main.js fetchUrl` / `fetchJson` | — |
| Session partition | `faelights-fetch` (in-memory) | `main.js fetchUrl` | — |
| Temp file | `<temp>/faelights-<random>.pdf` (deleted after import) | `main.js` `pdf:fetch` | `importPdf` |
| Doc field | `origin` `{kind: doi|arxiv|pmcid|pmid|isbn|ads|url, value, url}` | `app.js addImported` (from `pdf:fetch`) | `app.js submitAddId` duplicate check |
| IPC send (renderer → main) | `app:ready` | `app.js boot()` via `fl.ready()` | `main.js revealMain()` |
| IPC push | `menu` (payloads: `add`, `add-id`, `new-library`, `export-doc`, `export-library`, `rescan-all`, `search`, `toggle-mode`, `pane:side`, `pane:list`, `pane:rail`, `layout-reset`) | `main.js buildAppMenu()` | `app.js fl.onMenu` handler |
| IPC push | `open-files` | `main.js` `second-instance` / `open-file` | `app.js fl.onOpenFiles` → `addPaths` |
| IPC push | `theme` (`system`/`light`/`dark`) | `main.js applyTheme()` | `app.js fl.onTheme` |
| Persisted file | `userData/theme.json` (`{theme}`) | `main.js applyTheme` | `main.js loadTheme` at startup |
| Persisted file | `userData/library/faelights.json` (`{version, libraries, docs, settings}`) | `main.js saveDb` (whole object from renderer) | `main.js loadDb` → renderer `S.db` |
| Persisted dir | `userData/library/files/<docId>.pdf` | IPC `pdf:import`, `pdf:read` (refresh), `pdf:writeStored` (annotator) | `pdf:read`, `pdf:open`, `pdf:reveal`; deleted by `pdf:removeStored` |
| Doc flag | `annotated` (+ `annotatedAt`) | `annotator.js persist()`; cleared by `app.js useOriginal()` | `main.js` `pdf:read` (stored copy only) and `db:load` (never stale); `app.js` list pill + doc menu |
| Global (window) | `PDFLib` | `pdf-lib.min.js` script tag | `annotator.js` |
| Global (window) | `Annot` | `annotator.js` | `app.js renderReader`, `annotate`, `openDoc`, `removeDoc`, `useOriginal`, keydown |
| Global (window) | `normQuads` | `core.js` | `annotator.js pickAt` (also core itself) |
| Global (window) | `pdfjsLib` | `pdf.min.js` script tag | `app.js` (`GlobalWorkerOptions`, `getDocument`) |
| Global (window) | `analyzePdf`, `ANALYZER_VERSION` (3), `imgStreamAt`, `imgSnapToFacts` | `core.js` (top-level) | `app.js analyzeBytes`, `outdated()` |
| Global (window) | `Images` | `images.js` | `app.js figureEl`, `exportImages`, `removeDoc`, `rescan` |
| Global (window) | `Order` | `order.js` | `app.js renderReader` / `filteredImages` / `withImages`, `exportfmt.js` |
| Global (window) | `Tour` | `tour.js` | `app.js` guided-tour section (`startTour`, `maybeTour`) |
| DOM hooks | `data-tour="…"` attributes (`add`, `add-id`, `search`, `all`, `starred`, `mine`, `libraries`, `foot`, `pane`, `list-tools`, `start`, `view`, `copy`, `export`, `pv-back`, `pv-dl`) | `app.js`, `annotator.js` | `tour.js CHAPTERS` selectors (checked by `test/tour.test.js`) |
| Settings key | `settings.tour` (`{app\|reader\|viewer: [shown step ids] or true}`; no main default) | `app.js startTour` via `Tour.markShown` / `skipAll`; menu `tour` resets to `{}` | `app.js maybeTour` via `Tour.pending` |
| Menu channel | `tour` (Help › Show Tour) | `main.js` app menu | `app.js fl.onMenu` |
| Global (window) | `ExportFmt` | `exportfmt.js` | `app.js` export section (`wrapHl`/`entryLines`/`groupsOf` are aliases) |
| Result field | `result.images[]` `{id, n, page, rect, color, comment, at, topic}` | `core.js analyzePdf` | `order.js`, `images.js`, `exportfmt.js`, `app.js` |
| PDF annotation | `Square` (`/Subj (Image)`, border-only) = image box | `annotator.js startBox` (or other apps) | `core.js` (`images`), `images.js` (crop by `/Rect`) |
| Placeholder token | random `dirToken` in export text / asset paths | `app.js exportDoc` | `main.js export:bundle` (`exportPaths.fillToken`) |
| Result version | `result.v` | `core.js analyzePdf` | `app.js outdated()` → rescan on open / Rescan all |
| Global (window) | `fl` | `preload.js` | `app.js` everywhere |
| Magic id | library id `"inbox"` (`system: true`) | `main.js EMPTY_DB/loadDb` | `app.js` (default target, delete fallback, boot) |
| Drag MIME | `application/x-faelights-doc` | `app.js renderDocs` dragstart | `app.js navItem` drop on library |
| Relative paths | `../node_modules/pdfjs-dist/build/*.min.js`, `../node_modules/pdf-lib/dist/pdf-lib.min.js`, `../node_modules/@fontsource/*` | `package.json build.files` | `index.html`, `app.js` worker src, `styles.css @import` |
| Brand asset paths | `assets/brand/{mark,mote,splash}-{light,dark}.svg`, `favicon-*.ico`, `app-icon.png`, `app-icon.ico` | files in `renderer/assets/brand/` | `app.js brandImg()`, `index.html`, `splash.html`, `main.js ICON` |
| Media query | `prefers-color-scheme` | `nativeTheme.themeSource` (main) | `styles.css`, `splash.html`, `<picture>` sources |
| Settings keys | `settings.mode` (`full`/`only`), `fmt` (`md`/`obsidian`/`html`/`plain`), `sort` (`added`/`title`/`count`) | `main.js EMPTY_DB` defaults | `app.js` reader, export, list |
| Doc flag | `mine` ("My publications") | `app.js setMine` (doc menu, reader toggle, drop on sidebar item) | `app.js visibleDocs` (`view.kind === "mine"`), sidebar count |
| Settings key | `settings.info` (boolean; no main default) | `app.js` info toggle | `app.js renderReader()` |
| Settings key | `settings.images` (boolean "With images"; no main default) | `app.js` reader toggle, `exportMenu` | `app.js renderReader`, `exportWithImages`, Copy |
| Settings key | `settings.annotColor` (`[r,g,b]` 0–1; no main default, falls back to yellow) | `annotator.js` swatches / popover | `annotator.js color()` |
| Settings key | `settings.layout` (`{side,list,rail: {w, closed}}`; no main default, filled by `app.js layout()`) | `app.js` drag / toggle / `resetLayout` | `app.js applyLayout()` |
| CSS vars + classes on `#app` | `--side-w`, `--list-w`, `--rail-w`; `side-closed`, `list-closed`, `rail-closed`, `wide` | `app.js applyLayout()`, `renderList()` | `styles.css` grid, strips, `.app > .resizer` positions |
| Env vars | none read | — | — |

## Conventions
- All filesystem, dialog, shell and clipboard access stays in `main.js` behind an `ipcMain.handle`. The renderer runs with `contextIsolation: true`, `nodeIntegration: false` and `sandbox: true`, and only reaches the OS through `window.fl`.
- Adding an OS capability takes three edits: `ipcMain.handle("<area>:<verb>")` in `main.js`, a `fl.<name>` wrapper in `preload.js`, and the call site in `app.js`.
- `core.js` is pure analysis with no DOM and no `fl`. Keep it that way so it stays usable from Node (it has a `module.exports` guard).
- The renderer is immediate-mode: mutate `S` / `S.db`, call `save()`, then `renderAll()` (or `renderSide`/`renderList`/`renderReader`). There is no diffing.
- IDs: docs `"d" + base36 time + random`, libraries `"l" + base36 time`.
- CSS uses custom properties on `:root`, with a dark override under `prefers-color-scheme: dark`. Never add a theme class: the light/dark choice is made only through `nativeTheme.themeSource` in `main.js`.
- Light/dark artwork goes in `renderer/assets/brand/` as `<name>-light.svg` / `<name>-dark.svg` and is placed with `brandImg(name)` (or a `<picture>` in static HTML).
- Bump `ANALYZER_VERSION` in `core.js` whenever extraction output changes, so saved docs rescan.
- Pure renderer logic that tests need goes in its own script with a `module.exports` guard (`core.js`, `order.js`, `exportfmt.js`), loaded before `app.js`; main-side pure helpers go in their own CommonJS file (`identify.js`, `exportPaths.js`).
- Paths that come from the renderer (export names, asset paths) are validated in main with `exportPaths` before any write.
- PDF bytes are only ever written to the stored copy (`pdf:writeStored`) or a user-chosen path (`pdf:saveAs`), never to `sourcePath`.

## File → module index
| File | Module |
|---|---|
| `.github/workflows/build.yml` | packaging |
| `build/icon.ico` | packaging |
| `scripts/set-exe-icon.js` | packaging |
| `build/icon.png` | packaging |
| `package.json` | packaging |
| `renderer/annotator.js` | annotator |
| `renderer/app.js` | renderer-ui |
| `renderer/assets/brand/*` | renderer-ui |
| `renderer/core.js` | extraction-core |
| `renderer/exportfmt.js` | renderer-ui |
| `renderer/images.js` | renderer-ui |
| `renderer/index.html` | renderer-ui |
| `renderer/order.js` | renderer-ui |
| `renderer/tour.js` | renderer-ui |
| `renderer/sample.pdf` | renderer-ui |
| `renderer/splash.html` | renderer-ui |
| `renderer/styles.css` | renderer-ui |
| `src/exportPaths.js` | main-process |
| `src/identify.js` | main-process |
| `src/metadata.js` | main-process |
| `src/main.js` | main-process |
| `src/preload.js` | preload-bridge |
| `test/README.md` | tests |
| `test/core.test.js` | tests |
| `test/export.test.js` | tests |
| `test/fixtures/images.pdf`, `test/fixtures/make-images-pdf.js` | tests |
| `test/helpers/pdf.js` | tests |
| `test/identify.test.js` | tests |
| `test/metadata.test.js` | tests |
| `test/tour.test.js` | tests |
| `test/images.test.js` | tests |
| `test/reader-images.test.js` | tests |

## Excluded
`node_modules/`, `dist/` (gitignored build output), `package-lock.json`, `README.md`, `.gitignore`.
