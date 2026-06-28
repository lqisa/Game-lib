# Incremental Scan Merge & Adopt Cache Design

## Problem

Two issues with the current scan/scrape workflow:

1. **Scan destroys state**: After scanning, `loadUnscraped()` replaces `scanResults` entirely. All previous work (searched, adopted) resets to `pending`. Scrape All re-processes every row even though search_cache avoids duplicate API calls — the progress bar still counts from 0 to N, every row flashes "Searching...", and the user sees what looks like a full re-scrape.

2. **Adopt state is volatile**: User's adopt decisions (manual or auto-adopt) live only in the in-memory `adoptData` field. Page refresh, dialog close, or crash loses all adopt work. For users debugging with dozens of carefully matched games, this is painful.

## Design

### 1. Incremental scan merge

**Current flow**: `scanDir()` → `loadUnscraped()` → `scanResults = [...]` (full replace, all `pending`)

**New flow**: `scanDir()` → incremental merge into existing `scanResults`:

- Rows whose `subPath` is in `removedGames` → `status = 'stale'`
- New directories not in existing `scanResults` → append with `status = 'pending'`
- Existing rows → keep current status unchanged
- No longer call `loadUnscraped()` after scan

**First open / library switch** (when `scanResults` is empty): still use `loadUnscraped()` to load all unscraped games from DB.

**Merge detail**: After `POST /games/scan/add` inserts new games into DB, we need the new game IDs. Modify `POST /games/scan/add` to return `{ added: N, games: [{ id, name, sub_path }] }` so the frontend can directly build ScanRow objects without an extra DB query.

### 2. adopt_cache table

```sql
adopt_cache (
  game_id INTEGER PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_url TEXT,
  name TEXT,
  cover_url TEXT,
  makers TEXT NOT NULL DEFAULT '[]',
  genres TEXT NOT NULL DEFAULT '[]',
  tags TEXT NOT NULL DEFAULT '[]',
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

**Why a separate table instead of extending search_cache**:

- search_cache key is keyword-based (`auto:RJ123456`), adopt state is game-based (game_id)
- Same keyword can match multiple games; adopt state must distinguish them
- Manual search uses different keywords; adopt state should persist regardless
- adopt_cache includes detail data (makers/genres/tags/description) that doesn't belong in search results

### 3. Backend API for adopt_cache

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/cache/adopt?gameIds=1,2,3` | Batch query adopt status |
| `POST` | `/api/cache/adopt` | Save adopt decision `{ gameId, sourceType, sourceId, sourceUrl, name, coverUrl, makers, genres, tags, description }` |
| `DELETE` | `/api/cache/adopt?gameIds=1,2,3` | Delete after submit or discard |
| `POST` | `/api/cache/adopt/batch` | Batch save (for auto-adopt during Scrape All) |

### 4. Frontend flow changes

**Open dialog / switch library**:

```
loadUnscraped() → game list from DB
preloadCache() → load search_cache into Map
preloadAdoptCache() → GET /api/cache/adopt?gameIds=...
  → games with adopt_cache: status = 'adopted', fill adoptData + searchResult
  → games without: status = 'pending'
```

**User clicks Adopt (manual or quickAdopt)**:

```
→ POST /api/cache/adopt → persist to DB
→ update UI status
```

**User clicks Submit**:

```
→ write game_source etc. (unchanged)
→ DELETE /api/cache/adopt?gameIds=... → remove from adopt_cache
```

**User clicks Discard**:

```
→ DELETE /api/cache/adopt?gameIds=...
→ revert to pending/searched
```

**User clicks Scan (incremental merge)**:

```
→ call POST /games/scan → get newDirs + removedGames
→ POST /games/scan/add → insert new games, get back IDs
→ merge into scanResults:
  - removedGames paths → mark rows as 'stale'
  - newDirs → append as 'pending' rows
  - existing rows → keep status
→ preloadCache for new rows only
```

**User clicks Scrape All**:

```
→ only process rows with status 'pending' or 'error'
→ searched/adopted rows are skipped entirely
→ progress bar shows only new rows count
```

### 5. Cache sharing across libraries

**Current**: `onLibraryChange()` clears `searchCache` + `detailCache` + `segmentsCache`

**New**: `onLibraryChange()` does NOT clear caches. Only reloads `scanResults` for the new library.

Rationale: cache keys are keyword-based (`auto:RJ123456`), library-independent. Same game in any library hits the same cache.

### 6. Force Refresh changes

**Current**: clears search_cache only, adopt state (in-memory) lost with scanResults reset

**New**:

```
1. Clear searchCache Map + DB (unchanged)
2. Clear adopt_cache DB (new)
3. Reset scanResults:
   - adopted → pending, clear adoptData/searchResult
   - searched → pending, clear searchResult
   - error → pending
   - stale → unchanged
```

### 7. Scan/add endpoint change

`POST /games/scan/add` currently returns `{ added: N }`.

New return: `{ added: N, games: [{ id, name, sub_path }] }` so frontend can build ScanRow objects with correct game IDs without an extra query.

## No TTL

Both search_cache and adopt_cache are permanent until explicitly cleared. Same rationale as the original persistent cache design: game metadata rarely changes, Force Refresh covers the rare case.