import * as assert from 'assert';
import { SkillStatus, SkillInfo, PluginInfo, MarketplaceInfo, SkillImportState, BridgeManifest } from '../../types';

describe('Types', () => {
    it('should create a valid SkillInfo', () => {
        const skill: SkillInfo = {
            name: 'brainstorming',
            description: 'Use when starting creative work',
            content: '# Brainstorming\n\nContent here',
            pluginName: 'superpowers',
            pluginVersion: '4.3.1',
            marketplace: 'superpowers-marketplace',
            source: 'local',
            filePath: '/home/user/.claude/plugins/cache/superpowers-marketplace/superpowers/4.3.1/skills/brainstorming/SKILL.md',
        };
        assert.strictEqual(skill.name, 'brainstorming');
        assert.strictEqual(skill.source, 'local');
    });

    it('should create a valid BridgeManifest', () => {
        const manifest: BridgeManifest = {
            skills: {},
            marketplaces: [],
            settings: {
                checkInterval: 86400,
                autoAcceptUpdates: false,
            },
        };
        assert.deepStrictEqual(manifest.skills, {});
        assert.strictEqual(manifest.settings.checkInterval, 86400);
    });
});
