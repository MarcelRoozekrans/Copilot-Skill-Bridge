# GitHub Workflows, Conventional Commits & Semantic Versioning — Design

**Date:** 2026-03-02
**Status:** Approved

## Overview

Add CI/CD workflows, conventional commit enforcement, and automated semantic versioning to CopilotBridge.

## Components

### 1. Conventional Commits (Local + CI)

**Local:** `commitlint` + `husky` pre-commit hook validates every commit message.

**CI:** `commitlint` runs on PR commits to catch anything that bypassed local hooks.

**Format:** `type(scope): description`

Allowed types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`, `style`, `perf`

### 2. CI Workflow (`ci.yml`)

**Triggers:** `push` to `main`, `pull_request` to `main`

**Job: build-and-test** (ubuntu-latest, Node 20)

Steps:
1. Checkout
2. `npm ci`
3. `npm run compile`
4. `npm run lint`
5. `npm run test:unit`
6. `xvfb-run npm run test:integration`
7. Commitlint on PR commits

### 3. Release Please Workflow (`release-please.yml`)

**Trigger:** `push` to `main`

**What it does:**
- Analyzes conventional commits since last release
- Creates/updates a Release PR with version bump in `package.json` + `CHANGELOG.md` update
- When PR is merged, creates a git tag (e.g. `v0.2.0`) and a GitHub Release

Version bump rules:
- `feat:` → minor (0.1.0 → 0.2.0)
- `fix:` → patch (0.1.0 → 0.1.1)
- `feat!:` / `BREAKING CHANGE:` → major (0.1.0 → 1.0.0)

### 4. Publish Workflow (`release.yml`)

**Trigger:** GitHub Release created (by release-please)

**Job: publish**

Steps:
1. Checkout
2. `npm ci`
3. `npm run build`
4. `vsce package`
5. `vsce publish --pat ${{ secrets.VSCE_PAT }}`
6. Upload `.vsix` to the GitHub Release as an asset

### Release Flow

```
Conventional commits land on main
  → release-please creates PR: "chore(main): release v0.2.0"
     (bumps package.json version, updates CHANGELOG.md)
  → developer reviews + merges
  → release-please creates tag v0.2.0 + GitHub Release
  → release.yml triggers on release created
  → publishes to VS Code Marketplace + attaches .vsix to release
```

### Secrets Required

| Secret | Purpose |
|--------|---------|
| `VSCE_PAT` | Azure DevOps PAT with Marketplace Manage scope |

## Dependencies

| Package | Purpose |
|---------|---------|
| `@commitlint/cli` (dev) | Validate commit messages |
| `@commitlint/config-conventional` (dev) | Conventional commits ruleset |
| `husky` (dev) | Git hooks manager |
