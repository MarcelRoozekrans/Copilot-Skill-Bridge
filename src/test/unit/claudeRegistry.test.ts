import * as assert from 'assert';
import * as path from 'path';
import {
    pluginRegistryKey,
    upsertInstalledPlugin,
    upsertEnabledPlugin,
    upsertExtraKnownMarketplace,
    getClaudePluginsDir,
    InstalledPluginsRegistry,
    InstalledPluginEntry,
    ClaudeSettings,
} from '../../claudeRegistry';
import { PluginInfo } from '../../types';

function makePlugin(overrides?: Partial<PluginInfo>): PluginInfo {
    return {
        name: 'compress-memory',
        description: 'd',
        version: '1.22.1',
        skills: [],
        marketplace: 'MarcelRoozekrans/superpowers-extensions',
        marketplaceName: 'superpowers-extensions',
        source: 'remote',
        ...overrides,
    };
}

function entry(overrides?: Partial<InstalledPluginEntry>): InstalledPluginEntry {
    return {
        scope: 'user',
        installPath: 'C:\\cache\\superpowers-extensions\\compress-memory\\1.22.1',
        version: '1.22.1',
        installedAt: '2026-09-01T12:00:00.000Z',
        lastUpdated: '2026-09-01T12:00:00.000Z',
        ...overrides,
    };
}

describe('pluginRegistryKey', () => {
    it('should build <plugin>@<marketplace> using the marketplace name', () => {
        assert.strictEqual(pluginRegistryKey(makePlugin()), 'compress-memory@superpowers-extensions');
    });

    it('should not use the owner/repo slug', () => {
        assert.ok(!pluginRegistryKey(makePlugin()).includes('MarcelRoozekrans'));
    });
});

describe('upsertInstalledPlugin', () => {
    it('should add a new plugin entry', () => {
        const registry: InstalledPluginsRegistry = { version: 2, plugins: {} };
        const result = upsertInstalledPlugin(registry, 'compress-memory@superpowers-extensions', entry());
        assert.deepStrictEqual(result.plugins['compress-memory@superpowers-extensions'], [entry()]);
    });

    it('should preserve unrelated plugins', () => {
        const registry: InstalledPluginsRegistry = {
            version: 2,
            plugins: { 'logo-design@superpowers-extensions': [entry({ version: '1.0.0' })] },
        };
        const result = upsertInstalledPlugin(registry, 'compress-memory@superpowers-extensions', entry());
        assert.ok(result.plugins['logo-design@superpowers-extensions']);
        assert.strictEqual(result.plugins['logo-design@superpowers-extensions'][0].version, '1.0.0');
    });

    it('should not mutate the input registry', () => {
        const registry: InstalledPluginsRegistry = { version: 2, plugins: {} };
        upsertInstalledPlugin(registry, 'k', entry());
        assert.deepStrictEqual(registry.plugins, {});
    });

    it('should replace the entry for the same scope rather than duplicating it', () => {
        const registry: InstalledPluginsRegistry = { version: 2, plugins: { k: [entry({ version: '1.0.0' })] } };
        const result = upsertInstalledPlugin(registry, 'k', entry({ version: '2.0.0' }));
        assert.strictEqual(result.plugins.k.length, 1);
        assert.strictEqual(result.plugins.k[0].version, '2.0.0');
    });

    it('should keep the original installedAt when reinstalling', () => {
        const registry: InstalledPluginsRegistry = {
            version: 2,
            plugins: { k: [entry({ installedAt: '2020-01-01T00:00:00.000Z' })] },
        };
        const result = upsertInstalledPlugin(registry, 'k', entry({ lastUpdated: '2026-09-01T13:00:00.000Z' }));
        assert.strictEqual(result.plugins.k[0].installedAt, '2020-01-01T00:00:00.000Z');
        assert.strictEqual(result.plugins.k[0].lastUpdated, '2026-09-01T13:00:00.000Z');
    });

    it('should leave a project-scoped entry alone when installing at user scope', () => {
        const projectEntry = entry({ scope: 'project', projectPath: 'C:\\work\\app' });
        const registry: InstalledPluginsRegistry = { version: 2, plugins: { k: [projectEntry] } };
        const result = upsertInstalledPlugin(registry, 'k', entry());
        assert.strictEqual(result.plugins.k.length, 2);
        assert.ok(result.plugins.k.some(e => e.scope === 'project' && e.projectPath === 'C:\\work\\app'));
    });

    it('should default version to 2 when absent', () => {
        const registry = { plugins: {} } as unknown as InstalledPluginsRegistry;
        assert.strictEqual(upsertInstalledPlugin(registry, 'k', entry()).version, 2);
    });
});

describe('upsertEnabledPlugin', () => {
    it('should enable the plugin', () => {
        const result = upsertEnabledPlugin({}, 'compress-memory@superpowers-extensions');
        assert.strictEqual(result.enabledPlugins!['compress-memory@superpowers-extensions'], true);
    });

    it('should preserve other enabled plugins', () => {
        const result = upsertEnabledPlugin(
            { enabledPlugins: { 'superpowers@superpowers-marketplace': true } },
            'compress-memory@superpowers-extensions'
        );
        assert.strictEqual(result.enabledPlugins!['superpowers@superpowers-marketplace'], true);
    });

    it('should preserve unrelated settings such as permissions', () => {
        const settings: ClaudeSettings = { permissions: { allow: ['Bash'] }, statusLine: { type: 'command' } };
        const result = upsertEnabledPlugin(settings, 'k');
        assert.deepStrictEqual(result.permissions, { allow: ['Bash'] });
        assert.deepStrictEqual(result.statusLine, { type: 'command' });
    });

    it('should not mutate the input settings', () => {
        const settings: ClaudeSettings = {};
        upsertEnabledPlugin(settings, 'k');
        assert.strictEqual(settings.enabledPlugins, undefined);
    });
});

describe('upsertExtraKnownMarketplace', () => {
    it('should declare a new marketplace with its github repo', () => {
        const result = upsertExtraKnownMarketplace({}, 'superpowers-extensions', 'MarcelRoozekrans/superpowers-extensions');
        assert.deepStrictEqual(result.extraKnownMarketplaces!['superpowers-extensions'], {
            source: { source: 'github', repo: 'MarcelRoozekrans/superpowers-extensions' },
        });
    });

    it('should leave an existing declaration untouched', () => {
        const settings: ClaudeSettings = {
            extraKnownMarketplaces: {
                'memorylens-mcp': { source: { source: 'git', url: 'https://github.com/x/y.git' } as never },
            },
        };
        const result = upsertExtraKnownMarketplace(settings, 'memorylens-mcp', 'x/y');
        assert.deepStrictEqual(result.extraKnownMarketplaces!['memorylens-mcp'], settings.extraKnownMarketplaces!['memorylens-mcp']);
    });

    it('should preserve other declared marketplaces', () => {
        const settings: ClaudeSettings = {
            extraKnownMarketplaces: { other: { source: { source: 'github', repo: 'a/b' } } },
        };
        const result = upsertExtraKnownMarketplace(settings, 'new-one', 'c/d');
        assert.ok(result.extraKnownMarketplaces!.other);
        assert.ok(result.extraKnownMarketplaces!['new-one']);
    });
});

describe('getClaudePluginsDir', () => {
    it('should resolve the plugins directory as the parent of the cache directory', () => {
        // Built with path.join so the separator matches the platform running the test.
        const cache = path.join('home', '.claude', 'plugins', 'cache');
        assert.strictEqual(getClaudePluginsDir(cache), path.join('home', '.claude', 'plugins'));
    });
});
