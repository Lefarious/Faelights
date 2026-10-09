# Module: tests
> Path: test/ · Last synced commit: 736ffd2 · Related features: F-011, F-012, F-014, F-015, F-016, F-020

## Purpose
Automated checks run with Node's built-in `node:test` and `node:assert`, with no extra dependencies. They cover the pure parts of the app that load in plain Node: extraction (`core.js`, incl. image boxes), identifier parsing (`src/identify.js`), reader ordering (`renderer/order.js`), export formatting (`renderer/exportfmt.js`) and export path safety (`src/exportPaths.js`). They do not launch Electron or exercise the UI.

## Public interface
- `npm test` → `node --test "test/**/*.test.js"`. Any `*.test.js` under `test/` is picked up automatically, and files in `test/helpers/` are not run as tests.

## Dependencies
- **Uses:** extraction-core (`require("../renderer/core.js")` → `analyzePdf`, `ANALYZER_VERSION`, `imgStreamAt`, `imgSnapToFacts`), main-process (`require("../src/identify")`, `require("../src/exportPaths")`), renderer-ui (`renderer/order.js`, `renderer/exportfmt.js`), pdf-lib (fixture script only), pdfjs-dist 3.11.174 legacy build (`pdfjs-dist/legacy/build/pdf.js`)
- **Used by:** developers / CI (not wired into `.github/workflows/build.yml` yet)

## Data & state owned
Reads `renderer/sample.pdf` and `test/fixtures/images.pdf`. Writes nothing (the fixture script writes `images.pdf` when run by hand).

## Files

### `test/core.test.js`
- **Role:** snapshot tests of `analyzePdf` on `renderer/sample.pdf`: 2 pages, 8 marks, 7 entries, 0 loose, 5 font-size-heading topics, exact entries (page, topic, span colour/text/note, sentence), entry shape, reading order, known phrases, `v === ANALYZER_VERSION`, progress callback calls
- **Imports (internal):** `test/helpers/pdf.js`, `renderer/core.js`
- **Change impact:** any intentional change to extraction output must update the snapshot here (and bump `ANALYZER_VERSION`).

### `test/identify.test.js`
- **Role:** unit tests for `parseIdentifier` (accepted and rejected forms incl. ISBN-10/13 checksums, PMID forms, ADS bibcodes and URLs, trimming), `parseIdentifiers` (batch splitting, de-dupe), `findPdfLink`, `isPdf`, `fileNameFor` and `fetchFailureReason` (offline vs network mapping)
- **Imports (internal):** `src/identify.js`

### `test/metadata.test.js`
- **Role:** unit tests for `lookupTarget` (DOI vs arXiv vs arXiv DOI, origin precedence), `fromCrossref` (full record, partial dates, subtitles, inline JATS tags) and `fromArxivAtom` (entry mapping, error entry → null) on inline fixtures; no network
- **Imports (internal):** `src/metadata.js`

### `test/images.test.js`
- **Role:** image boxes on `test/fixtures/images.pdf` (6 Squares, 2 pages): count, ids, `n`, page, normalised rect, colour, trimmed comment, sort order, the before-the-fact rule against entry `at`s, topics; `sample.pdf` → `images: []`; unit tests of `imgStreamAt` fallbacks and `imgSnapToFacts`
- **Imports (internal):** `test/helpers/pdf.js`, `renderer/core.js`

### `test/reader-images.test.js`
- **Role:** `Order.withImages` / `groupItems` / `filterImages` / `imagesOf` / `ckey`: ties go before the entry, between/before/after, image-only groups, same groups as `groupsOf` without images, colour filtering
- **Imports (internal):** `renderer/order.js`

### `test/export.test.js`
- **Role:** `exportPaths` validation (traversal, absolute/UNC/drive, reserved names and characters, duplicates, size); `ExportFmt` image placement, md link encoding, Obsidian embeds, plain lines, copy placeholder, HTML escaping and `data:`-only images; md/obsidian/plain output without images identical to the pre-F-016 `docText`
- **Imports (internal):** `src/exportPaths.js`, `renderer/exportfmt.js`

### `test/fixtures/make-images-pdf.js` · `test/fixtures/images.pdf`
- **Role:** pdf-lib script (not a test; run `node test/fixtures/make-images-pdf.js`) that writes the image-box fixture deterministically (fixed dates), and the committed output

### `test/helpers/pdf.js`
- **Role:** loads a PDF in Node with the pdfjs-dist legacy build (font faces off; hides the optional `canvas` warning while loading)
- **Exports:** `loadPdf(pathOrBytes)`, `withPdf(file, fn)` (closes the document afterwards), `repoPath(...)`, `pdfjs`
- **Used by:** `test/core.test.js`, `test/images.test.js`

### `test/README.md`
- **Role:** how to run tests, add a test and update the snapshot.

## Gotchas
- The `npm test` glob needs Node 21 or newer. `node --test test/` (a bare directory) does not run the suites on Node 26.
- `sample.pdf` only covers Highlight marks and font-size headings. Underline/Squiggly/StrikeOut, outline and wording-based topics, and loose marks are untested.
- No test touches the network; fetch logic in `main.js` (`fetchUrl`, `resolvePdf`) is only covered through its pure helpers.
