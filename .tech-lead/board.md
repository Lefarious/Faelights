# Tech Lead Board — Faelights

_Last updated: 2026-10-21 · **Sprint 7 closed** (merged to local main c9791cc, 207/207, tag `sprint-7-end`; release v1.3.2; user OK to merge + push + publish) · next: Sprint 8 (T-025, T-029, T-035 — 5/5 slots) · Sprint 6 closed (merged to local main 9ff7a30, 168/168, tag `sprint-6-end`; release v1.3.1; v1.3.0 draft published) · next: Sprint 7 · Sprint 5 closed (merged to local main 20a8e58, 156/156, tag `sprint-5-end`; pushed 2026-10-21 7ead2d6..3cbd93e, CI run 39585050117 green) · next: Sprint 6 · Sprints 6–10 planned · T-015 cli + headless core merged to main 796478d (142/142; backup `backup/pre-T-015-20261021`), pushed 2026-10-21 (f0168db..d596936, CI run 39519273972 green); release v1.3.0 (draft) · Current sprint: 4 closed (T-014 merged locally, 43721ca) · main: green 81/81 · pushed to GitHub 2026-10-10 (e53e35e..f0168db, CI green)_

## Settings
- Sprint size: 3–5 slots per merge window (XS/S/M = 1 slot, L = 2) · minor bugs/polish (XS/S) are exempt and don't count (set by user 2026-10-21)
- Todo ids: `T-NNN`, next free: T-042 (T-016, the MCP server, merged in Sprint 7) · types/branch prefixes: `feature/` `enhancement/` `bug/` `polish/` → `<type>/<todo-id>-<slug>`
- Timebox: one implementation pass + one fix pass
- Test command: `npm test` (Node >= 21) · Build: `npm start` smoke launch
- Pause between sprints: no (merges to main need user OK per CLAUDE.md; pushing needs a second OK)
- Between sprints (set by user 2026-10-21): nothing goes to `main`. Docs go to `docs/pending` and ride with the next sprint or feature; code fixes wait for the next sprint's integration branch; builds and version bumps happen only at sprint end unless the user says otherwise. The sprint lands as one PR with all of its docs and changes, minus anything the user drops.

## Sprint plan 5–10 (planned 2026-10-21 from the Trello board, user rules)

User rules: Sprint 5 is all the bugs; small backlog items first, sizable (L) ones in later sprints; 3–5 slots per sprint. Source: Trello board "FaeLights" (https://trello.com/b/rgZKs8JI/faelights), Backlog + Bugs lists. Full cards are in the **Backlog** table below.

| sprint | theme | todos | slots |
|---|---|---|---|
| 5 | All bugs | T-017 long-paste-add-link, T-018 colour-filter-without-images, T-019 extract-sentence-split, T-002 offline-vs-unreachable, T-008 pmc-fallback | 0 (5 exempt bugs) |
| 6 | Small library improvements | T-020 continue-reading, T-022 search-current-pdf, T-023 search-current-library, T-024 tag-colours, T-026 mark-as-read | 5 |
| 7 | Medium items | T-021 multi-select, T-027 section-numbering, T-028 loose-marks-as-clips | 3 |
| 8 | Notes and shelves | T-025 markdown-notes (L), T-029 shelves (L), T-035 source-title (S) | 5 |
| 9 | Big bets I (design decision first) | T-030 ocr (L), T-031 ai-merge (L) | 4 |
| 10 | Big bets II | T-032 svg-diagrams (L) (+ T-033/T-034 if a backend is approved) | 2 (last window, under min) |

- Not scheduled: T-033 accounts, T-034 library-sharing — parked: they need a server, which goes against the offline-first decision D-009. Needs a user decision on a backend.
- Open proposals (T-003, T-004, T-005, T-006, T-009, T-010, T-011) stay under **To do**; any of them joins the open sprint once approved (T-005, T-009, T-011 are exempt). T-002 and T-008 are bugs, so they were pulled into Sprint 5.
- Dispatch order: T-018, T-019 and T-017 are in different files and can build in parallel; T-002 and T-008 both touch `core/fetch.js` and queue behind each other (and behind T-017 if it touches the add dialog's error text).
- Scaffold before Sprint 6: `core/library.js` is touched by T-020, T-023, T-024, T-026, T-025 and T-029. A small `refactor/library-doc-fields` branch that adds the new fields (`d.read`, `d.lastPage`, `db.tagColours`, `db.shelves`, `d.notes`) with defaults in `normalize` lets Sprint 6 build in parallel instead of queueing one at a time.
- Within Sprint 6, T-022 and T-023 both change the search panel in `app.js`: build together or queue T-023 behind T-022.
- Sprint 9 items need a decision before building: T-030 OCR engine (tesseract.js offline vs. other), T-031 AI provider and whether a key/network is acceptable (D-009), T-032 how to capture vector diagrams (pdf.js operator list → SVG vs. crop). Ask the user at the start of each.
- Trello cards already done in code (to move to Done on Trello): "Build desktop installers" (CI releases v1.2.1, v1.3.0), "Generate logo and add it to the app" (F-003, F-008), "Capture highlights over images" (F-015; the text-less highlight leftover is T-028), "Sort library view by number of extracts" ("Most marks" sort). Trello bug "Authors in metadata shown on separate lines": ignored by user 2026-10-21, not planned.

## To do

Every todo has a todo id (`T-NNN`, never reused) and a type: `feature`, `enhancement`, `bug` or `polish`. The type is the branch prefix: `<type>/<todo-id>-<slug>`, e.g. `feature/T-001-meta-enrich`. Minor bugs and polish (size XS or S) don't count toward the sprint cap.

**Sprint 4 (closed 2026-10-10, requested by user):** T-014 onboarding-tour, a guided tour that runs once after install and points at each main button in order.

- [x] **T-014 onboarding-tour** (feature · M · Sprint 4 · merged 43721ca, F-022 · branch `feature/T-014-onboarding-tour`, requested by user 2026-10-10): a guided tooltip tour, shown once after install, that walks through the main buttons in order and explains each one. Three chapters, each shown the first time its part of the app is on screen: **app** (sidebar + PDF list, 11 steps incl. "Start here" on the empty-library buttons; "Your PDFs" waits until a PDF exists; ends with "Try a sample PDF" when the library is empty), **reader** (title, organise, View, Metadata, Full/Only, With images, Copy/Export, colour filter, topics, an extract, the per-extract copy button), **viewer** (tools, colours, page/zoom, Download, back). Next / Back / Skip tour, ←/→/Enter/Esc; steps whose button isn't on screen are skipped. Each step is remembered once shown (`settings.tour[chapter]` = step ids; Skip sets every chapter to true); a step skipped because its button was not on screen (e.g. extract tips on a PDF with no highlights) shows as a short follow-up the first time the button appears. Help › Show Tour replays it. Acceptance: fresh profile shows the welcome card; finishing app chapter + adding the sample starts the reader chapter; opening View starts the viewer chapter; after Skip, a restart shows no tour; keys pressed during the tour don't reach the app (Delete can't remove a PDF).

**Sprint 3 (closed 2026-10-09):** T-001 meta-enrich, which fills in paper details from CrossRef and arXiv, stays optional, and keeps working offline; and T-012 copy-image, which copies a captured image from the extract to the clipboard. Any of the proposals below can join it if you approve them.

- [x] **T-001 meta-enrich** (feature · M · Sprint 3 · merged 736ffd2, depends on F-011 ✓): fill and refresh Info fields from CrossRef (DOI) and the arXiv API. Runs when a paper is added by DOI/link and on demand from the Info card. Never blocks adding or opening a PDF; results are saved in `meta`, so they still show offline.
- [x] **T-012 copy-image** (enhancement · S · Sprint 3 · merged 736ffd2, requested by user 2026-10-09): each image in the extract (reader "With images") can be copied to the clipboard as a PNG at full crop resolution, from a Copy button on the figure and from right-click. Shows a short "Copied" confirmation; works offline. Acceptance: pasting into Word, Paint or Obsidian gives the image.

Proposals waiting for approval (each can join Sprint 3; "exempt" = doesn't count toward the cap):

- [ ] **T-002** [bug · S · exempt] A mistyped link says "You're offline": tell "no connection" apart from "couldn't reach that site".
- [ ] **T-003** [enhancement · S] nature.com bot-blocks downloads, so some open-access papers fail: add an alternative-source lookup (fits T-001).
- [x] **T-004** (Sprint 7) [enhancement · S] Second test PDF (underline, strike-through, bookmark and wording topics, marks with no text). (The "run `npm test` in the GitHub build" half was done 2026-10-10 on `ci/build-on-push`.)
- [x] **T-005** (Sprint 7) [polish · XS · exempt] Rename "Annotate" in the PDF menu to "View"; remove the unused native-menu IPC (`menu:popup`).
- [ ] **T-006** [enhancement · S] Dev-only setting for a separate library folder, so a test copy can run while the real app is open.
- [ ] **T-008** [bug · S · exempt] PMC serves a bot-check page instead of PDFs, so PMCID (and PMIDs that resolve to PMC) may fail: try Europe PMC / Unpaywall.
- [x] **T-009** (Sprint 7) [polish · XS · exempt] ISBN lookup may pick a scan of another edition: show the edition title in the result row.
- [ ] **T-010** [enhancement · S] Move and resize image boxes in the viewer (today: delete and redraw).
- [x] **T-011** (Sprint 7) [polish · XS · exempt] `ckey` is duplicated in order.js and app.js, and `groupsOf` overlaps `Order.groupItems`: fold both into order.js.

- [x] **T-015 cli** (feature · L · merged 796478d (with `refactor/headless-core` 54d1a07), F-024 ·  branch `feature/T-015-cli`, cut from `refactor/headless-core` because it needs `core/`; requested by user 2026-10-21): a `faelights` command line over `core/` that covers the app's main actions. Reading: `extract <file>`, `export`, `text` (full text, `--pages`), `info`, `list` (`--tag`, `--starred`), `libraries`, `tags`. Adding: `add` from files or by DOI / arXiv / PMID / PMCID / ISBN / ADS / link (+ `--tag`, details from CrossRef/arXiv), `rescan` (`--all`), `lookup`. Organising: `library new|rename|delete`, `move`, `tag`/`untag`, `star`/`unstar`, `remove` (`--force` for docs annotated in the app). App: `search <words>` (the app's rule, now `Library.entryMatches`), `theme [system|light|dark]` (`theme.json`), `tour status|skip|restart` (`settings.tour` via `tour.js` `skipAll`; restart = Help › Show Tour). Moves to core: `readMeta`/`cleanTitle` → `core/meta.js`, `summary` → `Order.summary`, `src/identify.js` + `src/metadata.js` → `core/`, and the paper resolver + metadata lookup out of `main.js` into `core/fetch.js` (transport passed in: Electron `net` in the app, `nodeGet` with redirect cookies in the CLI). Captured images aren't exported (they need rendering). Verified on the branch: 142/142; the app starts in the theme the CLI set, runs the tour after `tour restart`, and its search uses the shared matcher; the app opens a CLI-built library (tags, stars, libraries, details, origins) and its own add-by-identifier and lookup still work through `core/fetch.js` (arXiv download, CrossRef lookup, Nature → paywalled). Live CLI downloads: arXiv 1706.03762, PLOS DOI; Nature DOI → paywalled.

Polish (reported by user):

- [x] **T-007** [bug · XS · exempt] The app icon on the Windows taskbar looked a different size from other apps' icons. Fixed in 055a74f (`fix/taskbar-icon-size`).
- [x] **T-013** [bug · S · exempt] After installing, the Start menu and desktop shortcuts show Electron's default atom icon instead of the Faelights icon. Cause: `win.signAndEditExecutable: false` stops electron-builder from writing `build/icon.ico` into Faelights.exe (the window icon is only set at runtime). Reported by user 2026-10-09. Fixed with an afterPack rcedit hook (71571a8), merged to main eb99c96.

## Backlog
| id | requirements (short) | footprint | depends on | size | priority | status |
|----|----------------------|-----------|------------|------|----------|--------|
| item-actions | Themed in-app action menu (icons, groups, danger item, keyboard, ARIA) for library + PDF actions, opened by right-click or a ⋯ button | renderer/app.js (menus, navItem, doc cards, reader library picker), renderer/styles.css (own block) | — | M | 1 | merged f576105 (F-010) |
| add-by-identifier | Add PDFs from a DOI, arXiv id, article page URL or direct PDF URL; main process downloads; clean failures with "Open in browser" | src/main.js, src/preload.js, new src/identify.js, renderer/app.js (add flow, drop/paste), renderer/styles.css (own block), test/identify.test.js | — | M | 1 | merged c5c0dbe (F-011) |
| test-harness | `npm test` via node:test; smoke tests for core.js analyzePdf on renderer/sample.pdf | package.json (scripts only), test/core.test.js, test/helpers | — | S | 1 | merged c6748e9 (F-012) |
| T-001 meta-enrich | Fill/augment doc metadata from CrossRef (DOI) and arXiv API, on add-by-identifier and on demand from the Info card | src/main.js, src/preload.js, renderer/app.js (readMeta/loadMeta/infoEl) | add-by-identifier | M | 2 | merged 736ffd2 (F-020) |
| T-012 copy-image | Copy an extract image to the clipboard as PNG (button on figure + right-click), "Copied" toast | renderer/app.js (figureEl), src/main.js (`clip:image` via clipboard.writeImage + nativeImage), src/preload.js, renderer/styles.css (fig block) | image-view ✓ | S | 1 | merged 736ffd2 (F-019) |
| add-ids | "Add by identifier" dialog: ISBN, DOI, PMID, PMCID, arXiv, ADS Bibcode, links; several at once; ISBN = free copy via Open Library/Internet Archive else explain | src/identify.js, src/main.js (resolve/pdf:fetch), renderer/app.js (add dialog), styles.css (addid block), test/identify.test.js | — | M | 1 | merged 40bb2c7 |
| image-box | Capture-image tool in viewer: thin coloured outline Square annotation, recolour/note/delete/undo | renderer/annotator.js, styles.css (.pv block) | — | M | 1 | merged 40bb2c7 |
| image-extract | core.js reads Square annots → result.images {id,n,page,rect,color,comment,at,topic}; image inside a fact sorts before it | renderer/core.js, test/core.test.js, test/fixtures/ | — | M | 1 | merged 40bb2c7 |
| image-view | "With images" reader toggle, centred crops interleaved by `at`; images in colour filter | renderer/app.js (reader), styles.css (reader block) | image-extract, images.js scaffold | M | 1 | merged 40bb2c7 |
| T-014 onboarding-tour | First-run guided tour, 3 chapters (app/reader/viewer), seen flags in settings.tour, Help › Show Tour | new renderer/tour.js, renderer/app.js (data-tour hooks, maybeTour/startTour, menu `tour`), renderer/annotator.js (2 hooks), renderer/index.html, renderer/styles.css (own block), src/main.js (Help menu), test/tour.test.js | — | M | 1 | merged 43721ca (F-022) |
| image-export | Export formats: Markdown+images folder, Obsidian, HTML (self-contained), plain; doc + library | renderer/app.js (export), src/main.js (export:bundle), src/preload.js | image-extract, images.js scaffold | M | 1 | merged 40bb2c7 |
| T-017 long-paste-add-link (bug · exempt) | Pasting a long clipboard item into "Add by link" fails. Reproduce, find the length/format that breaks it, fix. Accept: a long paste (multi-line, several ids, very long URL) is parsed or rejected with a clear message, never errors; test in identify.test.js | renderer/app.js (add dialog), core/identify.js, test/identify.test.js | — | S | 1 | merged 20a8e58 (Sprint 5, F-025) |
| T-018 colour-filter-without-images (bug · exempt) | Colour filter is hidden unless "With images" is on (it shows only when >1 colour, and images add colours). Accept: the filter shows whenever the extract has highlights, images on or off | renderer/app.js (renderReader colour block) | — | XS | 1 | merged 20a8e58 (Sprint 5, F-025) |
| T-019 extract-sentence-split (bug · exempt) | Extracts sometimes don't separate, even across " . ". Accept: a fixture with the failing case splits into separate extracts; existing snapshots unchanged or updated knowingly (ANALYZER_VERSION bump if results change) | core/extract.js, test/core/ | — | S | 1 | merged 20a8e58 (Sprint 5, F-025) |
| T-002 offline-vs-unreachable (bug · exempt) | (proposal, pulled into Sprint 5) Tell "no connection" apart from "couldn't reach that site" | core/fetch.js, renderer/app.js (add dialog messages) | — | S | 1 | merged 20a8e58 (Sprint 5, F-025) |
| T-008 pmc-fallback (bug · exempt) | (proposal, pulled into Sprint 5) PMC bot-check page: fall back to Europe PMC / Unpaywall for PMCID/PMID | core/fetch.js, test/ | — | S | 2 | merged 20a8e58 (Sprint 5, F-025) |
| T-020 continue-reading (enhancement) | Viewer remembers the last page per PDF; "Continue reading" opens it there. Accept: close at p. 12, reopen → p. 12; new PDFs open at p. 1 | renderer/annotator.js, renderer/app.js (viewer open), core/library.js (`d.lastPage`) | library-doc-fields scaffold | S | 1 | merged 9ff7a30 (Sprint 6, F-026) |
| T-022 search-current-pdf (enhancement) | Search scoped to the open PDF's extracts (sentence/highlight/note). Accept: a word in two PDFs matches only the open one | renderer/app.js (search panel) | — | S | 1 | merged 9ff7a30 (Sprint 6, F-026) |
| T-023 search-current-library (enhancement) | Search scoped to the selected library. Accept: matches limited to that library's PDFs | renderer/app.js (search panel), core/library.js | T-022 (same panel) | S | 1 | merged 9ff7a30 (Sprint 6, F-026) |
| T-024 tag-colours (enhancement) | Assign a colour to each tag; shown on tag chips in the library and on PDFs. Accept: colour persists across restart; CLI/MCP unaffected | renderer/app.js (tags), core/library.js (`db.tagColours`), renderer/styles.css | library-doc-fields scaffold | S | 2 | merged 9ff7a30 (Sprint 6, F-026) |
| T-026 mark-as-read (enhancement) | Toggle read/unread per PDF; read PDFs look distinct in the list and can be filtered. Accept: toggle from item menu, persists | renderer/app.js (doc list, item menu), core/library.js (`d.read`) | library-doc-fields scaffold | S | 2 | merged 9ff7a30 (Sprint 6, F-026) |
| T-021 multi-select (enhancement) | Select one or several PDFs (click, Ctrl/Shift-click) and apply move/tag/star/remove to all. Accept: Shift-select 3, move to a library, all 3 move | renderer/app.js (doc list, item actions), renderer/styles.css | — | M | 1 | merged c9791cc (Sprint 7, F-028) |
| T-027 section-numbering (feature) | Keep the document's heading structure and numbering (e.g. "12.1.12 Section A") in exports. Accept: a numbered-heading fixture exports with the same numbers and nesting | core/topics.js, core/export.js, test/ | — | M | 1 | merged c9791cc (Sprint 7, F-028) |
| T-028 loose-marks-as-clips (enhancement) | Highlights over images/scans with no text (today `result.loose`, page numbers only) become image clips in the extract and exports. Accept: a text-less highlight shows as a cropped image | core/extract.js, renderer/app.js (reader), renderer/images.js | — | M | 2 | merged c9791cc (Sprint 7, F-028) |
| T-025 markdown-notes (enhancement) | Own Markdown notes and section headings between extracts, kept in place and included in exports. Accept: add a note after extract 3, export → note sits after it | renderer/app.js (reader), core/export.js, core/order.js, core/library.js (`d.notes`) | — | L | 1 | planned · Sprint 8 |
| T-029 shelves (feature) | Shelves (sub-libraries) inside a library; move PDFs between shelves; CLI/MCP aware. Accept: create shelf, move 2 PDFs, they show under it after restart | core/library.js, renderer/app.js (sidebar, doc list), cli/, mcp/server.js | T-021 | L | 2 | planned · Sprint 8 |
| T-035 source-title (enhancement) | When the source gives a better title (e.g. the PMC bucket's "GenBank"), prefer it over the PDF's embedded title. Accept: add that PMC paper → title "GenBank", not "OP-NARE120883 36..42" | cli/faelights.js, src/main.js (title priority), core/meta.js | — | S | 2 | planned · Sprint 8 |
| T-030 ocr (feature) | OCR for scanned pages and image crops so their text is extracted. Needs engine decision (offline). | core/extract.js, renderer/app.js (reader), package.json | T-028 | L | 1 | planned · Sprint 9 |
| T-031 ai-merge (feature) | AI merge/polish of fragmented highlights into cleaner notes, from highlighted text only. Needs provider + network decision (D-009) | renderer/app.js (reader), core/export.js, src/main.js, package.json | T-025 | L | 1 | planned · Sprint 9 |
| T-032 svg-diagrams (feature) | Export embedded diagrams as lossless SVG for Notion/Obsidian. Needs capture-method decision | renderer/images.js, core/export.js, renderer/annotator.js | T-028 | L | 2 | planned · Sprint 10 |
| T-033 accounts (feature) | User accounts and account management. Needs a backend decision | — | backend decision | L | 3 | parked |
| T-034 library-sharing (feature) | Share libraries with other users | — | T-033 | L | 3 | parked |

## Sprints

| sprint | status | scope | result |
|---|---|---|---|
| 10 | planned | T-032 svg-diagrams (+ T-033/T-034 if approved) | — |
| 9 | planned | T-030 ocr, T-031 ai-merge | — |
| 8 | planned | T-025 markdown-notes, T-029 shelves, T-035 source-title | — |
| 7 | **closed** 2026-10-21 (tag `sprint-7-end`, main c9791cc) | T-016 mcp-server (L), T-021, T-027, T-004, T-028, T-037 (7 slots, user OK to go over 5) + exempt T-005, T-009, T-011, T-036, T-038 | 207/207 |
| 6 | **closed** 2026-10-21 (tag `sprint-6-end`, main 9ff7a30) | T-020 continue-reading, T-022 search-current-pdf, T-023 search-current-library, T-024 tag-colours, T-026 mark-as-read | 168/168 |
| 5 | **closed** 2026-10-21 (tag `sprint-5-end`, main 20a8e58) | bugs: T-017, T-018, T-019, T-002, T-008 (all exempt) | 156/156 |
| 4 | **closed** 2026-10-10 (tag `sprint-4-end`, main 43721ca) | T-014 onboarding-tour | 81/81 |
| 3 | **closed** 2026-10-09 (tag `sprint-3-end`, main 736ffd2) | T-012 copy-image, T-001 meta-enrich (+ T-013 exempt, just before) | 69/69 |
| 2 | **closed** 2026-10-09 (tag `sprint-2-end`, main 40bb2c7) | add-ids, image-box, image-extract, image-view, image-export | 63/63 |
| 1 | **closed** 2026-10-09 (tag `sprint-1-end`, c5c0dbe) | item-actions, add-by-identifier, test-harness | 23/23 |

Newest first. "Between sprints" entries are small fixes merged outside a sprint.

### Sprint 7 — closed (2026-10-21)
- Scope (7 slots, user approved): T-016 mcp-server (L, built earlier on its branch), T-021 multi-select, T-027 section-numbering, T-004 second-test-pdf, T-028 loose-marks-as-clips, T-037 cli-mcp-sprint6-fields; exempt: T-005, T-009, T-011, T-036, T-038. Release: v1.3.2 (user: stay on 1.3.x).
- Backup: `backup/sprint-7-pre-20261021` · Tag: `sprint-7-start` (202abe5) · Baseline: 168/168
- Merge flow: `feature/s7-integration` (worktree `../fl-s7`); agents in `../fl-T-021`, `../fl-T-027`, `../fl-T-028` (T-004 → T-028 in sequence), `../fl-T-037`; exempt fixes built directly in `../fl-polish`.
- Merge log (into feature/s7-integration):
  | order | id | merge sha | conflicts | tests after |
  |---|---|---|---|---|
  | 0 | T-016 mcp-server | e4a8f25 | docs only (kept main's; compass ids F-025/D-018/D-019 on the branch clash with Sprint 5 — renumber at close) | 183/183 |
  | 1 | T-036 strip-tracking-params (exempt) | 522569d | none (T-017 long-link test now expects utm_source dropped) | 184/184 |
  | 2 | T-005 view-label (exempt) | 51ea40f | none | 184/184 |
  | 3 | T-038 tag-colour-swatches (exempt) | 19f06ca | openMenu doc comment (both kept) | 184/184 |
  | 4 | T-009 isbn-edition-title (exempt) | 26e9e5e | none | 185/185 |
  | 5 | T-037 cli-mcp-sprint6-fields | 7cc6433 | none | 188/188 (1 flaky failure on first run, 6 clean reruns) |
  | 6 | T-021 multi-select | 7e7e071 | none | 195/195 |
  | 7 | T-027 section-numbering | 27c4d2b | none (ANALYZER_VERSION 4 → 5) | 199/199 |
  | 8 | T-011 fold-ckey-groups (exempt) | 6e8fefb | none (built after T-027: export.js groupsOf = Order.groupItems) | 199/199 |
  | 9 | T-004 second-test-pdf | (merge) | none | 201/203 — marks.pdf expects unnumbered bookmark titles; fixed in 10 |
  | 10 | T-028 loose-marks-as-clips | fa56121 | order.js comment, styles.css EOF (both kept); groupItems now takes flat export items too (T-011 × T-028); marks tests updated for T-027 numbering; ANALYZER_VERSION stays 5 | 207/207 |
- Checked: integration app on a scratch profile with marks.pdf + sample.pdf → both v5, marks.pdf 3 clips, numbered topics on both.
- 2026-10-21: user asked "is sprint 7 ready to merge, if yes merge" → merged into local main c9791cc; 207/207; tag `sprint-7-end`. Atlas synced (all modules, incl. T-016 docs redone), compass F-027 (MCP, renumbered from the branch's F-025), F-028, D-021…D-024. User: sync with remote and publish version → v1.3.2.
- Test rounds: 168 (baseline) → 183 → 184 → 184 → 184 → 185 → 188 → 195 → 199 → 199 → 201/203 → 207; new failures left: 0

### Sprint 6 — closed (2026-10-21)
- Scope (5 slots): T-020 continue-reading, T-022 search-current-pdf, T-023 search-current-library, T-024 tag-colours, T-026 mark-as-read (all enhancement · S).
- Backup: `backup/sprint-6-pre-20261021` · Tag: `sprint-6-start` (3cbd93e) · Baseline: `npm test` 156/156 green
- Merge flow: branches merge into `feature/s6-integration` (worktree `../fl-s6`); user tries the build (gate 1) → main; push = gate 2
- Scaffold (tech lead): `refactor/library-doc-fields` — `normalize` fills `d.read`, `d.lastPage` (0 = never opened), `db.tagColours`; helpers `setRead`, `setLastPage`, `setTagColour`, `tagColour`; new docs get read/lastPage in app.js. 159/159. Merged into s6-integration d6de5cc. Shelves/notes fields left for Sprint 8.
- Dispatch: 4 agents in parallel, worktrees `../fl-T-020`, `../fl-T-022`, `../fl-T-024`, `../fl-T-026`, all cut from s6-integration d6de5cc. T-022 → T-023 run by one agent in sequence (same search panel; T-023 branch cut from T-022). The library scope select already existed, so T-023 = default scope to the library you came from + "Search this library" in the library menu.
- app.js regions: T-020 `annotate()` + reader `r-actions`; T-022/23 search view, `libraryMenu`, keyboard handler; T-024 sidebar tags + `tags-inline` line + reader `tagedit`; T-026 `docMenu`, list header/tools, doc row, `visibleDocs`, reader `r-meta`. Each appends its own styles.css block. Expected textual overlap: T-024/T-026 in the list row, styles.css EOF.
- Merge log (into feature/s6-integration):
  | order | id | merge sha | conflicts | tests after |
  |---|---|---|---|---|
  | 0 | refactor/library-doc-fields (scaffold) | d6de5cc | none | 159/159 |
  | 1 | T-020 continue-reading | b11694e | none | 162/162 |
  | 2 | T-024 tag-colours | (merge) | styles.css EOF: kept T-020 + T-024 blocks | 162/162 |
  | 3 | T-026 mark-as-read | (merge) | styles.css EOF: kept all blocks; list row auto-merged (is-read class + tint on chips) | 162/162 |
  | 4 | T-022 search-current-pdf | (merge) | styles.css EOF: kept all blocks | 166/166 |
  | 5 | T-023 search-current-library | 374a109 | none | 168/168 |
  | 6 | fix: menu/start-screen labels drop "all" (flagged by the T-022 agent) | (commit) | — | 168/168 |
- Checked in the running app (fresh `--user-data-dir`, driven over DevTools): viewer closed on p. 2 → `lastPage` 2, "Continue · p. 2" shown, reopening lands on p. 2; Read toggle → `.is-read` row + Read pill, Unread filter → "No unread PDFs" + Show all; tag colour on sidebar dot, list chip and reader chip; search scope list has "This PDF — Notes on Bioluminescence", entering from Inbox defaults to Inbox. After a restart: read, lastPage, tag and colour all kept. No console errors.
- 2026-10-21: user asked to check, bump the version, publish, merge and push → merged into local main 9ff7a30; 168/168; tag `sprint-6-end`. Atlas synced, compass F-026, D-020. Version first bumped to 1.4.0 and tagged; user preferred 1.3.x, so the v1.4.0 tag and draft were deleted (unpublished) and it ships as v1.3.1. The v1.3.0 draft was published too (user).
- Test rounds: 156 (baseline) → 159 → 162 → 162 → 162 → 166 → 168 → 168 (main 9ff7a30); new failures introduced: 0

### Sprint 5 — closed (2026-10-21)
- Scope: all bugs (each exempt, 0 slots): T-018, T-019, T-017, T-008, T-002.
- Backup: `backup/sprint-5-pre-20261021` · Tag: `sprint-5-start` (7ead2d6) · Baseline: `npm test` 142/142 green
- Merge flow: branches merge into `feature/s5-integration` (worktree `../fl-s5`); user tries the build (gate 1) → main; push = gate 2
- Dispatch: T-018 built directly (XS). Agents in worktrees: T-019 (core/extract.js), T-017 (core/identify.js parser + app.js add dialog), T-008 (core/fetch.js). T-002 queued: it shares `fetchFailureReason` in core/identify.js with T-017's file and the fetch path with T-008; it starts once both are back.
- T-019 leftovers: "vitamin C. The" fixed on user request (64bc2b7): a lone capital + full stop ends a sentence when a common opener follows (The, This, We, However…); "J. Smith", "J. A. Smith" stay whole. Still open: "Smith et al. Nature 2020" splits. "Group A. Patients" fixed after Sprint 7 (`bug/T-019-label-before-initial`: a capital after a label word ends the sentence; ANALYZER_VERSION 6).
- T-017: cause was `parseIdentifier`'s 2048-char cap (links with long tracking tails = "Not recognised", paste did nothing), invisible chars (zero-width, soft hyphen), and `id:parseMany` silently keeping only 200. Cap now 16384, linear-time tidy, invisible chars stripped, >200 items / >100k chars refused with a message. The 200 limit is written in both app.js (`ADD_MAX`) and main.js: keep in sync.
- T-008: Europe PMC is Cloudflare-walled too, so the fix fetches from NCBI's PMC Open Access bucket (`pmc-oa-opendata.s3.amazonaws.com`) first, then Europe PMC, then PMC. All failing → `no-free-copy` (was `paywalled`). Unpaywall skipped (no API contact email in the repo). Only open-access PMC papers are fully fixed. Live: CLI `add PMC3531190` OK, its PMID → same file. New host to note in atlas/compass.
- T-002 started after T-017 and T-008 merged (worktree `../fl-T-002`, harness worktree isolation failed on a path-case check), so it may also edit core/fetch.js.
- T-002: new reason `unreachable` ("Couldn't find that site…", Open in browser). `fetchFailureReason(err, url)`: no-connection codes → offline; DNS/refused → offline for the app's own service hosts (doi.org, crossref, arxiv, ncbi, PMC bucket, europepmc, openlibrary, archive.org, adsabs), else unreachable; no url → offline (old behaviour). DOI path now also tries CrossRef links when the publisher host is unreachable. Wi-Fi-without-internet limit fixed on user request (1ee74af): before reporting `unreachable`, `resolvePdf` checks that doi.org answers; if it is offline too → `offline`. Costs one extra request only on that failure.
- 2026-10-21: all 5 merged on feature/s5-integration @ dafb4c9, 156/156 green. Gate-1 launch blocked by the installed app holding the single-instance lock; user reviewed the report, asked for the two leftovers to be fixed (follow-ups 6, 7), then said merge.
- 2026-10-21: user OK → merged into local main 20a8e58; 156/156; tag `sprint-5-end`. Atlas synced (fbf5430), compass F-025, D-018, D-019. User gate 2 OK → pushed 7ead2d6..3cbd93e; CI run 39585050117 green (tests + all three builds). No version tag.
- Test rounds: 142 (baseline) → 142 → 145 → 147 → 152 → 156 → 156 → 156 (integration) → 156 (main 20a8e58); new failures introduced: 0
- Cause of T-002 found while reading: `ERR_NAME_NOT_RESOLVED` / `ENOTFOUND` are in `OFFLINE_CODES`, so a mistyped domain reads as "offline".
- Merge log (into feature/s5-integration):
  | order | id | merge sha | conflicts | tests after |
  |---|---|---|---|---|
  | 1 | T-018 colour-filter-without-images | 627e376 | none | 142/142 |
  | 2 | T-019 extract-sentence-split | c3bbab0 | none (ANALYZER_VERSION 3 → 4: saved docs re-analyse; atlas mentions v3, fix at sync) | 145/145 |
  | 3 | T-017 long-paste-add-link | 8a3f3a1 | none (app.js auto-merged); also src/main.js `id:parseMany` 200 → 201 so the dialog can refuse >200 | 147/147 |
  | 4 | T-008 pmc-fallback | b53a36f | none | 152/152 |
  | 5 | T-002 offline-vs-unreachable | dafb4c9 | none (cut from s5-integration b53a36f) | 156/156 |
  | 6 | T-019 follow-up (lone capital + sentence opener splits) | aa263b5 | none | 156/156 |
  | 7 | T-002 follow-up (doi.org check before 'unreachable') | c0cc984 | none | 156/156 |

### Sprint 4 — closed (2026-10-10)
- Scope: T-014 onboarding-tour (feature · M). A single feature, so it was built directly with no sub-agents.
- Baseline on main e53e35e: `npm test` 69/69 green.
- Backup: `backup/sprint-4-pre-20261010` · Tag: `sprint-4-start` (e53e35e)
- Branch `feature/T-014-onboarding-tour`: 78/78 at first build, 81/81 after the user's follow-ups (9 new tests in test/tour.test.js, including a guard that every `data-tour` hook the steps use still exists in the renderer).
- Checked in the running app (fresh profile via `--user-data-dir`, driven over DevTools): welcome card on first launch; all 11 app steps land on their targets; "Try a sample PDF" on the last step adds the sample and the reader chapter starts (9 of 10 steps; With images skipped as expected); View starts the viewer chapter (5 steps); Esc/Delete/J during the tour don't reach the app; Skip persists across a reload; light and dark themes.
- Decision: the spotlight dims with a clip-path cut-out, not a 9999px box-shadow, because Chromium in this Electron didn't paint the huge shadow.
- User feedback on the branch (all built on it before merge): a step for the per-extract copy icon (shown while spotlit); a PDF with no extracts used up the reader chapter, so seen-tracking became per step and skipped steps show later as a follow-up; a "Start here" step for the empty-library Add buttons ("Your PDFs" now waits for a PDF).
- Merge log:
  | order | id | merge sha | conflicts | tests after |
  |---|---|---|---|---|
  | 1 | T-014 onboarding-tour | 43721ca | none | 81/81 |
- 2026-10-10: user gate 1 OK → merged into local main 43721ca; 81/81; tag `sprint-4-end`. Atlas synced at 43721ca; compass F-022, D-015. User gate 2 OK → pushed e53e35e..f0168db; CI run 38038099830 green (tests + all three builds). No version tag yet.
- Test rounds: 69 (baseline) → 78 → 81 (branch) → 81 (main 43721ca); new failures introduced: 0

### Sprint 3 — closed (2026-10-09)
- Scope: T-012 copy-image (enhancement · S), T-001 meta-enrich (feature · M). 2 of 3 slots; third slot unused.
- Before it: T-013 installed-app icon (bug · S · exempt) + board docs merged into main eb99c96 (user OK 2026-10-09), 63/63.
- Backup: `backup/sprint-3-pre-20261009` · Tag: `sprint-3-start` (eb99c96) · Baseline: `npm test` 63/63 green
- Merge flow: branches merge into `feature/s3-integration`; user tries the build (gate 1) → main; push = gate 2
- Built directly (two features, no sub-agents), each on its own branch from main.
- Merge log (into feature/s3-integration):
  | order | id | merge sha | conflicts | tests after |
  |---|---|---|---|---|
  | 1 | T-012 copy-image | 9d8820f | none | 63/63 |
  | 2 | T-001 meta-enrich | 269424f | none (main.js/preload.js/app.js touched in different places) | 69/69 |
- Decision: online details are stored in `d.lookup` rather than `d.meta`, because `rescan()` rebuilds `d.meta` from the PDF; the Info card shows `d.meta` overlaid with `d.lookup.meta`.
- 2026-10-09: user tried the build (gate 1) OK → merged into local main 736ffd2; 69/69; tag `sprint-3-end`. 2026-10-10: user gate 2 OK → pushed (7409d7d..b146661, together with Sprint 2, polish, T-013 and ci/github-releases); released as v1.2.1 (v1.2.0's CI run failed on a native-module rebuild; fixed with npmRebuild: false).
- Compass: F-018 (T-013), F-019 (T-012), F-020 (T-001); D-013, D-014. Atlas synced at 736ffd2.
- Test rounds: 63 (baseline) → 63 → 69 (integration) → 69 (main 736ffd2); new failures introduced: 0
- Checks: clipboard round-trip of a PNG in Electron OK; parsers checked against live CrossRef (10.1038/nature14539) and arXiv (1706.03762); bad arXiv id → none; unknown DOI → 404 → "not found".

### Between sprints — after Sprint 2 (2026-10-09)
- `fix/taskbar-icon-size` (055a74f) + `feature/metadata-label` (47e8eeb, "Metadata" label on the reader's ⓘ button), built directly (XS each, no shared files). Combined on `feature/polish-integration`, 63/63; user gate 1 OK → main fast-forwarded to f541b3f, 63/63. Push awaits gate 2. Compass F-017.

### Sprint 2 — closed (2026-10-09; user scope: add-ids + image capture only; meta-enrich left out)
- Backup: `backup/sprint-2-pre-20261009` · Tag: `sprint-2-start` (44379a0) · Baseline: `npm test` 23/23 green
- Merge flow: waves merge into `feature/s2-integration`; user tries the combined build (gate 1) before anything reaches main, push = gate 2
- Scaffold (tech lead): `renderer/images.js` (`Images.crop/png/forget`) + script tag, so image-view and image-export run in parallel
- Wave 1: add-ids, image-box, image-extract (no shared files except separate styles.css blocks)
- Wave 2: image-view, image-export (both need result.images; app.js different regions). Started in parallel with wave 1 against the fixed contract (5 agents in flight); merges still one at a time in dependency order: image-extract → image-box → add-ids → image-view → image-export
- Known textual overlaps to resolve at merge: renderReader toolbar block (image-view toggle vs image-export fmt/eb lines), index.html script lines (order.js, exportfmt.js), preload.js wrappers (add-ids, image-export), styles.css appended blocks; image-export's local merge helper to be swapped for image-view's
- Decisions: ISBN = free copy (Open Library / Internet Archive) else explain + Open in browser / Add from file. Image colours join the existing colour filter (no group-by-colour).
- Merge log (into feature/s2-integration):
  | order | id | merge sha | conflicts | tests after |
  |---|---|---|---|---|
  | 1 | image-box | 7963874 | none | 23/23 |
  | 2 | image-extract | 207c7d7 | none (ANALYZER_VERSION → 3) | 34/34 |
  | 3 | image-view | 96051c7 | none (styles.css auto-merged) | 44/44 |
  | 4 | image-export | d62427f | index.html script tags (kept order.js + exportfmt.js); swapped local exportItems for Order.withImages; Copy uses filteredImages | 57/57 |
  | 5 | add-ids | 96e2507 | main.js require lines (kept parseIdentifiers + exportPaths) | 63/63 |
- 2026-10-09: all 5 merged on feature/s2-integration @ 96e2507, 63/63 green; app launched from integration
- 2026-10-09: user gate 1 OK → merged into local main 40bb2c7 (main had moved to fb7b548, board auto-merged); 63/63 green; tag `sprint-2-end`; app relaunched from main. Push to GitHub awaits gate 2.
- Compass: F-014 add-ids, F-015 image-box + image-extract + image-view, F-016 image-export; D-011, D-012. Atlas synced at 40bb2c7.
- Test rounds: 23 (baseline) → 23 → 34 → 44 → 57 → 63 (integration) → 63 (main 40bb2c7); new failures introduced: 0
- Contract `result.images[]`: `{id, n, page, rect:[x1,y1,x2,y2] PDF user space normalised, color:[r,g,b] 0-255, comment, at, topic}`; sorted by `at`; consumers put an image before entry e when `img.at <= e.at`

### Between sprints — after Sprint 1 (2026-10-09)
- `fix/list-add-and-reader-tools` (F-013): Add PDFs + add-by-link buttons in the PDF list header; reader toolbar left-aligned (spacer removed). Small, so built directly without sub-agents.
- Tests: 23/23 on branch and on main (e4be24f). User OK on branch (gate 1) and main (gate 2); pushed 57deb0f..e4be24f.

### Sprint 1 — closed
- Backup: `backup/sprint-1-pre-20261009` · Tags: `sprint-1-start`, `sprint-1-end` (c5c0dbe)
- Baseline tests on main: none exist (project has no tests) · manual launch check only
- Features: item-actions (`feature/s1-item-actions`), add-by-identifier (`feature/s1-add-by-identifier`), test-harness (`test/s1-test-harness`)
- Why split: meta-enrich vs add-by-identifier — depends on its fetch layer and shares main.js/preload.js.
- Shared files: item-actions and add-by-identifier both touch app.js (different regions) and styles.css (separate appended blocks). Merge order: test-harness → item-actions → add-by-identifier.

- 2026-10-09: main moved mid-sprint (another session merged View button b78d3b7 + My publications 009f4df, already pushed). Merged main into all three branches: docMenu kept themed items + added 'Mark as my publication' (pub icon); styles.css kept both blocks.
- Trial integration (detached, ../fl-trial): main + test-harness + item-actions + add-by-identifier → conflicts only ICON `link` (identical, kept one) and styles.css EOF (kept both). npm test 23/23.

**Merge log**
| order | id | merge sha | conflicts resolved | tests on main after |
|-------|----|-----------|--------------------|---------------------|
| 1 | test-harness | c6748e9 | none | 7/7 |
| 2 | item-actions | f576105 | none (main already merged into branch: docMenu + My publications item, styles.css both blocks) | 7/7 |
| 3 | add-by-identifier | c5c0dbe | ICON link (identical, kept one); styles.css both blocks | 23/23 |

**Test rounds**
| time | sha | result | new failures vs baseline |
|------|-----|--------|--------------------------|
| 2026-10-09 | trial 34a2d31 (all 3 on main 2703544) | 23/23 pass | none (baseline had no tests) |
| 2026-10-09 | c6748e9 | 7/7 | none |
| 2026-10-09 | f576105 | 7/7 | none |
| 2026-10-09 | c5c0dbe (sprint close) | 23/23 | none |

## Proposed (recommendations awaiting user approval)
All open proposals are listed with todo ids under **To do** above: T-003 … T-006, T-009 … T-011. New proposals get the next free id.

- [ ] **T-035** [enhancement · S] (Sprint 8) When an added paper comes with a better title from its source (e.g. the PMC bucket's "GenBank"), prefer it over the PDF's embedded title (CLI showed "OP-NARE120883 36..42"). Check title priority in cli/faelights.js and src/main.js. (from T-008)
- [x] **T-037** [enhancement · S] (Sprint 7) CLI/MCP support for the Sprint 6 fields: `read`/`unread`, `--unread` filter on `list`, `tag colour <tag> <#hex>`. (from T-024/T-026)
- [x] **T-038** [polish · XS · exempt] (Sprint 7) Show a colour swatch beside each name in the tag colour menu (needs an `openMenu` item swatch). (from T-024)
- [x] **T-036** [polish · XS · exempt] (Sprint 7) Strip `utm_*` and similar tracking parameters from doi.org links before resolving, so `10.1038/x?utm=…` doesn't fail. (from T-017)

- [ ] **T-039** [enhancement · S] MCP `unreadable_marks` should skip marks that are now clips (or add rect/topic); CLI help still says captured images aren't exported, mention clips. (from T-028)
- [ ] **T-040** [polish · XS · exempt] Bulk "Export selected" and a "N PDFs" drag image for multi-select; a tag icon for Add tag. (from T-021)
- [ ] **T-041** [feature · L, likely several sprints] iOS and Android app (asked by user 2026-10-21). Faelights is desktop-only today (Electron). Reuse `core/` (plain JS) and pdf.js in a Capacitor shell; replace the Electron/Node parts (file access and library folder, clipboard, export dialogs, main-process IPC) with mobile equivalents; one-pane phone layout. Needs decisions first: Capacitor vs. a native rewrite, how the library syncs with the desktop (D-009 offline-first, no server today), app-store signing (Apple developer account). Suggest a spike: read-only reader on Android first.

## Decisions
- 2026-10-21 — T-035 source-title joins Sprint 8 as its 5th slot (user).
- 2026-10-21 — Sprint 7 takes T-016 (MCP server) so T-037 covers MCP too: 7 slots, over the 3–5 setting, by user choice. Version bump stays on 1.3.x → v1.3.2 (user).
- 2026-10-21 — Sprint plan 5–10 from the Trello board: Sprint 5 = all bugs, sizable items in later sprints, 3–5 slots per sprint (user). Authors-on-separate-lines bug ignored (user). Accounts and sharing parked pending a backend decision.
- 2026-10-09 — Item actions: themed in-app menu + ⋯ trigger (not hover bar / command palette).
- 2026-10-09 — Network access allowed on explicit user request (add by DOI/link) and for metadata enrichment; supersedes the compass "no network calls" non-goal (log as new D-entry at close).
- 2026-10-09 — Add a test harness this sprint.
- 2026-10-09 — User tried the combined build (gate 1) and said OK; merged locally. Pushed 2026-10-10 (gate 2).
- 2026-10-09 — App must work fully offline. Network only on explicit user action (add by DOI/link, metadata lookup); offline gives a distinct friendly "offline" error, fails fast, offers add-from-file fallback; nothing else may depend on network. Applies to add-by-identifier (sent mid-sprint) and meta-enrich (Sprint 2: enrichment must be optional, never block add/open, cached in d.meta so it shows offline).
