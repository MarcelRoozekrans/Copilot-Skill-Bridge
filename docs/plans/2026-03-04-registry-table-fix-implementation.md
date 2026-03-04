# Registry Table Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the registry table in copilot-instructions.md to use correct file paths based on output format and slim it to a 2-column meta-orchestrator (Skill + File).

**Architecture:** Thread `outputFormats` from config through `updateRegistry` → `generateRegistryEntry` to produce correct paths. Simplify `buildRegistryTable` to 2-column output. Drop `trigger` from `RegistryEntry`.

**Tech Stack:** TypeScript, VS Code Extension API, Mocha tests

---

### Task 1: Update `generateRegistryEntry` in converter.ts

**Files:**
- Modify: `src/converter.ts:1-6` (RegistryEntry interface)
- Modify: `src/converter.ts:96-102` (generateRegistryEntry function)
- Test: `src/test/unit/converter.test.ts:158-165`

**Step 1: Write failing tests**

Replace the existing test block at `src/test/unit/converter.test.ts:158-165` with:

```typescript
describe('generateRegistryEntry', () => {
    it('should default to instructions path when no output formats given', () => {
        const result = generateRegistryEntry('brainstorming');
        assert.strictEqual(result.name, 'brainstorming');
        assert.strictEqual(result.file, '.github/instructions/brainstorming.instructions.md');
    });

    it('should use prompts path when output format is prompts-only', () => {
        const result = generateRegistryEntry('brainstorming', ['prompts']);
        assert.strictEqual(result.file, '.github/prompts/brainstorming.prompt.md');
    });

    it('should use instructions path when both formats are enabled', () => {
        const result = generateRegistryEntry('brainstorming', ['instructions', 'prompts']);
        assert.strictEqual(result.file, '.github/instructions/brainstorming.instructions.md');
    });

    it('should use instructions path when instructions-only', () => {
        const result = generateRegistryEntry('brainstorming', ['instructions']);
        assert.strictEqual(result.file, '.github/instructions/brainstorming.instructions.md');
    });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `generateRegistryEntry` doesn't accept the new signature

**Step 3: Update RegistryEntry and generateRegistryEntry**

In `src/converter.ts`, change the `RegistryEntry` interface (lines 1-6) to:

```typescript
interface RegistryEntry {
    name: string;
    file: string;
}
```

Change `generateRegistryEntry` (lines 96-102) to:

```typescript
export function generateRegistryEntry(name: string, outputFormats?: OutputFormat[]): RegistryEntry {
    const usePrompts = outputFormats && !outputFormats.includes('instructions') && outputFormats.includes('prompts');
    const file = usePrompts
        ? `.github/prompts/${name}.prompt.md`
        : `.github/instructions/${name}.instructions.md`;
    return { name, file };
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: The new generateRegistryEntry tests PASS (other tests may fail — we fix those next)

**Step 5: Commit**

```bash
git add src/converter.ts src/test/unit/converter.test.ts
git commit -m "fix: make generateRegistryEntry output-format-aware"
```

---

### Task 2: Update `buildRegistryTable` in fileWriter.ts

**Files:**
- Modify: `src/fileWriter.ts:3-7` (RegistryEntry interface)
- Modify: `src/fileWriter.ts:12-24` (buildRegistryTable function)
- Test: `src/test/unit/fileWriter.test.ts:5-21`

**Step 1: Write failing tests**

Replace the existing test block at `src/test/unit/fileWriter.test.ts:5-15` with:

```typescript
describe('buildRegistryTable', () => {
    it('should produce a 2-column markdown table', () => {
        const entries = [
            { name: 'brainstorming', file: '.github/prompts/brainstorming.prompt.md' },
            { name: 'tdd', file: '.github/prompts/tdd.prompt.md' },
        ];
        const table = buildRegistryTable(entries);
        assert.ok(table.includes('| Skill | File |'));
        assert.ok(!table.includes('Trigger'));
        assert.ok(table.includes('| brainstorming |'));
        assert.ok(table.includes('| tdd |'));
    });

    it('should return empty section for no entries', () => {
        const table = buildRegistryTable([]);
        assert.ok(table.includes('No skills imported'));
    });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — table still has 3 columns with Trigger

**Step 3: Update RegistryEntry and buildRegistryTable**

In `src/fileWriter.ts`, change `RegistryEntry` (lines 3-7) to:

```typescript
interface RegistryEntry {
    name: string;
    file: string;
}
```

Change `buildRegistryTable` (lines 12-24) to:

```typescript
export function buildRegistryTable(entries: RegistryEntry[]): string {
    if (entries.length === 0) {
        return `## Available Skills\n\nNo skills imported yet.\n`;
    }

    const header = '## Available Skills\n\nWhen working on tasks, consult these skill files for guidance:\n\n';
    const tableHeader = '| Skill | File |\n|-------|------|\n';
    const rows = entries
        .map(e => `| ${e.name} | ${e.file} |`)
        .join('\n');

    return header + tableHeader + rows + '\n';
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: buildRegistryTable tests PASS

**Step 5: Commit**

```bash
git add src/fileWriter.ts src/test/unit/fileWriter.test.ts
git commit -m "fix: slim registry table to 2-column meta-orchestrator"
```

---

### Task 3: Update `types.ts` — drop trigger from ConversionResult

**Files:**
- Modify: `src/types.ts:79`

**Step 1: Update the type**

Change line 79 from:
```typescript
    registryEntry: { name: string; trigger: string; file: string };
```
to:
```typescript
    registryEntry: { name: string; file: string };
```

**Step 2: Run tests**

Run: `npm test`
Expected: Some tests in importService.test.ts may fail on `.trigger` assertions — we fix those in task 5

**Step 3: Commit**

```bash
git add src/types.ts
git commit -m "refactor: drop trigger from ConversionResult.registryEntry"
```

---

### Task 4: Thread outputFormats through importService.ts

**Files:**
- Modify: `src/importService.ts:71-82` (convertSkill — update generateRegistryEntry call)
- Modify: `src/importService.ts:206-233` (writeSkillFiles — pass outputFormats to updateRegistry)
- Modify: `src/importService.ts:249-343` (removeAllSkills — add outputFormats param)
- Modify: `src/importService.ts:376-379` (rebuildRegistry — add outputFormats param)
- Modify: `src/importService.ts:381-387` (updateRegistry — add outputFormats param)

**Step 1: Update `convertSkill`**

Change line 79 from:
```typescript
            registryEntry: generateRegistryEntry(skill.name, skill.description),
```
to:
```typescript
            registryEntry: generateRegistryEntry(skill.name, outputFormats),
```

**Step 2: Update `updateRegistry`**

Change the private method (lines 381-387) to:
```typescript
    private async updateRegistry(manifest: import('./types').BridgeManifest, outputFormats?: OutputFormat[]): Promise<void> {
        const entries = Object.keys(manifest.skills).map(name => {
            return generateRegistryEntry(name, outputFormats);
        });
        await updateCopilotInstructions(this.workspaceUri, entries);
    }
```

**Step 3: Update `writeSkillFiles`**

In the method body (around line 230), change:
```typescript
        if (generateRegistry) {
            await this.updateRegistry(manifest);
        }
```
to:
```typescript
        if (generateRegistry) {
            await this.updateRegistry(manifest, outputFormats as OutputFormat[]);
        }
```

**Step 4: Update `removeAllSkills` signature**

Change the method signature to add `outputFormats` after `mcpServers`:
```typescript
    async removeAllSkills(
        skills: SkillInfo[],
        generateRegistry: boolean,
        mcpServers?: McpServerInfo[],
        outputFormats?: OutputFormat[]
    ): Promise<BulkImportResult> {
```

And in the body, change:
```typescript
        if (generateRegistry) {
            await this.updateRegistry(manifest);
        }
```
to:
```typescript
        if (generateRegistry) {
            await this.updateRegistry(manifest, outputFormats);
        }
```

**Step 5: Update `rebuildRegistry` signature**

Change from:
```typescript
    async rebuildRegistry(): Promise<void> {
        const manifest = await loadManifest(this.workspaceUri);
        await this.updateRegistry(manifest);
    }
```
to:
```typescript
    async rebuildRegistry(outputFormats?: OutputFormat[]): Promise<void> {
        const manifest = await loadManifest(this.workspaceUri);
        await this.updateRegistry(manifest, outputFormats);
    }
```

**Step 6: Run tests**

Run: `npm test`
Expected: Some importService tests may fail on trigger assertions

**Step 7: Commit**

```bash
git add src/importService.ts
git commit -m "fix: thread outputFormats through registry generation"
```

---

### Task 5: Update extension.ts callers

**Files:**
- Modify: `src/extension.ts:260-268` (rebuildRegistry command)
- Modify: `src/extension.ts:335-348` (removeAllSkills command)
- Modify: `src/extension.ts:351-368` (removeAllFromMarketplace command)

**Step 1: Update rebuildRegistry call**

Change:
```typescript
                await importService.rebuildRegistry();
```
to:
```typescript
                const { outputFormats } = getConfig();
                await importService.rebuildRegistry(outputFormats as import('./types').OutputFormat[]);
```

**Step 2: Update removeAllSkills call**

Change:
```typescript
                await importService.removeAllSkills(plugin.skills, generateRegistry, plugin.mcpServers);
```
to:
```typescript
                const { outputFormats } = getConfig();
                await importService.removeAllSkills(plugin.skills, generateRegistry, plugin.mcpServers, outputFormats as import('./types').OutputFormat[]);
```

**Step 3: Update removeAllFromMarketplace call**

Change:
```typescript
                await importService.removeAllSkills(allSkills, generateRegistry, allMcpServers);
```
to:
```typescript
                const { outputFormats } = getConfig();
                await importService.removeAllSkills(allSkills, generateRegistry, allMcpServers, outputFormats as import('./types').OutputFormat[]);
```

**Step 4: Run tests**

Run: `npm test`
Expected: Extension-level code compiles correctly

**Step 5: Commit**

```bash
git add src/extension.ts
git commit -m "fix: pass outputFormats to removeAllSkills and rebuildRegistry"
```

---

### Task 6: Fix remaining test assertions

**Files:**
- Modify: `src/test/unit/importService.test.ts:31,63-67`
- Modify: `src/test/unit/fileWriter.test.ts:69-77,85-94`

**Step 1: Fix importService.test.ts**

At line 31, change:
```typescript
        assert.ok(result.registryEntry);
```
Keep as-is (still valid).

At lines 63-67, change:
```typescript
        assert.strictEqual(result.registryEntry.name, 'brainstorming');
        assert.strictEqual(result.registryEntry.trigger, 'Creative helper');
        assert.ok(result.registryEntry.file.includes('brainstorming.instructions.md'));
```
to:
```typescript
        assert.strictEqual(result.registryEntry.name, 'brainstorming');
        assert.ok(result.registryEntry.file.includes('brainstorming'));
```

**Step 2: Fix fileWriter.test.ts**

At lines 69-77, update the entries in `updateCopilotInstructions` test:
```typescript
        const entries = [
            { name: 'brainstorming', file: '.github/instructions/brainstorming.instructions.md' },
        ];
```

At lines 85-94, update similarly:
```typescript
        const entries = [
            { name: 'tdd', file: '.github/instructions/tdd.instructions.md' },
        ];
```

**Step 3: Run all tests**

Run: `npm test`
Expected: ALL tests PASS

**Step 4: Commit**

```bash
git add src/test/unit/importService.test.ts src/test/unit/fileWriter.test.ts
git commit -m "test: update assertions for 2-column registry table"
```
