import * as assert from 'assert';
import * as vscode from 'vscode';
import { SkillBridgeTreeProvider } from '../../treeView';
import { PluginInfo, BridgeManifest } from '../../types';
import { createEmptyManifest, computeHash } from '../../stateManager';

describe('TreeView Integration', () => {
    let treeProvider: SkillBridgeTreeProvider;

    const mockPlugin: PluginInfo = {
        name: 'test-plugin',
        description: 'A test plugin',
        version: '1.0.0',
        skills: [
            {
                name: 'test-skill',
                description: 'A test skill',
                content: '# Test Skill\nSome content.',
                pluginName: 'test-plugin',
                pluginVersion: '1.0.0',
                marketplace: 'test-marketplace',
                source: 'local',
            },
        ],
        marketplace: 'test-marketplace',
        source: 'local',
    };

    beforeEach(() => {
        treeProvider = new SkillBridgeTreeProvider();
    });

    it('should show plugins as root items', () => {
        treeProvider.setData([mockPlugin], createEmptyManifest());
        const roots = treeProvider.getChildren();
        assert.strictEqual(roots.length, 1);
        assert.strictEqual(roots[0].label, 'test-plugin');
        assert.strictEqual(roots[0].itemType, 'plugin');
    });

    it('should show skills under plugins', () => {
        treeProvider.setData([mockPlugin], createEmptyManifest());
        const roots = treeProvider.getChildren();
        const children = treeProvider.getChildren(roots[0]);
        assert.strictEqual(children.length, 1);
        assert.strictEqual(children[0].label, 'test-skill');
        assert.strictEqual(children[0].status, 'available');
    });

    it('should show synced status for imported skills', () => {
        const contentHash = computeHash('# Test Skill\nSome content.');
        const manifest: BridgeManifest = {
            ...createEmptyManifest(),
            skills: {
                'test-skill': {
                    source: 'test-plugin@test-marketplace',
                    sourceHash: contentHash,
                    importedHash: contentHash,
                    importedAt: new Date().toISOString(),
                    locallyModified: false,
                },
            },
        };
        treeProvider.setData([mockPlugin], manifest);
        const roots = treeProvider.getChildren();
        const children = treeProvider.getChildren(roots[0]);
        assert.strictEqual(children[0].status, 'synced');
    });

    it('should fire onDidChangeTreeData when data is set', (done) => {
        treeProvider.onDidChangeTreeData(() => {
            done();
        });
        treeProvider.setData([], createEmptyManifest());
    });
});
