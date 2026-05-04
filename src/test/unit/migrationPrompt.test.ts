import * as assert from 'assert';
import * as vscode from 'vscode';
import { maybePromptSkillsMigration } from '../../extension';
import { BridgeManifest } from '../../types';

interface MockConfig {
    outputFormats: string[];
    updates: Array<{ key: string; value: unknown; target: number }>;
}

function makeManifest(overrides: Partial<BridgeManifest> = {}): BridgeManifest {
    return {
        skills: {},
        mcpServers: {},
        marketplaces: [],
        settings: { checkInterval: 86400, autoAcceptUpdates: false },
        ...overrides,
    };
}

describe('maybePromptSkillsMigration', () => {
    const workspaceUri = { fsPath: '/tmp/migration-test', path: '/tmp/migration-test' } as unknown as vscode.Uri;

    let origReadFile: typeof vscode.workspace.fs.readFile;
    let origWriteFile: typeof vscode.workspace.fs.writeFile;
    let origCreateDirectory: typeof vscode.workspace.fs.createDirectory;
    let origGetConfiguration: typeof vscode.workspace.getConfiguration;
    let origShowInformationMessage: typeof vscode.window.showInformationMessage;

    let storedManifest: BridgeManifest | undefined;
    let mockConfig: MockConfig;
    let promptShown: boolean;
    let promptResponse: string | undefined;

    beforeEach(() => {
        origReadFile = vscode.workspace.fs.readFile;
        origWriteFile = vscode.workspace.fs.writeFile;
        origCreateDirectory = vscode.workspace.fs.createDirectory;
        origGetConfiguration = vscode.workspace.getConfiguration;
        origShowInformationMessage = vscode.window.showInformationMessage;

        storedManifest = undefined;
        mockConfig = { outputFormats: ['prompts'], updates: [] };
        promptShown = false;
        promptResponse = undefined;

        (vscode.workspace.fs as any).readFile = async () => {
            if (storedManifest) {
                return Buffer.from(JSON.stringify(storedManifest), 'utf-8');
            }
            throw new Error('not found');
        };
        (vscode.workspace.fs as any).writeFile = async (_uri: vscode.Uri, buf: Uint8Array) => {
            storedManifest = JSON.parse(Buffer.from(buf).toString('utf-8'));
        };
        (vscode.workspace.fs as any).createDirectory = async () => { /* noop */ };

        (vscode.workspace as any).getConfiguration = (_section?: string) => ({
            get: <T>(key: string, defaultValue?: T): T => {
                if (key === 'outputFormats') {
                    return (mockConfig.outputFormats as unknown) as T;
                }
                return defaultValue as T;
            },
            update: async (key: string, value: unknown, target: number) => {
                mockConfig.updates.push({ key, value, target });
                if (key === 'outputFormats' && Array.isArray(value)) {
                    mockConfig.outputFormats = value as string[];
                }
            },
        });

        (vscode.window as any).showInformationMessage = async (..._args: unknown[]) => {
            promptShown = true;
            return promptResponse;
        };
    });

    afterEach(() => {
        (vscode.workspace.fs as any).readFile = origReadFile;
        (vscode.workspace.fs as any).writeFile = origWriteFile;
        (vscode.workspace.fs as any).createDirectory = origCreateDirectory;
        (vscode.workspace as any).getConfiguration = origGetConfiguration;
        (vscode.window as any).showInformationMessage = origShowInformationMessage;
    });

    it('does not prompt when no skills are imported', async () => {
        storedManifest = makeManifest();
        await maybePromptSkillsMigration(workspaceUri);
        assert.strictEqual(promptShown, false);
        assert.strictEqual(mockConfig.updates.length, 0);
    });

    it('does not prompt when migration.skillsPrompted is already true', async () => {
        storedManifest = makeManifest({
            skills: {
                brainstorming: {
                    source: 'plugin@repo',
                    sourceHash: 'h',
                    importedHash: 'h',
                    importedAt: '2026-01-01',
                    locallyModified: false,
                },
            },
            migration: { skillsPrompted: true },
        });
        await maybePromptSkillsMigration(workspaceUri);
        assert.strictEqual(promptShown, false);
        assert.strictEqual(mockConfig.updates.length, 0);
    });

    it('does not prompt when outputFormats already includes "skills"', async () => {
        mockConfig.outputFormats = ['skills'];
        storedManifest = makeManifest({
            skills: {
                brainstorming: {
                    source: 'plugin@repo',
                    sourceHash: 'h',
                    importedHash: 'h',
                    importedAt: '2026-01-01',
                    locallyModified: false,
                },
            },
        });
        await maybePromptSkillsMigration(workspaceUri);
        assert.strictEqual(promptShown, false);
        assert.strictEqual(mockConfig.updates.length, 0);
    });

    it('prompts and switches to ["skills"] when user picks "Switch (recommended)"', async () => {
        storedManifest = makeManifest({
            skills: {
                brainstorming: {
                    source: 'plugin@repo',
                    sourceHash: 'h',
                    importedHash: 'h',
                    importedAt: '2026-01-01',
                    locallyModified: false,
                },
            },
        });
        promptResponse = 'Switch (recommended)';
        await maybePromptSkillsMigration(workspaceUri);

        assert.strictEqual(promptShown, true);
        const update = mockConfig.updates.find(u => u.key === 'outputFormats');
        assert.ok(update, 'expected outputFormats update');
        assert.deepStrictEqual(update!.value, ['skills']);
        assert.strictEqual(storedManifest!.migration?.skillsPrompted, true);
    });

    it('prompts and sets ["skills","prompts"] when user picks "Hybrid"', async () => {
        storedManifest = makeManifest({
            skills: {
                brainstorming: {
                    source: 'plugin@repo',
                    sourceHash: 'h',
                    importedHash: 'h',
                    importedAt: '2026-01-01',
                    locallyModified: false,
                },
            },
        });
        promptResponse = 'Hybrid (skills + prompts)';
        await maybePromptSkillsMigration(workspaceUri);

        assert.strictEqual(promptShown, true);
        const update = mockConfig.updates.find(u => u.key === 'outputFormats');
        assert.ok(update, 'expected outputFormats update');
        assert.deepStrictEqual(update!.value, ['skills', 'prompts']);
        assert.strictEqual(storedManifest!.migration?.skillsPrompted, true);
    });

    it('prompts but leaves config alone when user picks "Keep current" — still records prompted', async () => {
        storedManifest = makeManifest({
            skills: {
                brainstorming: {
                    source: 'plugin@repo',
                    sourceHash: 'h',
                    importedHash: 'h',
                    importedAt: '2026-01-01',
                    locallyModified: false,
                },
            },
        });
        promptResponse = 'Keep current';
        await maybePromptSkillsMigration(workspaceUri);

        assert.strictEqual(promptShown, true);
        const update = mockConfig.updates.find(u => u.key === 'outputFormats');
        assert.strictEqual(update, undefined, 'no outputFormats update should occur');
        assert.strictEqual(storedManifest!.migration?.skillsPrompted, true);
    });

    it('records prompted=true even when user dismisses (undefined response)', async () => {
        storedManifest = makeManifest({
            skills: {
                brainstorming: {
                    source: 'plugin@repo',
                    sourceHash: 'h',
                    importedHash: 'h',
                    importedAt: '2026-01-01',
                    locallyModified: false,
                },
            },
        });
        promptResponse = undefined;
        await maybePromptSkillsMigration(workspaceUri);

        assert.strictEqual(promptShown, true);
        assert.strictEqual(storedManifest!.migration?.skillsPrompted, true);
    });
});
