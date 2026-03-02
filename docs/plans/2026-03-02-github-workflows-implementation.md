# GitHub Workflows, Conventional Commits & Semantic Versioning — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add CI/CD workflows with conventional commit enforcement and automated semantic versioning via release-please.

**Architecture:** Three GitHub Actions workflows (CI, release-please, publish) plus local commit linting via commitlint + husky. Release-please creates Release PRs from conventional commits; merging the PR triggers publishing.

**Tech Stack:** GitHub Actions, release-please-action v4, commitlint, husky v9, xvfb (for headless integration tests), vsce

---

### Task 1: Install and configure commitlint

**Files:**
- Create: `commitlint.config.js`
- Modify: `package.json` (devDependencies)

**Step 1: Install commitlint**

```bash
npm install --save-dev @commitlint/cli @commitlint/config-conventional
```

**Step 2: Create commitlint config**

Create `commitlint.config.js`:

```javascript
module.exports = {
  extends: ['@commitlint/config-conventional'],
};
```

**Step 3: Verify commitlint works**

```bash
echo "feat: test message" | npx commitlint
```

Expected: passes silently (exit 0).

```bash
echo "bad message" | npx commitlint
```

Expected: fails with error about subject format.

**Step 4: Commit**

```bash
git add commitlint.config.js package.json package-lock.json
git commit -m "chore: add commitlint with conventional commits config"
```

---

### Task 2: Install and configure husky

**Files:**
- Create: `.husky/commit-msg`
- Modify: `package.json` (devDependencies, prepare script)

**Step 1: Install husky**

```bash
npm install --save-dev husky
```

**Step 2: Initialize husky**

```bash
npx husky init
```

This creates `.husky/` directory and adds a `prepare` script to package.json.

**Step 3: Create commit-msg hook**

Replace the default `.husky/pre-commit` file content with empty (or remove it), then create the commit-msg hook:

```bash
echo "npx --no -- commitlint --edit \$1" > .husky/commit-msg
```

On Windows, the file `.husky/commit-msg` should contain:

```bash
npx --no -- commitlint --edit $1
```

**Step 4: Remove the default pre-commit hook if it exists**

If `.husky/pre-commit` was created by `husky init` with `npm test` content, replace it with just an empty file or remove it (we don't want tests running on every commit — that's what CI is for).

```bash
echo "" > .husky/pre-commit
```

Or delete it:

```bash
rm .husky/pre-commit
```

**Step 5: Test the hook**

```bash
git add -A
git commit -m "bad message"
```

Expected: commit rejected by commitlint.

```bash
git commit -m "chore: add husky with commit-msg hook for commitlint"
```

Expected: commit succeeds.

---

### Task 3: Create CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

**Step 1: Create the CI workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build-and-test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - run: npm ci

      - name: Compile
        run: npm run compile

      - name: Lint
        run: npm run lint

      - name: Unit tests
        run: npm run test:unit

      - name: Integration tests
        run: xvfb-run -a npm run test:integration

  commitlint:
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - run: npm ci

      - name: Validate PR commits
        run: npx commitlint --from ${{ github.event.pull_request.base.sha }} --to ${{ github.event.pull_request.head.sha }}
```

**Step 2: Verify the file is valid YAML**

```bash
node -e "const yaml = require('yaml'); const fs = require('fs'); yaml.parse(fs.readFileSync('.github/workflows/ci.yml', 'utf8')); console.log('Valid YAML')"
```

If `yaml` module not available, just visually inspect. The workflow will be validated by GitHub on push.

**Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add CI workflow with build, lint, unit and integration tests"
```

---

### Task 4: Create release-please workflow

**Files:**
- Create: `.github/workflows/release-please.yml`
- Create: `.release-please-manifest.json`
- Create: `release-please-config.json`

**Step 1: Create release-please config**

Create `release-please-config.json`:

```json
{
  "packages": {
    ".": {
      "release-type": "node",
      "changelog-sections": [
        { "type": "feat", "section": "Features" },
        { "type": "fix", "section": "Bug Fixes" },
        { "type": "perf", "section": "Performance" },
        { "type": "refactor", "section": "Refactoring" },
        { "type": "docs", "section": "Documentation" },
        { "type": "chore", "section": "Miscellaneous", "hidden": true },
        { "type": "ci", "section": "Miscellaneous", "hidden": true },
        { "type": "test", "section": "Miscellaneous", "hidden": true },
        { "type": "style", "section": "Miscellaneous", "hidden": true }
      ]
    }
  }
}
```

**Step 2: Create release-please manifest**

Create `.release-please-manifest.json`:

```json
{
  ".": "0.1.0"
}
```

This tells release-please the current version so it can calculate the next bump correctly.

**Step 3: Create the release-please workflow**

Create `.github/workflows/release-please.yml`:

```yaml
name: Release Please

on:
  push:
    branches: [main]

permissions:
  contents: write
  pull-requests: write

jobs:
  release-please:
    runs-on: ubuntu-latest

    outputs:
      release_created: ${{ steps.release.outputs.release_created }}
      tag_name: ${{ steps.release.outputs.tag_name }}

    steps:
      - uses: googleapis/release-please-action@v4
        id: release
        with:
          config-file: release-please-config.json
          manifest-file: .release-please-manifest.json
```

**Step 4: Commit**

```bash
git add .github/workflows/release-please.yml release-please-config.json .release-please-manifest.json
git commit -m "ci: add release-please workflow for automated versioning"
```

---

### Task 5: Create publish workflow

**Files:**
- Create: `.github/workflows/publish.yml`

**Step 1: Create the publish workflow**

Create `.github/workflows/publish.yml`:

```yaml
name: Publish

on:
  release:
    types: [published]

jobs:
  publish:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - run: npm ci

      - name: Compile
        run: npm run compile

      - name: Lint
        run: npm run lint

      - name: Unit tests
        run: npm run test:unit

      - name: Integration tests
        run: xvfb-run -a npm run test:integration

      - name: Build
        run: npm run build

      - name: Package
        run: npx vsce package

      - name: Publish to Marketplace
        run: npx vsce publish --pat ${{ secrets.VSCE_PAT }}

      - name: Upload VSIX to GitHub Release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: gh release upload ${{ github.event.release.tag_name }} *.vsix
```

**Step 2: Commit**

```bash
git add .github/workflows/publish.yml
git commit -m "ci: add publish workflow for marketplace release on GitHub Release"
```

---

### Task 6: Add VSCE_PAT secret and push

**Files:**
- No source changes

**Step 1: Add the VSCE_PAT secret to GitHub**

```bash
gh secret set VSCE_PAT
```

Paste the Azure DevOps PAT when prompted (the same one used for `vsce publish` earlier).

**Step 2: Push everything**

```bash
git push origin main
```

**Step 3: Verify CI workflow runs**

```bash
gh run list --limit 3
```

Expected: CI workflow triggered on push to main, running build-and-test job.

**Step 4: Watch the run**

```bash
gh run watch
```

Expected: all steps pass (compile, lint, unit tests, integration tests).

---

### Task 7: Update .vscodeignore and .gitignore

**Files:**
- Modify: `.vscodeignore`
- Modify: `.gitignore`

**Step 1: Update .vscodeignore**

Add these entries if not already present to exclude CI/config files from the VSIX:

```
.github/**
.husky/**
commitlint.config.js
release-please-config.json
.release-please-manifest.json
```

**Step 2: Update .gitignore**

No changes needed — `.vscode-test/` is already ignored.

**Step 3: Verify packaging still works**

```bash
npm run build && npx vsce package
```

Expected: VSIX created, no workflow/config files included.

**Step 4: Commit**

```bash
git add .vscodeignore
git commit -m "chore: exclude CI and config files from VSIX package"
```

**Step 5: Push**

```bash
git push origin main
```

---

### Task 8: Test the full release flow (dry run)

**Files:**
- No source changes — this is a verification task

**Step 1: Verify release-please created a Release PR**

After the push in Task 7, release-please should analyze the conventional commits and create (or update) a Release PR.

```bash
gh pr list
```

Expected: A PR titled something like "chore(main): release 0.2.0" created by github-actions[bot].

**Step 2: Inspect the Release PR**

```bash
gh pr view <PR_NUMBER>
```

Verify it:
- Bumps version in `package.json`
- Updates `CHANGELOG.md` with feat/fix entries
- Updates `.release-please-manifest.json`

**Step 3: Document the release flow for future reference**

The flow is:
1. Push conventional commits to `main`
2. Release-please creates/updates a Release PR
3. Review and merge the Release PR when ready to ship
4. Release-please creates a git tag + GitHub Release
5. Publish workflow triggers → tests → publishes to Marketplace → attaches VSIX

No action needed for this step — it's informational.
