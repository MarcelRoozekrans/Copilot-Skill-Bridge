import * as assert from 'assert';
import * as vscode from 'vscode';
import { generateInstructionsFile, generatePromptFile } from '../../converter';
import { writeInstructionsFile, writePromptFile, removeSkillFiles } from '../../fileWriter';
import { loadManifest, saveManifest, recordImport, computeHash, createEmptyManifest } from '../../stateManager';

describe('Import Flow Integration', () => {
    let workspaceUri: vscode.Uri;

    before(() => {
        const folders = vscode.workspace.workspaceFolders;
        assert.ok(folders && folders.length > 0, 'No workspace folder open');
        workspaceUri = folders[0].uri;
    });

    it('should write instructions file to .github/instructions/', async () => {
        const content = generateInstructionsFile('test-import', 'A test skill', 'Body content here');
        await writeInstructionsFile(workspaceUri, 'test-import', content);

        const fileUri = vscode.Uri.joinPath(workspaceUri, '.github', 'instructions', 'test-import.instructions.md');
        const raw = await vscode.workspace.fs.readFile(fileUri);
        const text = Buffer.from(raw).toString('utf-8');
        assert.ok(text.includes("name: 'Test Import'"));
        assert.ok(text.includes('Body content here'));
    });

    it('should write prompt file to .github/prompts/', async () => {
        const content = generatePromptFile('test-import', 'A test skill', 'Body content here');
        await writePromptFile(workspaceUri, 'test-import', content);

        const fileUri = vscode.Uri.joinPath(workspaceUri, '.github', 'prompts', 'test-import.prompt.md');
        const raw = await vscode.workspace.fs.readFile(fileUri);
        const text = Buffer.from(raw).toString('utf-8');
        assert.ok(text.includes('name: test-import'));
        assert.ok(text.includes('agent: agent'));
    });

    it('should track import in manifest', async () => {
        let manifest = createEmptyManifest();
        manifest = recordImport(manifest, 'test-import', 'test@test', computeHash('body'));
        await saveManifest(workspaceUri, manifest);

        const loaded = await loadManifest(workspaceUri);
        assert.ok(loaded.skills['test-import']);
        assert.strictEqual(loaded.skills['test-import'].source, 'test@test');
    });

    it('should remove skill files on removeSkillFiles', async () => {
        await writeInstructionsFile(workspaceUri, 'test-remove', 'content');
        await writePromptFile(workspaceUri, 'test-remove', 'content');

        await removeSkillFiles(workspaceUri, 'test-remove');

        const instrUri = vscode.Uri.joinPath(workspaceUri, '.github', 'instructions', 'test-remove.instructions.md');
        try {
            await vscode.workspace.fs.readFile(instrUri);
            assert.fail('File should have been deleted');
        } catch {
            // Expected
        }
    });

    after(async () => {
        try {
            const githubDir = vscode.Uri.joinPath(workspaceUri, '.github');
            await vscode.workspace.fs.delete(githubDir, { recursive: true });
        } catch { /* may not exist */ }
    });
});
