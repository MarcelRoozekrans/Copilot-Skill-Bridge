import * as assert from 'assert';
import * as vscode from 'vscode';
import * as os from 'os';

describe('UpdateWatcher Integration', () => {
    it('should create a file system watcher for SKILL.md files', () => {
        const pattern = new vscode.RelativePattern(
            vscode.Uri.file(os.tmpdir()),
            '**/SKILL.md'
        );
        const watcher = vscode.workspace.createFileSystemWatcher(pattern);
        assert.ok(watcher);
        watcher.dispose();
    });
});
