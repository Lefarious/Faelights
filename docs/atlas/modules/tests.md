# Module: tests
> Path: test/ · Last synced commit: 9ff7a30 · Related features: F-011, F-012, F-014, F-015, F-016, F-020, F-022, F-023, F-024, F-025

## Purpose
Automated checks run with Node's built-in `node:test` and `node:assert`, with no extra dependencies. They cover everything that loads in plain Node: core/ (extraction incl. image boxes, topics, reading order, export formatting, the library store with its lock, identifier parsing, CrossRef/arXiv mapping, paper resolving and the Node transport against a local server), the guided tour's step data (`renderer/tour.js`), export path safety (`src/exportPaths.js`) and the `faelights` CLI as a child process on a temp library. They do not launch Electron or exercise the UI, and nothing touches the network.

## Public interface
- `npm test` → `node --test "test/**/*.test.js"`. Any `*.test.js` under `test/` is picked up automatically, and files in `test/helpers/` are not run as tests.

## Dependencies
- **Uses:** core (`extract`, `topics`, `meta`, `order`, `export`, `library`, `identify`, `metadata`, `fetch`), main-process (`src/exportPaths.js`), renderer-ui (`renderer/tour.js`), cli (`cli/faelights.js`, spawned with `process.execPath`), pdf-lib (`helpers/annotate.js`, fixture script), pdfjs-dist 3.11.174 legacy build (through `core/extract.js loadPdfjs`), `node:http` (local server in `core/fetch.test.js`)
- **Used by:** developers and CI (`npm test` in `.github/workflows/build.yml`)

## Data & state owned
Reads `renderer/sample.pdf` and `test/fixtures/images.pdf`. `core/library.test.js` and `cli.test.js` write only inside their own `os.tmpdir()` folders (`faelights-*`), removed afterwards; never the real library. The fixture script writes `images.pdf` when run by hand.

## Files

### `test/core.test.js`
- **Role:** snapshot tests of `analyzePdf` on `renderer/sample.pdf`: 2 pages, 8 marks, 7 entries, 0 loose, 5 font-size-heading topics, exact entries (page, topic, span colour/text/note, sentence), entry shape, reading order, known phrases, `v === ANALYZER_VERSION`, progress callback calls
- **Imports (internal):** `test/helpers/pdf.js`, `core/extract.js`
- **Change impact:** any intentional change to extraction output must update the snapshot here (and bump `ANALYZER_VERSION`).

### `test/tour.test.js`
- **Role:** unit tests for `renderer/tour.js`: fresh/older DBs have nothing seen, per-step `markShown` / `pending`, the no-extracts case (extract tips stay pending, then `ready` once they appear), `skipAll`, Show Tour reset, unique step ids, `nextIndex` / `progress` skipping, and that every `data-tour` hook and class/id the steps target still appears in `app.js` / `annotator.js` source
- **Imports (internal):** `renderer/tour.js`; reads `renderer/app.js`, `renderer/annotator.js` as text

### `test/identify.test.js`
- **Role:** unit tests for `parseIdentifier` (accepted and rejected forms incl. ISBN-10/13 checksums, PMID forms, ADS bibcodes and URLs, trimming), `parseIdentifiers` (batch splitting, de-dupe), `findPdfLink`, `isPdf`, `fileNameFor` and `fetchFailureReason` (offline / unreachable / network by error code and host); long and messy pastes (CRLF, tabs, NBSP, zero-width, soft hyphen, 6000-char link, prose with a DOI, 60 ids, 100000-char cut) and a < 200 ms timing guard
- **Imports (internal):** `core/identify.js`

### `test/metadata.test.js`
- **Role:** unit tests for `lookupTarget` (DOI vs arXiv vs arXiv DOI, origin precedence), `fromCrossref` (full record, partial dates, subtitles, inline JATS tags) and `fromArxivAtom` (entry mapping, error entry → null) on inline fixtures; no network
- **Imports (internal):** `core/metadata.js`

### `test/images.test.js`
- **Role:** image boxes on `test/fixtures/images.pdf` (6 Squares, 2 pages): count, ids, `n`, page, normalised rect, colour, trimmed comment, sort order, the before-the-fact rule against entry `at`s, topics; `sample.pdf` → `images: []`; unit tests of `imgStreamAt` fallbacks and `imgSnapToFacts`
- **Imports (internal):** `test/helpers/pdf.js`, `core/extract.js`

### `test/reader-images.test.js`
- **Role:** `Order.withImages` / `groupItems` / `filterImages` / `imagesOf` / `ckey`: ties go before the entry, between/before/after, image-only groups, same groups as `groupsOf` without images, colour filtering
- **Imports (internal):** `core/order.js`

### `test/continue-reading.test.js`
- **Role:** `Annot.startPage`: an explicit page wins, else `d.lastPage`, else page 1 for 0 / undefined / invalid
- **Imports (internal):** loads `renderer/annotator.js` in a Node `vm` with stub `PDFLib` / `addEventListener`

### `test/search-scope.test.js`
- **Role:** search scopes in `renderer/app.js`: `searchDocs` / `validScope` (This PDF matches only the open PDF; a removed PDF or library falls back to all), `entryScope` (library view → that library unless picked; explicit scope wins), "Search this library" hits
- **Imports (internal):** copies the functions out of `renderer/app.js`'s source text (no DOM)

### `test/export.test.js`
- **Role:** `exportPaths` validation (traversal, absolute/UNC/drive, reserved names and characters, duplicates, size); `ExportFmt` image placement, md link encoding, Obsidian embeds, plain lines, copy placeholder, HTML escaping and `data:`-only images; md/obsidian/plain output without images identical to the pre-F-016 `docText`
- **Imports (internal):** `src/exportPaths.js`, `core/export.js`

### `test/core/extract.test.js`
- **Role:** `core/extract.js` in plain Node: no DOM/canvas, path vs bytes give the same result, progress, reading order, `highlights()` rows, Underline/Squiggly/StrikeOut among highlights, loose marks, `normQuads` forms; sentence splitting (after quotes/brackets, `no.`, `et al.`, `etc.`, `vitamin C.`; a mark starting on the previous `. `; one extract for a mark across two sentences, `e.g.`, `Fig. 3`, `No. 5`, `3.5`, `J. Smith`, `J. A. Smith`)
- **Imports (internal):** `test/helpers/pdf.js`, `test/helpers/annotate.js`, `test/helpers/textpdf.js`, `core/extract.js`

### `test/core/topics.test.js`
- **Role:** topic precedence (bookmarks → font-size headings → wording → pages), grouping of extracts, `topicAt`, wording fallback dropping captions and running headers
- **Imports (internal):** `test/helpers/annotate.js`, `core/extract.js`, `core/topics.js`

### `test/core/export.test.js`
- **Role:** `core/export.js` on real extraction output: md/obsidian/plain/html, full vs only modes, YAML frontmatter, all facts in reading order, escaped HTML, loose-mark summary, `extOf`
- **Imports (internal):** `core/extract.js`, `core/export.js`

### `test/core/library.test.js`
- **Role:** `core/library.js`: `userDataDir` per platform and `FAELIGHTS_DATA_DIR`, empty library with Inbox, atomic saves, lock waiting / stale lock clearing, `update()` read-modify-write within and across processes, refusing to overwrite an unreadable file, tags / stars / libraries, read flag, `lastPage`, tag colours, `normalize` filling them on older files
- **Imports (internal):** `core/library.js`; spawns `node` children for the cross-process cases

### `test/core/fetch.test.js`
- **Role:** `core/fetch.js` offline: `nodeGet` against a local `http` server (redirects, cookie carried through a sign-in bounce, 404/403/500, size cap, redirect loop, non-http URL, refused port → `unreachable`, aborted signal → `cancelled`); a stubbed global `fetch` failing DNS (mistyped link → `unreachable` when doi.org answers, `offline` when nothing resolves; DOI → `offline` after one request); `resolver` with a fake transport (arXiv `citation_pdf_url`, DOI → CrossRef `link[]` fallback, `paywalled`, offline stops at once, PMC bucket / Europe PMC / PMC fallbacks, PMID → idconv → PMC sources, `no-free-copy` / `not-found`); `lookupMeta` CrossRef / `invalid` / `not-found`
- **Imports (internal):** `core/fetch.js`

### `test/cli.test.js`
- **Role:** `cli/faelights.js` run as a child process: `extract` equals `ExportFmt.docText`, json rows equal `Extract.highlights`, html/obsidian/only/`--out`, usage errors exit 2; on a temp `--data-dir`: add/list/libraries/export, re-add rescans, library new/rename/delete, move, tag/untag/tags, star/unstar and filters, info, text (`--pages`, file path), rescan, remove (`--force` for annotated), search (words, notes, topics, md marks), theme (`theme.json`), tour skip/restart (`settings.tour`); `core/meta.js` `readMeta` / `cleanTitle` / `DOI_RE`
- **Imports (internal):** `test/helpers/pdf.js`, `core/extract.js`, `core/export.js`, `core/meta.js`, `renderer/tour.js`
- **Change impact:** CLI wording asserted here (messages, `--json` shapes) is a contract for scripts.

### `test/helpers/annotate.js`
- **Role:** adds markup annotations (`Underline`, `StrikeOut`, `Squiggly`, `Highlight` by `find` text or `rect`) and bookmarks to a PDF in memory with pdf-lib → bytes
- **Exports:** `annotate(pathOrBytes, {marks, outline})`
- **Used by:** `test/core/extract.test.js`, `test/core/topics.test.js`

### `test/fixtures/make-images-pdf.js` · `test/fixtures/images.pdf`
- **Role:** pdf-lib script (not a test; run `node test/fixtures/make-images-pdf.js`) that writes the image-box fixture deterministically (fixed dates), and the committed output

### `test/helpers/textpdf.js`
- **Role:** builds a one-page PDF from lines of text with pdf-lib (Helvetica, one pdf.js text item per line) and saves it to a temp file, for sentence tests
- **Exports:** `textPdf(lines, {size})` → temp file path
- **Used by:** `test/core/extract.test.js`

### `test/helpers/pdf.js`
- **Role:** loads a PDF in Node through `core/extract.js openPdf` (the same path scripts use)
- **Exports:** `loadPdf(pathOrBytes)`, `withPdf(file, fn)` (closes the document afterwards), `repoPath(...)`, `pdfjs`
- **Used by:** `test/core.test.js`, `test/images.test.js`, `test/core/extract.test.js`, `test/cli.test.js`

### `test/README.md`
- **Role:** how to run tests, add a test and update the snapshot.

## Gotchas
- The `npm test` glob needs Node 21 or newer. `node --test test/` (a bare directory) does not run the suites on Node 26.
- `sample.pdf` only has Highlight marks and font-size headings; other mark types, bookmarks and loose marks are added in memory by `helpers/annotate.js`.
- No test touches the network: `core/fetch.test.js` uses a local server and fake transports. Electron's `fetchUrl` in `main.js` is untested.
