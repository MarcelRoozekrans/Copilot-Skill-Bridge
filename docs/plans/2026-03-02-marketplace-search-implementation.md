# Marketplace Search Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enhance the "Add Marketplace" command to search GitHub for repos containing `.claude-plugin/marketplace.json`, sorted by stars, with a live-search QuickPick UI.

**Architecture:** New `marketplaceSearch.ts` module calls the GitHub Code Search API to find repos with the marketplace file signature. The existing `addMarketplace` command in `extension.ts` is replaced with a QuickPick that shows live search results. Falls back to manual text input on error.

**Tech Stack:** VS Code QuickPick API, GitHub Code Search REST API (`/search/code`), existing `auth.ts` helpers.

---

### Task 1: Add `MarketplaceSearchResult` type

**Files:**
- Modify: `src/types.ts:103` (append after `MarketplaceJson` interface)

**Step 1: Write the type definition**

Add at the end of `src/types.ts`:

```typescript
export interface MarketplaceSearchResult {
    repo: string;
    description: string;
    stars: number;
    url: string;
}
```

**Step 2: Write the failing test**

Create `src/test/unit/marketplaceSearch.test.ts`:

```typescript
import * as assert from 'assert';
import { MarketplaceSearchResult } from '../../types';
import { buildSearchUrl, parseSearchResults } from '../../marketplaceSearch';

describe('buildSearchUrl', () => {
    it('should build code search URL with file signature', () => {
        const url = buildSearchUrl();
        assert.ok(url.includes('https://api.github.com/search/code'));
        assert.ok(url.includes('filename%3Amarketplace.json'));
        assert.ok(url.includes('path%3A.claude-plugin'));
    });

    it('should include user query when provided', () => {
        const url = buildSearchUrl('memory');
        assert.ok(url.includes('memory'));
        assert.ok(url.includes('filename%3Amarketplace.json'));
    });

    it('should encode special characters in query', () => {
        const url = buildSearchUrl('long term');
        assert.ok(url.includes('long+term') || url.includes('long%20term'));
    });
});

describe('parseSearchResults', () => {
    it('should extract repo info from GitHub code search response', () => {
        const response = {
            total_count: 2,
            items: [
                {
                    repository: {
                        full_name: 'obra/superpowers',
                        description: 'Superpowers for Claude',
                        stargazers_count: 150,
                        html_url: 'https://github.com/obra/superpowers',
                    },
                },
                {
                    repository: {
                        full_name: 'user/plugin',
                        description: 'A plugin',
                        stargazers_count: 42,
                        html_url: 'https://github.com/user/plugin',
                    },
                },
            ],
        };
        const results = parseSearchResults(response);
        assert.strictEqual(results.length, 2);
        assert.strictEqual(results[0].repo, 'obra/superpowers');
        assert.strictEqual(results[0].stars, 150);
        assert.strictEqual(results[1].repo, 'user/plugin');
    });

    it('should sort by stars descending', () => {
        const response = {
            total_count: 2,
            items: [
                {
                    repository: {
                        full_name: 'low-stars/repo',
                        description: 'Low',
                        stargazers_count: 5,
                        html_url: 'https://github.com/low-stars/repo',
                    },
                },
                {
                    repository: {
                        full_name: 'high-stars/repo',
                        description: 'High',
                        stargazers_count: 500,
                        html_url: 'https://github.com/high-stars/repo',
                    },
                },
            ],
        };
        const results = parseSearchResults(response);
        assert.strictEqual(results[0].repo, 'high-stars/repo');
        assert.strictEqual(results[0].stars, 500);
        assert.strictEqual(results[1].repo, 'low-stars/repo');
    });

    it('should deduplicate by repo name', () => {
        const response = {
            total_count: 3,
            items: [
                {
                    repository: {
                        full_name: 'obra/superpowers',
                        description: 'Superpowers',
                        stargazers_count: 150,
                        html_url: 'https://github.com/obra/superpowers',
                    },
                },
                {
                    repository: {
                        full_name: 'obra/superpowers',
                        description: 'Superpowers',
                        stargazers_count: 150,
                        html_url: 'https://github.com/obra/superpowers',
                    },
                },
                {
                    repository: {
                        full_name: 'other/repo',
                        description: 'Other',
                        stargazers_count: 10,
                        html_url: 'https://github.com/other/repo',
                    },
                },
            ],
        };
        const results = parseSearchResults(response);
        assert.strictEqual(results.length, 2);
    });

    it('should handle empty response', () => {
        const response = { total_count: 0, items: [] };
        const results = parseSearchResults(response);
        assert.strictEqual(results.length, 0);
    });

    it('should handle null description gracefully', () => {
        const response = {
            total_count: 1,
            items: [
                {
                    repository: {
                        full_name: 'user/repo',
                        description: null,
                        stargazers_count: 10,
                        html_url: 'https://github.com/user/repo',
                    },
                },
            ],
        };
        const results = parseSearchResults(response);
        assert.strictEqual(results[0].description, '');
    });
});
```

**Step 3: Run test to verify it fails**

Run: `npm run compile && npm run test:unit`
Expected: FAIL — `Cannot find module '../../marketplaceSearch'`

**Step 4: Write minimal implementation**

Create `src/marketplaceSearch.ts`:

```typescript
import { MarketplaceSearchResult } from './types';
import { buildAuthHeaders, getGitHubToken } from './auth';

const SEARCH_BASE = 'https://api.github.com/search/code';
const FILE_SIGNATURE = 'filename:marketplace.json path:.claude-plugin';

export function buildSearchUrl(query?: string): string {
    const q = query
        ? `${query} ${FILE_SIGNATURE}`
        : FILE_SIGNATURE;
    return `${SEARCH_BASE}?q=${encodeURIComponent(q)}&per_page=30`;
}

interface GitHubCodeSearchResponse {
    total_count: number;
    items: Array<{
        repository: {
            full_name: string;
            description: string | null;
            stargazers_count: number;
            html_url: string;
        };
    }>;
}

export function parseSearchResults(response: GitHubCodeSearchResponse): MarketplaceSearchResult[] {
    const seen = new Set<string>();
    const results: MarketplaceSearchResult[] = [];

    for (const item of response.items) {
        const repo = item.repository.full_name;
        if (seen.has(repo)) { continue; }
        seen.add(repo);
        results.push({
            repo,
            description: item.repository.description ?? '',
            stars: item.repository.stargazers_count,
            url: item.repository.html_url,
        });
    }

    results.sort((a, b) => b.stars - a.stars);
    return results;
}

export async function searchMarketplaces(query?: string): Promise<MarketplaceSearchResult[]> {
    const url = buildSearchUrl(query);
    const token = await getGitHubToken();
    const headers = buildAuthHeaders(token);
    const response = await fetch(url, { headers });

    if (!response.ok) {
        throw new Error(`GitHub search failed: ${response.status} ${response.statusText}`);
    }

    const data: GitHubCodeSearchResponse = await response.json();
    return parseSearchResults(data);
}
```

**Step 5: Run tests to verify they pass**

Run: `npm run compile && npm run test:unit`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add src/types.ts src/marketplaceSearch.ts src/test/unit/marketplaceSearch.test.ts
git commit -m "feat: add marketplace search module with GitHub Code Search API"
```

---

### Task 2: Replace "Add Marketplace" command with QuickPick search

**Files:**
- Modify: `src/extension.ts:26-42` (the `addMarketplace` command handler)

**Step 1: Modify the command handler**

Replace the `copilotSkillBridge.addMarketplace` command registration (lines 26-42 in `src/extension.ts`) with:

```typescript
vscode.commands.registerCommand('copilotSkillBridge.addMarketplace', async () => {
    const { searchMarketplaces } = await import('./marketplaceSearch');

    const quickPick = vscode.window.createQuickPick();
    quickPick.placeholder = 'Search GitHub for Claude marketplaces...';
    quickPick.matchOnDescription = true;
    quickPick.busy = true;

    const MANUAL_ENTRY_LABEL = '$(edit) Enter manually...';

    function makeItems(results: import('./types').MarketplaceSearchResult[]): vscode.QuickPickItem[] {
        const items: vscode.QuickPickItem[] = results.map(r => ({
            label: r.repo,
            description: `$(star) ${r.stars}`,
            detail: r.description,
        }));
        items.push({ label: MANUAL_ENTRY_LABEL, description: '', detail: 'Type an owner/repo path directly', alwaysShow: true });
        return items;
    }

    // Initial load
    try {
        const results = await searchMarketplaces();
        quickPick.items = makeItems(results);
    } catch {
        quickPick.items = [{ label: MANUAL_ENTRY_LABEL, description: '', detail: 'Search unavailable — enter manually', alwaysShow: true }];
    }
    quickPick.busy = false;

    // Debounced search on input
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    quickPick.onDidChangeValue(value => {
        if (debounceTimer) { clearTimeout(debounceTimer); }
        debounceTimer = setTimeout(async () => {
            quickPick.busy = true;
            try {
                const results = await searchMarketplaces(value || undefined);
                quickPick.items = makeItems(results);
            } catch {
                // Keep existing items on error
            }
            quickPick.busy = false;
        }, 400);
    });

    quickPick.onDidAccept(async () => {
        const selected = quickPick.selectedItems[0];
        quickPick.dispose();
        if (debounceTimer) { clearTimeout(debounceTimer); }

        let repo: string | undefined;

        if (selected?.label === MANUAL_ENTRY_LABEL) {
            repo = await vscode.window.showInputBox({
                prompt: 'Enter GitHub repo (owner/name)',
                placeHolder: 'obra/superpowers',
                validateInput: (value) => {
                    return /^[\w.-]+\/[\w.-]+$/.test(value) ? null : 'Format: owner/repo-name';
                },
            });
        } else if (selected) {
            repo = selected.label;
        }

        if (repo) {
            const config = vscode.workspace.getConfiguration('copilotSkillBridge');
            const current = config.get<string[]>('marketplaces', []);
            if (current.includes(repo)) {
                vscode.window.showInformationMessage(`Marketplace already added: ${repo}`);
            } else {
                await config.update('marketplaces', [...current, repo], vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage(`Added marketplace: ${repo}`);
            }
        }
    });

    quickPick.onDidHide(() => {
        quickPick.dispose();
        if (debounceTimer) { clearTimeout(debounceTimer); }
    });

    quickPick.show();
}),
```

**Step 2: Run compile to verify no TypeScript errors**

Run: `npm run compile`
Expected: No errors

**Step 3: Run all tests to verify nothing is broken**

Run: `npm run compile && npm run test:unit`
Expected: All tests PASS (existing + new)

**Step 4: Commit**

```bash
git add src/extension.ts
git commit -m "feat: replace Add Marketplace with QuickPick search UI"
```

---

### Task 3: Add integration test for search → add flow

**Files:**
- Modify: `src/test/unit/mcpIntegration.test.ts` (append new describe block)

**Step 1: Write integration test**

Add to the end of `src/test/unit/mcpIntegration.test.ts`:

```typescript
describe('Marketplace search integration', () => {
    it('should build search URL without query', () => {
        const { buildSearchUrl } = require('../../marketplaceSearch');
        const url = buildSearchUrl();
        assert.ok(url.startsWith('https://api.github.com/search/code'));
        assert.ok(url.includes('marketplace.json'));
        assert.ok(url.includes('.claude-plugin'));
    });

    it('should parse and deduplicate search results sorted by stars', () => {
        const { parseSearchResults } = require('../../marketplaceSearch');
        const response = {
            total_count: 4,
            items: [
                { repository: { full_name: 'low/repo', description: 'Low stars', stargazers_count: 2, html_url: 'https://github.com/low/repo' } },
                { repository: { full_name: 'high/repo', description: 'High stars', stargazers_count: 999, html_url: 'https://github.com/high/repo' } },
                { repository: { full_name: 'high/repo', description: 'Duplicate', stargazers_count: 999, html_url: 'https://github.com/high/repo' } },
                { repository: { full_name: 'mid/repo', description: null, stargazers_count: 50, html_url: 'https://github.com/mid/repo' } },
            ],
        };
        const results = parseSearchResults(response);
        assert.strictEqual(results.length, 3); // deduplicated
        assert.strictEqual(results[0].repo, 'high/repo'); // sorted by stars desc
        assert.strictEqual(results[0].stars, 999);
        assert.strictEqual(results[1].repo, 'mid/repo');
        assert.strictEqual(results[2].repo, 'low/repo');
        assert.strictEqual(results[2].description, 'Low stars');
        assert.strictEqual(results[1].description, ''); // null → ''
    });

    it('should filter already-added marketplaces from results', () => {
        const { parseSearchResults } = require('../../marketplaceSearch');
        const response = {
            total_count: 2,
            items: [
                { repository: { full_name: 'obra/superpowers', description: 'Superpowers', stargazers_count: 100, html_url: 'https://github.com/obra/superpowers' } },
                { repository: { full_name: 'new/repo', description: 'New', stargazers_count: 50, html_url: 'https://github.com/new/repo' } },
            ],
        };
        const results = parseSearchResults(response);
        const alreadyAdded = ['obra/superpowers'];
        const filtered = results.filter(r => !alreadyAdded.includes(r.repo));
        assert.strictEqual(filtered.length, 1);
        assert.strictEqual(filtered[0].repo, 'new/repo');
    });
});
```

**Step 2: Run tests**

Run: `npm run compile && npm run test:unit`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add src/test/unit/mcpIntegration.test.ts
git commit -m "test: add integration tests for marketplace search"
```

---

### Task 4: Final verification and commit

**Step 1: Run full test suite**

Run: `npm run compile && npm run test:unit`
Expected: All tests PASS (previous 127 + new ~11 = ~138)

**Step 2: Run lint**

Run: `npm run lint`
Expected: No errors

**Step 3: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore: marketplace search cleanup"
```
