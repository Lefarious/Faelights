# Module: preload-bridge
> Path: src/preload.js · Last synced commit: 736ffd2 · Related features: F-003, F-004, F-007, F-011, F-014, F-016

## Purpose
This is the only channel between the sandboxed renderer and the main process. It exposes `window.fl` with one thin wrapper per IPC channel and holds no logic of its own, apart from `pathFor`.

## Public interface (`window.fl`)
| Method | IPC channel |
|---|---|
| `loadDb()` / `saveDb(db)` / `pendingFiles()` | `db:load` / `db:save` / `app:pending` |
| `ready()` | `app:ready` (send, no reply) |
| `getTheme()` / `setTheme(t)` | `theme:get` / `theme:set` |
| `choosePdfs()` / `importPdf(p)` / `readPdf(doc)` / `statPdf(p)` | `pdf:choose` / `pdf:import` / `pdf:read` / `pdf:stat` |
| `openPdf(doc)` / `revealPdf(doc)` / `relinkPdf(doc)` / `removeStored(p)` | `pdf:open` / `pdf:reveal` / `pdf:relink` / `pdf:removeStored` |
| `writeStored(storedPath, bytes)` / `savePdfAs(name, bytes)` | `pdf:writeStored` / `pdf:saveAs` |
| `exportFile(name, text)` / `exportFolder(folderName, files, assets?)` / `exportBundle(name, text, assets, {dirToken, encode})` / `openFolder(p)` | `export:file` / `export:folder` / `export:bundle` / `export:openFolder` |
| `copy(text)` / `copyImage(pngBytes)` / `popup(items)` / `confirm(message, detail, ok)` | `clip:write` / `clip:image` / `menu:popup` (unused since F-010) / `ask:confirm` |
| `lookupMeta({doi, arxiv, origin})` | `meta:lookup` |
| `parseId(text)` / `parseIds(text)` / `fetchPdf(text)` / `cancelFetch()` | `id:parse` / `id:parseMany` / `pdf:fetch` / `pdf:fetchCancel` |
| `openExternal(url)` / `readClipboardText()` | `app:openExternal` / `clip:read` |
| `pathFor(file)` | none: `webUtils.getPathForFile`, falling back to `file.path` |
| `onMenu(fn)` / `onOpenFiles(fn)` / `onTheme(fn)` / `onFetchProgress(fn)` | listens on `menu` / `open-files` / `theme` / `fetch-progress` |

## Dependencies
- **Uses:** electron `contextBridge`, `ipcRenderer`, `webUtils`
- **Used by:** renderer-ui (`app.js`, `images.js`) and annotator (`annotator.js`), as the global `fl`
- **Talks to:** main-process

## Files

### `src/preload.js`
- **Role:** the `contextBridge` API definition
- **Exports:** `window.fl` (through `exposeInMainWorld`)
- **Used by:** `main.js` (`webPreferences.preload`); `app.js` calls it
- **Side effects:** registers `ipcRenderer.on` listeners when `onMenu` / `onOpenFiles` are called
- **Change impact:** any rename here must also be made in `app.js` call sites. There are no types, so a mismatch fails only at runtime.

## Gotchas
- The window runs with `sandbox: true`, so this preload can only `require("electron")` and a small set of built-ins.
- `onMenu` / `onOpenFiles` / `onTheme` never unsubscribe. Calling them twice registers duplicate handlers. `app.js` calls each once at load.
