# Tech Lead Board — Faelights

_Last updated: 2026-10-09 · Current sprint: 2 (not started) · main: green 23/23 @ c5c0dbe (local, not pushed)_

## Settings
- Capacity: 3 parallel features per sprint
- Timebox: one implementation pass + one fix pass
- Test command: `npm test` (Node >= 21) · Build: `npm start` smoke launch
- Pause between sprints: no (merges to main need user OK per CLAUDE.md; pushing needs a second OK)

## To do

**Next sprint (Sprint 2):** meta-enrich, which fills in paper details from CrossRef and arXiv, stays optional, and keeps working offline. Any of the proposals below can join it if you approve them.

- [ ] **meta-enrich** (M, depends on F-011 ✓): fill and refresh Info fields from CrossRef (DOI) and the arXiv API. Runs when a paper is added by DOI/link and on demand from the Info card. Never blocks adding or opening a PDF; results are saved in `meta`, so they still show offline.

Proposals waiting for approval (each can join Sprint 2):

- [ ] [Risk · S] A mistyped link says "You're offline": tell "no connection" apart from "couldn't reach that site".
- [ ] [Risk · S] nature.com bot-blocks downloads, so some open-access papers fail: add an alternative-source lookup (fits meta-enrich).
- [ ] [Feature · S] Second test PDF (underline, strike-through, bookmark and wording topics, marks with no text) and run `npm test` in the GitHub build.
- [ ] [Optimization · XS] Rename "Annotate" in the PDF menu to "View"; remove the unused native-menu IPC (`menu:popup`).
- [ ] [Risk · S] Dev-only setting for a separate library folder, so a test copy can run while the real app is open.

## Backlog
| id | requirements (short) | footprint | depends on | size | priority | status |
|----|----------------------|-----------|------------|------|----------|--------|
| item-actions | Themed in-app action menu (icons, groups, danger item, keyboard, ARIA) for library + PDF actions, opened by right-click or a ⋯ button | renderer/app.js (menus, navItem, doc cards, reader library picker), renderer/styles.css (own block) | — | M | 1 | merged f576105 (F-010) |
| add-by-identifier | Add PDFs from a DOI, arXiv id, article page URL or direct PDF URL; main process downloads; clean failures with "Open in browser" | src/main.js, src/preload.js, new src/identify.js, renderer/app.js (add flow, drop/paste), renderer/styles.css (own block), test/identify.test.js | — | M | 1 | merged c5c0dbe (F-011) |
| test-harness | `npm test` via node:test; smoke tests for core.js analyzePdf on renderer/sample.pdf | package.json (scripts only), test/core.test.js, test/helpers | — | S | 1 | merged c6748e9 (F-012) |
| meta-enrich | Fill/augment doc metadata from CrossRef (DOI) and arXiv API, on add-by-identifier and on demand from the Info card | src/main.js, src/preload.js, renderer/app.js (readMeta/loadMeta/infoEl) | add-by-identifier | M | 2 | todo |

## Sprints

### Sprint 2 — planned
- Features: meta-enrich (depends on F-011, now merged). Capacity left: could add approved proposals below.

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
- [Risk] `ERR_NAME_NOT_RESOLVED` maps to "offline", so a mistyped hostname says "You're offline" — check navigator.onLine before choosing offline vs "couldn't reach site" · S · sprint 1
- [Risk] Some publishers (nature.com) serve a bot challenge to Chromium's network stack, so even open-access DOIs can fail — fall back to Unpaywall/CrossRef link lookup (fits meta-enrich) · S · sprint 1
- [Feature] Second test-fixture PDF covering underline/strike/squiggly, bookmark and wording-based topics, marks with no text — sample.pdf only covers highlights + font-size headings · S · sprint 1
- [Optimization] Doc menu still says "Annotate" while the reader button is now "View" — align the label · XS · sprint 1
- [Risk] Dev/test launch: `--user-data-dir` doesn't move userData and the single-instance lock blocks test runs while the real app is open — add a `FAELIGHTS_USER_DATA` env override for dev · S · sprint 1

## Decisions
- 2026-10-09 — Item actions: themed in-app menu + ⋯ trigger (not hover bar / command palette).
- 2026-10-09 — Network access allowed on explicit user request (add by DOI/link) and for metadata enrichment; supersedes the compass "no network calls" non-goal (log as new D-entry at close).
- 2026-10-09 — Add a test harness this sprint.
- 2026-10-09 — User tried the combined build (gate 1) and said OK; merged locally. Push to GitHub awaits gate 2.
- 2026-10-09 — App must work fully offline. Network only on explicit user action (add by DOI/link, metadata lookup); offline gives a distinct friendly "offline" error, fails fast, offers add-from-file fallback; nothing else may depend on network. Applies to add-by-identifier (sent mid-sprint) and meta-enrich (Sprint 2: enrichment must be optional, never block add/open, cached in d.meta so it shows offline).
