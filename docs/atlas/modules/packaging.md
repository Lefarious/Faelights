# Module: packaging
> Path: package.json, .github/workflows/build.yml · Last synced commit: b146661 · Related features: F-001, F-003, F-007, F-008, F-012, F-018, F-021

## Purpose
This module covers dependency declarations, npm scripts, the electron-builder configuration and the CI release workflow. It decides which files ship inside the installed app.

## Public interface
- `npm start` runs `electron .`
- `npm test` runs `node --test "test/**/*.test.js"` (the glob needs Node 21 or newer; see [tests](tests.md))
- `npm run dist:win | dist:mac | dist:linux` runs `electron-builder` for that platform
- CI builds all three when a `v*` tag is pushed (or on manual dispatch) and uploads `.exe/.zip/.dmg/.AppImage` as run artifacts. It does not publish them.

## Dependencies
- **Runtime:** `pdfjs-dist` pinned to `3.11.174`, `pdf-lib` pinned to `1.17.1`, `@fontsource/figtree`, `@fontsource/newsreader`, `@fontsource/young-serif`
- **Dev:** `electron ^31`, `electron-builder ^24.13.3`
- **Used by:** every other module at package time

## Files

### `build/icon.png`
- **Role:** 1024 px app icon: `renderer/assets/brand/mark-dark.svg` on a rounded `#1F1C2A` tile (~2% transparent margin) with transparent corners and the halo frozen at mid-glow. Source for the mac/linux icons.

### `build/icon.ico`
- **Role:** Windows build icon (`build.win.icon`): the same tile as separate 16/20/24/32/40/48/64/128/256 px PNG frames, so the taskbar and Explorer pick a sharp frame instead of scaling one image.


### `package.json`
- **Role:** manifest and electron-builder config (`build` key)
- **Key config:** `main: src/main.js`; `build.files` ships `src/**`, `renderer/**`, only `pdf.min.js` and `pdf.worker.min.js` from pdfjs-dist, `pdf-lib/dist/pdf-lib.min.js`, and `@fontsource/**`. `npmRebuild: false` (no native modules are shipped; pdfjs-dist's optional `canvas` would otherwise be recompiled for Electron and fail). It registers a `.pdf` file association (role Viewer). Targets: win nsis+zip (`signAndEditExecutable: false`, so `build.afterPack` → `scripts/set-exe-icon.js` writes the icon instead), mac dmg, linux AppImage. Output goes to `dist/`.
- **Note:** `renderer/**` already ships `splash.html` and `assets/brand/*`, so no config change is needed for them.
- **Change impact:** a new runtime file under `node_modules` that the renderer references must be added to `build.files`, otherwise it works in `npm start` but is missing from installers.

### `scripts/set-exe-icon.js`
- **Role:** electron-builder `afterPack` hook; on win32 runs `rcedit` (devDependency) to write `build/icon.ico` into `<appOutDir>/<productFilename>.exe`, which the Start menu / desktop shortcuts and the installed exe show
- **Imports:** `path`, `rcedit`
- **Used by:** `package.json` `build.afterPack`

### `.github/workflows/build.yml`
- **Role:** matrix build on windows-latest, macos-latest and ubuntu-latest with Node 22
- **Steps:** checkout → setup-node (npm cache) → `npm ci` → `npm test` → on tags, fail unless the tag equals `v` + `package.json` version → `npm run <script> -- --publish never` → upload-artifact (7 days, 90 on tags; fails if no files) → on tag refs only, `softprops/action-gh-release@v2` with `draft: true` attaches the same `.exe/.zip/.dmg/.AppImage` files to a draft release for that tag
- **Matrix:** `fail-fast: false`, so each platform finishes even if another fails
- **Permissions:** `contents: write` (needed to create the release)
- **Triggers:** `push` to `main`, `pull_request`, `push` of tags `v*`, `workflow_dispatch`; only tag runs create a release. `concurrency` cancels an older run on the same branch, never a tag run

## Gotchas
- Windows uses `build/icon.ico` (`build.win.icon`); mac/linux use `build/icon.png`. The runtime window icon is a separate copy in `renderer/assets/brand/` (`app-icon.ico`/`.png`); regenerate both sets together, keeping the tile margin small (~2%) or the taskbar icon looks smaller than other apps'.
- The pdfjs-dist version is pinned exactly, and `core.js` relies on its annotation object shape.
- There are no code signing or notarisation steps.
