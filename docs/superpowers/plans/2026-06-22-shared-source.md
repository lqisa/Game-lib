# Shared Source (Duplicate Game) Implementation Plan

> **For AI agents:** Required sub-skill: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax to track progress.

**Goal:** Allow multiple games to share the same external source, detect conflicts at submit time, and surface duplicate information in the UI.

**Architecture:** Change `game_source` unique constraint from `(source_type, source_id)` to `(game_id, source_type, source_id)`. After batch adopt, query for shared sources and return conflict info. Frontend shows a notification dialog for conflicts, a duplicate icon on GameCard, and conflict info on the game detail page.

**Tech stack:** SQLite/Knex (backend), Vue 3 + Quasar (frontend)

---

## File Structure

| File | Responsibility | Action |
|------|---------------|--------|
| `server/database/init.js` | DB initialization + migration | Modify |
| `server/database/schema.js` | Schema definition for new installs | Modify |
| `server/database/db.js` | Add `getDuplicateSources` query, update `insertGameSource` | Modify |
| `server/routes/scraper.js` | Update `adoptOne` conflict handling, add conflict detection to batch | Modify |
| `server/routes/game.js` | Add `GET /games/duplicates` endpoint | Modify |
| `src/components/GameCard.vue` | Add `duplicate` prop and icon | Modify |
| `src/pages/GameLibPage.vue` | Load duplicates, pass prop to GameCard | Modify |
| `src/components/ScannerDialog.vue` | Show conflict notification after submit | Modify |
| `src/pages/GameDetailPage.vue` | Show shared-source games in detail | Modify |

---

### Task 1: Schema Migration — Change game_source Unique Constraint

**Files:**
- Modify: `server/database/init.js:95-120`
- Modify: `server/database/schema.js:56-65`

- [ ] **Step 1: Update schema.js for new installs**

Change the `game_source` table definition in `schema.js` line 63 from:

```js
table.unique(['source_type', 'source_id'])
```

to:

```js
table.unique(['game_id', 'source_type', 'source_id'])
```

- [ ] **Step 2: Update TABLE_DDL in init.js for missing-table creation**

Change the `game_source` entry in `TABLE_DDL` (line 67-76) from:

```js
table.unique(['source_type', 'source_id'])
```

to:

```js
table.unique(['game_id', 'source_type', 'source_id'])
```

- [ ] **Step 3: Add migration logic in init.js**

After the `await knex('setting').insert(...)` line at the end of `initDatabase` (line 119), add migration check:

```js
const v2 = await knex('setting').where({ key: 'migration_v2' }).first()
if (!v2) {
  console.log(' * Running migration v2: game_source constraint change...')
  await knex.raw('DROP INDEX IF EXISTS game_source_source_type_source_id_unique')
  await knex.raw('CREATE UNIQUE INDEX IF NOT EXISTS game_source_game_id_source_type_source_id_unique ON game_source(game_id, source_type, source_id)')
  await knex('setting').insert({ key: 'migration_v2', value: '1' }).onConflict('key').ignore()
  console.log(' * Migration v2 done.')
}
```

- [ ] **Step 4: Restart dev server and verify migration**

Run: restart the backend dev server, check console for "Migration v2 done." message.

- [ ] **Step 5: Commit**

```bash
git add server/database/init.js server/database/schema.js
git commit -m "feat: change game_source unique constraint to allow shared sources"
```

---

### Task 2: Backend — Update adoptOne Logic and Add Conflict Detection

**Files:**
- Modify: `server/routes/scraper.js:210-216`
- Modify: `server/routes/scraper.js:296-320`

- [ ] **Step 1: Update adoptOne to use new constraint**

In `scraper.js`, replace the current game_source insert block (lines 210-216):

```js
  await d('game_source').where({ game_id: gameId }).del()
  await d('game_source').insert({
    game_id: gameId,
    source_type: sourceType,
    source_id: sourceId,
    source_url: sourceUrl || null,
    raw_data: null
  }).onConflict(['source_type', 'source_id']).merge(['source_url', 'raw_data', 'game_id'])
```

with:

```js
  await d('game_source').insert({
    game_id: gameId,
    source_type: sourceType,
    source_id: sourceId,
    source_url: sourceUrl || null,
    raw_data: null
  }).onConflict(['game_id', 'source_type', 'source_id']).merge(['source_url', 'raw_data'])
```

No more `del()` before insert. The new unique constraint `(game_id, source_type, source_id)` allows multiple games to share the same source.

- [ ] **Step 2: Update insertGameSource in db.js**

In `db.js`, change `insertGameSource` (line 146):

```js
const insertGameSource = async (data) => {
  return db('game_source').insert(data).onConflict(['source_type', 'source_id']).merge()
}
```

to:

```js
const insertGameSource = async (data) => {
  return db('game_source').insert(data).onConflict(['game_id', 'source_type', 'source_id']).merge(['source_url', 'raw_data'])
}
```

- [ ] **Step 3: Commit**

```bash
git add server/routes/scraper.js server/database/db.js
git commit -m "feat: update adopt logic for shared sources"
```

---

### Task 3: Backend — Add Duplicates API Endpoint

**Files:**
- Modify: `server/database/db.js` (add `getDuplicateSources` function)
- Modify: `server/routes/game.js` (add `GET /games/duplicates` route)

- [ ] **Step 1: Add getDuplicateSources to db.js**

Add before the export block:

```js
const getDuplicateSources = async () => {
  const rows = await db('game_source as gs')
    .join('game as g', 'g.id', 'gs.game_id')
    .select('gs.source_type', 'gs.source_id', 'gs.game_id', 'g.name as game_name')
    .whereIn(
      db.knex.raw('(gs.source_type, gs.source_id)'),
      function () {
        this.select('source_type', 'source_id')
          .from('game_source')
          .groupBy('source_type', 'source_id')
          .havingRaw('COUNT(*) > 1')
      }
    )
    .orderBy('gs.source_type', 'gs.source_id')

  const groups = {}
  for (const row of rows) {
    const key = `${row.source_type}:${row.source_id}`
    if (!groups[key]) groups[key] = { sourceType: row.source_type, sourceId: row.source_id, games: [] }
    groups[key].games.push({ gameId: row.game_id, name: row.game_name })
  }

  return Object.values(groups)
}
```

- [ ] **Step 2: Export getDuplicateSources**

Add `getDuplicateSources` to the export list in `db.js`.

- [ ] **Step 3: Add GET /games/duplicates route in game.js**

Add before the `/:id` route (to avoid route conflict):

```js
router.get('/duplicates', async (req, res, next) => {
  try {
    const duplicates = await db.getDuplicateSources()
    res.send(duplicates)
  } catch (err) {
    next(err)
  }
})
```

- [ ] **Step 4: Test the endpoint**

Run: `curl -s http://localhost:9000/api/games/duplicates | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d)))"`

Expected: empty array `[]` (no duplicates yet since we reset the test data).

- [ ] **Step 5: Commit**

```bash
git add server/database/db.js server/routes/game.js
git commit -m "feat: add GET /games/duplicates API endpoint"
```

---

### Task 3b: Backend — Add Check-Conflicts API Endpoint

**Files:**
- Modify: `server/routes/game.js` (add `POST /games/check-conflicts` route)

This endpoint is called by the frontend BEFORE submitting adopt, to detect if any of the sources about to be adopted are already used by other games.

- [ ] **Step 1: Add POST /games/check-conflicts route in game.js**

Add before the `/:id` route (to avoid route conflict):

```js
router.post('/check-conflicts', async (req, res, next) => {
  try {
    const { sources } = req.body
    if (!Array.isArray(sources)) {
      return res.status(400).send({ error: 'sources array is required' })
    }
    if (sources.length === 0) {
      return res.send([])
    }
    const conflicts = []
    for (const s of sources) {
      if (!s.sourceType || !s.sourceId) continue
      const existing = await db.knex('game_source as gs')
        .join('game as g', 'g.id', 'gs.game_id')
        .where({ 'gs.source_type': s.sourceType, 'gs.source_id': String(s.sourceId) })
        .whereNot('gs.game_id', s.gameId)
        .select('gs.game_id', 'g.name as game_name', 'gs.source_type', 'gs.source_id')
      if (existing.length > 0) {
        conflicts.push({
          sourceType: s.sourceType,
          sourceId: s.sourceId,
          games: existing.map(r => ({ gameId: r.game_id, name: r.game_name }))
        })
      }
    }
    res.send(conflicts)
  } catch (err) {
    next(err)
  }
})
```

Request body format:
```json
{
  "sources": [
    { "gameId": 2134, "sourceType": "bangumi", "sourceId": "269859" },
    { "gameId": 100, "sourceType": "dlsite", "sourceId": "123456" }
  ]
}
```

Response: array of conflicts (empty if no conflicts):
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

- [ ] **Step 2: Test the endpoint**

Run with a test JSON file containing a known conflict source, verify it returns the conflicting game info.

- [ ] **Step 3: Commit**

```bash
git add server/routes/game.js
git commit -m "feat: add POST /games/check-conflicts API for pre-submit conflict detection"
```

---

### Task 4: Frontend — GameCard Duplicate Icon

**Files:**
- Modify: `src/components/GameCard.vue`

- [ ] **Step 1: Add duplicate prop and icon to GameCard**

Update the `Game` interface to not change (duplicate is a separate prop, not part of game data).

Add `duplicate` prop:

```ts
const props = withDefaults(defineProps<{
  game: Game
  selectable?: boolean
  selected?: boolean
  duplicate?: boolean
}>(), {
  selectable: false,
  selected: false,
  duplicate: false,
})
```

Add the duplicate icon in the template, after the selected icon div and before the game-cover__title div:

```vue
<div v-if="duplicate" class="absolute-top-right q-pa-xs" style="z-index: 1;">
  <q-icon name="content_copy" color="warning" size="18px">
    <q-tooltip>与其他游戏共享来源</q-tooltip>
  </q-icon>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/GameCard.vue
git commit -m "feat: add duplicate icon to GameCard"
```

---

### Task 5: Frontend — Load Duplicates in GameLibPage and Pass to GameCard

**Files:**
- Modify: `src/pages/GameLibPage.vue`

- [ ] **Step 1: Add duplicateGameIds ref and load function**

After the `total` ref declaration, add:

```ts
const duplicateGameIds = ref<Set<number>>(new Set())

const loadDuplicates = async () => {
  try {
    const res = await api.get('/games/duplicates')
    const ids = new Set<number>()
    for (const group of res.data) {
      for (const game of group.games) {
        ids.add(game.gameId)
      }
    }
    duplicateGameIds.value = ids
  } catch {
    duplicateGameIds.value = new Set()
  }
}
```

- [ ] **Step 2: Call loadDuplicates on mount and after loadGames**

In `onMounted`, add `void loadDuplicates()` after `void loadGames()`.

In the `loadGames` function, add `void loadDuplicates()` in the finally block (after `loading.value = false`).

- [ ] **Step 3: Pass duplicate prop to GameCard**

Update the GameCard usage in the template:

```vue
<GameCard
  :game="game"
  :selectable="selectMode"
  :selected="selectedIds.has(game.id)"
  :duplicate="duplicateGameIds.has(game.id)"
  @click="goDetail(game.id)"
  @select="toggleSelect(game.id, $event)"
/>
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/GameLibPage.vue
git commit -m "feat: load and display duplicate source indicators on game cards"
```

---

### Task 6: Frontend — Pre-Submit Conflict Confirmation in ScannerDialog

**Files:**
- Modify: `src/components/ScannerDialog.vue`

The flow is: user clicks Submit → call `POST /games/check-conflicts` with the adopted sources → if conflicts found, show confirmation dialog → user confirms or cancels → then call adopt/batch.

- [ ] **Step 1: Add conflict dialog state and refs**

Add refs:

```ts
const showConflictDialog = ref(false)
const conflictList = ref<{ sourceType: string; sourceId: string; games: { gameId: number; name: string }[] }[]>([])
const pendingSubmitData = ref<{ games: any[]; adoptedRows: any[]; staleRows: any[] } | null>(null)
```

- [ ] **Step 2: Update submitAdopted to check conflicts before submitting**

Replace the existing `submitAdopted` function:

```ts
const submitAdopted = async () => {
  submitting.value = true
  const adoptedRows = scanResults.value.filter(r => r.status === 'adopted' && r.adoptData)
  const staleRows = scanResults.value.filter(r => r.status === 'stale')
  try {
    if (adoptedRows.length > 0) {
      const games = adoptedRows.map(row => {
        const d = row.adoptData!
        const source = d.source || 'dlsite'
        return {
          gameId: row.gameId,
          sourceType: source,
          sourceId: d.sourceId,
          sourceUrl: getSourceUrl(source, d.sourceId),
          name: d.detail.title,
          coverUrl: d.detail.coverURL,
          makers: d.detail.makers,
          genres: d.detail.genres,
          tags: d.detail.tags,
          description: d.detail.description,
        }
      })

      const checkRes = await api.post('/games/check-conflicts', {
        sources: games.map(g => ({ gameId: g.gameId, sourceType: g.sourceType, sourceId: g.sourceId }))
      })
      const conflicts = checkRes.data || []

      if (conflicts.length > 0) {
        conflictList.value = conflicts
        pendingSubmitData.value = { games, adoptedRows, staleRows }
        showConflictDialog.value = true
        return
      }

      await doSubmit(games, adoptedRows, staleRows)
    } else {
      if (staleRows.length > 0) {
        await api.post('/games/batch-delete', { ids: staleRows.map(r => r.gameId) })
      }
      scanResults.value = scanResults.value.filter(r => r.status !== 'stale')
      emit('done')
    }
  } finally {
    submitting.value = false
  }
}

const doSubmit = async (games: any[], adoptedRows: any[], staleRows: any[]) => {
  const failedIds = new Set<number>()
  const batchRes = await api.post('/scraper/adopt/batch', { games })
  const results: { gameId: number; success: boolean; error?: string }[] = batchRes.data.results || []
  for (const r of results) {
    if (!r.success) {
      failedIds.add(r.gameId)
      const row = adoptedRows.find(ar => ar.gameId === r.gameId)
      if (row) row.status = row.searchResult ? 'searched' : 'pending'
    }
  }
  if (staleRows.length > 0) {
    await api.post('/games/batch-delete', { ids: staleRows.map(r => r.gameId) })
  }
  scanResults.value = scanResults.value.filter(r => {
    if (r.status === 'stale') return false
    if (r.status === 'adopted') return failedIds.has(r.gameId)
    return true
  })
  emit('done')
}

const confirmConflictSubmit = async () => {
  showConflictDialog.value = false
  if (!pendingSubmitData.value) return
  const { games, adoptedRows, staleRows } = pendingSubmitData.value
  pendingSubmitData.value = null
  submitting.value = true
  try {
    await doSubmit(games, adoptedRows, staleRows)
  } finally {
    submitting.value = false
  }
}

const cancelConflictSubmit = () => {
  showConflictDialog.value = false
  pendingSubmitData.value = null
}
```

- [ ] **Step 3: Add conflict confirmation dialog in template**

Add dialog in template (after the ScannerDialog's existing dialogs):

```vue
<q-dialog v-model="showConflictDialog" persistent>
  <q-card style="min-width: 400px">
    <q-card-section>
      <div class="text-h6 row items-center">
        <q-icon name="warning" color="warning" size="sm" class="q-mr-sm" />
        来源冲突提醒
      </div>
    </q-card-section>
    <q-card-section>
      <div class="text-body2 q-mb-sm">以下来源已被其他游戏使用，确认继续提交？</div>
      <div v-for="conflict in conflictList" :key="`${conflict.sourceType}:${conflict.sourceId}`" class="q-mb-md">
        <div class="text-subtitle2">{{ conflict.sourceType }}: {{ conflict.sourceId }}</div>
        <div class="text-caption text-grey">已关联的游戏：</div>
        <ul class="q-pl-md q-mt-xs">
          <li v-for="g in conflict.games" :key="g.gameId">{{ g.name }} (ID: {{ g.gameId }})</li>
        </ul>
      </div>
    </q-card-section>
    <q-card-actions align="right">
      <q-btn flat label="取消" color="grey" @click="cancelConflictSubmit" />
      <q-btn flat label="确认提交" color="primary" @click="confirmConflictSubmit" />
    </q-card-actions>
  </q-card>
</q-dialog>
```

- [ ] **Step 4: Commit**

```bash
git add src/components/ScannerDialog.vue
git commit -m "feat: pre-submit conflict confirmation dialog for shared sources"
```

---

### Task 7: Frontend — Game Detail Page Conflict Info

**Files:**
- Modify: `src/pages/GameDetailPage.vue`

- [ ] **Step 1: Add duplicateSources to GameDetail interface**

Add to the `GameDetail` interface:

```ts
  duplicateSources: { sourceType: string; sourceId: string; games: { gameId: number; name: string }[] }[] | null
```

- [ ] **Step 2: Add duplicate sources display in template**

After the sources display div (the one with `v-if="game.sources?.length"`), add:

```vue
          <div v-if="game.duplicateSources?.length" class="q-mt-sm">
            <q-badge color="warning" class="q-mb-xs">
              <q-icon name="content_copy" size="14px" class="q-mr-xs" />
              共享来源
            </q-badge>
            <div v-for="ds in game.duplicateSources" :key="`${ds.sourceType}:${ds.sourceId}`" class="text-caption q-mt-xs">
              <span class="text-grey">{{ ds.sourceType }}: {{ ds.sourceId }} — 同时关联：</span>
              <span v-for="(g, i) in ds.games" :key="g.gameId">
                <router-link :to="`/game/${g.gameId}`" class="text-blue">{{ g.name }}</router-link>
                <span v-if="i < ds.games.length - 1" class="text-grey">、</span>
              </span>
            </div>
          </div>
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/GameDetailPage.vue
git commit -m "feat: show shared source info on game detail page"
```

---

### Task 8: Backend — Add duplicateSources to Game Detail API

**Files:**
- Modify: `server/database/db.js` (update `getGameDetail`)

- [ ] **Step 1: Add duplicate source query to getGameDetail**

In `db.js`, at the end of `getGameDetail`, before the `return` statement, add:

```js
  let duplicateSources = null
  if (sources.length > 0) {
    const sourceConditions = sources.map(s => ({ source_type: s.source_type, source_id: s.source_id }))
    const dupRows = await db('game_source as gs')
      .join('game as g', 'g.id', 'gs.game_id')
      .where(function () {
        for (const sc of sourceConditions) {
          this.orWhere({ 'gs.source_type': sc.source_type, 'gs.source_id': sc.source_id })
        }
      })
      .whereNot('gs.game_id', id)
      .select('gs.source_type', 'gs.source_id', 'gs.game_id', 'g.name as game_name')

    if (dupRows.length > 0) {
      const groups = {}
      for (const row of dupRows) {
        const key = `${row.source_type}:${row.source_id}`
        if (!groups[key]) groups[key] = { sourceType: row.source_type, sourceId: row.source_id, games: [] }
        groups[key].games.push({ gameId: row.game_id, name: row.game_name })
      }
      duplicateSources = Object.values(groups)
    }
  }

  return { ...game, makers, genres, tags, sources, library, duplicateSources }
```

- [ ] **Step 2: Test the detail API**

Run: `curl -s http://localhost:9000/api/games/1 | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const g=JSON.parse(d);console.log('duplicateSources:',JSON.stringify(g.duplicateSources))})"`

Expected: `null` for games without shared sources, or an array of conflict groups.

- [ ] **Step 3: Commit**

```bash
git add server/database/db.js
git commit -m "feat: include duplicate source info in game detail API response"
```

---

### Task 9: Integration Test — End-to-End Verification

- [ ] **Step 1: Restart backend dev server**

- [ ] **Step 2: Open Scan & Scrape, scrape a game that shares a source with another game**

- [ ] **Step 3: Adopt both games, verify conflict confirmation dialog appears before submit**

- [ ] **Step 4: Verify both games remain in the list (not removed)**

- [ ] **Step 5: Verify GameCard shows duplicate icon on both games**

- [ ] **Step 6: Open game detail page, verify shared source info is displayed with clickable links**

- [ ] **Step 7: Final commit if any fixes needed**

---

### Task 10: ScannerDialog UI Improvements

**Files:**
- Modify: `src/components/ScannerDialog.vue`

Three UI improvements: search filter, folder name tooltip, and wider cover column.

- [ ] **Step 1: Add search filter input**

Add a `q-input` in the toolbar area (after the sort button), before the `<q-space />` or alongside existing controls:

```vue
<q-input
  v-model="scanFilter"
  label="Filter"
  outlined
  dense
  clearable
  style="max-width: 200px"
  class="q-ml-sm"
>
  <template v-slot:append>
    <q-icon name="search" />
  </template>
</q-input>
```

Add the ref:

```ts
const scanFilter = ref('')
```

Update `sortedResults` computed to also filter by `scanFilter`:

```ts
const sortedResults = computed(() => {
  let results = [...scanResults.value]
  if (scanFilter.value) {
    const keyword = scanFilter.value.toLowerCase()
    results = results.filter(r =>
      r.name.toLowerCase().includes(keyword) ||
      r.searchResult?.name?.toLowerCase().includes(keyword)
    )
  }
  // ... existing sort logic
})
```

- [ ] **Step 2: Add tooltip to folder name**

In the `scan-row__info` section, the folder name `<span class="text-body2 ellipsis">{{ row.name }}</span>` overflows. Add a `q-tooltip`:

```vue
<span class="text-body2 ellipsis">{{ row.name }}</span>
<q-tooltip v-if="row.name.length > 30">{{ row.name }}</q-tooltip>
```

- [ ] **Step 3: Increase row height to 260px for clearer cover images**

Change the grid template from:

```css
grid-template-columns: 40px 1fr 60px 140px;
```

to:

```css
grid-template-columns: 180px 1fr 60px 140px;
```

Update the cover wrap size (1:1.4 aspect ratio, height 260px → width ~180px):

```css
.scan-row__cover-wrap {
  position: relative;
  width: 180px;
  height: 260px;
  border-radius: 4px;
  background: #e0e0e0;
  display: flex;
  align-items: center;
  justify-content: center;
}
```

Update the row height from `48px` to `260px`:

```css
.scan-row {
  display: grid;
  grid-template-columns: 180px 1fr 60px 140px;
  gap: 0 8px;
  align-items: center;
  height: 260px;
  padding: 4px 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.12);
}
```

Update the virtual scroll item size to match:

```vue
:virtual-scroll-item-size="280"
```

Update the fallback cover placeholder to match:

```css
width: 180px; height: 260px;
```

- [ ] **Step 4: Commit**

```bash
git add src/components/ScannerDialog.vue
git commit -m "feat: add search filter, folder tooltip, and wider cover column to ScannerDialog"
```