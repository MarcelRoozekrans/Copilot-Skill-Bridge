# Skills Output Target Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a third output target that writes Claude skills as native Copilot Agent Skills (`SKILL.md`), default to user-global install (`~/.claude/skills/<name>/`) to keep workspaces clean, and migrate existing users via a one-time prompt.

**Architecture:** A new `skills` value joins the `OutputFormat` union. A pure `resolveSkillsRoot(scope, override?, workspaceUri?)` function maps `'user'` / `'workspace'` to a `vscode.Uri`. A new `skillsWriter.ts` writes `SKILL.md` + companion files verbatim (no link rewriting, no extension games — companions keep their original names alongside `SKILL.md`). The existing tool-name body conversion (`convertSkillContent`) is kept and applied to the body before writing. The manifest gains an optional `scope` field per skill so removal targets the correct directory; missing `scope` reads as workspace (legacy).

**Tech Stack:** TypeScript, VS Code Extension API (`vscode.workspace.fs`, `vscode.Uri.joinPath`), Mocha + Node `assert`, Node `os`/`path` for `~` expansion.

**Reference design:** [docs/plans/2026-05-04-skills-output-target-design.md](./2026-05-04-skills-output-target-design.md)

**Confirmed decisions (locked at design review):**
1. Default skills scope: `user` (`~/.claude/skills/`)
2. Tool-name body conversion: keep (apply `convertSkillContent` to body before writing)
3. Default `outputFormats` for new installs: `['skills']`
4. Migration UX: one-time prompt on upgrade

---

### Task 1: Add `'skills'` to the `OutputFormat` union

**Files:**
- Modify: [src/types.ts](src/types.ts) line 5
- Modify: [src/converter.ts](src/converter.ts) line 46 (the duplicate `OutputFormat` re-export)
- Test: [src/test/unit/types.test.ts](src/test/unit/types.test.ts) (add new it block)

**Step 1: Write the failing test**

Add to `src/test/unit/types.test.ts`:

```typescript
it('should accept "skills" as an OutputFormat value', () => {
    const formats: OutputFormat[] = ['instructions', 'prompts', 'skills'];
    assert.strictEqual(formats.length, 3);
    assert.ok(formats.includes('skills'));
});
```

(Import `OutputFormat` from `../../types` if not already imported.)

**Step 2: Run the test to verify it fails**

Run: `npm run lint`
Expected: TypeScript error — `'skills'` not assignable to `OutputFormat`.

**Step 3: Update the type**

`src/types.ts` line 5:

```typescript
export type OutputFormat = 'instructions' | 'prompts' | 'skills';
```

`src/converter.ts` line 46:

```typescript
export type OutputFormat = 'instructions' | 'prompts' | 'skills';
```

**Step 4: Run lint + tests**

Run: `npm run lint && npm run compile && npx mocha out/test/unit/types.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/types.ts src/converter.ts src/test/unit/types.test.ts
git commit -m "feat: add 'skills' to OutputFormat union"
```

---

### Task 2: Create `skillsPath` module with `resolveSkillsRoot`

**Files:**
- Create: `src/skillsPath.ts`
- Test: `src/test/unit/skillsPath.test.ts`

**Step 1: Write the failing test**

Create `src/test/unit/skillsPath.test.ts`:

```typescript
import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { resolveSkillsRoot } from '../../skillsPath';

describe('resolveSkillsRoot', () => {
    const workspaceUri = vscode.Uri.file('/tmp/test-workspace');

    it('returns ~/.claude/skills for user scope by default', () => {
        const uri = resolveSkillsRoot('user', undefined, workspaceUri);
        const expected = path.join(os.homedir(), '.claude', 'skills');
        assert.strictEqual(uri.fsPath, expected);
    });

    it('returns workspace/.github/skills for workspace scope by default', () => {
        const uri = resolveSkillsRoot('workspace', undefined, workspaceUri);
        assert.ok(uri.fsPath.endsWith(path.join('test-workspace', '.github', 'skills')),
            `unexpected fsPath: ${uri.fsPath}`);
    });

    it('expands ~ in user-scope override', () => {
        const uri = resolveSkillsRoot('user', '~/.copilot/skills', workspaceUri);
        const expected = path.join(os.homedir(), '.copilot', 'skills');
        assert.strictEqual(uri.fsPath, expected);
    });

    it('joins relative override under workspace for workspace scope', () => {
        const uri = resolveSkillsRoot('workspace', '.agents/skills', workspaceUri);
        assert.ok(uri.fsPath.endsWith(path.join('test-workspace', '.agents', 'skills')));
    });

    it('treats absolute override as-is regardless of scope', () => {
        const abs = path.resolve('/tmp/custom/skills');
        const uri = resolveSkillsRoot('user', abs, workspaceUri);
        assert.strictEqual(uri.fsPath, abs);
    });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run lint`
Expected: error — module `../../skillsPath` not found.

**Step 3: Implement `skillsPath.ts`**

Create `src/skillsPath.ts`:

```typescript
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

export type SkillsScope = 'user' | 'workspace';

const USER_DEFAULT = '~/.claude/skills';
const WORKSPACE_DEFAULT = '.github/skills';

export function resolveSkillsRoot(
    scope: SkillsScope,
    override: string | undefined,
    workspaceUri: vscode.Uri,
): vscode.Uri {
    const raw = override ?? (scope === 'user' ? USER_DEFAULT : WORKSPACE_DEFAULT);

    if (raw.startsWith('~')) {
        return vscode.Uri.file(path.join(os.homedir(), raw.slice(1)));
    }
    if (path.isAbsolute(raw)) {
        return vscode.Uri.file(raw);
    }
    if (scope === 'workspace') {
        return vscode.Uri.joinPath(workspaceUri, ...raw.split(/[\\/]/));
    }
    // User scope with relative override — anchor under home dir
    return vscode.Uri.file(path.join(os.homedir(), raw));
}
```

**Step 4: Run tests**

Run: `npm run compile && npx mocha out/test/unit/skillsPath.test.js`
Expected: 5 PASS.

**Step 5: Commit**

```bash
git add src/skillsPath.ts src/test/unit/skillsPath.test.ts
git commit -m "feat: add resolveSkillsRoot for user/workspace scope resolution"
```

---

### Task 3: Add optional `scope` field to `SkillImportState`

**Files:**
- Modify: [src/types.ts](src/types.ts) `SkillImportState` interface
- Modify: [src/stateManager.ts](src/stateManager.ts) `recordImport` to accept and persist scope
- Test: `src/test/unit/stateManager.test.ts` (add new it blocks)

**Step 1: Write the failing tests**

Add to `src/test/unit/stateManager.test.ts`:

```typescript
import { SkillsScope } from '../../skillsPath';

describe('recordImport with scope', () => {
    it('records the scope when provided', () => {
        const empty = createEmptyManifest();
        const updated = recordImport(empty, 'foo', 'plug@repo', 'abc123', 'user');
        assert.strictEqual(updated.skills['foo'].scope, 'user');
    });

    it('omits scope for legacy callers', () => {
        const empty = createEmptyManifest();
        const updated = recordImport(empty, 'foo', 'plug@repo', 'abc123');
        assert.strictEqual(updated.skills['foo'].scope, undefined);
    });

    it('preserves existing scope when re-importing without it', () => {
        const empty = createEmptyManifest();
        const first = recordImport(empty, 'foo', 'plug@repo', 'abc123', 'workspace');
        const second = recordImport(first, 'foo', 'plug@repo', 'def456');
        assert.strictEqual(second.skills['foo'].scope, 'workspace');
    });
});
```

**Step 2: Run to verify failure**

Run: `npm run lint`
Expected: errors — `recordImport` accepts only 4 args; `scope` not on `SkillImportState`.

**Step 3: Update type and `recordImport`**

`src/types.ts` — add to `SkillImportState`:

```typescript
export interface SkillImportState {
    source: string;
    sourceHash: string;
    importedHash: string;
    importedAt: string;
    locallyModified: boolean;
    embedded?: boolean;
    scope?: 'user' | 'workspace';
}
```

`src/stateManager.ts` — update `recordImport` signature and body:

```typescript
export function recordImport(
    manifest: BridgeManifest,
    skillName: string,
    source: string,
    contentHash: string,
    scope?: 'user' | 'workspace',
): BridgeManifest {
    const existing = manifest.skills[skillName];
    return {
        ...manifest,
        skills: {
            ...manifest.skills,
            [skillName]: {
                source,
                sourceHash: contentHash,
                importedHash: contentHash,
                importedAt: new Date().toISOString(),
                locallyModified: false,
                embedded: existing?.embedded ?? false,
                scope: scope ?? existing?.scope,
            },
        },
    };
}
```

**Step 4: Run tests**

Run: `npm run compile && npx mocha out/test/unit/stateManager.test.js`
Expected: existing tests still PASS, 3 new tests PASS.

**Step 5: Commit**

```bash
git add src/types.ts src/stateManager.ts src/test/unit/stateManager.test.ts
git commit -m "feat: record install scope per skill in manifest"
```

---

### Task 4: Add `generateSkillFile` to converter

**Files:**
- Modify: [src/converter.ts](src/converter.ts) (add export)
- Test: [src/test/unit/converter.test.ts](src/test/unit/converter.test.ts) (add describe block)

**Step 1: Write the failing tests**

Add to `src/test/unit/converter.test.ts`:

```typescript
describe('generateSkillFile', () => {
    it('wraps body in name+description frontmatter', () => {
        const result = generateSkillFile('brainstorming', 'Creative work helper', 'Body content here');
        assert.ok(result.startsWith('---\n'));
        assert.ok(result.includes("name: brainstorming"));
        assert.ok(result.includes("description: 'Creative work helper'"));
        assert.ok(result.includes('Body content here'));
    });

    it('escapes single quotes in description', () => {
        const result = generateSkillFile('test', "it's a test", 'body');
        assert.ok(result.includes("description: 'it''s a test'"));
    });

    it('does not include applyTo (Copilot SKILL.md does not use it)', () => {
        const result = generateSkillFile('test', 'desc', 'body');
        assert.ok(!result.includes('applyTo'));
    });

    it('does not include agent: agent (that is for prompts)', () => {
        const result = generateSkillFile('test', 'desc', 'body');
        assert.ok(!result.includes('agent: agent'));
    });
});
```

**Step 2: Run to verify failure**

Run: `npm run lint`
Expected: error — `generateSkillFile` not exported.

**Step 3: Implement `generateSkillFile`**

Add to `src/converter.ts` after `generateFullPromptFile`:

```typescript
export function generateSkillFile(name: string, description: string, convertedBody: string): string {
    return `---
name: ${name}
description: '${description.replace(/'/g, "''")}'
---

${convertedBody}
`;
}
```

Update the import at the top of `src/test/unit/converter.test.ts` to include `generateSkillFile`.

**Step 4: Run tests**

Run: `npm run compile && npx mocha out/test/unit/converter.test.js`
Expected: all PASS.

**Step 5: Commit**

```bash
git add src/converter.ts src/test/unit/converter.test.ts
git commit -m "feat: add generateSkillFile for Copilot SKILL.md frontmatter"
```

---

### Task 5: Create `skillsWriter.ts` with `writeSkillFolder`

**Files:**
- Create: `src/skillsWriter.ts`
- Test: `src/test/unit/skillsWriter.test.ts`

**Step 1: Write the failing tests**

Create `src/test/unit/skillsWriter.test.ts`:

```typescript
import * as assert from 'assert';
import * as vscode from 'vscode';
import { writeSkillFolder } from '../../skillsWriter';

describe('writeSkillFolder', () => {
    const root = vscode.Uri.file('/tmp/skills-root');
    let writtenFiles: Array<{ path: string; content: string }>;
    const origWriteFile = vscode.workspace.fs.writeFile;
    const origCreateDir = vscode.workspace.fs.createDirectory;

    beforeEach(() => {
        writtenFiles = [];
        (vscode.workspace.fs as any).writeFile = async (uri: any, buf: Uint8Array) => {
            writtenFiles.push({
                path: uri.fsPath,
                content: Buffer.from(buf).toString('utf-8'),
            });
        };
        (vscode.workspace.fs as any).createDirectory = async () => { /* noop */ };
    });

    afterEach(() => {
        (vscode.workspace.fs as any).writeFile = origWriteFile;
        (vscode.workspace.fs as any).createDirectory = origCreateDir;
    });

    it('writes SKILL.md under <root>/<name>/', async () => {
        await writeSkillFolder(root, 'brainstorming', 'SKILL body content', []);
        assert.strictEqual(writtenFiles.length, 1);
        assert.ok(writtenFiles[0].path.endsWith(['skills-root', 'brainstorming', 'SKILL.md'].join(require('path').sep)));
        assert.strictEqual(writtenFiles[0].content, 'SKILL body content');
    });

    it('writes companion files verbatim alongside SKILL.md', async () => {
        const companions = [
            { name: 'visual-criteria.md', content: 'criteria body' },
            { name: 'checklist.md', content: 'checklist body' },
        ];
        await writeSkillFolder(root, 'regression-test', 'SKILL body', companions);
        assert.strictEqual(writtenFiles.length, 3);
        const names = writtenFiles.map(f => require('path').basename(f.path));
        assert.deepStrictEqual(names.sort(), ['SKILL.md', 'checklist.md', 'visual-criteria.md']);
    });

    it('does not prefix companion file names', async () => {
        const companions = [{ name: 'code-reviewer.md', content: 'body' }];
        await writeSkillFolder(root, 'requesting-code-review', 'SKILL body', companions);
        const companionFile = writtenFiles.find(f => f.path.endsWith('code-reviewer.md'));
        assert.ok(companionFile, 'companion file should be written with original name');
        assert.ok(!companionFile!.path.includes('requesting-code-review-code-reviewer'),
            'companion should NOT be prefixed with parent name');
    });
});
```

**Step 2: Run to verify failure**

Run: `npm run lint`
Expected: error — module `../../skillsWriter` not found.

**Step 3: Implement `skillsWriter.ts`**

Create `src/skillsWriter.ts`:

```typescript
import * as vscode from 'vscode';
import { CompanionFile } from './types';

export async function writeSkillFolder(
    root: vscode.Uri,
    skillName: string,
    skillContent: string,
    companionFiles: CompanionFile[],
): Promise<void> {
    const skillDir = vscode.Uri.joinPath(root, skillName);
    await vscode.workspace.fs.createDirectory(skillDir);

    await vscode.workspace.fs.writeFile(
        vscode.Uri.joinPath(skillDir, 'SKILL.md'),
        Buffer.from(skillContent, 'utf-8'),
    );

    for (const companion of companionFiles) {
        await vscode.workspace.fs.writeFile(
            vscode.Uri.joinPath(skillDir, companion.name),
            Buffer.from(companion.content, 'utf-8'),
        );
    }
}
```

**Step 4: Run tests**

Run: `npm run compile && npx mocha out/test/unit/skillsWriter.test.js`
Expected: 3 PASS.

**Step 5: Commit**

```bash
git add src/skillsWriter.ts src/test/unit/skillsWriter.test.ts
git commit -m "feat: add writeSkillFolder for native SKILL.md output"
```

---

### Task 6: Add `removeSkillFolder` to `skillsWriter.ts`

**Files:**
- Modify: `src/skillsWriter.ts`
- Modify: `src/test/unit/skillsWriter.test.ts`

**Step 1: Write the failing tests**

Add to `src/test/unit/skillsWriter.test.ts`:

```typescript
describe('removeSkillFolder', () => {
    const root = vscode.Uri.file('/tmp/skills-root');
    let deletedPaths: string[];
    const origDelete = vscode.workspace.fs.delete;

    beforeEach(() => {
        deletedPaths = [];
        (vscode.workspace.fs as any).delete = async (uri: any) => {
            deletedPaths.push(uri.fsPath);
        };
    });

    afterEach(() => {
        (vscode.workspace.fs as any).delete = origDelete;
    });

    it('deletes the skill directory recursively', async () => {
        const { removeSkillFolder } = await import('../../skillsWriter');
        await removeSkillFolder(root, 'brainstorming');
        assert.strictEqual(deletedPaths.length, 1);
        assert.ok(deletedPaths[0].endsWith(require('path').join('skills-root', 'brainstorming')));
    });

    it('does not throw if directory does not exist', async () => {
        (vscode.workspace.fs as any).delete = async () => { throw new Error('not found'); };
        const { removeSkillFolder } = await import('../../skillsWriter');
        await assert.doesNotReject(removeSkillFolder(root, 'missing'));
    });
});
```

**Step 2: Run to verify failure**

Run: `npm run lint`
Expected: error — `removeSkillFolder` not exported.

**Step 3: Implement**

Add to `src/skillsWriter.ts`:

```typescript
import { getLogger } from './logger';

export async function removeSkillFolder(root: vscode.Uri, skillName: string): Promise<void> {
    const skillDir = vscode.Uri.joinPath(root, skillName);
    try {
        await vscode.workspace.fs.delete(skillDir, { recursive: true, useTrash: false });
    } catch (err) {
        getLogger().debug('skillsWriter.removeSkillFolder: directory not found', err);
    }
}
```

**Step 4: Run tests**

Run: `npm run compile && npx mocha out/test/unit/skillsWriter.test.js`
Expected: 5 PASS (3 + 2 new).

**Step 5: Commit**

```bash
git add src/skillsWriter.ts src/test/unit/skillsWriter.test.ts
git commit -m "feat: add removeSkillFolder cleanup"
```

---

### Task 7: Wire skills output into `importService.writeSkillFiles`

**Files:**
- Modify: [src/importService.ts](src/importService.ts) `writeSkillFiles` (~line 499)
- Modify: [src/extension.ts](src/extension.ts) `getConfig` (~line 191)
- Test: [src/test/unit/importService.test.ts](src/test/unit/importService.test.ts) (add tests for skills output)

**Step 1: Extend `getConfig` to read scope/path settings**

In `src/extension.ts:getConfig`, add:

```typescript
skillsScope: config.get<'user' | 'workspace'>('skillsScope', 'user'),
skillsPath: config.get<string | undefined>('skillsPath', undefined),
```

**Step 2: Write the failing test for skills output**

Add to `src/test/unit/importService.test.ts` inside the `ImportService.writeSkillFiles prompt format` describe (or a new describe block):

```typescript
describe('ImportService.writeSkillFiles skills format', () => {
    const workspaceUri = vscode.Uri.file('/tmp/test-workspace');
    let service: ImportService;
    let writtenFiles: Array<{ path: string; content: string }>;
    const origWriteFile = vscode.workspace.fs.writeFile;
    const origCreateDir = vscode.workspace.fs.createDirectory;
    const origShowInfo = vscode.window.showInformationMessage;

    beforeEach(() => {
        service = new ImportService(workspaceUri);
        writtenFiles = [];
        (vscode.workspace.fs as any).writeFile = async (uri: any, buf: Uint8Array) => {
            writtenFiles.push({
                path: uri.fsPath,
                content: Buffer.from(buf).toString('utf-8'),
            });
        };
        (vscode.workspace.fs as any).createDirectory = async () => {};
        (vscode.window as any).showInformationMessage = async () => 'Import';
    });

    afterEach(() => {
        (vscode.workspace.fs as any).writeFile = origWriteFile;
        (vscode.workspace.fs as any).createDirectory = origCreateDir;
        (vscode.window as any).showInformationMessage = origShowInfo;
    });

    it('writes SKILL.md when outputFormats=["skills"]', async () => {
        const skill = makeSkill();
        await service.importSkill(skill, ['skills'], false);
        const skillFile = writtenFiles.find(f => f.path.endsWith('SKILL.md'));
        assert.ok(skillFile, `expected SKILL.md write, got: ${writtenFiles.map(f => f.path).join(', ')}`);
        assert.ok(skillFile!.content.includes('name: test-skill'));
        // No instructions/prompts files when skills-only
        assert.ok(!writtenFiles.some(f => f.path.endsWith('.instructions.md')));
        assert.ok(!writtenFiles.some(f => f.path.endsWith('.prompt.md')));
    });

    it('writes companion files verbatim alongside SKILL.md', async () => {
        const skill = makeSkill({
            companionFiles: [{ name: 'helper.md', content: 'helper body' }],
        });
        await service.importSkill(skill, ['skills'], false);
        const helper = writtenFiles.find(f => f.path.endsWith('helper.md'));
        assert.ok(helper, 'helper.md should be written');
        // No prefix
        assert.ok(!writtenFiles.some(f => f.path.endsWith('test-skill-helper.md')));
    });
});
```

**Step 3: Run to verify failure**

Run: `npm run compile && npx mocha out/test/unit/importService.test.js -g "skills format"`
Expected: FAIL — no SKILL.md is written because the wiring isn't there yet.

**Step 4: Wire into `writeSkillFiles`**

In `src/importService.ts`, top imports, add:

```typescript
import { writeSkillFolder } from './skillsWriter';
import { resolveSkillsRoot, SkillsScope } from './skillsPath';
import { generateSkillFile } from './converter';
```

Modify `writeSkillFiles` signature to accept scope/path:

```typescript
private async writeSkillFiles(
    skill: SkillInfo,
    conversion: ConversionResult,
    outputFormats: string[],
    manifest: BridgeManifest,
    skillsScope: SkillsScope = 'user',
    skillsPath?: string,
): Promise<BridgeManifest> {
```

Inside `writeSkillFiles`, after the existing prompts/instructions blocks:

```typescript
if (outputFormats.includes('skills')) {
    const root = resolveSkillsRoot(skillsScope, skillsPath, this.workspaceUri);
    const skillContent = generateSkillFile(skill.name, skill.description, conversion.convertedBody);
    await writeSkillFolder(root, skill.name, skillContent, skill.companionFiles ?? []);
    manifest = recordImport(manifest, skill.name, source, hash, skillsScope);
} else {
    manifest = recordImport(manifest, skill.name, source, hash);
}
```

(Replace the existing single `recordImport` call near line 530 with the conditional above.)

Update **all callers** of `writeSkillFiles` to pass scope/path. Search for `this.writeSkillFiles(` and add the two new arguments after `manifest`. The values come from `getConfig()` which is already invoked at the entry points (`importSkill`, `importAllSkills`, etc.).

For `importSkill`/`importAllSkills` etc., add a parameter to accept these values from the calling site, OR have `ImportService` accept them via constructor / setter. **Simpler:** add `skillsScope`/`skillsPath` parameters to the public `importSkill`/`importAllSkills`/`importSkillsByPlugin` methods, default to `'user'`/undefined.

Then in `src/extension.ts`, every place that calls `importService.importSkill(...)` etc., pass `skillsScope` and `skillsPath` from `getConfig()`.

**Step 5: Run tests**

Run: `npm run lint && npm run compile && npm run test:unit`
Expected: all PASS, including the 2 new skills-format tests.

**Step 6: Commit**

```bash
git add src/importService.ts src/extension.ts src/test/unit/importService.test.ts
git commit -m "feat: wire skills output target into import flow"
```

---

### Task 8: Wire skills cleanup into `removeSkill`

**Files:**
- Modify: [src/importService.ts](src/importService.ts) `removeSkill` (~line 558)
- Modify: [src/test/unit/importService.test.ts](src/test/unit/importService.test.ts)

**Step 1: Write failing test**

Add to importService.test.ts:

```typescript
describe('ImportService.removeSkill skills format', () => {
    const workspaceUri = vscode.Uri.file('/tmp/test-workspace');
    let service: ImportService;
    let deletedPaths: string[];
    const origDelete = vscode.workspace.fs.delete;
    const origReadFile = vscode.workspace.fs.readFile;
    const origWriteFile = vscode.workspace.fs.writeFile;

    beforeEach(() => {
        service = new ImportService(workspaceUri);
        deletedPaths = [];
        (vscode.workspace.fs as any).delete = async (uri: any) => {
            deletedPaths.push(uri.fsPath);
        };
        // Mock manifest read to include a user-scope skill
        const manifest = {
            skills: { 'test-skill': { source: 'p@m', sourceHash: 'h', importedHash: 'h', importedAt: '', locallyModified: false, scope: 'user' } },
            mcpServers: {}, marketplaces: [], settings: { checkInterval: 86400, autoAcceptUpdates: false },
        };
        (vscode.workspace.fs as any).readFile = async () => Buffer.from(JSON.stringify(manifest));
        (vscode.workspace.fs as any).writeFile = async () => {};
    });

    afterEach(() => {
        (vscode.workspace.fs as any).delete = origDelete;
        (vscode.workspace.fs as any).readFile = origReadFile;
        (vscode.workspace.fs as any).writeFile = origWriteFile;
    });

    it('deletes the user-scope skills folder when scope=user', async () => {
        await service.removeSkill('test-skill', false, undefined, 'user');
        assert.ok(deletedPaths.some(p => p.includes('test-skill')),
            `expected skill folder delete, got: ${deletedPaths.join(', ')}`);
    });
});
```

**Step 2: Run to verify failure**

Run: `npx mocha out/test/unit/importService.test.js -g "removeSkill skills format"`
Expected: FAIL.

**Step 3: Update `removeSkill`**

In `src/importService.ts`, modify `removeSkill` to accept scope/path and dispatch on the manifest's recorded scope:

```typescript
async removeSkill(
    skillName: string,
    generateRegistry: boolean,
    outputFormats?: OutputFormat[],
    skillsScope: SkillsScope = 'user',
    skillsPath?: string,
): Promise<void> {
    let manifest = await loadManifest(this.workspaceUri);
    const recordedScope = manifest.skills[skillName]?.scope;

    // Always try to clean up legacy instructions/prompts files
    await removeSkillFiles(this.workspaceUri, skillName);

    // Clean up skills folder if recorded
    if (recordedScope) {
        const root = resolveSkillsRoot(recordedScope, skillsPath, this.workspaceUri);
        await removeSkillFolder(root, skillName);
    }

    manifest = removeSkillRecord(manifest, skillName);
    await saveManifest(this.workspaceUri, manifest);

    if (generateRegistry) {
        await this.updateRegistry(manifest, outputFormats);
    }
}
```

Add `import { removeSkillFolder } from './skillsWriter';` if not already imported.

Update callers in `extension.ts` to pass scope/path from config.

**Step 4: Run tests**

Run: `npm run lint && npm run compile && npm run test:unit`
Expected: all PASS.

**Step 5: Commit**

```bash
git add src/importService.ts src/extension.ts src/test/unit/importService.test.ts
git commit -m "feat: clean up skills folder on remove"
```

---

### Task 9: Add migration prompt on activation

**Files:**
- Modify: [src/extension.ts](src/extension.ts) `activate`
- Test: integration smoke (manual verification in Step 5)

**Step 1: Design the prompt UX**

On activation, after manifest load, if:
- The manifest has at least one skill, AND
- The manifest's marker `migration.skillsPrompted` is unset, AND
- The user's `outputFormats` does not already include `'skills'`,

then show a one-time prompt:

> "GitHub Copilot now reads SKILL.md natively. Switch CopilotBridge to write skills directly?"
> Options: `[Switch (recommended)]` `[Hybrid (skills + prompts)]` `[Keep current]`

Whatever they pick, set `migration.skillsPrompted = true` in the manifest so we don't ask again.

**Step 2: Add a `migration` section to `BridgeManifest`**

`src/types.ts`:

```typescript
export interface BridgeManifest {
    skills: Record<string, SkillImportState>;
    mcpServers: Record<string, McpServerRecord>;
    marketplaces: Array<{ repo: string; lastChecked: string }>;
    settings: {
        checkInterval: number;
        autoAcceptUpdates: boolean;
    };
    migration?: {
        skillsPrompted?: boolean;
    };
}
```

**Step 3: Implement in `extension.ts`**

Add a function near the top of `activate`:

```typescript
async function maybePromptSkillsMigration(workspaceUri: vscode.Uri): Promise<void> {
    const manifest = await loadManifest(workspaceUri);
    const hasSkills = Object.keys(manifest.skills).length > 0;
    const alreadyPrompted = manifest.migration?.skillsPrompted === true;
    const config = vscode.workspace.getConfiguration('copilotSkillBridge');
    const currentFormats = config.get<string[]>('outputFormats', ['prompts']);
    const alreadyOnSkills = currentFormats.includes('skills');

    if (!hasSkills || alreadyPrompted || alreadyOnSkills) { return; }

    const choice = await vscode.window.showInformationMessage(
        'GitHub Copilot now reads SKILL.md natively. Switch CopilotBridge to write skills directly?',
        { modal: false },
        'Switch (recommended)',
        'Hybrid (skills + prompts)',
        'Keep current',
    );

    if (choice === 'Switch (recommended)') {
        await config.update('outputFormats', ['skills'], vscode.ConfigurationTarget.Workspace);
    } else if (choice === 'Hybrid (skills + prompts)') {
        await config.update('outputFormats', ['skills', 'prompts'], vscode.ConfigurationTarget.Workspace);
    }
    // For all branches (including dismissal/keep), mark prompted so we don't nag
    const updated = { ...manifest, migration: { ...(manifest.migration ?? {}), skillsPrompted: true } };
    await saveManifest(workspaceUri, updated);
}
```

Call `await maybePromptSkillsMigration(workspaceUri);` once at the start of `activate` after the workspace folder is resolved. Wrap in try/catch with logger.debug — it must never block activation.

**Step 4: Build + manual smoke test**

Run: `npm run compile`
Manual verification:
1. Create a temp workspace with an existing manifest containing one skill (no `scope`).
2. Launch the extension in dev host (F5).
3. Confirm the prompt appears.
4. Pick "Keep current". Reload window. Confirm the prompt does NOT reappear (manifest now has `migration.skillsPrompted: true`).
5. Delete `migration.skillsPrompted` from manifest, reload, pick "Switch", reload. Confirm `outputFormats` is now `['skills']` and the prompt does not reappear.

**Step 5: Commit**

```bash
git add src/types.ts src/extension.ts
git commit -m "feat: one-time migration prompt for skills output"
```

---

### Task 10: Update `package.json` config schema

**Files:**
- Modify: [package.json](package.json) `contributes.configuration.properties`

**Step 1: Update `outputFormats` enum and default**

```json
"copilotSkillBridge.outputFormats": {
  "type": "array",
  "items": {
    "type": "string",
    "enum": ["instructions", "prompts", "skills"]
  },
  "default": ["skills"],
  "description": "Which Copilot file formats to generate. 'skills' writes native SKILL.md (recommended). 'instructions'/'prompts' use the legacy conversion pipeline."
}
```

**Step 2: Add the two new settings**

Append:

```json
"copilotSkillBridge.skillsScope": {
  "type": "string",
  "enum": ["user", "workspace"],
  "default": "user",
  "description": "Where to install skills. 'user' (default) writes to ~/.claude/skills (clean repo, like installing a VS Code extension). 'workspace' writes to .github/skills (committed, team-shared)."
},
"copilotSkillBridge.skillsPath": {
  "type": "string",
  "default": "",
  "description": "Override the skills install path. Empty = use the scope default. Supports ~ expansion. For workspace scope, relative paths anchor at the workspace root."
}
```

**Step 3: Manual verification**

Open the extension's `package.json` schema in VS Code Settings UI, confirm new settings appear with the descriptions above.

**Step 4: Commit**

```bash
git add package.json
git commit -m "feat: add skillsScope/skillsPath config; default outputFormats to skills"
```

---

### Task 11: Update README

**Files:**
- Modify: [README.md](README.md)

**Step 1: Add a section under "Configuration"**

Document:
- Skills as the new default output target
- `skillsScope` choice between user / workspace
- The migration prompt for existing users
- Min Copilot version note (Dec 2025+ for native SKILL.md support)
- Mode-gating note (skills only fire in Agent mode)

**Step 2: Update any setup screenshots/quickstart that reference `.github/prompts/`**

Search for `.github/prompts` and `.github/instructions` references in README.md and update where the recommended path is now `~/.claude/skills/`.

**Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document skills output target and migration"
```

---

### Task 12: Final verification

**Step 1: Full build + lint + tests**

```bash
npm run lint && npm run compile && npm run test:unit
```

Expected: all PASS, no new warnings.

**Step 2: Run integration tests**

```bash
npm run test:integration
```

Expected: all PASS.

**Step 3: Manual smoke test in dev host**

1. Launch dev host (F5).
2. Open a workspace with a configured marketplace.
3. Import a skill that has companion files (e.g., `requesting-code-review`).
4. Verify on disk:
   - `~/.claude/skills/requesting-code-review/SKILL.md` exists
   - `~/.claude/skills/requesting-code-review/code-reviewer.md` exists (companion, original name, no prefix)
   - SKILL.md frontmatter has `name` and `description`
   - SKILL.md body contains the converted tool names (e.g., "task checklist" not "TodoWrite")
5. Open VS Code Copilot Chat in **Agent mode**, confirm the skill is discovered (it should appear when relevant).
6. Remove the skill via the extension. Verify the directory is gone.

**Step 4: Push and open PR**

```bash
git push -u origin feat/skills-output-target
gh pr create --title "feat: native SKILL.md output target" --body-file <prepared-body>
```

PR body should reference the design doc PR (#119) and the four locked decisions.

---

## Acceptance criteria

- [ ] `outputFormats` accepts `'skills'` and writes `SKILL.md` + companions to the resolved path
- [ ] Default scope is user-global (`~/.claude/skills/`), overridable via `skillsScope`/`skillsPath`
- [ ] Companion files keep their original names (no parent prefix) and live alongside `SKILL.md`
- [ ] Body conversion (TodoWrite → checklist, etc.) still applies inside `SKILL.md`
- [ ] Manifest records `scope` per skill; legacy entries (no scope) read as workspace
- [ ] Removal cleans up the correct directory based on recorded scope
- [ ] One-time migration prompt fires for existing users with imported skills; never re-prompts
- [ ] Default `outputFormats` for new installs is `['skills']`
- [ ] No regression in existing `instructions`/`prompts` flows
- [ ] All unit + integration tests pass
- [ ] README documents the new format and the min Copilot version

## Out of scope

- `.agent.md` output target (separate future feature)
- Removing the `instructions`/`prompts` pipeline
- Auto-deletion of legacy on-disk files during migration
- Tool-restriction frontmatter (`tools:` field) — would require mapping Claude tool names to Copilot's tool surface, defer
