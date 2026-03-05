# LM-Enhanced Skill Conversion

## Problem

The current converter uses ~35 hardcoded regex rules to rewrite Claude-specific content for Copilot. Simple substitutions (tool names, file paths, jargon) work well, but contextual rewrites fail — sentences like "use the Skill tool to invoke brainstorming" need full rephrasing, not word-for-word swaps.

## Solution

Hybrid two-phase conversion pipeline: deterministic regex first, then an LM pass via VS Code's Language Model API (`vscode.lm`) for contextual rephrasing. Silent fallback to regex-only when Copilot is unavailable.

## Architecture

### Conversion Pipeline

```
Original SKILL.md
    -> parseSkillFrontmatter (strip frontmatter)
    -> convertSkillContent (regex pass - deterministic)
    -> convertWithLM (LM pass - contextual rephrasing)
        |-- Copilot available -> enhanced result
        |-- Copilot unavailable -> return regex result unchanged, silently
    -> generateInstructionsFile / generatePromptFile (wrap in output format)
```

### Phase 1: Regex (existing, unchanged)

Deterministic substitutions in `converter.ts`:
- File paths: `CLAUDE.md` -> `.github/copilot-instructions.md`
- Cross-references: `superpowers:foo` -> `.github/instructions/foo.instructions.md`
- Tool names: `TodoWrite` -> `task checklist`, `Agent tool` -> `subtask delegation`
- Jargon: `Claude Code` -> `the AI assistant`, `your human partner` -> `the user`

### Phase 2: LM (new)

Contextual rephrasing via `vscode.lm.selectChatModels()`:
- Rephrase sentences describing Claude-specific workflows for Copilot context
- Preserve markdown structure, code blocks, and structural elements
- Don't remove content, only rephrase it
- Don't change file paths or cross-references (already converted by regex)

### System Prompt

```
You are rewriting AI assistant instructions. The original was written for Claude Code.
Rewrite it for GitHub Copilot in VS Code.

Rules:
1. Rephrase sentences that reference Claude-specific workflows, tools, or capabilities
2. Preserve all markdown formatting, code blocks, and structural elements exactly
3. Don't remove content - rephrase it
4. Don't change file paths or cross-references (already converted)
5. Return only the rewritten content, no explanation
```

### Model Selection

1. Try `vscode.lm.selectChatModels({ family: 'gpt-4o' })`
2. Fall back to any available model via `vscode.lm.selectChatModels({})`
3. If no models available, return input unchanged (silent fallback)

## File Changes

| File | Change |
|------|--------|
| `src/lmConverter.ts` | **New** - LM integration, prompt construction, response streaming |
| `src/converter.ts` | No change - regex rules stay as-is |
| `src/importService.ts` | `convertSkill` calls LM pass after regex, becomes async |
| `package.json` | New `useLmConversion` boolean setting (default: `true`) |

## Decisions

- **Hybrid over full LM**: Regex is fast, deterministic, and testable for known patterns. LM handles the fuzzy cases regex can't.
- **Silent fallback**: If Copilot isn't available, import still works with regex-only. No warning shown — keeps the flow smooth.
- **Separate file**: `lmConverter.ts` keeps LM logic isolated from deterministic regex, making each independently testable.
- **Setting to disable**: `useLmConversion` lets users opt out if they prefer deterministic-only conversion.
- **No preview**: Conversion happens directly on import without a diff preview step.
