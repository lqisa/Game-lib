# Multi-Source Scraper Design (VNDB + Bangumi)

## Overview
Add Bangumi (bgm.tv) and VNDB as additional scraping sources alongside DLSite. Follow priority-based auto-selection with manual source switching.

## Architecture

### Backend Scrapers
Each source exports `search(keyword, ...)` + `fetchDetail(id, ...)` returning unified format.

**Unified Search Result Format:**
```json
{ "id": "string", "title": "string", "coverUrl": "string", "makerName": "string" }
```

**Unified Detail Format:**
```json
{
  "id": "string",
  "title": "string",
  "coverURL": "string",
  "makers": ["string"],
  "genres": ["string"],
  "tags": ["string"],
  "description": "string"
}
```

### New Files
- `server/scraper/bangumi.js` — Bangumi API integration
- `server/scraper/vndb.js` — VNDB API integration

### Bangumi API
- Search: `GET https://api.bgm.tv/v0/search/subject?keyword={kw}&type=4`
  - type=4 = games
  - Header: `Authorization: Bearer {token}`
  - Response: `.data` array with `.id`, `.name`, `.images.common` (cover), `.infobox` (makers)
- Detail: `GET https://api.bgm.tv/v0/subjects/{id}`
  - Response: `.name`, `.images.common`, `.summary`, `.infobox` (makers/genres), `.tags`

### VNDB API
- Search: `POST https://api.vndb.org/kana/vn`
  - Body: `{"filters":["search","=","{kw}"],"fields":"title,image.url,developers.name","results":10}`
  - No auth required
- Detail: same endpoint with more fields
  - Body: `{"filters":["id","=","{id}"],"fields":"title,image.url,description,developers.name,tags.name,developers.name","results":1}`

### New Routes
```
POST /scraper/bangumi/search   { keyword } → { results, segments }
POST /scraper/bangumi/fetch    { id }      → detail
POST /scraper/vndb/search      { keyword } → { results, segments }
POST /scraper/vndb/fetch       { id }      → detail
POST /scraper/auto/search      { keyword, name } → { source, results, segments }
```

### Auto-Search Priority Logic
1. If name contains RJ code → DLSite → Bangumi → VNDB
2. Otherwise → Bangumi → DLSite → VNDB
3. Return first source with non-empty results
4. If all fail, return empty results with source=null

### Settings
- Rename "DLSite Token" → "Bangumi Token" in settings page and DB
- DLSite and VNDB do not require tokens
- Backend reads `bangumi_token` from `setting` table

### Frontend Changes

#### ScrapeDialog
- Add source tabs at top: DLSite / Bangumi / VNDB
- Default tab = auto-recommended source
- Switching tab re-searches with same keyword
- Search results and detail format unified, no source-specific rendering

#### ScannerDialog
- Batch scrape calls `/scraper/auto/search` instead of `/scraper/dlsite/search`
- Cache keyed by `keyword+source` instead of just `keyword`
- Quick adopt calls `/scraper/{source}/fetch` with correct source

#### SettingPage
- Rename DLSite Token label to Bangumi Token
- DB key: `bangumi_token`

## Implementation Order
1. Backend: `bangumi.js` scraper
2. Backend: `vndb.js` scraper
3. Backend: Routes for both + auto-search
4. Backend: Settings migration (rename token)
5. Frontend: SettingPage token rename
6. Frontend: ScrapeDialog source tabs
7. Frontend: ScannerDialog multi-source integration
8. Test: End-to-end with all three sources