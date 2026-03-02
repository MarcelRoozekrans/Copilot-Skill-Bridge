import * as assert from 'assert';
import { mergeMcpConfigs, removeServerFromConfig } from '../../mcpWriter';

describe('mergeMcpConfigs', () => {
    it('should add new servers to empty config', () => {
        const existing = { servers: {} };
        const incoming = {
            servers: { 'my-server': { type: 'stdio' as const, command: 'node', args: ['s.js'] } },
            inputs: [],
        };
        const result = mergeMcpConfigs(existing, incoming, []);
        assert.ok(result.servers['my-server']);
        assert.strictEqual(result.servers['my-server'].command, 'node');
    });

    it('should update bridge-managed servers', () => {
        const existing = {
            servers: { 'my-server': { type: 'stdio' as const, command: 'old-cmd' } },
        };
        const incoming = {
            servers: { 'my-server': { type: 'stdio' as const, command: 'new-cmd' } },
            inputs: [],
        };
        const result = mergeMcpConfigs(existing, incoming, ['my-server']);
        assert.strictEqual(result.servers['my-server'].command, 'new-cmd');
    });

    it('should NOT overwrite user-added servers', () => {
        const existing = {
            servers: { 'user-server': { type: 'stdio' as const, command: 'user-cmd' } },
        };
        const incoming = {
            servers: { 'user-server': { type: 'stdio' as const, command: 'bridge-cmd' } },
            inputs: [],
        };
        const result = mergeMcpConfigs(existing, incoming, []);
        assert.strictEqual(result.servers['user-server'].command, 'user-cmd');
    });

    it('should preserve existing user servers when adding new bridge servers', () => {
        const existing = {
            servers: { 'user-server': { type: 'stdio' as const, command: 'user-cmd' } },
        };
        const incoming = {
            servers: { 'bridge-server': { type: 'stdio' as const, command: 'bridge-cmd' } },
            inputs: [],
        };
        const result = mergeMcpConfigs(existing, incoming, []);
        assert.ok(result.servers['user-server']);
        assert.ok(result.servers['bridge-server']);
    });

    it('should merge inputs without duplicating by id', () => {
        const existing = {
            servers: {},
            inputs: [{ id: 'existing-input', type: 'promptString' as const, description: 'old', password: true }],
        };
        const incoming = {
            servers: {},
            inputs: [
                { id: 'existing-input', type: 'promptString' as const, description: 'new', password: true },
                { id: 'new-input', type: 'promptString' as const, description: 'brand new', password: true },
            ],
        };
        const result = mergeMcpConfigs(existing, incoming, []);
        const ids = result.inputs!.map((i: any) => i.id);
        assert.strictEqual(ids.length, 2);
        assert.ok(ids.includes('existing-input'));
        assert.ok(ids.includes('new-input'));
    });

    it('should handle missing inputs array in existing config', () => {
        const existing = { servers: {} };
        const incoming = {
            servers: {},
            inputs: [{ id: 'new', type: 'promptString' as const, description: 'test', password: true }],
        };
        const result = mergeMcpConfigs(existing, incoming, []);
        assert.strictEqual(result.inputs!.length, 1);
    });
});

describe('removeServerFromConfig', () => {
    it('should remove a server by name', () => {
        const config = {
            servers: {
                'bridge-server': { type: 'stdio' as const, command: 'node' },
                'user-server': { type: 'stdio' as const, command: 'python' },
            },
        };
        const result = removeServerFromConfig(config, 'bridge-server');
        assert.strictEqual(result.servers['bridge-server'], undefined);
        assert.ok(result.servers['user-server']);
    });

    it('should remove associated inputs', () => {
        const config = {
            servers: { 'my-srv': { type: 'stdio' as const, command: 'node' } },
            inputs: [
                { id: 'my-srv-API_KEY', type: 'promptString', description: 'key', password: true },
                { id: 'other-srv-TOKEN', type: 'promptString', description: 'tok', password: true },
            ],
        };
        const result = removeServerFromConfig(config, 'my-srv');
        assert.strictEqual(result.inputs!.length, 1);
        assert.strictEqual(result.inputs![0].id, 'other-srv-TOKEN');
    });

    it('should return config unchanged if server not found', () => {
        const config = { servers: { 'a': { type: 'stdio' as const, command: 'x' } } };
        const result = removeServerFromConfig(config, 'nonexistent');
        assert.ok(result.servers['a']);
    });

    it('should not include inputs key when no inputs remain', () => {
        const config = {
            servers: { 'srv': { type: 'stdio' as const, command: 'x' } },
            inputs: [{ id: 'srv-KEY', type: 'promptString', description: 'k', password: true }],
        };
        const result = removeServerFromConfig(config, 'srv');
        assert.strictEqual(result.inputs, undefined);
    });
});
