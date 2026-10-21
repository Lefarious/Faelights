# Module: cli
> Path: cli/faelights.js · Last synced commit: 1167137 · Related features: F-024, F-025, F-027, T-029, T-035 (Sprint 8)

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
| `list [library]`, `libraries`, `tags` | listings (`--shelf`, `--tag`, `--starred`, `--read`, `--unread`); rows carry `read` / `lastPage` and the shelf; `tags` shows each colour (`--json` `[{tag, pdfs, colour}]`) | `Library.docsIn`, `tagCounts`, `cleanTag`, `tagColour` |
| `search <words>` | entries where every word matches (`-l` one library) | `Library.searchTerms` / `entryMatches`, `ExportFmt.entryLines` |
| `add <file.pdf \| identifier>...` | import files (same `sourcePath` → rescan) or download by identifier (dupes by `origin` or `hash` → "Already in your library"); `-l`, `-t`, `--no-lookup` | `store.importPdf` / `readPdf` / `update` / `removeStored`, `identify.parseIdentifier` / `describe` / `fileNameFor`, `fetch.resolver(nodeGet).resolvePdf`, `fetch.lookupMeta` |
| `rescan [pdf...]` | stale or outdated docs (`--all`) | `store.readPdf`, `update` |
| `lookup <pdf>` | CrossRef / arXiv details → `d.lookup` | `fetch.lookupMeta` |
| `shelves [library]`, `shelf new <library> <name> \| rename <shelf> <name> \| delete <shelf> \| list` | shelves, one level inside a library; names unique within a library; a name in two libraries → error listing ids (`--library` or the id picks one) | `Library.shelvesIn` / `addShelf` / `renameShelf` / `removeShelf` |
| `shelve <pdf> <shelf>`, `unshelve <pdf>...`, `move <pdf> <library> [--shelf <name>]` | put PDFs on / take them off a shelf; `move` without `--shelf` → the library's root | `Library.moveToShelf` / `moveDoc` |
| `library new \| rename \| delete` | libraries (Inbox can't be deleted; names unique, case-insensitive) | `Library.addLibrary` / `renameLibrary` / `removeLibrary` |
| `move`, `tag`, `untag`, `star`, `unstar`, `read`, `unread` | doc fields (one `store.update`; an unknown doc aborts all) | `Library.moveDoc` / `addTag` / `removeTag` / `setStar` / `setRead` |
| `tag colour <tag> [<#hex> \| none \| --clear]` (`color`) | show / set / clear `db.tagColours[tag]`; `#rgb` expands to `#rrggbb`; bad hex exit 2, unknown tag exit 1 | `Library.setTagColour` / `tagColour` |
| `remove <pdf>` | drop doc + stored copy; annotated docs need `--force` | `update`, `store.removeStored` |
| `theme [system\|light\|dark]` | read/write `<userData>/theme.json` | — |
| `tour [status\|skip\|restart]` | `settings.tour` | `Tour.pending` / `skipAll` (from `renderer/tour.js`) |

Options: `-f md|obsidian|html|plain|json`, `-m full|only`, `-o file`, `-l` (also narrows a shelf name), `--shelf`, `-t` (repeatable), `--starred`, `--pages`, `--all`, `--force`, `--no-lookup`, `--frontmatter`, `--json`, `--data-dir`, `-h`, `-v`. Exit codes: 0 ok, 1 failure (`Fail`, `ELOCKED`), 2 usage. Also `module.exports = {main, Fail, scan, scanned, ADD_FAIL, sameOrigin, fetchDetails, applyDetails}`, reused by `mcp/tools.js` `add_pdf` / `add_by_identifier`.

## Dependencies
- **Uses:** core (`extract`, `meta`, `order`, `export`, `library`, `identify`, `fetch`), renderer-ui's `renderer/tour.js` (pure helpers only), `package.json` (`version`), node `fs`, `os`, `path`, `util.parseArgs`
- **Used by:** users / scripts; `test/cli.test.js` (spawned as a child process)

## Data & state owned
None in memory beyond one command. Reads and writes, under `Library.at(--data-dir | userDataDir())`: `library/faelights.json` (only through `update()`, i.e. under the lock), `library/files/<id>.pdf` (`importPdf`, `removeStored`), `theme.json`; temp files `<os.tmpdir()>/faelights-<random>.pdf` while adding by identifier (deleted at once). Reads `FAELIGHTS_DATA_DIR`, `APPDATA`, `XDG_CONFIG_HOME` (via `userDataDir`).

## Files

### `cli/faelights.js`
- **Role:** the whole CLI (`#!/usr/bin/env node`)
- **Exports:** `main(argv)`, `Fail`
- **Key internals:** `parse` (`util.parseArgs`), `scan(bytes)` (open once → `{title, meta, result}`, like the app's `analyzeBytes`), `scanned(result, mtime)` (doc fields after a scan), `render(d, o)`, `findDoc` / `findLibrary` / shelf lookup (id, then case-insensitive name/substring; ambiguous → error listing ids), `sameOrigin`, `pageSet`, `fetchDetails` / `applyDetails` (same rules as the app's `lookUp`; titles via `Meta.docTitle`), `addStored` in `cmdAdd` (keeps the resolver's title as `d.sourceTitle`), `transport()` (`nodeGet` with `User-Agent: Faelights/<version> …`), `ADD_FAIL` (copy of the app's messages), `changed()` (the "restart the app" note), `THEMES`
- **Imports (internal):** see Dependencies
- **Side effects:** files listed above; network only in `add <identifier>` and `lookup`; prints results to stdout, notes and errors to stderr
- **Change impact:** doc records it creates must keep the app's shape (`addImported` fields + `origin` / `lookup`); `test/cli.test.js` and the parity check rely on `meta` / `result` / `count` / `colours` being identical to an app add.

## Gotchas
- Every change is one `store.update(fn)`: the doc or library is looked up inside `fn`, so a `Fail` thrown there aborts without writing.
- A running app keeps its own copy of the DB and saves it whole (`saveDb`), so it overwrites CLI changes made while it was open. `theme.json` is read by the app only at startup.
- `extract` and `text <file.pdf>` never touch the library; `text` treats an argument ending in `.pdf` that exists on disk as a file, anything else as a library doc.
- `add` validates every argument before importing anything; a failed scan removes the stored copy it just made.
- Images (`result.images`) are never exported; cropping needs the renderer's canvas.
- Exports include the user's notes (`d.notes`) through `ExportFmt.docText`; `--format json` doesn't (T-043).
- `add`, `rescan` and `lookup` all set `d.title` with `Meta.docTitle`, so a rescan recomputes the title (a typed title survives).
- `search` prints plain text unless `-f` is given (`html` falls back to plain).
