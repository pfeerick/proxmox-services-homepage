# AGENTS.md

Repository guidance for coding agents working in this repo.

## Tooling

- Use `bun install` to install/update the development environment.
- Use `bun run dev` to start the server with hot-reload during development.
- Use `bun test` to run the test suite.
- Use `bun run build` to bundle `static/js/app.js` into `static/js/bundle.js`. The server
  serves the bundle when it exists and the unbundled modules when it doesn't, so a stale
  `bundle.js` will silently mask frontend edits during development — delete it or rebuild.
- The Bun version is pinned in `.mise.toml` and enforced at startup by `src/index.ts`. It is
  the single source of truth: `install.sh` and the CI workflow both read the version out of
  it rather than hardcoding one.
- Respect the Commitizen workflow configured in `.cz.toml`.

## Tests

- Run the full suite with `bun test` before committing.
- Prefer targeted runs (`bun test tests/ip-parsing.test.ts`) for the specific area changed.
- Config loading tests use temp directories via `mkdtempSync` — never touch `config.toml` or `services.toml` directly in tests.
- Routes are tested through `handleRequest()` from `src/router.ts`, not by binding a port. Seed a snapshot with `setCache()` from `src/cache.ts` first.
- Frontend tests import the modules under `static/js/` directly. `tests/frontend-change-detection.test.ts` needs a DOM (the change detectors cache their state inside the render functions, so priming means rendering) and registers happy-dom.
- **happy-dom's `GlobalRegistrator.register()` replaces process-wide globals, including `Response` and `Blob`.** Bun runs all test files in one process, so always `unregister()` in `afterAll` — otherwise later files break in confusing ways (the route tests read a response body and got `"[object Blob]"`).
- `/health` caches its upstream probe for 5s and the cache isn't resettable from outside, so a test asserting on probe counts must be the first `/health` call in the process.

## Architecture

- `ProxmoxAPI` (`src/proxmox.ts`) owns its connection state and holds no references to module globals. Instantiate it directly in tests.
- `getContainers()` **throws** when the node list or a node's container list can't be fetched, so callers can tell "Proxmox is unreachable" apart from "no containers exist". Per-container detail lookups stay best-effort. Don't reintroduce a catch-all that returns `[]` — the refresh loop relies on the throw to keep the previous snapshot.
- `config` and `serviceMap` are live ESM bindings exported from `src/config.ts`. They are reassigned atomically by `reloadConfigs()`. Use `readConfig(dir)` and `readServices(dir)` with a temp directory when testing config loading in isolation.
- `readConfig()` merges the parsed TOML over `defaultConfig()`, so missing sections and keys resolve to defaults rather than `undefined`. New config keys must be given a default there.
- `reloadConfigs()` guards both the parse and the `onReload` callback, rolling back to the previous config if either throws — it runs inside the watcher's interval callback, where an escaping exception would take the process down.
- The container cache (`src/cache.ts`) is populated by a `while (true)` loop awaiting `waitOrTrigger()`, which resolves either on a `setTimeout` or early via `requestImmediateRefresh()` (used by the config reload hook). The loop is **not** started on import — `src/index.ts` calls `startRefreshLoop()` — so importing the router doesn't begin polling Proxmox. Don't move it back to module scope.
- `src/router.ts` holds the whole HTTP surface as `handleRequest(req, ctx)`, deliberately separate from `Bun.serve` in `src/index.ts` so routes are callable without a port. `ctx.clearTimeout` is how the SSE route escapes Bun's idle timeout; it's optional so tests can omit or observe it.
- `src/sse.ts` holds module-level subscriber state plus an unref'd keep-alive interval, and exports `serializeSnapshot()` — the single place the `containers`/`services` event pair is built, shared by the `/api/stream` initial payload and the cache push. It's safe to import from tests.
- `getServiceInfo()`, `computeServices()`, `escapeHtml()` and `satisfiesMinVersion()` are pure functions in `src/utils.ts` — test them directly.
- `checkConnection()` in `ProxmoxAPI` probes `/api2/json/nodes`. Assign a stub to `globalThis.fetch` (see `tests/proxmox-containers.test.ts`) or use `mock.module` when testing it. `checkHealth()` in `src/cache.ts` wraps it with a 5s result cache, so back-to-back `/health` requests don't each hit Proxmox.

## Commits and Releases

- Follow Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `ci:`, `perf:`.
- Use `cz commit` for guided commit message creation, or write manually — the commit-msg hook validates format.
- Use `cz bump --changelog --retry` for version bumps. This updates `.cz.toml` and `package.json`, generates `CHANGELOG.md`, runs pre-bump hooks (`bun install`, `git add bun.lock`), and creates the tag.
- After bumping, push with `git push --follow-tags` to ensure the release tag reaches the remote.
- If a bump commit lands without its tag, create the tag manually before running `cz bump` again.

## Code Style

- Biome is configured in `biome.json` (line length 100, 2-space indent) and covers `src/**`, `tests/**` and `static/**` — the generated `static/js/bundle.js` is excluded. Run `bun run check:fix` before committing, or rely on the pre-commit hooks to do it automatically.
- `biome.json` is strict JSON, **not** JSONC. A `//` comment doesn't error loudly — Biome discards the whole config and silently falls back to its defaults (tab indent), which shows up as every file suddenly needing a reformat.
- `static/index.html` contains `{{TITLE}}` / `{{SCRIPT}}` placeholders substituted by `src/index.ts` at request time; `html.parser.interpolation` is enabled so Biome accepts them.
- Pre-commit hooks run Biome (pre-commit stage), shellcheck, and commitizen (commit-msg stage). Install with `pre-commit install --hook-type pre-commit --hook-type commit-msg`.
- `install.sh` runs under `set -euo pipefail`. A helper whose last command is a `[[ ... ]] && ...` short-circuit returns non-zero on the false branch and aborts the script — use an explicit `if`.

## Changes

- Prefer small, focused commits over large batched ones.
- When `config.toml` is involved, note that it is git-ignored (contains the API token). `config.toml.example` is the committed template.
- `APP_DIR` (`src/config.ts`) is the canonical reference for the project root — use it, not `process.cwd()` or `"."`, when constructing file paths.
- `import.meta.dir` is Bun-specific and gives the directory of the current source file.
- Keep repo-specific instructions here concise; move broad contributor documentation to `CONTRIBUTING.md` or `README.md`.
- When a repo-specific workflow or repeated correction comes up more than once, update this file so the guidance stays current.
