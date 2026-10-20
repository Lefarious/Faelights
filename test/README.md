# Tests

Plain Node tests using only built-ins (`node:test`, `node:assert`). There are no test dependencies.

## Run

```
npm test
```

This runs `node --test "test/**/*.test.js"`, so every `*.test.js` file under `test/` is picked up on its own. Node 21 or newer is needed for the glob. Files in `test/helpers/` are not named `*.test.js`, so they are never run as tests.

To run one file: `node --test test/core.test.js`.

## Add a test

1. Create `test/<area>.test.js` and use `const { test } = require("node:test")` and `const assert = require("node:assert/strict")`.
2. To work with a PDF, use the shared helper:

   ```js
   const { withPdf, repoPath } = require("./helpers/pdf");
   const { analyzePdf } = require("../core/extract.js");

   const result = await withPdf(repoPath("renderer", "sample.pdf"), (pdf) => analyzePdf(pdf));
   ```

   `loadPdf(pathOrBytes)` is `core/extract.js` `openPdf`: a pdf.js document proxy from the `pdfjs-dist` 3.11.174 legacy build, with no worker and font faces turned off. Call `pdf.destroy()` when you are done with it. `withPdf` does this for you. For a whole result in one call, use `extractPdf(pathOrBytes)` from `core/extract.js`.

## Headless core (`test/core/`)

`test/core/*.test.js` test the `core/` modules in plain Node, with no Electron and no DOM:

- `extract.test.js`: opening a path or bytes, reading order, the flat `highlights()` list (full sentence and highlight-only text), Underline / Squiggly / StrikeOut, loose marks.
- `topics.test.js`: font-size headings on `sample.pdf`, bookmarks winning over headings (with nesting), the wording and per-page fallbacks.
- `export.test.js`: Markdown, Obsidian, plain text and HTML in both modes (full sentence / highlights only), YAML frontmatter.
- `library.test.js`: the userData folder per platform and `FAELIGHTS_DATA_DIR`, atomic saves, the lock file (also between two processes), tags, stars, libraries and stored PDF copies. Each test uses its own temp folder, never the real library.

`test/helpers/annotate.js` adds markup annotations and bookmarks to a PDF in memory with pdf-lib, finding the words to mark through pdf.js. The extract and topic tests use it on `sample.pdf` to cover mark types and bookmarks that the sample doesn't have.

## Snapshot in `core.test.js`

`core.test.js` checks the exact current output of `analyzePdf` on `renderer/sample.pdf`: page count, mark count, every entry's spans, colours, comments and sentence, and the detected topics. If you change extraction on purpose, check that the new output is better, update the expected values in the test, and bump `ANALYZER_VERSION` in `core/extract.js`.

## Fixtures

`test/fixtures/images.pdf` is a generated 2-page document with headings, highlighted sentences and Square "image capture" boxes (between paragraphs, inside a merged multi-sentence fact, in the right column of a two-column block, a side-by-side pair, and one with a comment). `images.test.js` checks `result.images` on it: rects, colours, comments, sort order and placement relative to facts.

It is built with pdf-lib by `test/fixtures/make-images-pdf.js` (the layout is described at the top of that script). Both files are committed. To regenerate after changing the script:

```
node test/fixtures/make-images-pdf.js
```

The output is byte-stable (fixed dates), so an unchanged script gives an unchanged PDF. Fixture scripts must not end in `.test.js`, or `npm test` would run them.
