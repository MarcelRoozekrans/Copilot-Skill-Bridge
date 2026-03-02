import * as assert from 'assert';
import { buildGitHubApiUrl, parseGitHubContentsResponse, buildRemoteSkillInfo } from '../remoteReader';

describe('buildGitHubApiUrl', () => {
    it('should build correct contents API URL', () => {
        const url = buildGitHubApiUrl('obra/superpowers', '.claude-plugin/plugin.json');
        assert.strictEqual(url, 'https://api.github.com/repos/obra/superpowers/contents/.claude-plugin/plugin.json');
    });

    it('should build correct URL with ref', () => {
        const url = buildGitHubApiUrl('obra/superpowers', 'skills', 'main');
        assert.strictEqual(url, 'https://api.github.com/repos/obra/superpowers/contents/skills?ref=main');
    });
});

describe('parseGitHubContentsResponse', () => {
    it('should decode base64 content from GitHub API response', () => {
        const response = {
            content: Buffer.from('Hello World').toString('base64'),
            encoding: 'base64',
        };
        const result = parseGitHubContentsResponse(response);
        assert.strictEqual(result, 'Hello World');
    });
});

describe('buildRemoteSkillInfo', () => {
    it('should set source to remote', () => {
        const skill = buildRemoteSkillInfo('tdd', 'TDD skill', '# Content', 'superpowers', '4.3.1', 'obra/superpowers');
        assert.strictEqual(skill.source, 'remote');
        assert.strictEqual(skill.marketplace, 'obra/superpowers');
    });
});
