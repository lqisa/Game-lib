# Keyword Cleaning, DLSite Fetch Fix & GameCard Folder Icon

## Overview

Three small fixes:
1. Strip Chinese brackets `【】` `（）` and version suffixes from search keywords at Scan time, pre-cache segments
2. Fix DLSite fetch route to accept `id` parameter (not just `rjcode`)
3. Add folder icon to GameCard for quick directory access

## 1. Improved splitKeyword + Pre-processing at Scan

### splitKeyword enhancement (`server/scraper/dlsite.js`)

Add bracket stripping before version stripping:

```js
const splitKeyword = (name) => {
  let cleaned = name
    .replace(/【.*?】/g, '')     // strip 【...】
    .replace(/（.*?）/g, '')     // strip （...）
    .replace(/\s*v\d+[\d.]*\s*$/i, '')  // strip version suffix
    .trim()
  // ... rest unchanged (RJ match, CJK/alphanumeric tokenization)
}
```

### ScannerDialog pre-processing

In `loadUnscraped`, after loading games, call `/dlsite/segments` for each game to get cleaned keyword + segments. Cache segments keyed by original name. Set `searchKeyword` to cleaned keyword.

ScrapeDialog receives cleaned keyword as `default-keyword` and cached segments as `initial-segments`.

## 2. DLSite Fetch Route Fix

`POST /dlsite/fetch` currently only accepts `rjcode`. Change to accept `id` as fallback:

```js
const code = req.body.rjcode || req.body.id
```

## 3. GameCard Folder Icon

In `GameCard.vue`, add a `folder_open` icon button next to `library_name`. Clicking calls `window.electronAPI.openPath(library_path + '\\' + sub_path)`.

Requires `hasElectronAPI` computed and `openDir` function.

## Files Changed

| File | Change |
|------|--------|
| `server/scraper/dlsite.js` | Add bracket stripping to splitKeyword |
| `server/routes/scraper.js` | DLSite fetch accept `id` parameter |
| `src/components/ScannerDialog.vue` | Pre-process segments at scan time |
| `src/components/GameCard.vue` | Add folder icon button |