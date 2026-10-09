# Module: packaging
> Path: package.json, .github/workflows/build.yml · Last synced commit: 5a2c5e0 · Related features: F-001, F-003

## Purpose
This module covers dependency declarations, npm scripts, the electron-builder configuration and the CI release workflow. It decides which files ship inside the installed app.

## Public interface
- `npm start` runs `electron .`
- `npm run dist:win | dist:mac | dist:linux` runs `electron-builder` for that platform
- CI builds all three when a `v*` tag is pushed (or on manual dispatch) and uploads `.exe/.zip/.dmg/.AppImage` as run artifacts. It does not publish them.

## Dependencies
- **Runtime:** `pdfjs-dist` pinned to `3.11.174`, `@fontsource/figtree`, `@fontsource/newsreader`, `@fontsource/young-serif`
- **Dev:** `electron ^31`, `electron-builder ^24.13.3`
- **Used by:** every other module at package time

## Files

### `build/icon.png`
- **Role:** 1024 px app icon: `renderer/assets/brand/mark-dark.svg` on a rounded `#1F1C2A` tile with transparent corners and the halo frozen at mid-glow. It is the source for `.ico`/`.icns`.


### `package.json`
- **Role:** manifest and electron-builder config (`build` key)
- **Key config:** `main: src/main.js`; `build.files` ships `src/**`, `renderer/**`, only `pdf.min.js` and `pdf.worker.min.js` from pdfjs-dist, and `@fontsource/**`. It registers a `.pdf` file association (role Viewer). Targets: win nsis+zip (`signAndEditExecutable: false`), mac dmg, linux AppImage. Output goes to `dist/`.
- **Note:** `renderer/**` already ships `splash.html` and `assets/brand/*`, so no config change is needed for them.
- **Change impact:** a new runtime file under `node_modules` that the renderer references must be added to `build.files`, otherwise it works in `npm start` but is missing from installers.

### `.github/workflows/build.yml`
- **Role:** matrix build on windows-latest, macos-latest and ubuntu-latest with Node 20
- **Steps:** checkout → setup-node → `npm ci || npm install` → `npm run <script> -- --publish never` → upload-artifact

## Gotchas
- `build/icon.png` is the single icon source for win/mac/linux (`directories.buildResources: build`). electron-builder converts it to `.ico`/`.icns`.
- The pdfjs-dist version is pinned exactly, and `core.js` relies on its annotation object shape.
- There are no code signing or notarisation steps.
