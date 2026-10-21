# Module: mcp
> Path: mcp/ · Last synced commit: 2620815 · Related features: T-016 (Compass id assigned at log)

## Purpose
An MCP server over stdio (`faelights-mcp`) that exposes the desktop app's library to MCP clients (Claude Code, Claude Desktop): list, read extracts grouped by topic, search, export, and three write tools. It imports core/ in-process. It does not render images, download papers or talk to a running app. It only reads the app's session marker to decide whether writing is safe.

## Public interface
`node mcp/server.js [--data-dir <dir>]` (`package.json` `bin.faelights-mcp`, `npm run mcp`). Data folder: `--data-dir`, else `FAELIGHTS_DATA_DIR`, else `Library.userDataDir()`.

| Tool | Input (zod) | Output (JSON text + `structuredContent`) | Writes |
|---|---|---|---|
| `list_libraries` | — | `{libraries: [{id, name, system, pdfs}]}` | — |
| `list_pdfs` | `library?`, `tag?`, `starred?` | `{pdfs: [summary]}` | — |
| `get_extracts` | `pdf_id`, `mode` full\|highlights, `colours?` (hex), `topic?` | `{topics: [{topic: path[], topic_page, extracts: [{n, page, text, highlights: [{text, colour, type, comment}]}]}], unreadable_marks, textless_pages, warnings}` | — |
| `search` | `query`, `scope` sentence\|highlight\|note\|all, `library?`, `limit` | `{total, truncated, matches: [{pdf_id, page, topic, sentence, highlights}]}` | — |
| `export_pdf` | `pdf_id`, `format` markdown\|obsidian\|plain, `mode?`, `frontmatter` | `{text}` (= `ExportFmt.docText`) | — |
| `export_library` | `library`, `out_dir` (absolute), `format`, `mode?` | `{dir, files, skipped}` | files under `<out_dir>/<fileBase(library)>/` |
| `add_pdf` | `path`, `library?`, `tags?` | `{action: added\|rescanned, pdf, warnings}` | library |
| `add_by_identifier` | `identifier` (DOI, arXiv, PMID, PMCID, ISBN, ADS, link), `library?`, `tags?`, `lookup` | `{action: added\|exists, pdf, origin, details, warnings}`; progress notifications when the request has a `progressToken` | library; network (`openWorldHint`) |
| `tag_pdf` | `pdf_id`, `tags[]` | `{added, tags, changed}` | library |
| `star_pdf` | `pdf_id`, `starred` | `{starred, changed}` | library |

Resource template `faelights://pdf/{id}` (`text/markdown`; list = every doc). Errors come back as `isError` with `{error: {code, message}}`. The codes are `unknown_pdf`, `unknown_library`, `file_missing`, `no_text_layer`, `bad_pdf`, `invalid_input`, `library_in_use` and `internal`. `add_by_identifier` adds `offline`, `paywalled`, `not_pdf`, `not_found`, `no_free_copy`, `too_large` and `network`, which are core/fetch.js `FetchFail` reasons with `-` replaced by `_`. zod rejections arrive as protocol error -32602.

## Dependencies
- **Uses:** core `library.js` (`at`, `userDataDir`, `findDoc`/`findLibrary`/`docsIn`, `cleanTag`/`addTag`/`setStar`, `searchTerms`/`entryMatches`, store `loadDb`/`update(fn, {wait: 0})`/`checkSources`/`readPdf`/`importPdf`/`removeStored`/`appSession`), `extract.js` (`ANALYZER_VERSION`), `order.js` (`summary`), `export.js` (`docText`, `groupsOf`, `fileBase`, `extOf`), `identify.js` (`parseIdentifier`, `fileNameFor`), `fetch.js` (`nodeGet` with `onProgress`, `resolver`, `FetchFail`); main-process `src/exportPaths.js` (`resolveInside`); cli `scan`/`scanned`/`ADD_FAIL`/`sameOrigin`/`fetchDetails`/`applyDetails`; `package.json` (`version`).
- **Used by:** tests (`test/mcp.test.js`, over stdio).
- **External libs:** `@modelcontextprotocol/sdk` (`McpServer`, `ResourceTemplate`, `StdioServerTransport`), `zod` 4.

## Data & state owned
None of its own. It reads `<userData>/library/faelights.json`, the PDFs (source or stored copy) and `library/faelights.app`. It writes `faelights.json` (through `store.update`), `library/files/<id>.pdf` (`add_pdf`, `add_by_identifier`), a temp `<tmp>/faelights-<random>.pdf` during a download (deleted after import) and export files (`export_library`).

## Files

### `mcp/server.js`
- **Role:** process entry. It redirects `console.log/info/debug` to stderr before loading anything, registers the tools with their zod schemas and annotations (`readOnlyHint` on reads), registers the resource template, and connects a `StdioServerTransport`.
- **Exports:** `createServer(dataDir)` → `{server, tools}`.
- **Imports (internal):** `./tools.js`, `../package.json`.
- **Used by:** `package.json` `bin.faelights-mcp` / `scripts.mcp`, `test/mcp.test.js` (spawned).
- **Side effects:** stdout is protocol only, and the startup line goes to stderr. `wrap()` passes the SDK's `extra` through, turns a `ToolError` into an `isError` result and logs any other exception's stack to stderr. `progressFor(extra)` turns `add_by_identifier`'s stages and downloaded bytes into `notifications/progress` with a value that only increases, sent only when the request carries a `progressToken`.
- **Change impact:** tool names, schemas and descriptions are the client-facing contract, checked by `test/mcp.test.js`.

### `mcp/tools.js`
- **Role:** the handlers as plain async functions over core/.
- **Exports:** `tools(dataDir)` → `{store, list_libraries, list_pdfs, get_extracts, search, export_pdf, export_library, add_pdf, add_by_identifier(args, progress?), tag_pdf, star_pdf, pdf_markdown, pdf_resources}`, `ToolError`, `FORMATS` (`markdown→md`).
- **Imports (internal):** `core/library`, `core/extract`, `core/order`, `core/export`, `core/identify`, `core/fetch`, `src/exportPaths`, `cli/faelights` (`scan`, `scanned`, `ADD_FAIL`, `sameOrigin`, `fetchDetails`, `applyDetails`), `package.json`.
- **Used by:** `mcp/server.js`.
- **Side effects:**
  - `resultOf(d)` uses the saved `d.result` unless it's missing, older than `ANALYZER_VERSION`, or `stale`. In those cases it re-reads the PDF in memory and never writes the result back.
  - `checkText` reports `result.textless` pages (older scans fall back to `loose` pages). Every page textless → `no_text_layer`.
  - `writable()` throws `library_in_use` while `store.appSession()` returns a live pid.
  - `write(fn)` = `store.update(fn, {wait: 0})`, with `ELOCKED` → `library_in_use`.
  - `export_library` writes each file as a temp file + rename.
- **Change impact:**
  - `add_pdf` and `add_by_identifier` build the doc record with the same fields as the CLI's `cmdAdd`/`addStored` (including `origin` and `lookup`). Keep them in step.
  - The colour filter matches within an RGB distance of 48.

## Gotchas
- `add_pdf` checks the session marker before it copies the file into the library. If the write fails afterwards, the stored copy is removed again.
- Read tools keep working while the app is open. They see the app's last save, not its unsaved in-memory state.
- `export_library` leaves out captured images, which need the renderer's canvas (`images.js`).
- `add_by_identifier` checks the session marker before downloading, and `write()` checks it again before saving, so an app opened mid-download still blocks the write. Its download is bounded only by core/fetch.js's stall timeout and size cap, so a slow server can outlast a client's tool timeout. The server keeps going and adds the paper, and a retry returns `exists`.
