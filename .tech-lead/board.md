# Tech Lead Board — Faelights

_Last updated: 2026-10-10 · Current sprint: 4 closed (T-014 merged locally, 43721ca) · main: green 81/81 · push to GitHub awaits gate 2 (last push: v1.2.1)_

## Settings
- Capacity: 3 parallel features per sprint · minor bugs/polish (XS/S) are exempt and don't count
- Todo ids: `T-NNN`, next free: T-015 · types/branch prefixes: `feature/` `enhancement/` `bug/` `polish/` → `<type>/<todo-id>-<slug>`
- Timebox: one implementation pass + one fix pass
- Test command: `npm test` (Node >= 21) · Build: `npm start` smoke launch
- Pause between sprints: no (merges to main need user OK per CLAUDE.md; pushing needs a second OK)

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
- [ ] **T-004** [enhancement · S] Second test PDF (underline, strike-through, bookmark and wording topics, marks with no text). (The "run `npm test` in the GitHub build" half was done 2026-10-10 on `ci/build-on-push`.)
- [ ] **T-005** [polish · XS · exempt] Rename "Annotate" in the PDF menu to "View"; remove the unused native-menu IPC (`menu:popup`).
- [ ] **T-006** [enhancement · S] Dev-only setting for a separate library folder, so a test copy can run while the real app is open.
- [ ] **T-008** [bug · S · exempt] PMC serves a bot-check page instead of PDFs, so PMCID (and PMIDs that resolve to PMC) may fail: try Europe PMC / Unpaywall.
- [ ] **T-009** [polish · XS · exempt] ISBN lookup may pick a scan of another edition: show the edition title in the result row.
- [ ] **T-010** [enhancement · S] Move and resize image boxes in the viewer (today: delete and redraw).
- [ ] **T-011** [polish · XS · exempt] `ckey` is duplicated in order.js and app.js, and `groupsOf` overlaps `Order.groupItems`: fold both into order.js.

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

## Sprints

| sprint | status | scope | result |
|---|---|---|---|
| 4 | **closed** 2026-10-10 (tag `sprint-4-end`, main 43721ca) | T-014 onboarding-tour | 81/81 |
| 3 | **closed** 2026-10-09 (tag `sprint-3-end`, main 736ffd2) | T-012 copy-image, T-001 meta-enrich (+ T-013 exempt, just before) | 69/69 |
| 2 | **closed** 2026-10-09 (tag `sprint-2-end`, main 40bb2c7) | add-ids, image-box, image-extract, image-view, image-export | 63/63 |
| 1 | **closed** 2026-10-09 (tag `sprint-1-end`, c5c0dbe) | item-actions, add-by-identifier, test-harness | 23/23 |

Newest first. "Between sprints" entries are small fixes merged outside a sprint.

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
- 2026-10-10: user gate 1 OK → merged into local main 43721ca; 81/81; tag `sprint-4-end`. Atlas synced at 43721ca; compass F-022, D-015. Push awaits gate 2.
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
All open proposals are listed with todo ids under **To do** above: T-002 … T-006, T-008 … T-011. New proposals get the next free id.

## Decisions
- 2026-10-09 — Item actions: themed in-app menu + ⋯ trigger (not hover bar / command palette).
- 2026-10-09 — Network access allowed on explicit user request (add by DOI/link) and for metadata enrichment; supersedes the compass "no network calls" non-goal (log as new D-entry at close).
- 2026-10-09 — Add a test harness this sprint.
- 2026-10-09 — User tried the combined build (gate 1) and said OK; merged locally. Pushed 2026-10-10 (gate 2).
- 2026-10-09 — App must work fully offline. Network only on explicit user action (add by DOI/link, metadata lookup); offline gives a distinct friendly "offline" error, fails fast, offers add-from-file fallback; nothing else may depend on network. Applies to add-by-identifier (sent mid-sprint) and meta-enrich (Sprint 2: enrichment must be optional, never block add/open, cached in d.meta so it shows offline).
