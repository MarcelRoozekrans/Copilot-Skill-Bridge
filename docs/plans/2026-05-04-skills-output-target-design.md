# Design: Native SKILL.md output for Copilot Agent Skills

**Status:** Draft
**Date:** 2026-05-04
**Author:** Marcel + Claude

## Problem

CopilotBridge currently converts each Claude `SKILL.md` into two foreign formats:

- `.github/instructions/<name>.instructions.md` — auto-attach via `applyTo` glob
- `.github/prompts/<name>.prompt.md` — slash-command invocation

This conversion exists because Copilot historically had no native skill format. The conversion does real work — registry table generation, link rewriting, companion-file prefixing, extension juggling — and most of the bridge's recent bugs (companion file naming, intra-content references) live in this conversion layer.

As of December 18, 2025, GitHub Copilot ships **Agent Skills**: a native `SKILL.md` format identical in shape to Claude's. Copilot auto-discovers it from six paths, including `.claude/skills/` and `~/.claude/skills/` for direct interop. ([VS Code docs](https://code.visualstudio.com/docs/copilot/customization/agent-skills))

This means most of the bridge's conversion work is now redundant for users on current Copilot.

## Proposal

Add a third output target — `skills` — that writes `SKILL.md` and companion files **verbatim** into a Copilot-recognized skills folder. No conversion. No rewriting.

Make `skills` the default for new installs, while keeping `instructions` and `prompts` as opt-in for users who need them.

## Why this works

| Concern in current pipeline | How `skills` output sidesteps it |
|---|---|
| Companion file naming (`.prompt.md` vs `.md`) | Companions stay alongside `SKILL.md` in the same dir, original names preserved |
| Markdown link rewriting (`](child.md)` → `](parent-child.prompt.md)`) | Source links remain valid because the companion sits in the same dir |
| Plain-text path references (`.github/prompts/x.prompt.md`) | Source content is unchanged, references stay accurate to source layout |
| Registry table in `copilot-instructions.md` | Not needed — Copilot discovers SKILL.md without a registry |
| Tool name conversion (Read/Edit/TodoWrite → Copilot equivalents) | Open question — see below |

## Output target options

VS Code Agent Skills auto-discovers six paths, split across **user-global** (apply to every workspace) and **workspace** (committed to the repo):

| Path | Scope | Pros | Cons |
|---|---|---|---|
| `~/.claude/skills/<name>/SKILL.md` | User-global, uncommitted | Clean repo, install once use everywhere, mirrors the existing "Install in Claude" precedent | Not reproducible across team; new contributors must install separately |
| `~/.copilot/skills/<name>/SKILL.md` | User-global, uncommitted | Same as above, but in a Copilot-branded path rather than Claude's | Less recognizable to users coming from Claude tooling |
| `.github/skills/<name>/SKILL.md` | Workspace, committed | Travels with repo, team-shared, lives next to existing `.github/instructions/` | Pollutes repo with possibly-third-party content; large skill libraries bloat the project |
| `.claude/skills/<name>/SKILL.md` | Workspace, committed | Direct Claude interop — same files work in both tools | `.claude/` is conventionally Claude-specific; mixing tooling there feels off |

**Recommended default:** `~/.claude/skills/<name>/SKILL.md` (user-global).

Reasoning:

1. **Most usage is personal productivity, not team policy.** CopilotBridge's primary flow is "browse a marketplace, import a skill, use it" — the same shape as installing a VS Code extension. Extensions don't get committed to the repo, and skills probably shouldn't either.
2. **Mirrors existing "Install in Claude" precedent.** That command already writes user-globally to `~/.claude/plugins/cache/`. Users have a mental model that this extension installs to their home directory, not their workspace.
3. **Keeps repos clean.** A user who imports 20 marketplace skills doesn't pollute every project they open with 20 unrelated `.github/skills/` directories.
4. **Reproducibility is a separate problem.** Teams that need shared skills can opt into the workspace path explicitly.

Expose two settings:

- `copilotBridge.skillsScope`: `'user'` (default) | `'workspace'` — chooses between user-global and workspace install.
- `copilotBridge.skillsPath`: optional override of the exact path within the chosen scope. Defaults: `~/.claude/skills` for user, `.github/skills` for workspace.

Document the team-shared workflow in the README: *"To commit skills to your repo so teammates pick them up automatically, set `copilotBridge.skillsScope` to `'workspace'`."*

## Format mapping

| Claude SKILL.md field | Copilot SKILL.md field | Action |
|---|---|---|
| `name` | `name` | Pass through |
| `description` | `description` | Pass through |
| `argument-hint` | `argument-hint` | Pass through |
| `user-invocable` | `user-invocable` | Pass through |
| `disable-model-invocation` | `disable-model-invocation` | Pass through |
| Body content | Body content | **Open: pass through, or apply tool-name conversion?** |
| Companion files | Companion files | Copy verbatim into the skill dir |

The frontmatter schemas appear identical for the fields that matter. Verify by smoke-testing one skill.

## Tool name conversion — the one open question

`src/converter.ts:convertSkillContent()` currently rewrites Claude tool names:

- `TodoWrite` → `checklist`
- `Read tool` → `file reading`
- `CLAUDE.md` → `copilot-instructions.md`
- ~40 more rules in [src/converter.ts](src/converter.ts)

These rewrites assume the model is following imperative instructions like "Use the TodoWrite tool to track tasks." If we ship `SKILL.md` verbatim, those Claude-named tools appear in the body. Three possible behaviors:

1. **Skip conversion entirely** — trust modern models (Claude/GPT/Gemini in Copilot) to map "use the Read tool" onto Copilot's file-read capability automatically. Cleanest. Highest risk.
2. **Apply conversion to skills output too** — same conversion pipeline runs, only the file destination changes. Safest. Reintroduces some of the rewriting we wanted to skip, but link-rewriting and extension games still go away.
3. **Smart routing** — detect whether the skill body has imperative tool references; if not, ship verbatim; if yes, convert. Overengineered.

**Recommendation:** option 2 for the first release. The current conversion is already battle-tested; keeping it as the body transform while ditching the structural rewrites (links, companions, extensions, registry) captures most of the simplification benefit without a new failure mode. Revisit option 1 after a release of telemetry/feedback.

## Mode gating

Agent Skills only fire in Copilot **Agent mode** — not Ask, not Edit, not Inline. This is a real limitation: users primarily in Ask mode would lose access to skills entirely if we drop the `prompts` and `instructions` outputs.

**Resolution:** never silently replace existing outputs. The `skills` target adds a new option; existing users keep their current behavior. New installs default to `skills` only, but the setting `copilotBridge.outputFormats` accepts `['skills', 'instructions', 'prompts']` in any combination.

For users who want belt-and-braces coverage across all modes, document the recommended combo: `['skills', 'prompts']` — agent-mode discovery via SKILL.md, plus slash-command access in Ask/Edit via prompts.

## Migration

Existing users have skills already imported as `.instructions.md` / `.prompt.md`. The bridge tracks these in `.github/copilot-skill-bridge.json` (manifest).

**No silent rewrites.** Plan:

1. On extension upgrade, detect manifest entries that predate skills support.
2. Show a one-time prompt: *"GitHub Copilot now reads SKILL.md natively. Switch to skills format? Existing prompts/instructions will remain until you remove them."*
3. If user accepts: re-import all manifest entries into `.github/skills/`, leave the old files in place. User decides when to delete them.
4. If user declines: respect the existing `outputFormats` setting; never auto-change.

## Backwards compatibility

**Classification:** soft behavior change for users on default config; no data loss.

| Concern | Impact | Mitigation |
|---|---|---|
| Existing `.github/prompts/*.prompt.md` files | None — left on disk untouched | Manifest still tracks them; removal still works |
| Existing `.github/instructions/*.instructions.md` files | None — left on disk untouched | Same |
| Default `outputFormats` flips from `['prompts']` to `['skills']` | Future imports go to `~/.claude/skills/` instead of `.github/prompts/` | Migration prompt asks user on first run after upgrade |
| Manifest schema gains optional `scope` field | None — additive | Missing field reads as `'workspace'`, matching legacy behavior |
| Older Copilot versions (pre-Dec 2025) won't pick up `SKILL.md` | Skills become invisible to Copilot for those users | Document min Copilot version in README; users with old Copilot stay on `prompts`/`instructions` |
| Scripts assuming `.github/prompts/` exists | Break for new imports if they assumed default behavior | Documented; users with explicit `outputFormats` config are unaffected |

**No semver-major bump required.** This is a default change, not an API/contract removal. The `instructions` and `prompts` outputs remain fully supported for users who set them explicitly.

## Implementation sketch

New files:
- `src/skillsWriter.ts` — `writeSkillFolder(targetRoot, skill, conversion)` that creates `<root>/<slug>/` and writes `SKILL.md` + companions. `targetRoot` is the resolved scope path (user or workspace).
- `src/skillsPath.ts` — `resolveSkillsRoot(scope, override?, workspaceUri?)` that returns a `vscode.Uri` for the active scope. Handles `~` expansion for user paths.

Modified files:
- `src/types.ts` — add `'skills'` to the `OutputFormat` union.
- `src/converter.ts` — `generateSkillFile(skill, convertedBody)` that wraps body in passthrough frontmatter for the new path.
- `src/importService.ts` — at `writeSkillFiles`, when `outputFormats.includes('skills')`, resolve scope and call `writeSkillFolder` in addition to (or instead of) the existing instructions/prompts writes.
- `src/fileWriter.ts` — `removeSkillFiles` learns about both user-scope and workspace-scope skill dirs so cleanup works on un-import regardless of where the skill was installed.
- `src/extension.ts` — config schema adds `skills` to `outputFormats` enum; adds `skillsScope` and `skillsPath` settings; default `outputFormats` for new installs becomes `['skills']`, default scope `'user'`.
- `src/stateManager.ts` — manifest entry should record the install scope (`'user' | 'workspace'`) per skill, so removal targets the correct directory even if the user changes the default later.

Roughly 300–400 LOC + tests. Most existing conversion code stays — it gets reused for the body transform inside `SKILL.md`. The structural rewriting (link patching, companion prefixing, registry table) is bypassed when `outputFormats === ['skills']`.

## Test plan

- Unit: `writeSkillFolder` writes correct paths for `.github/skills/`, `.claude/skills/`, `~/.claude/skills/`.
- Unit: companion files preserved with original names alongside SKILL.md.
- Unit: frontmatter passthrough leaves `name` / `description` / `argument-hint` intact.
- Integration: import a skill with companions in `skills` mode, verify on-disk layout.
- Smoke: import the `requesting-code-review` skill (the one that exposed the recent bugs) in `skills` mode, verify links inside SKILL.md still resolve to the unprefixed companion next to it.

## Decisions to confirm

1. Default skills scope — recommended user-global (`~/.claude/skills/`) to keep workspaces clean. Confirm or prefer workspace.
2. Tool-name conversion in body — recommended option 2 (keep current conversion, drop structural rewrites). Confirm.
3. Default `outputFormats` for new installs — recommended `['skills']`. Confirm or prefer `['skills', 'prompts']` for mode coverage.
4. Migration prompt UX — recommended one-time prompt on upgrade. Confirm or prefer silent / opt-in via command palette only.

## Out of scope

- Agent files (`.agent.md`) — separate concept, separate decision. The recent research showed Copilot also supports custom agents with model pinning and tool restrictions. That's a future enhancement.
- Removing the existing instructions/prompts pipeline — keep it, just stop defaulting to it.
