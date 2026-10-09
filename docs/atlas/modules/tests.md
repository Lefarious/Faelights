# Module: tests
> Path: test/ · Last synced commit: c5c0dbe · Related features: F-011, F-012

## Purpose
Automated checks run with Node's built-in `node:test` and `node:assert`, with no extra dependencies. They cover the pure parts of the app that load in plain Node: extraction (`core.js`) and the DOI/arXiv/link helpers (`src/identify.js`). They do not launch Electron or exercise the UI.

## Public interface
- `npm test` → `node --test "test/**/*.test.js"`. Any `*.test.js` under `test/` is picked up automatically, and files in `test/helpers/` are not run as tests.

## Dependencies
- **Uses:** extraction-core (`require("../renderer/core.js")` → `analyzePdf`, `ANALYZER_VERSION`), main-process (`require("../src/identify")`), pdfjs-dist 3.11.174 legacy build (`pdfjs-dist/legacy/build/pdf.js`)
- **Used by:** developers / CI (not wired into `.github/workflows/build.yml` yet)

## Data & state owned
Reads `renderer/sample.pdf`. Writes nothing.

## Files

### `test/core.test.js`
- **Role:** snapshot tests of `analyzePdf` on `renderer/sample.pdf`: 2 pages, 8 marks, 7 entries, 0 loose, 5 font-size-heading topics, exact entries (page, topic, span colour/text/note, sentence), entry shape, reading order, known phrases, `v === ANALYZER_VERSION`, progress callback calls
- **Imports (internal):** `test/helpers/pdf.js`, `renderer/core.js`
- **Change impact:** any intentional change to extraction output must update the snapshot here (and bump `ANALYZER_VERSION`).

### `test/identify.test.js`
- **Role:** unit tests for `parseIdentifier` (accepted and rejected forms, trimming), `findPdfLink`, `isPdf`, `fileNameFor` and `fetchFailureReason` (offline vs network mapping)
- **Imports (internal):** `src/identify.js`

### `test/helpers/pdf.js`
- **Role:** loads a PDF in Node with the pdfjs-dist legacy build (font faces off; hides the optional `canvas` warning while loading)
- **Exports:** `loadPdf(pathOrBytes)`, `withPdf(file, fn)` (closes the document afterwards), `repoPath(...)`, `pdfjs`
- **Used by:** `test/core.test.js`

### `test/README.md`
- **Role:** how to run tests, add a test and update the snapshot.

## Gotchas
- The `npm test` glob needs Node 21 or newer. `node --test test/` (a bare directory) does not run the suites on Node 26.
- `sample.pdf` only covers Highlight marks and font-size headings. Underline/Squiggly/StrikeOut, outline and wording-based topics, and loose marks are untested.
- No test touches the network; fetch logic in `main.js` (`fetchUrl`, `resolvePdf`) is only covered through its pure helpers.
