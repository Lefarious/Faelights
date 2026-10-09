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
   const { analyzePdf } = require("../renderer/core.js");

   const result = await withPdf(repoPath("renderer", "sample.pdf"), (pdf) => analyzePdf(pdf));
   ```

   `loadPdf(pathOrBytes)` returns a pdf.js document proxy (the `pdfjs-dist` 3.11.174 legacy build, with no worker and font faces turned off). Call `pdf.destroy()` when you are done with it. `withPdf` does this for you.

## Snapshot in `core.test.js`

`core.test.js` checks the exact current output of `analyzePdf` on `renderer/sample.pdf`: page count, mark count, every entry's spans, colours, comments and sentence, and the detected topics. If you change extraction on purpose, check that the new output is better, update the expected values in the test, and bump `ANALYZER_VERSION` in `renderer/core.js`.

## Fixtures

`test/fixtures/images.pdf` is a generated 2-page document with headings, highlighted sentences and Square "image capture" boxes (between paragraphs, inside a merged multi-sentence fact, in the right column of a two-column block, a side-by-side pair, and one with a comment). `images.test.js` checks `result.images` on it: rects, colours, comments, sort order and placement relative to facts.

It is built with pdf-lib by `test/fixtures/make-images-pdf.js` (the layout is described at the top of that script). Both files are committed. To regenerate after changing the script:

```
node test/fixtures/make-images-pdf.js
```

The output is byte-stable (fixed dates), so an unchanged script gives an unchanged PDF. Fixture scripts must not end in `.test.js`, or `npm test` would run them.
