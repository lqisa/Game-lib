# Steam 数据源集成实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 为 game-lib 新增 Steam 作为第四个数据源，支持搜索、详情获取、Tags、多语言 Fallback 和缓存

**架构：** 新建 `server/scraper/steam.js` 封装 Steam Storefront API，修改 `server/routes/scraper.js` 添加路由和更新自动搜索策略，完全遵循现有 DLSite/VNDB/Bangumi 的接口模式

**技术栈：** Express.js, Knex.js, axios (retryGet), cheerio (HTML 清理)

---

## 文件结构

```
server/
├── scraper/
│   ├── steam.js          # 🆕 新建 - Steam API 封装
│   ├── dlsite.js         # 参考模板
│   ├── vndb.js           # 参考模板
│   └── axios.js          # 复用 retryGet
└── routes/
    └── scraper.js        # 📝 修改 - 新增路由 + 更新 auto/search
```

### 文件职责

| 文件 | 职责 |
|------|------|
| `steam.js` | Steam API 调用、数据标准化、多语言 Fallback、缓存逻辑 |
| `scraper.js` | HTTP 路由端点、自动搜索策略调度 |

---

### 任务 1：创建 Steam Scraper 核心模块

**文件：**
- 创建：`server/scraper/steam.js`
- 参考：`server/scraper/vndb.js`, `server/scraper/dlsite.js`

- [ ] **步骤 1：创建文件并导入依赖**

```javascript
import axios from 'axios';
import { load } from 'cheerio';
import * as db from '../database/db.js';
import { retryGet } from './axios.js';

const STEAM_SEARCH_API = 'https://store.steampowered.com/api/storesearch/';
const STEAM_DETAIL_API = 'https://store.steampowered.com/api/appdetails';
const STEAM_LOCALE_CN = { cc: 'cn', l: 'schinese' };
const STEAM_LOCALE_EN = { cc: 'us', l: 'english' };
```

- [ ] **步骤 2：实现 searchSteam 函数**

```javascript
const searchSteam = async (keyword) => {
  const cacheKey = `steam:${keyword}`;

  // 1. 尝试从缓存读取
  const cached = await db.getSearchCache(cacheKey);
  if (cached && cached.results.length > 0) {
    return cached.results;
  }

  // 2. 缓存未命中，请求 Steam API
  const url = `${STEAM_SEARCH_API}?term=${encodeURIComponent(keyword)}&cc=${STEAM_LOCALE_CN.cc}&l=${STEAM_LOCALE_CN.l}`;
  let response;
  try {
    response = await retryGet(url);
  } catch (err) {
    console.error('steam search failed:', err.message);
    return [];
  }

  const items = response.data?.items || [];
  const results = items
    .map((item) => ({
      id: String(item.id),
      name: item.name || '',
      makerName: item.developer?.[0] || '',
      coverUrl: item.header_image || '',
    }))
    .filter((r) => r.id && r.name);

  // 3. 写入缓存（仅在有结果时）
  if (results.length > 0) {
    try {
      await db.setSearchCache({
        key: cacheKey,
        source: 'steam',
        keyword,
        results,
      });
    } catch (err) {
      console.error('steam search cache write failed:', err.message);
    }
  }

  return results;
};
```

- [ ] **步骤 3：实现 fetchWithLocale 辅助函数**

```javascript
const fetchWithLocale = async (appId, locale) => {
  const url = `${STEAM_DETAIL_API}?appids=${appId}&cc=${locale.cc}&l=${locale.l}`;
  let response;
  try {
    response = await retryGet(url);
  } catch (err) {
    console.error(`steam detail failed (${locale.l}):`, err.message);
    return null;
  }

  const data = response.data?.[appId];
  if (!data?.success) return null;

  const appData = data.data;
  if (!appData) return null;

  return {
    id: appId,
    title: appData.name || '',
    coverURL: appData.header_image || '',
    makers: Array.isArray(appData.developers)
      ? [...new Set(appData.developers)] // 去重
      : [],
    genres: Array.isArray(appData.genres)
      ? appData.genres.map((g) => g.description).filter(Boolean)
      : [],
    tags: Array.isArray(appData.tags)
      ? appData.tags.map((t) => t.name).filter(Boolean)
      : [],
    description: stripHtmlTags(appData.short_description || ''),
  };
};
```

- [ ] **步骤 4：实现 HTML 标签清理工具函数**

```javascript
const stripHtmlTags = (html) => {
  if (!html) return '';
  try {
    const $ = load(html);
    return $.text().trim();
  } catch {
    return html.replace(/<[^>]+>/g, '').trim();
  }
};
```

- [ ] **步骤 5：实现 fetchSteamDetail 函数（含多语言 Fallback）**

```javascript
const fetchSteamDetail = async (appId) => {
  // 优先尝试简体中文
  let detail = await fetchWithLocale(appId, STEAM_LOCALE_CN);

  // 中文缺失时 fallback 到英文
  if (
    !detail ||
    !detail.title ||
    detail.title === appId ||
    detail.title.match(/^\d+$/) // 纯数字 AppID 说明无中文名称
  ) {
    detail = await fetchWithLocale(appId, STEAM_LOCALE_EN);
  }

  return detail;
};
```

- [ ] **步骤 6：导出函数**

```javascript
export { searchSteam, fetchSteamDetail };
```

- [ ] **步骤 7：验证代码语法**

运行：`node --check server/scraper/steam.js`
预期：无语法错误输出

- [ ] **步骤 8：Commit**

```bash
git add server/scraper/steam.js
git commit -m "feat(steam): add Steam scraper with search, detail, fallback and cache"
```

---

### 任务 2：添加 Steam 路由端点

**文件：**
- 修改：`server/routes/scraper.js`
- 参考：现有 `/dlsite/search`, `/vndb/fetch` 等路由模式

- [ ] **步骤 1：在文件顶部添加 import**

在 [scraper.js#L5](file:///d:/work/game-lib/server/routes/scraper.js#L5) 之后添加：

```javascript
import { searchSteam, fetchSteamDetail } from '../scraper/steam.js';
```

- [ ] **步骤 2：添加 /steam/search 路由**

在 [scraper.js#L100](file:///d:/work/game-lib/server/routes/scraper.js#L100) （/vndb/search 之后）插入：

```javascript
router.post('/steam/search', async (req, res, next) => {
  try {
    const { keyword } = req.body;
    if (!keyword) {
      return res.status(400).send({ error: 'keyword is required' });
    }
    const results = await searchSteam(keyword);
    res.send({ results });
  } catch (err) {
    next(err);
  }
});
```

- [ ] **步骤 3：添加 /steam/fetch 路由**

紧接着上一步之后插入：

```javascript
router.post('/steam/fetch', async (req, res, next) => {
  try {
    const { id } = req.body;
    if (!id) {
      return res.status(400).send({ error: 'id is required' });
    }
    const detail = await fetchSteamDetail(id);
    if (!detail) {
      return res.status(404).send({ error: 'detail not found' });
    }
    res.send(detail);
  } catch (err) {
    next(err);
  }
});
```

- [ ] **步骤 4：验证路由注册**

运行：`node -e "import('./server/routes/scraper.js').then(m => console.log('routes loaded'))"`
预期：输出 "routes loaded" 无报错

- [ ] **步骤 5：Commit**

```bash
git add server/routes/scraper.js
git commit -m "feat(scraper): add Steam search and fetch routes"
```

---

### 任务 3：更新自动搜索策略

**文件：**
- 修改：`server/routes/scraper.js` (auto/search 路由)

- [ ] **步骤 1：定位 auto/search 路由**

找到 [scraper.js#L150-L180](file:///d:/work/game-lib/server/routes/scraper.js#L150-L180) 区域的 `router.post('/auto/search')` 处理函数

- [ ] **步骤 2：更新 sources 数组定义**

将现有的 sources 逻辑：

```javascript
const sources = hasRJ
  ? ['dlsite', 'bangumi', 'vndb']
  : isMostlyEnglish
    ? ['vndb', 'bangumi', 'dlsite']
    : ['bangumi', 'dlsite', 'vndb'];
```

替换为：

```javascript
let sources;
if (hasRJ) {
  sources = ['dlsite', 'bangumi', 'vndb', 'steam'];
} else if (isMostlyEnglish) {
  sources = ['steam', 'vndb', 'bangumi', 'dlsite']; // 英文游戏 Steam 优先
} else {
  sources = ['bangumi', 'dlsite', 'vndb', 'steam'];
}
```

- [ ] **步骤 3：在 for 循环中添加 steam 分支**

在现有的 `if (source === 'vndb')` 分支之后添加：

```javascript
if (source === 'steam') {
  results = await searchSteam(keyword);
}
```

- [ ] **步骤 4：测试 auto/search 逻辑**

手动验证：
- 英文关键词（如 "Portal"）应先调用 searchSteam
- RJ 码关键词应仍优先 DLSite
- 中文关键词应保持原有顺序，steam 在最后

- [ ] **步骤 5：Commit**

```bash
git add server/routes/scraper.js
git commit -m "feat(scraper): update auto-search strategy to include Steam datasource"
```

---

### 任务 4：端到端集成测试

**文件：**
- 测试：手动验证所有功能路径

- [ ] **步骤 1：启动开发服务器**

运行：`cd server && node dev.js` 或项目对应的启动命令
预期：服务器正常启动，监听端口

- [ ] **步骤 2：测试 Steam 搜索接口**

```bash
curl -X POST http://localhost:<port>/scraper/steam/search \
  -H "Content-Type: application/json" \
  -d '{"keyword": "Portal"}'
```

预期响应：
```json
{
  "results": [
    {
      "id": "620",
      "name": "Portal",
      "makerName": "Valve",
      "coverUrl": "https://cdn.akamai.steamstatic.com/..."
    }
  ]
}
```

- [ ] **步骤 3：测试 Steam 详情接口**

```bash
curl -X POST http://localhost:<port>/scraper/steam/fetch \
  -H "Content-Type: application/json" \
  -d '{"id": "620"}'
```

预期响应：
```json
{
  "id": "620",
  "title": "Portal",
  "coverURL": "https://cdn.akamai.steamstatic.com/...",
  "makers": ["Valve"],
  "genres": ["Action", "Indie", "Puzzle"],
  "tags": ["Puzzle", "Physics"],
  description: "..."
}
```

- [ ] **步骤 4：测试自动搜索（英文游戏）**

```bash
curl -X POST http://localhost:<port>/scraper/auto/search \
  -H "Content-Type: application/json" \
  -d '{"keyword": "Hades"}'
```

预期：`source` 字段应为 `"steam"` 或返回 Steam 结果

- [ ] **步骤 5：测试自动搜索（中文游戏）**

```bash
curl -X POST http://localhost:<port>/scraper/auto/search \
  -H "Content-Type: application/json" \
  -d '{"keyword": "某中文游戏名"}'
```

预期：source 应为 bangumi/dlsite/vndb 之一，steam 作为最后备选

- [ ] **步骤 6：测试缓存功能**

重复执行步骤 2，第二次调用应该更快（命中缓存）

- [ ] **步骤 7：测试多语言 Fallback**

尝试一个已知没有中文信息的 AppID，验证是否返回英文信息

- [ ] **步骤 8：记录测试结果**

将所有测试用例的输入/实际输出/预期输出记录到文档或注释中

- [ ] **步骤 9：最终 Commit（如有修复）**

```bash
git add -A
git commit -m "test(steam): verify integration and fix issues"
```

---

## 自检清单

### 规格覆盖度 ✅

- [x] Steam Storefront API 集成 → 任务 1 步骤 2, 3
- [x] 路由端点 (/steam/search, /steam/fetch) → 任务 2
- [x] 自动搜索策略更新 → 任务 3
- [x] Steam Tags 支持 → 任务 1 步骤 3 (tags 字段提取)
- [x] 多语言 Fallback → 任务 1 步骤 5
- [x] 搜索缓存持久化 → 任务 1 步骤 2 (缓存读写)
- [x] 错误处理 → 所有 try/catch 块
- [x] 数据清洗 (HTML 标签) → 任务 1 步骤 4

### 占位符扫描 ✅

- [x] 无 TODO/待定项
- [x] 无模糊描述（如"适当的错误处理"）
- [x] 所有代码块完整可执行
- [x] 所有文件路径精确
- [x] 所有命令和预期输出明确

### 类型一致性 ✅

- [x] `searchSteam()` 返回格式与 `searchDLSite()` 一致：`{ id, name, makerName, coverUrl }[]`
- [x] `fetchSteamDetail()` 返回格式与 `fetchDLSiteDetail()` 一致：`{ id, title, coverURL, makers[], genres[], tags[], description }`
- [x] 路由请求体格式一致：`{ keyword }` / `{ id }`
- [x] 缓存 key 格式统一：`steam:{keyword}`
- [x] source_type 统一使用字符串 `'steam'`

---

## 执行说明

### 前置条件

1. Node.js 环境已配置
2. 项目依赖已安装 (`npm install`)
3. 开发数据库可访问
4. 网络连接正常（需要访问 store.steampowered.com）

### 依赖关系

```
任务 1 (核心模块) 
   ↓ 必须先完成
任务 2 (路由端点)
   ↓ 可并行
任务 3 (搜索策略) 
   ↓ 全部完成后
任务 4 (集成测试)
```

### 预估时间

- 任务 1：15 分钟（核心逻辑）
- 任务 2：10 分钟（路由层）
- 任务 3：5 分钟（策略调整）
- 任务 4：20 分钟（测试验证）
- **总计：~50 分钟**

### 回滚策略

每个任务都有独立 commit，如遇问题可通过 `git revert <commit-hash>` 回滚到任意节点。

---

## 成功标准

✅ `POST /scraper/steam/search` 返回标准化的搜索结果  
✅ `POST /scraper/steam/fetch` 返回完整的游戏详情  
✅ 自动搜索对英文游戏优先使用 Steam  
✅ 多语言 Fallback 正常工作（中文缺失时切换英文）  
✅ 搜索结果被正确缓存到 `search_cache` 表  
✅ Steam Tags 被提取并写入 `game_tag` 表（通过 adopt 流程）  
✅ 所有错误情况有适当处理（网络失败、无效 ID 等）