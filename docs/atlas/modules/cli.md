# Module: cli
> Path: cli/faelights.js · Last synced commit: 2620815 · Related features: F-024

## Purpose
The `faelights` command line: a thin shell over core/ that reads highlights and text from any PDF and manages the desktop app's library on disk (the same `<userData>/library` folder) without Electron. It doesn't render anything (no image crops), doesn't talk to a running app, and has no state of its own.

## Public interface
`node cli/faelights.js <command> [options]` (`package.json` `bin.faelights`, `npm run cli -- …`). `<pdf>` is a doc id, or a substring of its title or file name that matches exactly one doc.

| Command | Does | core/ calls |
|---|---|---|
| `extract <file.pdf>` | highlights of any PDF, no library | `Extract.openPdf` / `analyzePdf`, `Meta.readMeta`, `Order.summary`, `ExportFmt.docText` / `docHtml`, `Extract.highlights` (json) |
| `export <pdf>` | highlights of a library doc | `store.loadDb`, same renderers |
| `text <pdf \| file.pdf>` | full text per page (`--pages 1-3,7`) | `store.readPdf`, `Extract.openPdf`, `getTextContent` |
| `info <pdf>` | details: `metaOf(d)` (= `d.meta` overlaid with `d.lookup.meta`), library, tags, origin, flags | `store.checkSources` |
| `list [library]`, `libraries`, `tags` | listings (`--tag`, `--starred`) | `Library.docsIn`, `tagCounts`, `cleanTag` |
| `search <words>` | entries where every word matches (`-l` one library) | `Library.searchTerms` / `entryMatches`, `ExportFmt.entryLines` |
| `add <file.pdf \| identifier>...` | import files (same `sourcePath` → rescan) or download by identifier (dupes by `origin` or `hash` → "Already in your library"); `-l`, `-t`, `--no-lookup` | `store.importPdf` / `readPdf` / `update` / `removeStored`, `identify.parseIdentifier` / `describe` / `fileNameFor`, `fetch.resolver(nodeGet).resolvePdf`, `fetch.lookupMeta` |
| `rescan [pdf...]` | stale or outdated docs (`--all`) | `store.readPdf`, `update` |
| `lookup <pdf>` | CrossRef / arXiv details → `d.lookup` | `fetch.lookupMeta` |
| `library new \| rename \| delete` | libraries (Inbox can't be deleted; names unique, case-insensitive) | `Library.addLibrary` / `renameLibrary` / `removeLibrary` |
| `move`, `tag`, `untag`, `star`, `unstar` | doc fields | `Library.moveDoc` / `addTag` / `removeTag` / `setStar` |
| `remove <pdf>` | drop doc + stored copy; annotated docs need `--force` | `update`, `store.removeStored` |
| `theme [system\|light\|dark]` | read/write `<userData>/theme.json` | — |
| `tour [status\|skip\|restart]` | `settings.tour` | `Tour.pending` / `skipAll` (from `renderer/tour.js`) |

Options: `-f md|obsidian|html|plain|json`, `-m full|only`, `-o file`, `-l`, `-t` (repeatable), `--starred`, `--pages`, `--all`, `--force`, `--no-lookup`, `--frontmatter`, `--json`, `--data-dir`, `-h`, `-v`. Exit codes: 0 ok, 1 failure (`Fail`, `ELOCKED`), 2 usage. Also `module.exports = {main, Fail, scan, scanned, ADD_FAIL, sameOrigin, fetchDetails, applyDetails}`, reused by `mcp/tools.js` `add_pdf` / `add_by_identifier`.

## Dependencies
- **Uses:** core (`extract`, `meta`, `order`, `export`, `library`, `identify`, `fetch`), renderer-ui's `renderer/tour.js` (pure helpers only), `package.json` (`version`), node `fs`, `os`, `path`, `util.parseArgs`
- **Used by:** users / scripts; `test/cli.test.js` (spawned as a child process)

## Data & state owned
None in memory beyond one command. Reads and writes, under `Library.at(--data-dir | userDataDir())`: `library/faelights.json` (only through `update()`, i.e. under the lock), `library/files/<id>.pdf` (`importPdf`, `removeStored`), `theme.json`; temp files `<os.tmpdir()>/faelights-<random>.pdf` while adding by identifier (deleted at once). Reads `FAELIGHTS_DATA_DIR`, `APPDATA`, `XDG_CONFIG_HOME` (via `userDataDir`).

## Files

### `cli/faelights.js`
- **Role:** the whole CLI (`#!/usr/bin/env node`)
- **Exports:** `main(argv)`, `Fail`
- **Key internals:** `parse` (`util.parseArgs`), `scan(bytes)` (open once → `{title, meta, result}`, like the app's `analyzeBytes`), `scanned(result, mtime)` (doc fields after a scan), `render(d, o)`, `findDoc` / `findLibrary` (id, then case-insensitive name/substring; ambiguous → error listing ids), `sameOrigin`, `pageSet`, `fetchDetails` / `applyDetails` (same rules as the app's `lookUp`), `transport()` (`nodeGet` with `User-Agent: Faelights/<version> …`), `ADD_FAIL` (copy of the app's messages), `changed()` (the "restart the app" note), `THEMES`
- **Imports (internal):** see Dependencies
- **Side effects:** files listed above; network only in `add <identifier>` and `lookup`; prints results to stdout, notes and errors to stderr
- **Change impact:** doc records it creates must keep the app's shape (`addImported` fields + `origin` / `lookup`); `test/cli.test.js` and the parity check rely on `meta` / `result` / `count` / `colours` being identical to an app add.

## Gotchas
- Every change is one `store.update(fn)`: the doc or library is looked up inside `fn`, so a `Fail` thrown there aborts without writing.
- A running app keeps its own copy of the DB and saves it whole (`saveDb`), so it overwrites CLI changes made while it was open. `theme.json` is read by the app only at startup.
- `extract` and `text <file.pdf>` never touch the library; `text` treats an argument ending in `.pdf` that exists on disk as a file, anything else as a library doc.
- `add` validates every argument before importing anything; a failed scan removes the stored copy it just made.
- Images (`result.images`) are never exported; cropping needs the renderer's canvas.
- `search` prints plain text unless `-f` is given (`html` falls back to plain).
