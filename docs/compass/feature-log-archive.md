# Faelights — Feature log archive
Older entries moved out of [PROJECT_COMPASS.md](../PROJECT_COMPASS.md) §7 (newest first). Entries are never edited, only appended to with `Revised` lines.

### F-001 · Faelights desktop v1.0.0 · 2026-10-08 · shipped
- **Why:** turn annotated PDFs into organised, exportable highlight notes, offline.
- **How:**
  - Electron app with a sandboxed renderer. All disk and OS access goes through a small IPC bridge.
  - In-renderer extraction using pdf.js: the text stream is rebuilt, annotation quads are hit-tested per character, edges snap to words, marks expand to whole sentences, and topics come from bookmarks or font-size headings.
  - Libraries, tags, stars, cross-PDF search, colour filtering, and two reading modes.
  - Each PDF is copied into the app's library, with mtime-based staleness detection, auto-rescan and relinking.
  - Export to Markdown, Obsidian or plain text, per PDF or as a folder per library with YAML frontmatter.
  - electron-builder installers for 3 OSes, built in GitHub Actions.
- **Touched:** all modules (see [ATLAS](atlas/ATLAS.md)).
- **Added:** deps electron, electron-builder, pdfjs-dist, @fontsource ×3. `.pdf` file association. CI workflow.
- **Trade-offs:** whole-DB JSON saves (simple, but cost grows with library size); analysis runs on the renderer thread apart from the pdf.js worker; no tests (see D-002, D-004).
- **Known limits / follow-ups:** no OCR; flattened annotations can't be read; unsigned builds.
- **Commit range:** 18c8052 (reconstructed from git: the entire app arrived in the initial commit)
