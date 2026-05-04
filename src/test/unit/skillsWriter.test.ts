import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { writeSkillFolder, removeSkillFolder } from '../../skillsWriter';

describe('writeSkillFolder', () => {
    const root = vscode.Uri.file('/tmp/skills-root');
    let writtenFiles: Array<{ path: string; content: string }>;
    const origWriteFile = vscode.workspace.fs.writeFile;
    const origCreateDir = vscode.workspace.fs.createDirectory;

    beforeEach(() => {
        writtenFiles = [];
        (vscode.workspace.fs as unknown as { writeFile: unknown }).writeFile =
            async (uri: vscode.Uri, buf: Uint8Array) => {
                writtenFiles.push({
                    path: uri.fsPath,
                    content: Buffer.from(buf).toString('utf-8'),
                });
            };
        (vscode.workspace.fs as unknown as { createDirectory: unknown }).createDirectory =
            async () => { /* noop */ };
    });

    afterEach(() => {
        (vscode.workspace.fs as unknown as { writeFile: unknown }).writeFile = origWriteFile;
        (vscode.workspace.fs as unknown as { createDirectory: unknown }).createDirectory = origCreateDir;
    });

    it('writes SKILL.md under <root>/<name>/', async () => {
        await writeSkillFolder(root, 'brainstorming', 'SKILL body content', []);
        assert.strictEqual(writtenFiles.length, 1);
        assert.ok(writtenFiles[0].path.endsWith('skills-root/brainstorming/SKILL.md'),
            `unexpected path: ${writtenFiles[0].path}`);
        assert.strictEqual(writtenFiles[0].content, 'SKILL body content');
    });

    it('writes companion files verbatim alongside SKILL.md', async () => {
        const companions = [
            { name: 'visual-criteria.md', content: 'criteria body' },
            { name: 'checklist.md', content: 'checklist body' },
        ];
        await writeSkillFolder(root, 'regression-test', 'SKILL body', companions);
        assert.strictEqual(writtenFiles.length, 3);
        const names = writtenFiles.map(f => path.basename(f.path));
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

describe('removeSkillFolder', () => {
    const root = vscode.Uri.file('/tmp/skills-root');
    let deletedPaths: string[];
    const origDelete = vscode.workspace.fs.delete;

    beforeEach(() => {
        deletedPaths = [];
        (vscode.workspace.fs as unknown as { delete: unknown }).delete =
            async (uri: vscode.Uri) => {
                deletedPaths.push(uri.fsPath);
            };
    });

    afterEach(() => {
        (vscode.workspace.fs as unknown as { delete: unknown }).delete = origDelete;
    });

    it('deletes the skill directory recursively', async () => {
        await removeSkillFolder(root, 'brainstorming');
        assert.strictEqual(deletedPaths.length, 1);
        assert.ok(deletedPaths[0].endsWith('skills-root/brainstorming'),
            `unexpected path: ${deletedPaths[0]}`);
    });

    it('does not throw if directory does not exist', async () => {
        (vscode.workspace.fs as unknown as { delete: unknown }).delete =
            async () => { throw new Error('not found'); };
        await assert.doesNotReject(removeSkillFolder(root, 'missing'));
    });
});
