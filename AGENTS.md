# AGENTS.md

Repository guidance for coding agents working in this repo.

## Tooling

- Use `uv sync` to install/update the development environment (dev deps are in `[dependency-groups]`, installed by default).
- Use `uv sync --extra tailscale` to include gunicorn for Tailscale/production deployments.
- Use `uv run ...` for all repo-local Python commands (tests, ruff, cz).
- Respect the Commitizen and `uv lock` workflow configured in `pyproject.toml`.

## Tests

- Run the full suite with `uv run pytest -q` before committing.
- Prefer targeted runs (`uv run pytest tests/test_ip_parsing.py`) for the specific area changed.
- Tests use `monkeypatch` + `tmp_path` for config file tests — avoid touching real `config.yaml` or `services.yaml`.
- The app module runs side effects on import (`reload_configs`, file watcher, cache thread). This is harmless in tests; the daemon thread silently fails to reach Proxmox and does not block the suite.
- `InsecureRequestWarning` is suppressed globally in pytest config — do not re-enable it without good reason.

## Architecture

- `ProxmoxAPI` owns its connection state (`host`, `user`, `token`, `ssl_verify`, `_base_url`, `_headers`). It holds no references to module globals. Instantiate it directly in tests without mocking globals.
- `config`, `SERVICE_MAP`, and `proxmox` are all replaced atomically under `config_lock` by `reload_configs()`. When testing config-dependent behaviour, monkeypatch `app.APP_DIR` to a `tmp_path` rather than touching these globals directly.
- Container data is served from `_container_cache`, populated by a single background thread. Route tests should patch `app._container_cache` directly rather than mocking Proxmox API calls.
- `get_service_info()` reads from `SERVICE_MAP` under `config_lock`. Patch `app.SERVICE_MAP` when testing service matching in isolation.
- `check_connection()` probes `/api2/json/nodes` with a 5-second timeout. Mock `requests.get` at the `app` module level when testing it.

## Commits and Releases

- Follow Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `ci:`, `perf:`.
- Use `cz commit` for guided commit message creation, or write manually — the commit-msg hook validates format.
- Use `uv run cz bump --changelog --retry` for version bumps. This updates `pyproject.toml`, generates `CHANGELOG.md`, runs pre-bump hooks (`uv lock`, `git add uv.lock`), and creates the tag.
- After bumping, push with `git push --follow-tags` to ensure the release tag reaches the remote.
- If a bump commit lands without its tag, create the tag manually before running `cz bump` again.

## Code Style

- Ruff is configured in `pyproject.toml` (line length 100, double quotes, isort). Run `uv run ruff format .` and `uv run ruff check --fix .` before committing, or rely on the pre-commit hooks to do it automatically.
- Pre-commit hooks run ruff (pre-commit stage) and commitizen (commit-msg stage). Install with `pre-commit install --hook-type pre-commit --hook-type commit-msg`.

## Changes

- Prefer small, focused commits over large batched ones.
- When `config.yaml` is involved, note that it is git-ignored (contains the API token). `config.yaml.example` is the committed template.
- `APP_DIR` is the canonical reference for the project root inside the app — use it, not `os.getcwd()` or `"."`, when constructing file paths.
- Keep repo-specific instructions here concise; move broad contributor documentation to `CONTRIBUTING.md` or `README.md`.
- When a repo-specific workflow or repeated correction comes up more than once, update this file so the guidance stays current.
