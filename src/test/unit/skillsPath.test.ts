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
        assert.ok(uri.fsPath.endsWith('test-workspace/.github/skills'),
            `unexpected fsPath: ${uri.fsPath}`);
    });

    it('expands ~ in user-scope override', () => {
        const uri = resolveSkillsRoot('user', '~/.copilot/skills', workspaceUri);
        const expected = path.join(os.homedir(), '.copilot', 'skills');
        assert.strictEqual(uri.fsPath, expected);
    });

    it('joins relative override under workspace for workspace scope', () => {
        const uri = resolveSkillsRoot('workspace', '.agents/skills', workspaceUri);
        assert.ok(uri.fsPath.endsWith('test-workspace/.agents/skills'),
            `unexpected fsPath: ${uri.fsPath}`);
    });

    it('treats absolute override as-is regardless of scope', () => {
        const abs = path.resolve('/tmp/custom/skills');
        const uri = resolveSkillsRoot('user', abs, workspaceUri);
        assert.strictEqual(uri.fsPath, abs);
    });

    it('treats empty-string override as "use default" for user scope', () => {
        const uri = resolveSkillsRoot('user', '', workspaceUri);
        const expected = path.join(os.homedir(), '.claude', 'skills');
        assert.strictEqual(uri.fsPath, expected);
    });

    it('treats empty-string override as "use default" for workspace scope', () => {
        const uri = resolveSkillsRoot('workspace', '', workspaceUri);
        assert.ok(uri.fsPath.endsWith('test-workspace/.github/skills'),
            `unexpected fsPath: ${uri.fsPath}`);
    });

    it('does not expand ~user/foo (only ~/foo or ~\\foo or bare ~)', () => {
        const uri = resolveSkillsRoot('user', '~bob/skills', workspaceUri);
        assert.ok(uri.fsPath.includes('~bob'),
            `expected ~bob preserved, got: ${uri.fsPath}`);
    });

    it('expands bare ~ to the home directory', () => {
        const uri = resolveSkillsRoot('user', '~', workspaceUri);
        assert.strictEqual(uri.fsPath, os.homedir());
    });
});
