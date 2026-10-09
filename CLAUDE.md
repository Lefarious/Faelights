# Faelights

## Project context — read before coding

1. docs/PROJECT_COMPASS.md — direction, architecture, feature history, roadmap
2. docs/atlas/ATLAS.md — how the code is wired (codebase-atlas)

After finishing a feature: run codebase-atlas `sync`, then project-compass `log`.

## Git workflow

- Never commit features directly to `main`. Start every new piece of work on its own branch cut from an up-to-date `main`.
- Never merge into `main` without the user's explicit permission. Verify on the branch, report, then ask.
- Every todo on `.tech-lead/board.md` has a todo id `T-NNN` (next free number, never reused) and a type: `feature`, `enhancement`, `bug` or `polish`.
- Todo branches: `<type>/<todo-id>-<short-kebab-description>`, types `feature/`, `enhancement/`, `bug/`, `polish/`.
  e.g. `feature/T-001-meta-enrich`, `bug/T-002-offline-vs-unreachable`, `polish/T-005-view-label`.
- Work that isn't a todo: `docs/`, `refactor/`, `chore/`, `test/`, `ci/`, `hotfix/` + `<short-kebab-description>`, e.g. `docs/codebase-atlas`.
- Sprint cap: minor bugs and polish (size XS or S) don't count toward it; everything else does.
- Commit messages: Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, `test:`, `ci:`).
