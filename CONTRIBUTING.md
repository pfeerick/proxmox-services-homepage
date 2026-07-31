# Contributing Guide

## Initial Setup

### Prerequisites

Only [mise](https://mise.jdx.dev/) — it provides Bun, commitizen and pre-commit at the
versions pinned in `.mise.toml`. Installing [uv](https://docs.astral.sh/uv/) as well is
recommended but optional; mise uses it to install the Python-based tools much faster.

### First-Time Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/pfeerick/proxmox-services-homepage.git
   cd proxmox-services-homepage
   ```

2. **Install tools, dependencies and git hooks:**
   ```bash
   mise install     # Bun, commitizen, pre-commit
   mise run setup   # bun install + pre-commit install
   ```

3. **Configure the dashboard:**
   ```bash
   cp config.toml.example config.toml
   chmod 600 config.toml
   # Edit config.toml with your Proxmox details
   ```

4. **Verify setup:**
   ```bash
   cz version
   pre-commit run --all-files
   ```

You're ready to contribute! 🎉

### Editor / IDE setup

**If you commit from your editor's UI rather than a terminal, add mise's shims
directory to your PATH permanently:**

| OS | Directory |
| --- | --- |
| Linux / macOS | `~/.local/share/mise/shims` |
| Windows | `%LOCALAPPDATA%\mise\shims` |

`mise activate` only updates PATH when a shell prompt is drawn, which never happens
when an editor spawns `git` directly. The commit-msg hook calls `cz`, so without the
shims on PATH commits fail from the UI with `cz: command not found` while working
fine in the terminal. Restart the editor fully after changing PATH.

VS Code users: the recommended extensions in `.vscode/extensions.json` include
[mise-vscode](https://marketplace.visualstudio.com/items?itemName=hverlin.mise-vscode),
which adds `.mise.toml` autocompletion and lets you run `mise run setup` from the
command palette.

## Running Tests

```bash
bun test
```

For a targeted run:

```bash
bun test tests/ip-parsing.test.ts
```

Run the linter and type checker before pushing:

```bash
# Lint and format (Biome)
bun run check

# Auto-fix all safe issues
bun run check:fix

# TypeScript type check
bun tsc --noEmit
```

Or let the pre-commit hooks handle everything automatically on `git commit`.

## Commit Message Format

This project uses [Conventional Commits](https://www.conventionalcommits.org/) to automate versioning and changelog generation.

### Format

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types

- **feat**: New feature (triggers minor version bump)
- **fix**: Bug fix (triggers patch version bump)
- **docs**: Documentation changes only
- **chore**: Maintenance tasks (dependencies, configs)
- **refactor**: Code refactoring without feature changes
- **test**: Adding or updating tests
- **style**: Code style/formatting changes
- **perf**: Performance improvements
- **ci**: CI/CD pipeline changes
- **build**: Build system changes

### Breaking Changes

Add `!` after the type or `BREAKING CHANGE:` in the footer for major version bumps:

```bash
feat!: redesign API interface
```

or

```bash
feat: redesign API interface

BREAKING CHANGE: All endpoint URLs have changed
```

### Scope (Optional)

Specify the area of the codebase:

```bash
feat(api): add webhook support
fix(discovery): handle containers with no IP
docs(readme): update deployment instructions
```

### Examples

```bash
# Feature (bumps 0.1.0 → 0.2.0)
feat(api): add webhook support for container events

# Bug fix (bumps 0.1.0 → 0.1.1)
fix(discovery): handle containers with DHCP addresses correctly

# Documentation (no version bump)
docs: add Tailscale deployment guide

# Chore (no version bump)
chore: upgrade dependencies

# Breaking change (bumps 0.1.0 → 1.0.0)
feat!: redesign services.toml format
```

## Commit Workflows

### Option 1: Interactive (Recommended for Complex Commits)

Use commitizen's guided prompts:

```bash
git add .
cz commit
```

This will walk you through:
1. Selecting commit type
2. Adding scope (optional)
3. Writing description
4. Adding body (optional)
5. Marking breaking changes

### Option 2: Quick Manual (For Simple Commits)

Write the commit message directly:

```bash
git add .
git commit -m "feat(api): add rate limiting"
```

The pre-commit hook will validate the format automatically.

### Option 3: VSCode Extension

1. Install the **Conventional Commits** extension by vivaxy
2. Stage your changes in the Source Control panel
3. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
4. Type "Conventional Commits" and select it
5. Follow the interactive prompts

Or simply write the conventional format in the commit message box — the hooks will validate it.

## Commit Message Validation

The pre-commit hooks will automatically validate your commit messages. Invalid commits will be rejected with a helpful error message:

```bash
❌ Commit message does not follow Conventional Commits format
Expected: <type>(<scope>): <description>
Got: "added new feature"
```

## Versioning and Releases

### Automatic Version Bumping

When ready to release, commitizen automatically determines the version bump based on commits since the last tag:

```bash
# Automatic bump based on commit types
cz bump --changelog --retry

# Preview what would happen (dry run)
cz bump --dry-run
```

The bump pushes itself — a post-bump hook runs `git push --atomic --follow-tags origin HEAD`, so the bump commit and its tag always reach the remote together. No manual push step is needed.

> **Why the push is automatic:** a tag that exists only locally is indistinguishable from one that was deleted upstream, so any `git fetch` will prune it if `fetch.pruneTags` is enabled — silently leaving a bump commit with no release tag. Pushing as part of the bump closes that window. Relatedly, tags are configured as **annotated** (`annotated_tag = true`), because `git push --follow-tags` skips lightweight tags without reporting anything.

During `cz bump`, Commitizen is configured to run pre-bump hooks that:
- run `bun install` to ensure `bun.lock` is up to date
- stage the lockfile automatically with `git add bun.lock`

The version is tracked in `.cz.toml` and `package.json` — both are updated on each bump.

### Manual Version Bumping

If you need to specify the bump type manually:

```bash
cz bump --increment PATCH --retry    # 0.1.0 → 0.1.1
cz bump --increment MINOR --retry    # 0.1.0 → 0.2.0
cz bump --increment MAJOR --retry    # 0.1.0 → 1.0.0
```

### What Happens During a Bump

1. Analyzes commits since last version tag
2. Determines version bump (patch/minor/major)
3. Updates `version` in `.cz.toml` and `package.json`
4. Updates or creates `CHANGELOG.md`
5. Runs pre-bump hooks to refresh and stage `bun.lock`
6. Creates a git commit: `bump: version 0.1.0 → 0.2.0`
7. Creates a git tag: `v0.2.0`

8. Pushes the commit and tag together via the post-bump hook

If a bump commit ever lands without its matching tag, repair that missing tag before running `cz bump` again. Otherwise Commitizen will not find the current version tag and may prompt as though it is the first release.

## Updating Your Tools

Bun, commitizen and pre-commit are pinned in `.mise.toml`:

```bash
mise outdated              # what's behind
mise upgrade --bump        # update the pins in .mise.toml
pre-commit autoupdate      # update hook revs in .pre-commit-config.yaml
```

Renovate opens these PRs automatically on a weekly schedule, so running them by hand
is usually only needed if you want an update sooner.

## Troubleshooting

### Pre-commit hooks not running

```bash
# Reinstall hooks
pre-commit install --hook-type pre-commit --hook-type commit-msg

# Test manually
pre-commit run --hook-stage commit-msg --commit-msg-filename .git/COMMIT_EDITMSG
pre-commit run --all-files
```

### Commitizen command not found

```bash
mise install     # installs the pinned commitizen
mise which cz    # confirm where it resolves from
cz version
```

If `cz` works in a terminal but commits fail from your editor's UI, the shims
directory is missing from your PATH — see [Editor / IDE setup](#editor--ide-setup).

### `mise ERROR No version is set for shim: <tool>`

A tool was installed with bare `mise install <tool>`, which creates a shim but does
not record a version in any config, so the shim has nothing to resolve to. Either
register it (`mise use -g <tool>@<version>`) or remove it (`mise uninstall <tool>`).
Prefer `mise use -g` over `mise install` for global tools to avoid this.

### Want to skip hooks temporarily (not recommended)

```bash
git commit --no-verify -m "emergency fix"
```

## Development Workflow Summary

```bash
# 1. Create feature branch
git checkout -b feat/my-new-feature

# 2. Make changes and commit (use conventional format)
git add .
cz commit  # or git commit -m "feat: add new feature"

# 3. Push feature branch
git push origin feat/my-new-feature

# 4. Create pull request

# 5. After merge to master, bump version (maintainers only)
git checkout master
git pull
cz bump --changelog --retry   # commits, tags and pushes
```

## Questions?

- Check the [Conventional Commits](https://www.conventionalcommits.org/) specification
- Review [Commitizen documentation](https://commitizen-tools.github.io/commitizen/)
- Open an issue if you need help!
