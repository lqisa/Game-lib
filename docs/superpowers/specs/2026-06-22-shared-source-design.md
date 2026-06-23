# Shared Source (Duplicate Game) Design

## Problem

Multiple local game directories can map to the same external source (e.g. bangumi:269859). The current `UNIQUE(source_type, source_id)` constraint prevents this, causing adopt failures or "ping-pong" effects where games steal sources from each other.

## Solution Overview

Allow multiple games to share the same source by changing the unique constraint, detect conflicts at submit time, and surface duplicate information in the UI.

## §1 Schema Migration

**Current**: `UNIQUE(source_type, source_id)` — one source can only belong to one game.

**New**: `UNIQUE(game_id, source_type, source_id)` — one source can belong to multiple games, but a game cannot duplicate the same source.

**Migration steps** (in `init.js`, tracked via `setting` table key `migration_v2`):

1. Drop old index: `DROP INDEX IF EXISTS game_source_source_type_source_id_unique`
2. Create new index: `CREATE UNIQUE INDEX game_source_game_id_source_type_source_id_unique ON game_source(game_id, source_type, source_id)`
3. Record migration: `INSERT INTO setting (key, value) VALUES ('migration_v2', '1')`

## §2 Backend Adopt Logic

**`adoptOne` in scraper.js**:

- Remove `del()` + `onConflict(['source_type', 'source_id']).merge()` (ping-pong logic)
- Use: `insert().onConflict(['game_id', 'source_type', 'source_id']).merge()`
- No longer deletes other games' sources

**Pre-submit conflict check API** — `POST /games/check-conflicts`:

Called BEFORE submitting adopt. Takes a list of sources about to be adopted, returns which ones conflict with existing games.

Request:
```json
{
  "sources": [
    { "gameId": 2134, "sourceType": "bangumi", "sourceId": "269859" }
  ]
}
```

Response (empty if no conflicts):
```json
[
  {
    "sourceType": "bangumi",
    "sourceId": "269859",
    "games": [
      { "gameId": 1820, "name": "我和她（女护士）的诊察日志" }
    ]
  }
]
```

## §3 Duplicates API

`GET /games/duplicates` — returns all source-sharing game groups:

```json
[
  {
    "sourceType": "bangumi",
    "sourceId": "269859",
    "games": [
      { "gameId": 1820, "name": "我和她（女护士）的诊察日志" },
      { "gameId": 2134, "name": "我和她（女医师）的诊察日志" }
    ]
  }
]
```

## §4 Frontend — Pre-Submit Conflict Confirmation

When user clicks Submit in ScannerDialog:

1. Call `POST /games/check-conflicts` with the adopted sources
2. If conflicts found, show a **persistent** confirmation dialog listing:
   - The shared source (e.g. "bangumi: 269859")
   - The conflicting games with their names and IDs
3. User can:
   - Click "确认提交" to proceed with adopt (conflicts are allowed)
   - Click "取消" to cancel and go back
4. If no conflicts, proceed directly to adopt

## §5 Frontend — GameCard Duplicate Icon

- Parent page loads `GET /games/duplicates` once, builds a `Set<number>` of game IDs that have conflicts
- Pass `duplicate` boolean prop to `GameCard`
- Show a small icon (e.g. `content_copy`) in top-right corner with tooltip "与其他游戏共享来源"

```vue
<div v-if="duplicate" class="absolute-top-right q-pa-xs">
  <q-icon name="content_copy" color="warning" size="18px">
    <q-tooltip>与其他游戏共享来源</q-tooltip>
  </q-icon>
</div>
```

## §6 Frontend — Game Detail Conflict Info

- `GET /games/:id` response includes `duplicateSources` field listing other games sharing the same source
- Displayed in the detail page below the source section: "共享此来源的游戏：XXX" with clickable links