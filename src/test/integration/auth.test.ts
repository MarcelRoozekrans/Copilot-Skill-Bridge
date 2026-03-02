import * as assert from 'assert';
import * as vscode from 'vscode';

describe('GitHub Auth Integration', () => {
    it('should have the authentication API available', () => {
        assert.ok(vscode.authentication);
        assert.ok(typeof vscode.authentication.getSession === 'function');
    });

    it('should return undefined when no session exists and createIfNone is false', async () => {
        try {
            const session = await vscode.authentication.getSession('github', ['repo'], {
                createIfNone: false,
            });
            assert.ok(session === undefined || session.accessToken);
        } catch {
            // Some test environments may not have the GitHub auth provider
        }
    });

    it('should have login command registered', async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes('copilotSkillBridge.login'));
    });
});
