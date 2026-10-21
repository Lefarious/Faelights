# Faelights

## Project context — read before coding

1. docs/PROJECT_COMPASS.md — direction, architecture, feature history, roadmap
2. docs/atlas/ATLAS.md — how the code is wired (codebase-atlas)

After finishing a feature: run codebase-atlas `sync`, then project-compass `log`.

## Git workflow

- Never commit features directly to `main`. Start every new piece of work on its own branch cut from an up-to-date `main`.
- Never merge into `main` without the user's explicit permission. Verify on the branch, report, then ask.
- GitHub flow: push every branch and open a pull request into `main` (`gh pr create`; CI runs on PRs). `main` is protected: changes land only through a PR with green CI.
  - Gate 1: the user tries the branch locally and approves; then the PR is merged (merge commit, not squash) and the branch is deleted on GitHub and locally.
  - Gate 2: a release is a version bump PR plus a `v*` tag, pushed only with the user's OK.
  - Sprints: todo PRs target the sprint's `feature/sN-integration` branch; the sprint lands as one PR from it into `main`. Tags `sprint-N-start` / `sprint-N-end` mark the points (no more `backup/*` branches).
- `gh` is installed at `C:\Program Files\GitHub CLI\gh`; if it isn't logged in, pass the git credential token as `GH_TOKEN` for that command.
- Every todo on `.tech-lead/board.md` has a todo id `T-NNN` (next free number, never reused) and a type: `feature`, `enhancement`, `bug` or `polish`.
- Todo branches: `<type>/<todo-id>-<short-kebab-description>`, types `feature/`, `enhancement/`, `bug/`, `polish/`.
  e.g. `feature/T-001-meta-enrich`, `bug/T-002-offline-vs-unreachable`, `polish/T-005-view-label`.
- Work that isn't a todo: `docs/`, `refactor/`, `chore/`, `test/`, `ci/`, `hotfix/` + `<short-kebab-description>`, e.g. `docs/codebase-atlas`.
- Nothing lands on `main` between sprints. All of a sprint's docs and unmerged changes go to `main` together in the sprint's one PR, unless the user decides to drop them. Nothing trickles in after the sprint closes.
  - Docs written between sprints (board, compass, atlas, CLAUDE.md) are committed to the holding branch `docs/pending`. It never gets its own PR into `main`. Merge it into the next sprint's `feature/sN-integration`, or into the next feature branch if that comes first, then delete it.
  - Code changes made between sprints (fixes, follow-ups) wait for the next sprint and target its integration branch. Don't open a PR into `main` for them.
  - Builds and version bumps (release PR + `v*` tag) happen only at the end of a sprint, unless the user says otherwise.
- Sprint cap: minor bugs and polish (size XS or S) don't count toward it; everything else does.
- Commit messages: Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, `test:`, `ci:`).
