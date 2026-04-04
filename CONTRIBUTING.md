# Contributing Guide

## Initial Setup

### Prerequisites
- Python 3.12+
- [uv](https://docs.astral.sh/uv/) installed

### First-Time Setup

1. **Install global tools:**
   ```bash
   uv tool install commitizen
   uv tool install pre-commit
   ```

2. **Clone the repository:**
   ```bash
   git clone https://github.com/pfeerick/proxmox-services-homepage.git
   cd proxmox-services-homepage
   ```

3. **Install project dependencies:**
   ```bash
   uv sync
   ```

4. **Configure the dashboard:**
   ```bash
   cp config.yaml.example config.yaml
   chmod 600 config.yaml
   # Edit config.yaml with your Proxmox details
   ```

5. **Install pre-commit hooks:**
   ```bash
   pre-commit install --hook-type pre-commit --hook-type commit-msg
   ```

6. **Verify setup:**
   ```bash
   # Check commitizen is available
   cz version

   # Test pre-commit hooks
   pre-commit run --all-files
   ```

You're ready to contribute! 🎉

## Running Tests

Install the project with its dev dependencies (pytest, ruff, commitizen) and run the suite:

```bash
uv sync
uv run pytest -q
```

For a targeted run:

```bash
uv run pytest tests/test_connection.py -q
```

Run the linter and formatter checks locally before pushing:

```bash
uv run ruff check .
uv run ruff format --check .
```

Or let the pre-commit hooks handle it automatically on `git commit`.

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
feat!: redesign services.yaml format
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

# Push changes with tags
git push --follow-tags
```

During `cz bump`, Commitizen is configured to run pre-bump hooks that:
- refresh `uv.lock` via `uv lock`
- stage the lockfile automatically with `git add uv.lock`

This keeps `uv.lock` in sync before the release commit and tag are created, and `--retry` handles pre-commit hooks that may rewrite files during the first commit attempt.

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
3. Updates `version` in `pyproject.toml`
4. Updates or creates `CHANGELOG.md`
5. Runs pre-bump hooks to refresh and stage `uv.lock`
6. Creates a git commit: `bump: version 0.1.0 → 0.2.0`
7. Creates a git tag: `v0.2.0`

**Note:** Don't forget to push tags: `git push --follow-tags`

If a bump commit ever lands without its matching tag, repair that missing tag before running `cz bump` again. Otherwise Commitizen will not find the current version tag and may prompt as though it is the first release.

## Updating Your Tools

Keep your global tools up to date:

```bash
# Update commitizen
uv tool upgrade commitizen

# Update pre-commit
uv tool upgrade pre-commit

# Update pre-commit hooks in the project
pre-commit autoupdate
```

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
# Ensure commitizen is installed globally
uv tool install commitizen

# Verify installation
which cz
cz version
```

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
cz bump --changelog
git push --follow-tags
```

## Questions?

- Check the [Conventional Commits](https://www.conventionalcommits.org/) specification
- Review [Commitizen documentation](https://commitizen-tools.github.io/commitizen/)
- Open an issue if you need help!
