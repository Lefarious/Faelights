# Module: renderer-ui
> Path: renderer/ (app.js, index.html, splash.html, styles.css, assets/brand/, sample.pdf) · Last synced commit: c5c0dbe · Related features: F-001, F-002, F-003, F-004, F-005, F-006, F-007, F-008, F-009, F-010, F-011

## Purpose
This is the whole user interface plus the splash page and brand artwork. It holds app state (`S`), renders the three panes (library sidebar, PDF list, extract reader) and the search view, and formats exports. It drives PDF import, rescan and analysis by combining `window.fl` (OS access) with `analyzePdf` (extraction). It does not touch the filesystem directly.

## Public interface
None. This is the top of the stack. It reacts to DOM events, `fl.onMenu` (including `pane:side|list|rail`, `layout-reset` and `add-id`), `fl.onOpenFiles` and `fl.onFetchProgress`.

## Dependencies
- **Uses:** preload-bridge (`fl.*`), extraction-core (`analyzePdf`), annotator (`Annot.open/close/mount/key/isOpen/docId`), pdfjs-dist (`pdfjsLib` global, worker at `../node_modules/pdfjs-dist/build/pdf.worker.min.js`), @fontsource (Figtree, Newsreader, Young Serif through CSS `@import`)
- **Used by:** `main.js` loads `splash.html` and `assets/brand/app-icon.png`; annotator calls back into `rescan`, `renderAll`, `renderReader`, `save`, `S` and the DOM helpers (`el`, `svg`, `btn`, `toast`, `copyText`, `plural`, `safeName`)

## Internal structure
```mermaid
graph TD
  html[index.html] --> pdfjs[pdf.min.js] --> pdflib[pdf-lib.min.js] --> core[core.js] --> annot[annotator.js] --> app[app.js]
  html --> css[styles.css]
  app -->|fetches via fl.importPdf path| sample[sample.pdf]
  app -->|brandImg| brand[assets/brand/*.svg]
  html --> brand
  splash[splash.html] --> brand
```

`app.js` sections:
- **state:** `S`, `save()`, lookups `doc()` / `lib()`, `PRE_TOPIC`, `outdated(d)`, `THEMES`, `brandImg(name, cls)`
- **analysis:** `cleanTitle`, `DOI_RE`, `ARXIV_RE`, `pdfDate`, `readMeta(pdf)` (XMP dc/prism → Info dict → DOI/arXiv regex on page 1), `analyzeBytes` (returns `{title, meta, result}`), `loadMeta(d)` (lazy metadata for older docs), `summary`, `addImported(info, target, opts)` (analyses an already-imported PDF and pushes the doc; `opts.origin`, `opts.title` fallback, `opts.sample`), `addPaths` (disk files → `fl.importPdf` → `addImported`), `rescan`, `rescanAll`
- **libraries:** `newLibrary`, `deleteLibrary`, `libraryMenu(id, at?, opts?)`
- **action menu:** `openMenu(at, items, opts)` → Promise of the chosen id or `null` (themed `.amenu` popover; `at` = element (opens below) or `{x,y}`; items `{id,label,icon,hint,danger,disabled,checked,submenu}`, separators and headings; keyboard, type-ahead, submenus, ARIA `menu`/`menuitem(checkbox)`), `closeMenu()`, `MENU` (open menu or `null`), `kbdNav`, `keyHint(k, shift)`, `moreBtn(label)` (⋯ trigger), `menuKey(e, open)` (Shift+F10 / ContextMenu)
- **doc actions:** `removeDoc`, `setMine(d, on)`, `docMenu(d, at?, opts?)` (themed menu with icons; adds Mark as my publication / Remove from My publications, Annotate, Save PDF copy / Save annotated PDF, Discard annotations made here), `moveDoc`, `annotate(d, page?)`, `savePdfCopy(d)`, `useOriginal(d)`, `relink`
- **export:** `wrapHl`, `entryLines`, `groupsOf`, `docText`, `safeName`, `exportDoc`, `exportLibrary`
- **layout:** `PANES` (min/max/default widths), `STRIP`, `READER_MIN`, `layout()` (normalises `settings.layout` in place), `applyLayout()`, `togglePane(k, open?)`, `resetLayout()`, `paneBtn(k)`, `strip(k, label?)`, `resizer(k)`, `syncResizer(h)`, `resizerKey(e, h)`, window `pointerdown`/`dblclick`/`resize` listeners
- **render:** `renderSide`/`themeSwitch`/`navItem`/`go`, `renderList`/`renderDocs`/`visibleDocs`/`renderProgress`, `openDoc`, `renderReader`/`infoEl`/`infoRows`/`fmtDate`/`quoteEl`/`markEl`/`appendHits`/`TOPIC_SOURCE`/`filtered`/`renderBlank`, `renderSearch`/`renderResults`, `renderAll`
- **add from DOI / link:** `addIdBtn(compact)`, `openAddId(prefill?)` (dialog; prefills from the clipboard when parseable), `closeAddId`, `addIdHint` (live `fl.parseId` label + Offline pill from `navigator.onLine`), `addIdBusy`, `addIdFail(reason, landingUrl)` (Open in browser / Add PDFs from file…), `submitAddId` (offline short-circuit → `fl.fetchPdf` → duplicate check by `origin` or `hash` → `addImported`), `fl.onFetchProgress` handler
- **input:** `chooseAndAdd`, `addSample`, window drag/drop (a dropped `text/uri-list` opens the add-from-link dialog), `paste` (parseable text outside inputs opens it), keydown, `fl.onMenu`, `fl.onOpenFiles`, `fl.onTheme`, `boot()` (ends with `fl.ready()`)

## Data & state owned
- `S` (in memory): `db` (the mirror of `faelights.json`), `view` (`{kind: library|all|starred|mine|tag|search, id?, tag?}`), `docId`, `docQuery`, `searchQuery`, `searchLib`, `off` (hidden colour keys), `busy` (progress), `renaming`, `editingTitle`, `jumpTo`, `theme` (a mirror of the main-process theme)
- Doc record fields it writes: `origin` (`{kind: doi|arxiv|pmcid|url, value, url}`, only on docs added by DOI/link, which have `sourcePath: null`), `id, libraryId, title, fileName, sourcePath, storedPath, hash, addedAt, tags[], starred, scannedMtime, scannedAt, meta, result, pages, count, colours[]`, `annotated` (cleared by `useOriginal`; set by annotator), and `mine` (boolean, "My publications"; set by `setMine`)
- `meta` (optional; missing on docs scanned before F-006): `{title, authors[], abstract, publication, volume, issue, pages, date, doi, arxiv, issn, isbn, publisher, url, rights, keywords[], creator, producer, created, modified, pdfVersion}`. Empty fields are omitted; a failed lazy read leaves `{}` in memory only
- Library record: `{id, name, createdAt, system?}`
- `S.db.settings.mode | fmt | sort | layout | info | annotColor` (`info` = boolean, Info card shown; `layout` = `{side,list,rail: {w, closed}}`; `annotColor` written by annotator)

## Files

### `renderer/app.js`
- **Role:** UI controller and view layer
- **Exports:** none (browser script; all functions are globals in the page)
- **Imports (internal):** globals `fl` (preload), `analyzePdf` + `ANALYZER_VERSION` (core.js), `pdfjsLib`
- **Used by:** `index.html`
- **Side effects:** every persistence and OS call goes through `fl.*`. It sets `pdfjsLib.GlobalWorkerOptions.workerSrc`, and registers window `dragenter/dragleave/dragover/drop/keydown/pointerdown/dblclick/resize` listeners. `boot()` appends the sidebar and list `.resizer` handles to `#app`; `renderReader` adds the rail one.
- **Change impact:** export output format (`docText`, `entryLines`) is what users paste into Notion and Obsidian. `ckey()` colour bucketing (rounded to multiples of 24) drives both list swatches and reader colour filters. DB field renames need a migration in `main.js loadDb`.

### `renderer/index.html`
- **Role:** page shell with three mount points `#side`, `#list`, `#reader`, plus `#drop` overlay (with the mote `<picture>`) and `#toast`. It links the light/dark favicons.
- **Side effects:** CSP `default-src 'self'; script-src 'self'; worker-src 'self' blob:` and others. No inline scripts are allowed.
- **Change impact:** script order matters: `pdf.min.js` → `pdf-lib.min.js` → `core.js` → `annotator.js` → `app.js`. `annotator.js` must come before `app.js` because `boot()` can resume between scripts.

### `renderer/styles.css`
- **Role:** all styling. Design tokens on `:root` with a dark override, the three-column grid `.app` sized by `--side-w`/`--list-w` (`.wide` hides the list during search), column handles `.resizer`, collapsed `.strip`s and `*-closed` classes, `.pane-btn`, the reader split `.r-body` → `.rail-pane` + `.r-main` (each scrolls on its own; rail hidden by a `@container` query under 600 px), global `::-webkit-scrollbar` styling, and component classes used by `app.js` (`.amenu*` action menu, `.row-more` ⋯ triggers, `.doc-row` card wrapper, the add-from-link dialog block at the end, `.nav`, `.doc`, `.r-head`, `.group`, `.ex`, `mark.u`/`mark.s`, `.chip`, `.info`/`.info-grid`/`.info-btn`, `.s-hit`, `.toast`, `.drop`…), and the annotator's `.pv*` classes plus a trimmed copy of pdf.js's `.textLayer` rules. `.pg` is now a `button` (page number opens the viewer)
- **Imports:** `@fontsource` CSS from `../node_modules/…`
- **Change impact:** class names are string-coupled to `el(tag, cls)` calls in `app.js`. Highlight colour reaches CSS as the `--mc` custom property (`"r g b"`).

### `renderer/splash.html`
- **Role:** static splash page: a `<picture>` of the animated lockup `splash-light|dark.svg` (dots appear, mote blooms, wordmark writes in by ~2.2 s, then fades out from 2.9 s) + "Gathering your highlights…". Its tokens are inline and follow `prefers-color-scheme`. It has no script.
- **Used by:** `main.js createSplash()`
- **Change impact:** the colours duplicate `styles.css` `--bg/--ink/--muted` and `main.js themeBg()`.

### `renderer/assets/brand/`
- **Role:** brand files: `mark-light|dark.svg` (ring of dots + mote with pulsing halo), `splash-light|dark.svg` (animated mark + outlined wordmark lockup, 1176×303), `mote-light|dark.svg` (dot), `favicon-light|dark.ico`, and `app-icon.png` (256 px window icon, rendered from `mark-dark.svg` on a `#1F1C2A` tile)
- **Used by:** `app.js brandImg()` (sidebar mark, empty-state mote), `index.html` (drop overlay, favicons), `splash.html`, `main.js ICON`
- **Change impact:** the SVGs carry their own CSS animation, which honours `prefers-reduced-motion`.

### `renderer/sample.pdf`
- **Role:** demo document added by "Try a sample PDF" (`addSample` → `addPaths([path], {sample:true})`). It is stored with `sourcePath: null`, so it never goes stale.

## Gotchas
- Saves are debounced by 250 ms and send the entire DB, including every `result`, over IPC on each change.
- `process_platform()` sniffs `navigator.userAgent` for "Mac", because `process` isn't available in the sandbox.
- `addPaths` matches existing docs by exact `sourcePath`. A PDF already in the library is rescanned instead of duplicated.
- On first import `addPaths` reads the stored copy (`sourcePath: null`), not the original.
- `openDoc` auto-rescans only when `d.stale && d.sourcePath`.
- `go()` resets `docId` to the first visible doc when the current one isn't in the new view.
- In the search view, the mode toggle calls `renderReader()`, which re-routes to `renderSearch`. Results are capped at 50 per doc.
- Pressing Delete with the list focused removes the selected doc (after a confirm). The handler ignores keys typed in inputs, selects and textareas.
- `openDoc` also rescans quietly when `outdated(d)` (result from an older `ANALYZER_VERSION`) and toasts "Topics refreshed".
- Extracts before the first topic are labelled `PRE_TOPIC` ("Abstract") in the reader, the topics rail and exports.
- The theme switch (sidebar footer, a `role=radiogroup` of three icon buttons) only asks main to change the theme. The page reacts through `prefers-color-scheme`; `S.theme` just marks which icon is `aria-checked`.
- A closed pane keeps its DOM; CSS hides every child except `.strip`, so toggling never re-renders or loses scroll position. Each pane renderer must append its `strip()` as a direct child.
- `layout()` must mutate the pane objects in place: the drag handler holds a reference to `layout()[k]` across `applyLayout()` calls.
- Drag handlers filter by `pointerId`, so stray events from another pointer don't end a drag.
- Shortcuts Ctrl+B / Ctrl+Shift+B / Ctrl+Alt+B come from the main menu, not a renderer keydown; `PANES[k].key` only labels tooltips.
- The Info card (`infoEl`) is the first child of `.r-main` when `settings.info` is on. If `d.meta` is missing it calls `loadMeta(d)`, which reads the stored copy (not the original), then re-renders only if that doc is still open. `loadMeta.busy` guards against re-entry from repeated renders.
- Info links (DOI, arXiv, URL) are `target=_blank` and leave the app through `main.js setWindowOpenHandler` → `shell.openExternal`. Double-clicking a value copies it.
- `addSample` turns the `file:` URL into a path and strips the leading `/` for Windows drive letters.
- While the annotator is open, `renderReader()` re-mounts it instead of rebuilding the reader, and closes it once its doc is no longer the current, visible one (search view, another doc, filtered out). The window keydown handler offers keys to `Annot.key(e)` first, so Delete and ↑↓/J/K don't remove or switch docs while annotating.
- Docs with `annotated: true` show an "Annotated" pill in the list.
- Library rows are an `<li>` wrapping the nav `<button>` and a sibling ⋯ (`.row-more`); the `<li>` is the drop target. PDF cards are a `div.doc-row` wrapping `button.doc` and its ⋯, because buttons can't nest. Drag, click and `aria-current` stay on the inner button.
- `openMenu` swallows the click that follows a pointerdown on the open menu's own trigger (`openMenu.skip`, 600 ms), so clicking ⋯ again closes it.
- `docMenu` / `libraryMenu` with no anchor open below `document.activeElement` (the reader's ⋯ button relies on this).
- Shortcut hints in menus are shown only on the current doc or library, where the main-menu accelerator actually applies.
- `addImported` uses `opts.title` (the landing page's `citation_title`) only when the PDF itself yields no title.
- Ctrl/⌘+V and link drops call `fl.parseId` over IPC before opening the dialog; text pasted into inputs is left alone.
