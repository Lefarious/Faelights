# Faelights

Faelights is a desktop app that pulls the highlights out of annotated PDFs. Each extract is shown in reading order, grouped under the topic it sits in, and kept in libraries you can tag, search and export to Notion or Obsidian.

## What it does

- **Extracts every highlight, underline and strike-through** saved in a PDF, along with the page number and any note you attached.
- **Switches between two views:** *Full sentence* shows the whole sentence with the highlighted words marked in their original colour, and *Highlights only* shows just the marked words.
- **Groups extracts by topic.** It uses the PDF's bookmarks, or falls back to headings detected by font size.
- **Organises PDFs into libraries.** Drag a PDF onto a library to move it, and right-click a library to rename, export or delete it. Deleting a library moves its PDFs to Inbox.
- **Supports tags, stars and filtering** by title or tag.
- **Light, dark or system theme.** Use the button next to the logo, or *View → Theme*. Your choice is remembered.
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

## Build installers

```bash
npm run dist:win     # Windows installer (.exe) + portable zip
npm run dist:mac     # macOS .dmg (must be built on a Mac)
npm run dist:linux   # Linux AppImage
```

Build the Windows installer on Windows. Building it on Linux needs Wine. The workflow in `.github/workflows/build.yml` builds all three platforms on GitHub. Push a tag like `v1.0.0`, then download the files from the run's artifacts.

## Limits

- Highlights on scanned pages or images have no text behind them. Faelights lists them separately with their page numbers. Run OCR on the PDF and rescan to read them.
- Some readers flatten highlights into the page when exporting. Those can't be read back, so save with annotations kept.
