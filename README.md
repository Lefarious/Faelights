# Faelights

Faelights is a desktop app that pulls the highlights out of annotated PDFs. Each extract is shown in reading order, grouped under the topic it sits in, and kept in libraries you can tag, search and export to Notion or Obsidian.

## What it does

- **Extracts every highlight, underline and strike-through** saved in a PDF, along with the page number and any note you attached.
- **Switches between two views:** *Full sentence* shows the whole sentence with the highlighted words marked in their original colour, and *Highlights only* shows just the marked words.
- **Groups extracts by topic.** It uses the PDF's bookmarks, or falls back to headings detected by font size.
- **Organises PDFs into libraries.** Drag a PDF onto a library to move it, and right-click a library to rename, export or delete it. Deleting a library moves its PDFs to Inbox.
- **Supports tags, stars and filtering** by title or tag.
- **Light, dark or system theme.** Pick an icon at the bottom of the sidebar (screen = match system, sun = light, moon = dark), or use *View → Theme*. Your choice is remembered.
- **Searches highlights across every PDF.** Every word you type must appear in the sentence, the highlight or its note. Click a result to jump to it.
- **Keeps PDFs in sync.** Faelights remembers where each PDF lives. If you annotate it again, it shows *Changed* and rescans automatically when you open it. If the file moves, use *Find original file*.
- **Exports:**
  - Copy to the clipboard, or export as Markdown, Obsidian (`==highlight==`) or plain text.
  - *File → Export Library to Folder* writes one note per PDF with YAML frontmatter (title, source, tags, highlight count) into a folder you choose, such as your Obsidian vault.

Your library is stored on your computer in a `library` folder inside the app's data folder. Use *File → Show Library Folder* to open it. Each PDF is copied into it, so your highlights survive even if the original is deleted.

## Keyboard

| Keys | Action |
|---|---|
| Ctrl/⌘ O | Add PDFs |
| Ctrl/⌘ F | Search all highlights |
| Ctrl/⌘ T | Full sentence / highlights only |
| Ctrl/⌘ E | Export current PDF |
| Ctrl/⌘ ⇧ E | Export library to folder |
| Ctrl/⌘ ⇧ N | New library |
| ↑ ↓ or J K | Previous / next PDF |
| Delete | Remove the selected PDF from Faelights |

## Run from source

Requires Node.js 18 or newer.

```bash
npm install
npm start
```

## Command line

The same library is available from a terminal, without opening the app (run from a checkout after `npm install`):

```bash
npm run cli -- extract paper.pdf              # highlights of any PDF (md, obsidian, html, plain or json)
npm run cli -- add paper.pdf 10.1371/journal.pone.0185809 -l Thesis
npm run cli -- search deep sea                # highlights containing every word
npm run cli -- list --tag insects
npm run cli -- --help                         # every command: text, info, library, move, tag, star, rescan, theme, tour…
```

`npm link` adds a `faelights` command instead. Close Faelights before commands that change the library: the open app saves its own copy and would overwrite them.

## MCP server (Claude Code, Claude Desktop)

`mcp/server.js` lets an MCP client such as Claude read your library over stdio. Run `npm install` in the checkout first.

| Tool | What it does |
|---|---|
| `list_libraries` | Libraries and how many PDFs each holds |
| `list_pdfs` | PDFs with ids, tags, stars and highlight counts (filter by `library`, `tag`, `starred`) |
| `get_extracts` | One PDF's highlights grouped by topic, with pages, colours and comments (`mode` full or highlights, filter by `colours` or `topic`) |
| `search` | Highlights containing every word, in the `sentence`, `highlight`, `note` or `all` |
| `export_pdf` | One PDF as Markdown, Obsidian or plain text (returns the text) |
| `export_library` | Writes a library to a folder inside `out_dir`, one file per PDF |
| `add_pdf`, `add_by_identifier`, `tag_pdf`, `star_pdf` | The only tools that change the library. `add_by_identifier` downloads a paper by DOI, arXiv id, PMID, PMCID, ISBN, ADS bibcode or link, and is the only tool that uses the internet |

The resource `faelights://pdf/{id}` returns a PDF's extracts as Markdown.

The server uses the app's own data folder: `%APPDATA%\Faelights` on Windows, `~/Library/Application Support/Faelights` on macOS and `~/.config/Faelights` on Linux. Set `FAELIGHTS_DATA_DIR` to use another one. While the desktop app is open, the four write tools refuse with `library_in_use`, because the app would overwrite their changes when it next saves. Reading works either way.

A download from a slow server can take minutes. `add_by_identifier` sends progress notifications while it downloads, but a client that doesn't reset its timeout on progress may give up first. The paper is still added in that case, and asking again returns `exists`. In Claude Code you can raise the limit by starting it with `MCP_TOOL_TIMEOUT=300000` (milliseconds).

**Claude Code:**

```bash
claude mcp add faelights --scope user -- node C:/Users/User/Downloads/faelights-desktop/mcp/server.js
```

**Claude Desktop:** open *Settings → Developer → Edit Config* (`%APPDATA%\Claude\claude_desktop_config.json` on Windows, `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS), add the server, and restart Claude Desktop:

```json
{
  "mcpServers": {
    "faelights": {
      "command": "node",
      "args": ["C:/Users/User/Downloads/faelights-desktop/mcp/server.js"]
    }
  }
}
```

To use another library, add `"env": { "FAELIGHTS_DATA_DIR": "D:/Notes/Faelights" }` to the server entry. With Claude Code, pass `-e FAELIGHTS_DATA_DIR=...` before the `--`.

To try the tools by hand, run `npx @modelcontextprotocol/inspector node mcp/server.js`. `npm link` also adds a `faelights-mcp` command.

## Build installers

```bash
npm run dist:win     # Windows installer (.exe) + portable zip
npm run dist:mac     # macOS .dmg (must be built on a Mac)
npm run dist:linux   # Linux AppImage
```

Build the Windows installer on Windows. Building it on Linux needs Wine. The workflow in `.github/workflows/build.yml` builds all three platforms on GitHub. Push a tag like `v1.3.0`: the run attaches the installers to a draft GitHub Release, which you review and publish by hand. The files are also kept as the run's artifacts.

## Limits

- Highlights on scanned pages or images have no text behind them. Faelights lists them separately with their page numbers. Run OCR on the PDF and rescan to read them.
- Some readers flatten highlights into the page when exporting. Those can't be read back, so save with annotations kept.
