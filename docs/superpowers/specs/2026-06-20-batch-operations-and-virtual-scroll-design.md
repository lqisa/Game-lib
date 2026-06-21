# Batch Operations & Virtual Scroll Design

## Overview

Three performance optimizations for the ScannerDialog:
1. Batch segments API call instead of N sequential requests
2. Batch adopt API call instead of N sequential requests
3. Replace q-table with q-virtual-scroll for large lists

## 1. Batch Segments API

### Backend: `POST /scraper/dlsite/segments/batch`

Accept array of names, return processed results for all.

```js
// Request: { names: ["SWAN SONG（天鹅之歌）", "余命一年の恋"] }
// Response: { results: [{ name, keyword, segments }, ...] }
```

### Frontend: ScannerDialog.loadUnscraped

One call instead of loop. Map results to searchKeyword and segmentsCache.

## 2. Batch Adopt API

### Backend: `POST /scraper/adopt/batch`

Accept array of game adopt data, process each (download cover, update DB, sync makers/genres/tags), return results.

```js
// Request: { games: [{ gameId, sourceType, sourceId, sourceUrl, name, coverUrl, makers, genres, tags, description }, ...] }
// Response: { results: [{ gameId, success, error?, game? }, ...] }
```

### Frontend: ScannerDialog.submitAdopted

One call instead of loop.

## 3. Virtual Scroll

Replace `q-table` with `q-virtual-scroll`. Each item renders as a flat flex row with cover thumbnail, directory name, match result, status badge, and action buttons.

No table columns, no header row. Fixed height container with virtual scroll for smooth rendering of thousands of items.

## Files Changed

| File | Change |
|------|--------|
| `server/routes/scraper.js` | Add batch segments and batch adopt endpoints |
| `src/components/ScannerDialog.vue` | Replace q-table with q-virtual-scroll, use batch APIs |