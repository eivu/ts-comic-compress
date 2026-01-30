# Semantic Release Setup Guide

This project now uses [semantic-release](https://semantic-release.gitbook.io/) for automated version management and package publishing.

## How It Works

Semantic-release automatically:

- Determines the next version number based on commit messages
- Generates release notes
- Creates a GitHub release
- Publishes to npm (if configured)
- Updates the CHANGELOG.md file
- Commits version changes back to the repository

## Commit Message Format

Use the [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types and Version Bumps

| Type                | Description             | Version Bump      |
| ------------------- | ----------------------- | ----------------- |
| `feat`              | New feature             | **Minor** (1.x.0) |
| `fix`               | Bug fix                 | **Patch** (1.0.x) |
| `perf`              | Performance improvement | **Patch** (1.0.x) |
| `docs`              | Documentation only      | No release        |
| `style`             | Code style changes      | No release        |
| `refactor`          | Code refactoring        | No release        |
| `test`              | Test changes            | No release        |
| `chore`             | Build/tooling changes   | No release        |
| **BREAKING CHANGE** | Breaking API changes    | **Major** (x.0.0) |

### Examples

```bash
# Patch release (1.0.0 -> 1.0.1)
git commit -m "fix: resolve image processing memory leak"

# Minor release (1.0.0 -> 1.1.0)
git commit -m "feat: add support for AVIF image format"

# Major release (1.0.0 -> 2.0.0) - with breaking change
git commit -m "feat!: redesign CLI interface

BREAKING CHANGE: --input flag is now required"

# Or in footer
git commit -m "refactor: restructure archive processing

BREAKING CHANGE: ArchiveProcessor constructor signature changed"

# With scope
git commit -m "fix(pdf): correct page extraction for rotated pages"
git commit -m "feat(cli): add verbose logging option"

# No release
git commit -m "docs: update README with new examples"
git commit -m "chore: update dependencies"
```

## Branch Configuration

- **`main`/`master`**: Production releases
- **`feat-*`**: Pre-release versions (e.g., `1.1.0-feat-semantic-verisioning.1`)

## Workflow

1. **Make changes** to your code
2. **Commit using conventional format**:
   ```bash
   git commit -m "feat: add new feature"
   ```
3. **Push to main/master**:
   ```bash
   git push origin main
   ```
4. **GitHub Actions runs automatically** and:
   - Analyzes commits since last release
   - Determines new version number
   - Builds the project
   - Creates a GitHub release
   - Publishes to npm (if NPM_TOKEN is configured)
   - Updates CHANGELOG.md

## Required GitHub Secrets

Configure these in your repository settings (Settings → Secrets and variables → Actions):

1. **`PERSONAL_EIVU_TOKEN`** ✅ (Already configured)
   - Personal Access Token with repo and workflow permissions
   - Used for creating releases and pushing commits

2. **`NPM_TOKEN`** (Optional, for npm publishing)
   - npm access token for publishing packages
   - Get from: https://www.npmjs.com/settings/[your-username]/tokens
   - Select "Automation" token type

## Testing Pre-releases

Feature branches matching `feat-*` will create pre-release versions:

```bash
git checkout -b feat-new-feature
git commit -m "feat: add new feature"
git push origin feat-new-feature
# Creates version like: 1.1.0-feat-new-feature.1
```

## Skipping Releases

To commit without triggering a release (useful for documentation):

```bash
git commit -m "docs: update README [skip ci]"
```

## Manual Release

If you need to trigger a release manually:

1. Go to GitHub Actions tab
2. Select "Release" workflow
3. Click "Run workflow"

## Troubleshooting

### Release didn't trigger

- Check commit message format follows Conventional Commits
- Verify you pushed to `main` or `master` branch
- Check GitHub Actions logs for errors

### NPM publish failed

- Verify `NPM_TOKEN` secret is set
- Check npm registry is accessible
- Ensure package name is available on npm

### Permission denied errors

- Verify `PERSONAL_EIVU_TOKEN` has correct permissions:
  - ✅ repo (Full control of private repositories)
  - ✅ workflow (Update GitHub Action workflows)

## Additional Resources

- [Semantic Release Documentation](https://semantic-release.gitbook.io/)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [Commit Message Guidelines](https://github.com/angular/angular/blob/main/CONTRIBUTING.md#commit)
