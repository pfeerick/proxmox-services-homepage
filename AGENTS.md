# AGENTS.md

Repository guidance for coding agents working in this repo.

## Tooling

- Use `bun install` to install/update the development environment.
- Use `bun run dev` to start the server with hot-reload during development.
- Use `bun test` to run the test suite.
- Respect the Commitizen workflow configured in `.cz.toml`.

## Tests

- Run the full suite with `bun test` before committing.
- Prefer targeted runs (`bun test tests/ip-parsing.test.ts`) for the specific area changed.
- Config loading tests use temp directories via `mkdtempSync` — never touch `config.toml` or `services.toml` directly in tests.
- The server (`src/index.ts`) starts the background cache refresh loop when imported. Keep test files isolated to pure functions from `src/utils.ts`, `src/config.ts`, and `src/proxmox.ts` where possible.

## Architecture

- `ProxmoxAPI` (`src/proxmox.ts`) owns its connection state and holds no references to module globals. Instantiate it directly in tests.
- `config` and `serviceMap` are live ESM bindings exported from `src/config.ts`. They are reassigned atomically by `reloadConfigs()`. Use `readConfig(dir)` and `readServices(dir)` with a temp directory when testing config loading in isolation.
- The container cache (`src/cache.ts`) is populated by a `setInterval`-driven async loop. Route tests should test `computeServices()` and the data shapes directly rather than mocking the Proxmox API.
- `getServiceInfo()` and `computeServices()` are pure functions in `src/utils.ts` — test them directly.
- `checkConnection()` in `ProxmoxAPI` probes `/api2/json/nodes`. Mock `fetch` via `mock.module` when testing it.

## Commits and Releases

- Follow Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `ci:`, `perf:`.
- Use `cz commit` for guided commit message creation, or write manually — the commit-msg hook validates format.
- Use `cz bump --changelog --retry` for version bumps. This updates `.cz.toml` and `package.json`, generates `CHANGELOG.md`, runs pre-bump hooks (`bun install`, `git add bun.lock`), and creates the tag.
- After bumping, push with `git push --follow-tags` to ensure the release tag reaches the remote.
- If a bump commit lands without its tag, create the tag manually before running `cz bump` again.

## Code Style

- Biome is configured in `biome.json` (line length 100, 2-space indent). Run `bun run check:fix` before committing, or rely on the pre-commit hooks to do it automatically.
- Pre-commit hooks run Biome (pre-commit stage) and commitizen (commit-msg stage). Install with `pre-commit install --hook-type pre-commit --hook-type commit-msg`.

## Changes

- Prefer small, focused commits over large batched ones.
- When `config.toml` is involved, note that it is git-ignored (contains the API token). `config.toml.example` is the committed template.
- `APP_DIR` (`src/config.ts`) is the canonical reference for the project root — use it, not `process.cwd()` or `"."`, when constructing file paths.
- `import.meta.dir` is Bun-specific and gives the directory of the current source file.
- Keep repo-specific instructions here concise; move broad contributor documentation to `CONTRIBUTING.md` or `README.md`.
- When a repo-specific workflow or repeated correction comes up more than once, update this file so the guidance stays current.
