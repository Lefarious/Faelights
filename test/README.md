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
