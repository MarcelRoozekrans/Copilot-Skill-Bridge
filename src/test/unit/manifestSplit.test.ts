import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { loadManifest, saveManifest } from '../../stateManager';
import { getUserManifestUri } from '../../userManifest';
import { BridgeManifest, SkillImportState } from '../../types';

const USER_MANIFEST_PATH = path.join(os.homedir(), '.claude', 'copilot-skill-bridge.json');

function makeState(overrides: Partial<SkillImportState> = {}): SkillImportState {
    return {
        source: 'plug@repo',
        sourceHash: 'h',
        importedHash: 'h',
        importedAt: '2026-05-04T00:00:00.000Z',
        locallyModified: false,
        ...overrides,
    };
}

describe('manifest split (workspace + user-global)', () => {
    const workspaceUri = vscode.Uri.file('/tmp/test-workspace');
    const workspaceManifestPath = '/tmp/test-workspace/.github/.copilot-skill-bridge.json';

    let store: Record<string, string>;
    const origReadFile = vscode.workspace.fs.readFile;
    const origWriteFile = vscode.workspace.fs.writeFile;
    const origCreateDir = vscode.workspace.fs.createDirectory;

    beforeEach(() => {
        store = {};
        (vscode.workspace.fs as unknown as { readFile: unknown }).readFile = async (uri: vscode.Uri) => {
            const content = store[uri.fsPath];
            if (content === undefined) {
                throw new Error('ENOENT');
            }
            return Buffer.from(content, 'utf-8');
        };
        (vscode.workspace.fs as unknown as { writeFile: unknown }).writeFile = async (uri: vscode.Uri, buf: Uint8Array) => {
            store[uri.fsPath] = Buffer.from(buf).toString('utf-8');
        };
        (vscode.workspace.fs as unknown as { createDirectory: unknown }).createDirectory = async () => { /* noop */ };
    });

    afterEach(() => {
        (vscode.workspace.fs as unknown as { readFile: unknown }).readFile = origReadFile;
        (vscode.workspace.fs as unknown as { writeFile: unknown }).writeFile = origWriteFile;
        (vscode.workspace.fs as unknown as { createDirectory: unknown }).createDirectory = origCreateDir;
    });

    it('returns an empty manifest when neither file exists', async () => {
        const m = await loadManifest(workspaceUri);
        assert.deepStrictEqual(m.skills, {});
    });

    it('merges user-global skills into the loaded manifest', async () => {
        store[USER_MANIFEST_PATH] = JSON.stringify({
            skills: {
                tdd: makeState({ scope: 'user' }),
            },
        });
        const m = await loadManifest(workspaceUri);
        assert.ok(m.skills['tdd']);
        assert.strictEqual(m.skills['tdd'].scope, 'user');
    });

    it('combines user-global and workspace skills on load', async () => {
        store[USER_MANIFEST_PATH] = JSON.stringify({
            skills: { tdd: makeState({ scope: 'user' }) },
        });
        store[workspaceManifestPath] = JSON.stringify({
            skills: { 'legacy-skill': makeState() },
            mcpServers: {},
            marketplaces: [],
            settings: { checkInterval: 86400, autoAcceptUpdates: false },
        });
        const m = await loadManifest(workspaceUri);
        assert.ok(m.skills['tdd'], 'user-scope skill should be present');
        assert.ok(m.skills['legacy-skill'], 'workspace-scope skill should be present');
    });

    it('routes user-scope skills to the user manifest on save', async () => {
        const m: BridgeManifest = {
            skills: {
                'user-skill': makeState({ scope: 'user' }),
                'workspace-skill': makeState({ scope: 'workspace' }),
            },
            mcpServers: {},
            marketplaces: [],
            settings: { checkInterval: 86400, autoAcceptUpdates: false },
        };
        await saveManifest(workspaceUri, m);

        const userFile = JSON.parse(store[USER_MANIFEST_PATH]);
        assert.ok(userFile.skills['user-skill'], 'user-scope skill should be in user manifest');
        assert.ok(!userFile.skills['workspace-skill'], 'workspace-scope skill must NOT be in user manifest');

        const workspaceFile = JSON.parse(store[workspaceManifestPath]);
        assert.ok(workspaceFile.skills['workspace-skill'], 'workspace-scope skill should be in workspace manifest');
        assert.ok(!workspaceFile.skills['user-skill'], 'user-scope skill must NOT be in workspace manifest');
    });

    it('routes legacy entries (no scope) to the workspace manifest on save', async () => {
        const m: BridgeManifest = {
            skills: { 'legacy-skill': makeState() },
            mcpServers: {},
            marketplaces: [],
            settings: { checkInterval: 86400, autoAcceptUpdates: false },
        };
        await saveManifest(workspaceUri, m);

        const workspaceFile = JSON.parse(store[workspaceManifestPath]);
        assert.ok(workspaceFile.skills['legacy-skill'], 'legacy entry should land in workspace manifest');
        const userFile = JSON.parse(store[USER_MANIFEST_PATH] ?? '{"skills":{}}');
        assert.ok(!userFile.skills['legacy-skill'], 'legacy entry must NOT be in user manifest');
    });

    it('keeps mcpServers, marketplaces, settings, migration in the workspace manifest only', async () => {
        const m: BridgeManifest = {
            skills: { 'user-skill': makeState({ scope: 'user' }) },
            mcpServers: { foo: { source: 'src', importedAt: '2026-05-04' } },
            marketplaces: [{ repo: 'org/marketplace', lastChecked: '2026-05-04' }],
            settings: { checkInterval: 86400, autoAcceptUpdates: true },
            migration: { skillsPrompted: true },
        };
        await saveManifest(workspaceUri, m);

        const userFile = JSON.parse(store[USER_MANIFEST_PATH]);
        assert.deepStrictEqual(Object.keys(userFile), ['skills'], 'user manifest should only contain skills');

        const workspaceFile = JSON.parse(store[workspaceManifestPath]);
        assert.ok(workspaceFile.mcpServers.foo);
        assert.strictEqual(workspaceFile.marketplaces[0].repo, 'org/marketplace');
        assert.strictEqual(workspaceFile.settings.autoAcceptUpdates, true);
        assert.strictEqual(workspaceFile.migration.skillsPrompted, true);
    });

    it('save then load round-trips user-scope skills', async () => {
        const m: BridgeManifest = {
            skills: { 'user-skill': makeState({ scope: 'user' }) },
            mcpServers: {},
            marketplaces: [],
            settings: { checkInterval: 86400, autoAcceptUpdates: false },
        };
        await saveManifest(workspaceUri, m);
        const loaded = await loadManifest(workspaceUri);
        assert.ok(loaded.skills['user-skill']);
        assert.strictEqual(loaded.skills['user-skill'].scope, 'user');
    });

    it('returns the user manifest URI under ~/.claude', () => {
        const uri = getUserManifestUri();
        assert.ok(uri.fsPath.includes('.claude'));
        assert.ok(uri.fsPath.endsWith('copilot-skill-bridge.json'));
    });
});
