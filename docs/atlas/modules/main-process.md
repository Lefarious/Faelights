# Module: main-process
> Path: src/main.js · Last synced commit: 312784a · Related features: F-001, F-003, F-004, F-005

## Purpose
This is the Electron main process. It owns the on-disk library (`faelights.json` plus copied PDFs), the splash and main windows, the theme, the native app menu, native dialogs, context-menu popups, shell actions and the clipboard. It does not parse PDFs or hold UI state. The renderer sends the whole DB object and this module persists it as-is.

## Public interface
IPC handlers, called only through `preload.js`:
- `db:load` → DB object with transient `sourceMissing` / `stale` flags set on each doc
- `db:save(db)` → `true` once the write is queued
- `app:pending` → drains `pendingOpen` paths
- `pdf:choose` → multi-select open dialog → `string[]`
- `pdf:import(srcPath)` → copies into `files/`, returns `{id, hash, fileName, sourcePath, storedPath, mtime, size}`
- `pdf:read(doc)` → `{bytes: Uint8Array, mtime, from: "source"|"copy"}`
- `pdf:stat(path)` → `{mtime}|null` (exposed but not called by the renderer)
- `pdf:open(doc)` / `pdf:reveal(doc)`: `shell.openPath` / `showItemInFolder`, preferring the original file and falling back to the stored copy
- `pdf:relink(doc)` → chosen path or `null`
- `pdf:removeStored(storedPath)` → unlinks the file only if it is inside `FILES_DIR`
- `export:file({name, text})`, `export:folder({folderName, files})`, `export:openFolder(path)`
- `clip:write(text)`, `menu:popup(items)` → chosen item id, `ask:confirm({message, detail, ok})` → boolean
- `theme:get` → `"system"|"light"|"dark"`; `theme:set(t)` → applies and returns the theme
- `app:ready` (one-way `ipcMain.on`) → `revealMain()`

Pushes to the renderer: `menu` (channel strings; View menu adds `pane:side`, `pane:list`, `pane:rail`, `layout-reset`), `open-files` (path arrays) and `theme`.

## Dependencies
- **Uses:** electron (`app`, `BrowserWindow`, `ipcMain`, `dialog`, `shell`, `Menu`, `clipboard`, `nativeTheme`), node `fs`, `path`, `crypto`
- **Used by:** preload-bridge (all channels)
- **Loads:** `src/preload.js`, `renderer/index.html`, `renderer/splash.html`, `renderer/assets/brand/app-icon.png` (window icon)

## Data & state owned
- `app.getPath("userData")/library/faelights.json` is the single JSON DB `{version:1, libraries[], docs[], settings{mode,fmt,sort}}`
- `…/library/files/<docId>.pdf` holds the copied PDFs
- `app.getPath("userData")/theme.json` holds `{theme}`. It sits outside `library/` and is read synchronously at startup.
- `…/faelights.json.tmp` is the atomic write temp file, and `…/faelights.json.broken-<ts>` is a backup of an unparseable DB
- In memory: `win`, `splash`, `splashShownAt`, `pendingOpen[]`, `writeChain` (a serialised promise chain of saves), and `nativeTheme.themeSource`

## Files

### `src/main.js`
- **Role:** the entire main process
- **Exports:** none (CommonJS entry)
- **Key functions:** `loadDb()`, `saveDb(db)`, `statOrNull(p)`, `createSplash()`, `revealMain()`, `createWindow()`, `themeBg()`, `loadTheme()`, `applyTheme(t)`, `pdfArgs(argv)`, `buildAppMenu()`, `EMPTY_DB()`, path helpers `DATA_DIR()`, `DB_PATH()`, `FILES_DIR()`, `THEME_PATH()`; constants `ICON`, `THEMES`, `SPLASH_MIN_MS`, `SPLASH_MAX_MS`
- **Imports (internal):** none (loads `preload.js` and `index.html` by path)
- **Used by:** Electron runtime (`package.json` `"main"`); renderer through preload
- **Side effects:** reads and writes the files above; opens dialogs; `shell.openExternal` for http(s) links (in-window navigation away from `file:` is blocked); sets the application menu; takes the single-instance lock
- **Change impact:** renaming an IPC channel breaks `preload.js`. Changing the DB shape affects every `S.db` reader in `app.js` and existing user data, and there is no migration besides the `loadDb` repair. Changing menu `send("…")` strings breaks the `fl.onMenu` handler in `app.js`.

## Gotchas
- `saveDb` swallows errors (`console.error` only). The renderer always sees `true`.
- `db:load` writes `sourceMissing` / `stale` onto docs, and these get persisted on the next `db:save`. They are recomputed at every load.
- `pdf:read` silently overwrites the stored copy when the original is more than 1 s newer than `scannedMtime`.
- `pdf:removeStored` compares `path.dirname(storedPath) === FILES_DIR()` as a string. A path stored with different casing or separators would not be deleted.
- `menu:popup` resolves on the popup's close callback through `setTimeout(…, 0)` so that the click handler runs first.
- On macOS, an `open-file` event before the window loads is queued in `pendingOpen`. After that it is sent straight away as `open-files`.
- `themeBg()` hard-codes the same hex values as the `--bg` tokens in `styles.css` and `splash.html`.
- The main window starts hidden and is shown only by `revealMain()`, on `app:ready` or the 8 s fallback timer. A renderer crash before `fl.ready()` therefore means an 8 s wait.
- `applyTheme()` rebuilds the whole application menu so the View → Theme radio items stay in sync.
- The theme is applied before `createSplash()`, so the splash already uses the saved choice.
