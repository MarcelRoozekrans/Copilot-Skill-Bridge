# AGENTS.md: Copilot Skill Bridge

Copilot Skill Bridge is a VS Code extension (published to the Marketplace as `MarcelRoozekrans.copilot-skill-bridge`)
that reads Claude Code marketplace skills from the local plugin cache and from GitHub repos, converts
Claude-specific wording into Copilot equivalents, and writes native `SKILL.md` folders, legacy prompt or
instruction files, and `.vscode/mcp.json`. Users install the extension; it is a single TypeScript package, no
library is published.

## Layout

- `src/extension.ts` is the only entry point. `npm run compile` (`tsc`) writes `out/`; `npm run build`
  (`esbuild`) bundles to the same `out/extension.js` and overwrites the tsc file. `package.json` `main` points
  there. `out/` is git-ignored.
- `src/test/unit` runs under plain Node. `src/test/unit/vscode.mock.ts` replaces the `vscode` module and is
  loaded through `.mocharc.yml`, so a unit test that needs a new `vscode` API needs it added to that mock.
- `src/test/integration` runs inside a real VS Code host with `test-workspace/` (empty, only `.gitkeep`) as the
  workspace. Both test folders are excluded from the VSIX (`.vscodeignore` drops `src/**`) and from coverage
  (`.c8rc.json`, `codecov.yml`).
- `docs/plans` holds the original design and implementation plans from March 2026. They are history, not a
  description of the current code.

## Build and test

Prerequisites: Node.js with npm (CI uses Node 26) and `npm ci`. The integration tests also download VS Code
and need a display; on Linux that means `xvfb-run`. The extension targets `vscode` `^1.109.0` (`engines`).

Commands CI runs in the `build-and-test` job of `.github/workflows/ci.yml`:

```bash
npm ci
npm run compile
npm run lint                         # tsc --noEmit
npm run test:coverage                # c8 over the mocha unit tests, writes coverage/lcov.info
xvfb-run -a npm run test:integration # needs a display and a VS Code download
```

The `commitlint` job of `ci.yml` runs on pull requests only:

```bash
npx commitlint --from "$BASE_SHA" --to "$HEAD_SHA"
```

The `publish` job of `.github/workflows/release-please.yml` runs after a release is created:

```bash
npm ci
npm run compile
npm run lint
npm run test:unit
npm run build
npx vsce package
```

Fast inner loop, verified here (448 unit tests pass):

```bash
npm run compile && npm run test:unit
```

`test:unit` runs `out/`, not `src/`, so compile first or it tests stale code. A single file:
`npx mocha out/test/unit/converter.test.js`.

## Conventions and gotchas

- The README lists 27 conversion rules; `CONVERSION_RULES` in `src/converter.ts` has 27 entries. Change both
  together.
- A setting is declared in `package.json` `contributes.configuration`, read in `getConfig()` in
  `src/extension.ts` with its own default, and listed in the README settings table. Keep the three defaults
  equal; `useLmConversion` defaults to `false` in all of them.
- A command is declared in `package.json` `contributes.commands`, registered in `src/extension.ts`, offered in
  `contributes.menus` with a `when` clause on the tree item `contextValue`, and listed in the README command
  table. A new context value needs its menu entries.
- CI uploads coverage to Codecov through OIDC with no token; both Codecov statuses are informational, so a low
  patch percentage does not fail the PR. Coverage comes from the unit tests only.

<!-- org-core:start sha256=08a88996bc9165f888fc0260607cfd0670cae128c323e16707c6b452ee66222d (generated from docker-nuc scripts/agents-md/org-core-personal.md; do not edit here) -->
## Org rules

These rules hold in every public MarcelRoozekrans repo.

### Commits and releases

- Conventional Commits. release-please reads them on the default branch, and the changelog sections
  in `release-please-config.json` decide which types count. The standard: `feat`, `fix`, `perf`,
  `deps` and `revert` open or update the release PR; `docs`, `test`, `refactor`, `build`, `ci`,
  `chore` and `style` do not, unless the commit is breaking or has a `Release-As:` footer. The
  release happens when that PR merges. A breaking change needs `!` or a `BREAKING CHANGE:` footer.
- A commit body never contains nested parentheses. release-please cannot parse them and silently
  drops the whole commit from the changelog, while the workflow still reports success.
- After merging a commit that should release, check that it appears in the release-please PR.

### Branches and pull requests

- Every change goes through a branch and a pull request. Never push to the default branch directly.
- A PR body says what the diff does, and nothing the diff does not do.
- Fix review findings in the PR under review, including small ones. File an issue only for a finding
  that belongs to other code, needs a design decision, is its own piece of work, or waits on
  something external.

### CI

- The .NET repos call the shared workflows of `MarcelRoozekrans/ci-baseline`, pinned to `@v1`, never
  `@main`.
- Its coverage gate fails the build when line coverage drops below the floor of 80%, and Codecov
  fails a PR that lowers project coverage by more than 1 percentage point. New code comes with
  tests.
- A repo with a lower floor documents the reason and links the issue that raises it.
<!-- org-core:end -->
