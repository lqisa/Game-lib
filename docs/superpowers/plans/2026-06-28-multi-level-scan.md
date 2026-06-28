# Multi-Level Scan & Archive Recognition 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 为游戏库扫描器添加手动逐层展开扫描和压缩包识别（含分包去重）功能

**架构：** 后端新增 `POST /games/scan/expand` API 和 `server/constants.js` 常量文件，改造 `scanner.js` 支持压缩包识别与启发式过滤。前端 `ScannerDialog.vue` 将扁平列表改为树形渲染，支持逐层展开扫描。

**技术栈：** Node.js (Express 5)、Vue 3 + Quasar、TypeScript、SQLite (Knex)

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `server/constants.js` | 创建 | `NON_GAME_DIRS`、`ARCHIVE_EXTENSIONS`、`VOLUME_PATTERNS` 常量 |
| `server/scanner.js` | 修改 | 新增 `expandDirectory`、`deduplicateArchives`、`filterGameDirs`；改造 `scanDirectory` 返回压缩包 |
| `server/routes/game.js` | 修改 | 新增 `POST /scan/expand` 路由；改造 `POST /scan` 和 `POST /scan/add` |
| `src/components/ScannerDialog.vue` | 修改 | 扩展 `ScanRow` 类型；树形渲染；展开扫描交互；压缩包视觉区分 |

---

### 任务 1：创建 `server/constants.js`

**文件：**
- 创建：`server/constants.js`

- [ ] **步骤 1：创建常量文件**

```javascript
const NON_GAME_DIRS = new Set([
  'www', 'audio', 'img', 'data', 'js', 'fonts', 'movies', 'save', 'icon', 'css',
  'graphics', 'system',
  'savedata', 'bgm', 'se', 'voice', 'vo', 'fg', 'bg', 'rule', 'scenario', 'image',
  'patch', 'patch2', 'others', 'anim', 'env', 'ubin',
  'game', 'cache', 'saves', 'tl', 'gui', 'log', 'persistent', 'renpy',
  'managed', 'plugins', 'resources', 'streamingassets', 'monobleedingedge',
  'graphic', 'sound',
  'dat', 'cg',
  'music', 'me', 'config', 'script', 'plugin', 'mods', 'mod',
  'temp', 'tmp', 'logs', 'backup', 'screenshot', 'screenshots',
  'thumbnail', 'thumbnails', 'thumb', 'doc', 'manual', 'readme',
  'video', 'dlc', 'extra', 'extras', 'bonus',
  'images', 'font', 'icons', 'update', 'crack', 'dll', 'lib', 'libs',
  'docs', 'help', 'tool', 'tools', 'sdk', 'assets', 'resource',
  'locale', 'lang', 'localization', 'i18n', 'conf', 'cfg', 'settings',
  'profile', 'profiles', 'userdata', 'user', 'meta', 'info',
  'en', 'zh', 'ja', 'ko', 'cn', 'tw',
]);

const ARCHIVE_EXTENSIONS = new Set([
  '.zip', '.7z', '.rar',
  '.001', '.002', '.003', '.004', '.005',
  '.006', '.007', '.008', '.009',
]);

const VOLUME_PATTERNS = [
  /^(.+)\.7z\.\d+$/,
  /^(.+)\.part\d+\.rar$/i,
  /^(.+)\.rar\.r\d+$/i,
];

export { NON_GAME_DIRS, ARCHIVE_EXTENSIONS, VOLUME_PATTERNS };
```

- [ ] **步骤 2：验证文件可被导入**

运行：`node -e "import('./server/constants.js').then(m => console.log(Object.keys(m)))"`
预期：输出 `[ 'NON_GAME_DIRS', 'ARCHIVE_EXTENSIONS', 'VOLUME_PATTERNS' ]`

- [ ] **步骤 3：Commit**

```bash
git add server/constants.js
git commit -m "feat: add scanner constants for heuristic filtering and archive recognition"
```

---

### 任务 2：改造 `server/scanner.js`

**文件：**
- 修改：`server/scanner.js`

- [ ] **步骤 1：重写 scanner.js，添加新函数并改造 scanDirectory**

将 `server/scanner.js` 完整替换为：

```javascript
import fs from 'node:fs';
import path from 'node:path';
import { NON_GAME_DIRS, ARCHIVE_EXTENSIONS, VOLUME_PATTERNS } from './constants.js';

const scanDirectory = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    return { dirs: [], archives: [] };
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  const archives = entries
    .filter((e) => e.isFile())
    .filter((e) => ARCHIVE_EXTENSIONS.has(path.extname(e.name).toLowerCase()))
    .map((e) => e.name);

  return { dirs, archives: deduplicateArchives(archives) };
};

const expandDirectory = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    return { dirs: [], archives: [], hasSubDirs: {} };
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  const archives = entries
    .filter((e) => e.isFile())
    .filter((e) => ARCHIVE_EXTENSIONS.has(path.extname(e.name).toLowerCase()))
    .map((e) => e.name);

  const hasSubDirs = {};
  for (const d of dirs) {
    const subPath = path.join(dirPath, d);
    try {
      hasSubDirs[d] = fs.readdirSync(subPath, { withFileTypes: true }).some((e) => e.isDirectory());
    } catch {
      hasSubDirs[d] = false;
    }
  }

  return {
    dirs: filterGameDirs(dirs),
    archives: deduplicateArchives(archives),
    hasSubDirs,
  };
};

const deduplicateArchives = (archiveNames) => {
  const map = new Map();
  for (const name of archiveNames) {
    let baseName = null;
    for (const pattern of VOLUME_PATTERNS) {
      const match = name.match(pattern);
      if (match) {
        baseName = match[1];
        break;
      }
    }
    if (baseName) {
      if (!map.has(baseName)) map.set(baseName, name);
    } else {
      const ext = path.extname(name);
      map.set(name.slice(0, -ext.length), name);
    }
  }
  return [...map.values()];
};

const filterGameDirs = (dirNames) => {
  return dirNames.filter((d) => !NON_GAME_DIRS.has(d.toLowerCase()));
};

export { scanDirectory, expandDirectory, deduplicateArchives, filterGameDirs };
```

- [ ] **步骤 2：验证模块可导入**

运行：`node -e "import('./server/scanner.js').then(m => console.log(Object.keys(m)))"`
预期：输出 `[ 'scanDirectory', 'expandDirectory', 'deduplicateArchives', 'filterGameDirs' ]`

- [ ] **步骤 3：Commit**

```bash
git add server/scanner.js
git commit -m "feat: extend scanner with archive recognition, dedup, and expand-scan"
```

---

### 任务 3：改造 `POST /games/scan` 和 `POST /games/scan/add`

**文件：**
- 修改：`server/routes/game.js`

- [ ] **步骤 1：更新 import 语句**

将第 3 行：
```javascript
import { scanDirectory } from '../scanner.js';
```
改为：
```javascript
import { scanDirectory, expandDirectory } from '../scanner.js';
```

- [ ] **步骤 2：改造 `POST /scan` 路由**

将 `router.post('/scan', ...)` 的回调函数体替换为：

```javascript
  try {
    const { libraryId } = req.body;
    if (!libraryId) {
      return res.status(400).send({ error: 'libraryId is required' });
    }
    const library = await db.knex('library').where({ id: libraryId }).first();
    if (!library) {
      return res.status(404).send({ error: 'Library not found' });
    }

    const { dirs, archives } = scanDirectory(library.path);
    const blacklist = await getBlacklist();
    const blacklistSet = new Set(blacklist);
    const filteredDirs = blacklist.length > 0
      ? dirs.filter((d) => !blacklistSet.has(d))
      : dirs;
    const filteredArchives = blacklist.length > 0
      ? archives.filter((a) => !blacklistSet.has(a))
      : archives;

    const existingGames = await db
      .knex('game')
      .where({ library_id: libraryId })
      .select('id', 'name', 'sub_path');
    const existingPaths = new Set(existingGames.map((g) => g.sub_path));

    const newDirs = filteredDirs.filter((d) => !existingPaths.has(d));
    const newArchives = filteredArchives.filter((a) => !existingPaths.has(a));

    const allNewEntries = [...newDirs, ...newArchives];
    const dirSet = new Set(filteredDirs);
    const archiveSet = new Set(filteredArchives);
    const allCurrentPaths = new Set([...dirSet, ...archiveSet]);
    const removedGames = existingGames.filter((g) => !allCurrentPaths.has(g.sub_path));

    res.send({
      allDirs: filteredDirs,
      archives: filteredArchives,
      newDirs: allNewEntries,
      removedGames,
    });
  } catch (err) {
    next(err);
  }
```

- [ ] **步骤 3：改造 `POST /scan/add` 路由**

将 `router.post('/scan/add', ...)` 的回调函数体替换为：

```javascript
  try {
    const { libraryId, dirs } = req.body;
    if (!libraryId || !Array.isArray(dirs)) {
      return res.status(400).send({ error: 'libraryId and dirs are required' });
    }

    const rows = dirs.map((d) => ({
      name: d,
      library_id: libraryId,
      sub_path: d,
    }));

    const inserted = [];
    if (rows.length > 0) {
      const BATCH_SIZE = 100;
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const ids = await db.knex('game').insert(rows.slice(i, i + BATCH_SIZE), ['id', 'name', 'sub_path']);
        inserted.push(...ids);
      }
    }

    res.status(201).send({ added: rows.length, games: inserted });
  } catch (err) {
    next(err);
  }
```

注意：`POST /scan/add` 的逻辑不变，因为 `sub_path` 已经是字符串字段，天然支持相对路径格式（如 `合集/游戏C`）。`name` 字段也已经是传入的字符串，压缩包文件名直接传入即可。

- [ ] **步骤 4：验证服务器启动**

运行：`node -e "import('./server/routes/game.js').then(() => console.log('OK'))"`
预期：输出 `OK`

- [ ] **步骤 5：Commit**

```bash
git add server/routes/game.js
git commit -m "feat: update scan API to include archives and support relative sub_path"
```

---

### 任务 4：新增 `POST /games/scan/expand` API

**文件：**
- 修改：`server/routes/game.js`

- [ ] **步骤 1：在 `POST /scan/add` 路由之后添加新路由**

在 `router.post('/scan/add', ...)` 之后、`export default router;` 之前添加：

```javascript
router.post('/scan/expand', async (req, res, next) => {
  try {
    const { libraryId, subPath } = req.body;
    if (!libraryId || !subPath) {
      return res.status(400).send({ error: 'libraryId and subPath are required' });
    }
    const library = await db.knex('library').where({ id: libraryId }).first();
    if (!library) {
      return res.status(404).send({ error: 'Library not found' });
    }

    const fullPath = path.join(library.path, subPath);
    if (!fs.existsSync(fullPath)) {
      return res.status(404).send({ error: 'Directory not found' });
    }

    const result = expandDirectory(fullPath);
    res.send(result);
  } catch (err) {
    next(err);
  }
});
```

- [ ] **步骤 2：在文件顶部添加缺失的 import**

确保 `server/routes/game.js` 顶部有：
```javascript
import path from 'node:path';
import fs from 'node:fs';
```

如果不存在则添加。

- [ ] **步骤 3：验证服务器启动**

运行：`node -e "import('./server/routes/game.js').then(() => console.log('OK'))"`
预期：输出 `OK`

- [ ] **步骤 4：Commit**

```bash
git add server/routes/game.js
git commit -m "feat: add POST /games/scan/expand API for manual expand-scan"
```

---

### 任务 5：扩展前端 `ScanRow` 类型与树形扁平化

**文件：**
- 修改：`src/components/ScannerDialog.vue`

- [ ] **步骤 1：扩展 `ScanRow` 接口**

在 `ScannerDialog.vue` 中，找到 `ScanRow` 接口定义（约第 407-417 行），替换为：

```typescript
interface ScanRow {
  gameId: number;
  name: string;
  subPath: string;
  status: 'pending' | 'searching' | 'searched' | 'adopted' | 'error' | 'stale';
  searchResult: SearchResult | null;
  adoptData: AdoptData | null;
  searchKeyword: string;
  source: SourceType | null;
  loading: boolean;
  children: ScanRow[];
  expanded: boolean;
  isArchive: boolean;
  depth: number;
  hasChildren: boolean | null;
}
```

- [ ] **步骤 2：添加树形扁平化辅助函数**

在 `<script setup>` 中，`sortedResults` computed 之前添加：

```typescript
const flattenTree = (rows: ScanRow[]): ScanRow[] => {
  const result: ScanRow[] = [];
  const walk = (list: ScanRow[]) => {
    for (const row of list) {
      result.push(row);
      if (row.expanded && row.children.length > 0) {
        walk(row.children);
      }
    }
  };
  walk(rows);
  return result;
};
```

- [ ] **步骤 3：改造 `sortedResults` computed**

将 `sortedResults` computed 替换为：

```typescript
const sortedResults = computed(() => {
  let list = flattenTree(scanResults.value);
  const kw = searchKeyword.value?.trim().toLowerCase();
  if (kw) {
    list = list.filter(
      (r) =>
        r.name.toLowerCase().includes(kw) ||
        r.subPath.toLowerCase().includes(kw) ||
        (r.searchResult?.name?.toLowerCase().includes(kw) ?? false),
    );
  }
  if (sortBy.value === 'none') return list;

  let sorted: ScanRow[];
  if (sortBy.value === 'name') {
    sorted = [...list].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }),
    );
  } else {
    const order = sortBy.value === 'status' ? statusOrder : actionOrder;
    sorted = [...list].sort((a, b) => order[a.status] - order[b.status]);
  }
  return sortOrder.value === 'desc' ? sorted.reverse() : sorted;
});
```

- [ ] **步骤 4：更新所有创建 ScanRow 的地方，添加新字段的默认值**

需要找到所有创建 `ScanRow` 对象的位置并添加新字段。搜索 `scanResults.value.push(` 和 `scanResults.value =` 中的对象字面量。

**位置 1：`loadUnscraped` 函数**（约第 527 行）

将：
```typescript
scanResults.value = res.data.map((g: { id: number; name: string; sub_path: string }) => ({
  name: g.name,
  subPath: g.sub_path,
  status: 'pending' as const,
  searchResult: null,
  adoptData: null,
  searchKeyword: g.name,
  source: null as SourceType | null,
  loading: false,
  gameId: g.id,
}));
```
改为：
```typescript
scanResults.value = res.data.map((g: { id: number; name: string; sub_path: string }) => ({
  name: g.name,
  subPath: g.sub_path,
  status: 'pending' as const,
  searchResult: null,
  adoptData: null,
  searchKeyword: g.name,
  source: null as SourceType | null,
  loading: false,
  gameId: g.id,
  children: [],
  expanded: false,
  isArchive: false,
  depth: 0,
  hasChildren: null,
}));
```

**位置 2：`scanDir` 函数中的 `scanResults.value.push(`**（约第 573 行）

将：
```typescript
scanResults.value.push({
  gameId: g.id,
  name: g.name,
  subPath: g.sub_path,
  status: 'pending',
  searchResult: null,
  adoptData: null,
  searchKeyword: g.name,
  source: null,
  loading: false,
});
```
改为：
```typescript
scanResults.value.push({
  gameId: g.id,
  name: g.name,
  subPath: g.sub_path,
  status: 'pending',
  searchResult: null,
  adoptData: null,
  searchKeyword: g.name,
  source: null,
  loading: false,
  children: [],
  expanded: false,
  isArchive: false,
  depth: 0,
  hasChildren: null,
});
```

- [ ] **步骤 5：更新 `hasPending`、`adoptedCount`、`staleCount` computed 使其递归遍历树**

将：
```typescript
const hasPending = computed(() =>
  scanResults.value.some((r) => r.status === 'pending' || r.status === 'error'),
);
const adoptedCount = computed(() => scanResults.value.filter((r) => r.status === 'adopted').length);
const staleCount = computed(() => scanResults.value.filter((r) => r.status === 'stale').length);
```
改为：
```typescript
const flattenAllRows = (rows: ScanRow[]): ScanRow[] => {
  const result: ScanRow[] = [];
  const walk = (list: ScanRow[]) => {
    for (const row of list) {
      result.push(row);
      if (row.children.length > 0) walk(row.children);
    }
  };
  walk(rows);
  return result;
};

const hasPending = computed(() =>
  flattenAllRows(scanResults.value).some((r) => r.status === 'pending' || r.status === 'error'),
);
const adoptedCount = computed(() => flattenAllRows(scanResults.value).filter((r) => r.status === 'adopted').length);
const staleCount = computed(() => flattenAllRows(scanResults.value).filter((r) => r.status === 'stale').length);
```

- [ ] **步骤 6：运行 typecheck**

运行：`npm run typecheck`
预期：无错误

- [ ] **步骤 7：Commit**

```bash
git add src/components/ScannerDialog.vue
git commit -m "feat: extend ScanRow type with tree fields and flatten tree for rendering"
```

---

### 任务 6：改造 `scanDir` 函数支持压缩包

**文件：**
- 修改：`src/components/ScannerDialog.vue`

- [ ] **步骤 1：改造 `scanDir` 函数**

将 `scanDir` 函数中处理扫描结果的逻辑替换。找到 `const newDirs: string[] = res.data.newDirs;` 这一行，将整个 `scanDir` 函数中的结果处理部分替换：

```typescript
const scanDir = async () => {
  if (!selectedLibrary.value) return;
  scanning.value = true;
  try {
    const res = await api.post('/games/scan', { libraryId: selectedLibrary.value });
    const newEntries: string[] = res.data.newDirs;
    const removedGames: { id: number; name: string; sub_path: string }[] =
      res.data.removedGames || [];

    const removedPaths = new Set(removedGames.map((g) => g.sub_path));
    for (const row of flattenAllRows(scanResults.value)) {
      if (removedPaths.has(row.subPath)) {
        row.status = 'stale';
      }
    }

    if (newEntries.length > 0) {
      const addRes = await api.post('/games/scan/add', {
        libraryId: selectedLibrary.value,
        dirs: newEntries,
      });
      const addedGames: { id: number; name: string; sub_path: string }[] = addRes.data.games || [];
      const existingPaths = new Set(flattenAllRows(scanResults.value).map((r) => r.subPath));
      for (const g of addedGames) {
        if (!existingPaths.has(g.sub_path)) {
          const isArchive = /\.(zip|7z|rar)$/i.test(g.name);
          const keyword = isArchive
            ? g.name.replace(/\.(7z\.\d+|part\d+\.rar|rar\.r\d+|zip|7z|rar)$/i, '')
            : g.name;
          const { keyword: splitKw, segments } = splitKeyword(keyword);
          segmentsCache.set(keyword, [splitKw, ...segments.filter((s) => s !== splitKw)]);
          scanResults.value.push({
            gameId: g.id,
            name: g.name,
            subPath: g.sub_path,
            status: 'pending',
            searchResult: null,
            adoptData: null,
            searchKeyword: keyword,
            source: null,
            loading: false,
            children: [],
            expanded: false,
            isArchive,
            depth: 0,
            hasChildren: null,
          });
        }
      }
      const newRows = flattenAllRows(scanResults.value).filter(
        (r) => addedGames.some((g) => g.id === r.gameId),
      );
      if (newRows.length > 0) {
        const keywords = newRows.map((r) => r.searchKeyword || r.name);
        try {
          const cacheRes = await api.post('/cache/search/preload', { keywords });
          const entries = cacheRes.data.entries || [];
          for (const entry of entries) {
            searchCache.set(entry.key, { source: entry.source, results: entry.results });
          }
        } catch {
          // preload failure is non-critical
        }
        const newGameIds = newRows.map((r) => r.gameId);
        try {
          const adoptRes = await api.get('/cache/adopt', { params: { gameIds: newGameIds.join(',') } });
          const entries: AdoptCacheEntry[] = adoptRes.data.entries || [];
          const adoptMap = new Map(entries.map((e): [number, AdoptCacheEntry] => [e.game_id, e]));
          for (const row of newRows) {
            const cached = adoptMap.get(row.gameId);
            if (cached) {
              row.source = cached.source_type as SourceType;
              row.searchResult = {
                id: cached.source_id,
                name: cached.name || row.name,
                makerName: '',
                coverUrl: cached.cover_url || '',
              };
              row.adoptData = {
                source: cached.source_type as SourceType,
                sourceId: cached.source_id,
                name: cached.name || row.name,
                makerName: '',
                coverUrl: cached.cover_url || '',
                detail: {
                  id: cached.source_id,
                  title: cached.name || row.name,
                  coverURL: cached.cover_url || '',
                  makers: cached.makers || [],
                  genres: cached.genres || [],
                  tags: cached.tags || [],
                  description: cached.description || '',
                },
              };
              row.status = 'adopted';
            }
          }
        } catch {
          // preload failure is non-critical
        }
      }
    }
  } finally {
    scanning.value = false;
  }
};
```

- [ ] **步骤 2：运行 typecheck**

运行：`npm run typecheck`
预期：无错误

- [ ] **步骤 3：Commit**

```bash
git add src/components/ScannerDialog.vue
git commit -m "feat: update scanDir to handle archives from scan API response"
```

---

### 任务 7：添加展开扫描交互

**文件：**
- 修改：`src/components/ScannerDialog.vue`

- [ ] **步骤 1：添加 `expandRow` 函数**

在 `scanDir` 函数之后添加：

```typescript
const expandRow = async (row: ScanRow) => {
  if (!selectedLibrary.value) return;
  if (row.expanded) {
    row.expanded = false;
    return;
  }

  if (row.children.length > 0) {
    row.expanded = true;
    return;
  }

  row.loading = true;
  try {
    const res = await api.post('/games/scan/expand', {
      libraryId: selectedLibrary.value,
      subPath: row.subPath,
    });
    const { dirs, archives, hasSubDirs } = res.data as {
      dirs: string[];
      archives: string[];
      hasSubDirs: Record<string, boolean>;
    };

    const newChildren: ScanRow[] = [];

    for (const dirName of dirs) {
      const { keyword, segments } = splitKeyword(dirName);
      segmentsCache.set(dirName, [keyword, ...segments.filter((s) => s !== keyword)]);
      newChildren.push({
        gameId: 0,
        name: dirName,
        subPath: `${row.subPath}/${dirName}`,
        status: 'pending',
        searchResult: null,
        adoptData: null,
        searchKeyword: dirName,
        source: null,
        loading: false,
        children: [],
        expanded: false,
        isArchive: false,
        depth: row.depth + 1,
        hasChildren: hasSubDirs[dirName] ?? null,
      });
    }

    for (const archiveName of archives) {
      const keyword = archiveName.replace(/\.(7z\.\d+|part\d+\.rar|rar\.r\d+|zip|7z|rar)$/i, '');
      const { keyword: splitKw, segments } = splitKeyword(keyword);
      segmentsCache.set(keyword, [splitKw, ...segments.filter((s) => s !== splitKw)]);
      newChildren.push({
        gameId: 0,
        name: archiveName,
        subPath: `${row.subPath}/${archiveName}`,
        status: 'pending',
        searchResult: null,
        adoptData: null,
        searchKeyword: keyword,
        source: null,
        loading: false,
        children: [],
        expanded: false,
        isArchive: true,
        depth: row.depth + 1,
        hasChildren: false,
      });
    }

    row.children = newChildren;
    row.expanded = true;
    row.hasChildren = newChildren.length > 0;
  } catch {
    // expand failure is non-critical
  } finally {
    row.loading = false;
  }
};
```

- [ ] **步骤 2：改造 `submitAdopted` 函数以支持树形提交**

将 `submitAdopted` 函数中的 `adoptedRows` 和 `staleRows` 提取逻辑改为递归遍历：

找到：
```typescript
const adoptedRows = scanResults.value.filter((r) => r.status === 'adopted' && r.adoptData);
const staleRows = scanResults.value.filter((r) => r.status === 'stale');
```

替换为：
```typescript
const allRows = flattenAllRows(scanResults.value);
const adoptedRows = allRows.filter((r) => r.status === 'adopted' && r.adoptData);
const staleRows = allRows.filter((r) => r.status === 'stale');
```

- [ ] **步骤 3：改造 `batchScrape` 函数以递归遍历树**

在 `batchScrape` 函数中，找到：
```typescript
const rows = [...scanResults.value].filter((r) => r.status === 'pending' || r.status === 'error');
```

替换为：
```typescript
const rows = [...flattenAllRows(scanResults.value)].filter((r) => r.status === 'pending' || r.status === 'error');
```

- [ ] **步骤 4：改造 `forceRefresh` 函数以递归遍历树**

在 `forceRefresh` 函数中，找到：
```typescript
const keys = scanResults.value.map((r) => `auto:${r.searchKeyword || r.name}`);
```

替换为：
```typescript
const keys = flattenAllRows(scanResults.value).map((r) => `auto:${r.searchKeyword || r.name}`);
```

以及找到：
```typescript
const allGameIds = scanResults.value.map((r) => r.gameId);
```

替换为：
```typescript
const allGameIds = flattenAllRows(scanResults.value).map((r) => r.gameId);
```

以及找到：
```typescript
for (const row of scanResults.value) {
```

替换为：
```typescript
for (const row of flattenAllRows(scanResults.value)) {
```

- [ ] **步骤 5：改造 `doSubmit` 中清理逻辑以递归遍历树**

在 `doSubmit` 函数中，找到：
```typescript
scanResults.value = scanResults.value.filter((r) => {
  if (r.status === 'stale') return false;
  if (r.status === 'adopted') return failedIds.has(r.gameId);
  return true;
});
```

替换为：
```typescript
const filterTree = (rows: ScanRow[]): ScanRow[] => {
  return rows
    .filter((r) => {
      if (r.status === 'stale') return false;
      if (r.status === 'adopted') return failedIds.has(r.gameId);
      return true;
    })
    .map((r) => ({ ...r, children: filterTree(r.children) }));
};
scanResults.value = filterTree(scanResults.value);
```

- [ ] **步骤 6：运行 typecheck**

运行：`npm run typecheck`
预期：无错误

- [ ] **步骤 7：Commit**

```bash
git add src/components/ScannerDialog.vue
git commit -m "feat: add expandRow function and update tree-aware submit/scrape/refresh"
```

---

### 任务 8：改造模板——树形渲染与展开按钮

**文件：**
- 修改：`src/components/ScannerDialog.vue`

- [ ] **步骤 1：在扫描行模板中添加缩进和展开按钮**

在 `<template v-slot="{ item: row }">` 内部的 `<div class="scan-row ...">` 上添加动态样式绑定：

找到：
```html
<div
  class="scan-row q-px-md"
  :class="{ 'scan-row--stale': row.status === 'stale', 'scan-row--compact': compact }"
>
```

替换为：
```html
<div
  class="scan-row q-px-md"
  :class="{ 'scan-row--stale': row.status === 'stale', 'scan-row--compact': compact }"
  :style="{ paddingLeft: `${16 + row.depth * 24}px` }"
>
```

- [ ] **步骤 2：在封面区域之前添加展开按钮和压缩包图标**

找到封面区域的开始：
```html
<div class="scan-row__cover">
```

在其前面添加展开按钮：

```html
<div class="scan-row__expand" v-if="row.depth > 0 || row.hasChildren !== false">
  <q-btn
    v-if="row.hasChildren === true || row.hasChildren === null"
    flat
    round
    dense
    size="sm"
    :icon="row.expanded ? 'expand_more' : 'chevron_right'"
    :loading="row.loading && !row.searchResult"
    @click="expandRow(row)"
  />
  <span v-else style="width: 28px; display: inline-block"></span>
</div>
```

- [ ] **步骤 3：将文件夹图标改为条件渲染**

找到：
```html
<q-icon name="folder" :size="compact ? '16px' : '48px'" color="grey" />
```

替换为：
```html
<q-icon :name="row.isArchive ? 'archive' : 'folder'" :size="compact ? '16px' : '48px'" color="grey" />
```

- [ ] **步骤 4：添加展开按钮的 CSS**

在 `<style scoped>` 中添加：

```css
.scan-row__expand {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  width: 28px;
}
```

- [ ] **步骤 5：运行 typecheck**

运行：`npm run typecheck`
预期：无错误

- [ ] **步骤 6：Commit**

```bash
git add src/components/ScannerDialog.vue
git commit -m "feat: add tree rendering with expand button and archive icon in scan results"
```

---

### 任务 9：处理展开扫描结果的入库

**文件：**
- 修改：`src/components/ScannerDialog.vue`

- [ ] **步骤 1：改造 `submitAdopted` 函数，在提交前先将展开扫描结果入库**

在 `submitAdopted` 函数中，`const adoptedRows = ...` 之前添加：

```typescript
const expandRows = flattenAllRows(scanResults.value).filter(
  (r) => r.gameId === 0 && (r.status === 'adopted' || r.status === 'searched' || r.status === 'pending'),
);
if (expandRows.length > 0) {
  const addRes = await api.post('/games/scan/add', {
    libraryId: selectedLibrary.value,
    dirs: expandRows.map((r) => r.subPath),
  });
  const addedGames: { id: number; name: string; sub_path: string }[] = addRes.data.games || [];
  const gameMap = new Map(addedGames.map((g): [string, number] => [g.sub_path, g.id]));
  for (const row of expandRows) {
    const newId = gameMap.get(row.subPath);
    if (newId) row.gameId = newId;
  }
}
```

注意：这需要在 `submitAdopted` 的 try 块内，在 `adoptedRows` 提取之前执行。需要将 `submitting.value = true` 后的逻辑调整为先入库再提交。

完整的 `submitAdopted` 函数替换为：

```typescript
const submitAdopted = async () => {
  submitting.value = true;
  try {
    const expandRows = flattenAllRows(scanResults.value).filter(
      (r) => r.gameId === 0 && (r.status === 'adopted' || r.status === 'searched' || r.status === 'pending'),
    );
    if (expandRows.length > 0) {
      const addRes = await api.post('/games/scan/add', {
        libraryId: selectedLibrary.value,
        dirs: expandRows.map((r) => r.subPath),
      });
      const addedGames: { id: number; name: string; sub_path: string }[] = addRes.data.games || [];
      const gameMap = new Map(addedGames.map((g): [string, number] => [g.sub_path, g.id]));
      for (const row of expandRows) {
        const newId = gameMap.get(row.subPath);
        if (newId) row.gameId = newId;
      }
    }

    const allRows = flattenAllRows(scanResults.value);
    const adoptedRows = allRows.filter((r) => r.status === 'adopted' && r.adoptData);
    const staleRows = allRows.filter((r) => r.status === 'stale');

    if (adoptedRows.length > 0) {
      const games: SubmitGame[] = adoptedRows.map((row) => {
        const d = row.adoptData!;
        const source: SourceType = (d.source && d.source !== ('auto' as string)) ? d.source : 'dlsite';
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
        };
      });

      const sources = games.map((g) => ({
        gameId: g.gameId,
        sourceType: g.sourceType,
        sourceId: g.sourceId,
        name: g.name,
      }));
      try {
        const conflictRes = await api.post('/games/check-conflicts', { sources });
        if (conflictRes.data.length > 0) {
          conflictData.value = conflictRes.data;
          pendingSubmitData.value = { games, staleRows };
          showConflictDialog.value = true;
          return;
        }
      } catch {
        // conflict check failure is non-critical, proceed with submission
      }

      await doSubmit(games, staleRows);
    } else {
      await doSubmit([], staleRows);
    }
  } finally {
    submitting.value = false;
  }
};
```

- [ ] **步骤 2：运行 typecheck**

运行：`npm run typecheck`
预期：无错误

- [ ] **步骤 3：Commit**

```bash
git add src/components/ScannerDialog.vue
git commit -m "feat: persist expand-scan results to DB before submit"
```

---

### 任务 10：端到端验证

**文件：**
- 无文件修改

- [ ] **步骤 1：启动开发服务器**

运行：`npm run dev`

- [ ] **步骤 2：验证根级扫描**

1. 打开 ScannerDialog
2. 选择一个库
3. 点击 Scan
4. 预期：扫描结果包含目录和压缩包，压缩包显示 archive 图标

- [ ] **步骤 3：验证展开扫描**

1. 找到一个有子目录的目录行
2. 点击展开按钮
3. 预期：子目录以缩进形式出现，非游戏目录被自动过滤

- [ ] **步骤 4：验证压缩包分包去重**

1. 在包含分卷压缩包（如 `.7z.001`, `.7z.002`）的目录中扫描
2. 预期：分卷只显示一条记录

- [ ] **步骤 5：验证提交**

1. 对展开扫描的结果进行 Scrape 和 Adopt
2. 点击 Submit
3. 预期：展开扫描的结果正确入库，`sub_path` 为相对路径格式

- [ ] **步骤 6：运行 lint**

运行：`npm run lint`
预期：无错误

- [ ] **步骤 7：运行 typecheck**

运行：`npm run typecheck`
预期：无错误

- [ ] **步骤 8：Final commit**

```bash
git add -A
git commit -m "feat: complete multi-level scan and archive recognition feature"
```