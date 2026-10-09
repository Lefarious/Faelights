# Faelights

## Project context — read before coding

1. docs/PROJECT_COMPASS.md — direction, architecture, feature history, roadmap
2. docs/atlas/ATLAS.md — how the code is wired (codebase-atlas)

After finishing a feature: run codebase-atlas `sync`, then project-compass `log`.

## Git workflow

- Never commit features directly to `main`. Start every new piece of work on its own branch cut from an up-to-date `main`.
- Never merge into `main` without the user's explicit permission. Verify on the branch, report, then ask.
- Branch names: `<type>/<short-kebab-description>`, types: `feature/`, `fix/`, `docs/`, `refactor/`, `chore/`, `test/`, `ci/`, `hotfix/`.
  e.g. `feature/app-icon`, `fix/save-error-toast`, `docs/codebase-atlas`.
- Commit messages: Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, `test:`, `ci:`).
