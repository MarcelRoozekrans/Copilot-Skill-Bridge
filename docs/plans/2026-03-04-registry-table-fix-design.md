# Registry Table Fix — Design

## Problem

The registry table in `copilot-instructions.md` has two bugs:

1. **Wrong file paths**: `generateRegistryEntry` always generates `.github/instructions/{name}.instructions.md` regardless of the configured output format. When using the default `prompts` format, the referenced files don't exist.
2. **Bloated orchestrator**: The trigger column contains full skill descriptions, bloating `copilot-instructions.md`. The skill files themselves already contain descriptions in their frontmatter.

## Solution

Adopt a slim meta-orchestrator pattern: `copilot-instructions.md` is a lightweight 2-column index (Skill + File) that points Copilot to individual skill files. Fix file paths to match the configured output format.

## Changes

### 1. `converter.ts` — output-format-aware registry entries

- `generateRegistryEntry(name, outputFormats?)` — drop `description` param
- Return `{ name, file }` with correct path based on format
- Prompts-only → `.github/prompts/{name}.prompt.md`
- Otherwise → `.github/instructions/{name}.instructions.md`

### 2. `fileWriter.ts` — 2-column table

- `RegistryEntry` becomes `{ name: string; file: string }`
- `buildRegistryTable` outputs `| Skill | File |` table

### 3. `importService.ts` — thread output formats

- `updateRegistry(manifest, outputFormats)` passes formats through
- `removeAllSkills` gets `outputFormats` parameter
- `rebuildRegistry` gets `outputFormats` parameter

### 4. `extension.ts` — pass config to new signatures

- All callers of `removeAllSkills` and `rebuildRegistry` pass `outputFormats`

### 5. `types.ts` — simplify ConversionResult

- `registryEntry` becomes `{ name: string; file: string }`

### 6. Tests — update to match

## Expected Output

```markdown
<!-- copilot-skill-bridge:start -->
## Available Skills

When working on tasks, consult these skill files for guidance:

| Skill | File |
|-------|------|
| brainstorming | .github/prompts/brainstorming.prompt.md |
| tdd | .github/prompts/tdd.prompt.md |

<!-- copilot-skill-bridge:end -->
```
