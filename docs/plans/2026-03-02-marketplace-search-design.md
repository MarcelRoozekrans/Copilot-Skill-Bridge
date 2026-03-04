# Marketplace Search Design

## Goal

Enhance the "Add Marketplace" command to search GitHub for repos containing Claude marketplace file signatures (`.claude-plugin/marketplace.json`), sorted by star count, replacing the current manual text input.

## Decisions

- **UI**: Enhanced "Add Marketplace" QuickPick with live search results, manual entry fallback
- **Auth**: Unauthenticated first, falls back to manual input on rate limit
- **File signature**: `path:.claude-plugin/marketplace.json` via GitHub Code Search API
- **Approach**: Single Code Search API call, deduplicate by repo, client-side sort by stars

## Architecture

### New module: `src/marketplaceSearch.ts`

```typescript
export interface MarketplaceSearchResult {
    repo: string;        // "owner/repo"
    description: string;
    stars: number;
    url: string;         // GitHub URL
}

export async function searchMarketplaces(query?: string): Promise<MarketplaceSearchResult[]>;
```

- Calls `GET /search/code?q={query}+filename:marketplace.json+path:.claude-plugin`
- Uses `buildAuthHeaders` from `auth.ts` (token optional)
- Deduplicates results by `repository.full_name`
- Sorts by `stargazers_count` descending

### Modified: `src/extension.ts`

Replace the `copilotSkillBridge.addMarketplace` command handler:

1. Create `vscode.window.createQuickPick()`
2. On open: call `searchMarketplaces()` with no query (shows all matches by popularity)
3. On `onDidChangeValue`: debounced call to `searchMarketplaces(query)`
4. Items formatted as: `$(star) {stars}  {owner/repo}` with description
5. Permanent last item: "Enter manually..." (opens input box)
6. On accept: add repo to `copilotSkillBridge.marketplaces` setting, call `refreshAll()`

### Error handling

| Scenario | Behavior |
|----------|----------|
| Network failure | Show "Enter manually..." with info message |
| Rate limit (403) | Show warning, fall back to manual input |
| No results | Show "No marketplaces found" + manual input |
| Already added | Skip duplicate, show info message |

### UX flow

```
User triggers "Add Marketplace"
  → QuickPick opens, placeholder: "Search GitHub for Claude marketplaces..."
  → Loading indicator while fetching initial results
  → Results appear sorted by stars: "owner/repo  ★123  Description..."
  → User types query → debounced re-search
  → User picks result → added to settings → tree refreshes
  → Or picks "Enter manually..." → original input box flow
```

### GitHub Code Search API details

- Endpoint: `GET https://api.github.com/search/code`
- Query: `q=filename:marketplace.json+path:.claude-plugin{+userQuery}`
- Unauthenticated rate limit: 10 requests/minute
- Response includes `items[].repository.full_name`, `items[].repository.description`, `items[].repository.stargazers_count`
- No pagination needed for initial implementation (default 30 results is plenty)
