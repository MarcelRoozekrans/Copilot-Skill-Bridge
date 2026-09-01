import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { PluginInfo } from './types';
import { isFileNotFound } from './fsErrors';
import { claudeMarketplaceDirName } from './claudeInstaller';

/**
 * Claude Code treats its plugin cache as payload only. A plugin is not loaded until it
 * is also registered, so installing means touching three files:
 *
 *   plugins/installed_plugins.json  "<plugin>@<marketplace>" -> [{ scope, installPath, ... }]
 *   settings.json  enabledPlugins        "<plugin>@<marketplace>" -> true
 *   settings.json  extraKnownMarketplaces "<marketplace>"        -> { source }
 *
 * `plugins/known_marketplaces.json` is deliberately NOT written: its `installLocation`
 * points at a git clone under plugins/marketplaces/ that this extension never creates,
 * so fabricating an entry would point Claude at a directory that does not exist.
 * `extraKnownMarketplaces` is the declarative equivalent that Claude resolves itself.
 */

export interface InstalledPluginEntry {
    scope: string;
    installPath: string;
    version: string;
    installedAt: string;
    lastUpdated: string;
    gitCommitSha?: string;
    projectPath?: string;
}

export interface InstalledPluginsRegistry {
    version: number;
    plugins: Record<string, InstalledPluginEntry[]>;
}

export interface MarketplaceSource {
    source: 'github';
    repo: string;
}

export interface ClaudeSettings {
    enabledPlugins?: Record<string, boolean>;
    extraKnownMarketplaces?: Record<string, { source: MarketplaceSource }>;
    [key: string]: unknown;
}

/** Registry key Claude uses for an installed plugin: `<plugin>@<marketplace>`. */
export function pluginRegistryKey(plugin: PluginInfo): string {
    return `${plugin.name}@${claudeMarketplaceDirName(plugin)}`;
}

/**
 * Merge an install record into an installed_plugins.json structure.
 *
 * Entries for other scopes (and other projects within a scope) are preserved untouched;
 * only the matching scope/projectPath pair is replaced. `installedAt` is carried over
 * from an existing record so a reinstall does not lose the original install date.
 */
export function upsertInstalledPlugin(
    registry: InstalledPluginsRegistry,
    key: string,
    entry: InstalledPluginEntry,
): InstalledPluginsRegistry {
    const existing = registry.plugins[key] ?? [];
    const matches = (e: InstalledPluginEntry) =>
        e.scope === entry.scope && e.projectPath === entry.projectPath;
    const previous = existing.find(matches);
    const merged: InstalledPluginEntry = {
        ...entry,
        installedAt: previous?.installedAt ?? entry.installedAt,
    };
    return {
        ...registry,
        version: registry.version ?? 2,
        plugins: {
            ...registry.plugins,
            [key]: [...existing.filter(e => !matches(e)), merged],
        },
    };
}

/** Enable a plugin in settings.json without disturbing any other setting. */
export function upsertEnabledPlugin(settings: ClaudeSettings, key: string): ClaudeSettings {
    return {
        ...settings,
        enabledPlugins: { ...(settings.enabledPlugins ?? {}), [key]: true },
    };
}

/**
 * Declare the marketplace in settings.json. An existing declaration is left alone —
 * the user may have added it by a different source form (git URL vs github repo) and
 * overwriting that would rewrite a choice we did not make.
 */
export function upsertExtraKnownMarketplace(
    settings: ClaudeSettings,
    marketplaceName: string,
    repo: string,
): ClaudeSettings {
    const existing = settings.extraKnownMarketplaces ?? {};
    if (existing[marketplaceName]) { return settings; }
    return {
        ...settings,
        extraKnownMarketplaces: {
            ...existing,
            [marketplaceName]: { source: { source: 'github', repo } },
        },
    };
}

export function getClaudePluginsDir(resolvedCachePath: string): string {
    return path.dirname(resolvedCachePath);
}

export function getClaudeSettingsUri(): vscode.Uri {
    return vscode.Uri.file(path.join(os.homedir(), '.claude', 'settings.json'));
}

/**
 * Read and parse a JSON file. Returns `fallback` only when the file does not exist —
 * a corrupt or unreadable file throws, so callers never silently overwrite one.
 */
async function readJsonFile<T>(uri: vscode.Uri, fallback: T): Promise<T> {
    let raw: Uint8Array;
    try {
        raw = await vscode.workspace.fs.readFile(uri);
    } catch (err) {
        if (isFileNotFound(err)) { return fallback; }
        throw err;
    }
    const text = Buffer.from(raw).toString('utf-8');
    if (text.trim() === '') { return fallback; }
    try {
        return JSON.parse(text) as T;
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`${uri.fsPath} is not valid JSON, refusing to overwrite it: ${msg}`);
    }
}

async function writeJsonFile(uri: vscode.Uri, value: unknown): Promise<void> {
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(uri.fsPath)));
    await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(value, null, 2) + '\n', 'utf-8'));
}

/**
 * Register an already-written plugin so Claude Code discovers and enables it.
 * Call after installPluginInClaudeCache.
 */
export async function registerPluginWithClaude(
    plugin: PluginInfo,
    resolvedCachePath: string,
    gitCommitSha?: string,
    now: string = new Date().toISOString(),
): Promise<void> {
    const marketplaceName = claudeMarketplaceDirName(plugin);
    const key = pluginRegistryKey(plugin);
    const pluginsDir = getClaudePluginsDir(resolvedCachePath);
    const installPath = path.join(resolvedCachePath, marketplaceName, plugin.name, plugin.version);

    const registryUri = vscode.Uri.file(path.join(pluginsDir, 'installed_plugins.json'));
    const settingsUri = getClaudeSettingsUri();

    // Read and validate both files before writing either, so an unparseable settings.json
    // cannot leave the plugin registered-but-not-enabled.
    const [registry, settings] = await Promise.all([
        readJsonFile<InstalledPluginsRegistry>(registryUri, { version: 2, plugins: {} }),
        readJsonFile<ClaudeSettings>(settingsUri, {}),
    ]);

    const entry: InstalledPluginEntry = {
        scope: 'user',
        installPath,
        version: plugin.version,
        installedAt: now,
        lastUpdated: now,
        ...(gitCommitSha ? { gitCommitSha } : {}),
    };
    const nextRegistry = upsertInstalledPlugin(registry, key, entry);
    const nextSettings = upsertExtraKnownMarketplace(
        upsertEnabledPlugin(settings, key),
        marketplaceName,
        plugin.marketplace,
    );

    await writeJsonFile(registryUri, nextRegistry);
    await writeJsonFile(settingsUri, nextSettings);
}
