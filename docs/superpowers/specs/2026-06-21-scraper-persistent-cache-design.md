# Scraper Persistent Cache Design

## Problem

Scrape All scans 100-200 games, fetching search results from external APIs. Currently all results are stored in JS Map objects (searchCache, detailCache) which are lost on page refresh, dialog close, or crash. Re-scanning the same library requires re-fetching everything.

## Design

### One persistent cache table + in-memory detail cache

```sql
search_cache (
  key TEXT PRIMARY KEY,          -- 'auto:RJ123456' or 'dlsite:RJ123456'
  source TEXT NOT NULL,          -- 'dlsite' | 'bangumi' | 'vndb' | 'auto'
  keyword TEXT NOT NULL,         -- search keyword
  results TEXT NOT NULL,         -- JSON: SearchResult[]
  created_at DATETIME,
  updated_at DATETIME
)
```

detail_cache 仅保留在内存 Map 中，不落表。理由：
- search_cache 对 Scrape All 影响最大（每个游戏都要搜一次）
- detail 只在 adopt 时按需获取，重新 fetch 代价低
- 减少数据库写入量和实现复杂度

### Data flow

**Scrape All (normal):**
1. Search: check searchCache Map (L1) → hit: return → miss → check search_cache DB (L2) → hit: load to Map, return → miss: fetch from API → write Map + DB
2. Adopt: check detailCache Map → hit: return → miss: fetch from API → write Map only

**Rescrape / Game detail page:**
- Bypass search cache, fetch directly from API → on success, overwrite search_cache DB

**Force Refresh button:**
- Clears search_cache entries for the current library's scan results → re-fetch everything

### In-memory cache layer

- searchCache Map: L1 cache, preloaded from DB on dialog open
- detailCache Map: memory-only, discarded on dialog close
- On dialog close: searchCache Map discarded (DB is source of truth), detailCache Map discarded (no persistence)

### Backend API

- `GET /api/cache/search?key=<key>` — get cached search results
- `POST /api/cache/search` — save search results `{ key, source, keyword, results }`
- `DELETE /api/cache/search?keys=<key1,key2,...>` — delete specific search cache entries
- `POST /api/cache/search/batch` — batch save search results `{ items: [{ key, source, keyword, results }, ...] }`

### Frontend changes

1. ScannerDialog: on open, preload search_cache from DB into Map
2. batchScrape: check Map (L1) → miss → check DB (L2) → miss → fetch API → write Map + DB
3. quickAdopt: check detailCache Map → miss → fetch API → write Map only
4. Add "Force Refresh" button next to "Scrape All" that clears search_cache and re-fetches
5. Game detail page rescrape: bypass search cache, on success overwrite search_cache DB

### No cache invalidation TTL

Cache is permanent until explicitly cleared. Rationale: game metadata rarely changes, and Force Refresh covers the rare case.