# Steam 数据源集成设计

## 概述

为 game-lib 新增 Steam 作为第四个数据源，解决现有三个平台（DLSite、VNDB、Bangumi）覆盖不到的游戏元数据获取问题。

## 背景

- 用户部分游戏在 DLSite/VNDB/Bangumi 均无法搜索到
- Steam 拥有最全的英文游戏库和国际游戏数据
- 参考 Playnite 的成功实践：使用 Steam Storefront 公开 API（无需 API Key）

## 技术选型

### API 选择：Steam Storefront API（公开接口）

**端点**：
- 搜索：`https://store.steampowered.com/api/storesearch/?term={keyword}&cc=cn&l=schinese`
- 详情：`https://store.steampowered.com/api/appdetails?appids={appId}&cc=cn&l=schinese`

**优势**：
- ✅ 零配置（无需 API Key）
- ✅ 官方维护，稳定可靠
- ✅ 返回标准 JSON，易于集成
- ✅ 中文支持（`cc=cn&l=schinese`）

**限制**：
- 速率限制约 20 请求/分钟（个人使用足够）

## 架构设计

### 文件结构

```
server/
├── scraper/
│   ├── dlsite.js      # 已有
│   ├── vndb.js        # 已有
│   ├── bangumi.js     # 已有
│   └── steam.js       # 🆕 新增
└── routes/
    └── scraper.js     # 📝 修改：新增路由 + 更新 auto/search
```

### 接口规范

#### steam.js 导出函数

```javascript
export { searchSteam, fetchSteamDetail }
```

**searchSteam(keyword)** → `Promise<Array<{ id, name, makerName, coverUrl }>>`

- 参数：游戏名称关键词
- 返回：匹配结果列表（最多 ~10 条）
- 字段映射：
  - `id`: String(AppID) - Steam 应用 ID
  - `name`: 游戏名称
  - `makerName`: 开发商（取第一个）
  - `coverUrl`: 封面图片 URL

**fetchSteamDetail(appId)** → `Promise<Object | null>`

- 参数：Steam AppID
- 返回：标准化详情对象或 null
- 标准格式（与 DLSite/VNDB/Bangumi 一致）：

```javascript
{
  id: String,           // AppID
  title: String,        // 游戏标题
  coverURL: String,     // 封面 URL
  makers: Array<String>,// 开发商列表
  genres: Array<String>,// 类型标签
  tags: Array<String>,  // 标签（暂空，Steam tags 需额外接口）
  description: String   // 游戏描述
}
```

### 路由集成

#### 新增端点（scraper.js）

| 方法 | 路径 | 功能 |
|------|------|------|
| POST | `/scraper/steam/search` | 搜索 Steam 游戏 |
| POST | `/scraper/steam/fetch` | 获取 Steam 游戏详情 |

**请求/响应格式**：

**搜索**：
```json
POST /scraper/steam/search
Body: { "keyword": "Portal" }
Response: { "results": [{ "id": "570", "name": "DOTA 2", ... }] }
```

**详情**：
```json
POST /scraper/steam/fetch
Body: { "id": "620" }  // AppID
Response: { "id": "620", "title": "Portal", "makers": ["Valve"], ... }
```

### 自动搜索策略更新

修改 `/scraper/auto/search` 的数据源优先级逻辑：

**当前逻辑（3 个数据源）**：
```
hasRJ?        → [dlsite, bangumi, vndb]
isMostlyEnglish? → [vndb, bangumi, dlsite]
默认          → [bangumi, dlsite, vndb]
```

**新逻辑（4 个数据源）**：
```
hasRJ?        → [dlsite, bangumi, vndb, steam]
isMostlyEnglish? → [steam, vndb, bangumi, dlsite]  // 🔥 Steam 提升至第一
默认          → [bangumi, dlsite, vndb, steam]
```

**策略说明**：
- **英文游戏优先 Steam**：解决用户核心痛点（国际游戏覆盖不全）
- **中文/日文保持不变**：不影响现有行为
- **RJ 码仍优先 DLSite**：明确标识不改变

### Adopt 流程兼容性

✅ **完全兼容** - 无需任何修改

原因：
1. `game_source` 表使用 `source_type: 'steam'` 存储来源
2. Adopt 依赖标准化返回格式（已满足）
3. 批量 adopt/batch 同样适用

## 数据流示例

### 场景：搜索英文游戏 "Hades"

```
用户输入: "Hades"
↓
auto/search 检测: isMostlyEnglish = true
↓
搜索顺序:
  1. searchSteam("Hades") → ✅ 找到 [{ id: "1145360", name: "Hades", ... }]
  ↓
返回: { source: "steam", results: [...] }
↓
用户选择结果 → 点击 adopt
↓
fetchSteamDetail("1145360") → 获取完整元数据
↓
adopt 流程写入 game_source (source_type='steam', source_id='1145360')
✅ 完成
```

## 实现要点

### 错误处理

- 复用现有 `retryGet()` 机制（来自 `scraper/axios.js`）
- Steam API 返回 `{ appId: { success: false } }` 时返回 null
- 网络超时/失败自动重试

### 数据清洗

- **AppID 统一转为字符串**：确保与现有系统一致
- **开发商去重**：`data.developers` 可能重复，需 Set 处理
- **封面 URL 补全**：Steam 返回完整 HTTPS URL，无需处理
- **HTML 标签清理**：`detailed_description` 包含 HTML，需提取纯文本

### 性能考虑

- **搜索缓存**：可复用现有 `search_cache` 表（可选优化）
- **并发控制**：遵循现有 pLimit 模式（如批量 adopt 时）
- **速率限制**：单次搜索 <100ms，自动搜索链路总耗时可控

## 测试计划

### 单元测试

1. **searchSteam()**
   - 正常关键词返回结果
   - 特殊字符编码处理
   - 空结果处理
   - 网络错误重试

2. **fetchSteamDetail()**
   - 有效 AppID 返回完整数据
   - 无效 AppID 返回 null
   - 字段映射正确性
   - HTML 清理验证

### 集成测试

3. **路由测试**
   - POST `/steam/search` 接口响应
   - POST `/steam/fetch` 接口响应
   - 错误码返回（400/404/500）

4. **自动搜索流程**
   - 英文关键词命中 Steam
   - 中文关键词走原有路径
   - RJ 码不受影响

### 手动验证

5. **真实场景**
   - 搜索已知 Steam 游戏（Portal、Hades 等）
   - Adopt 到本地库
   - 验证封面、描述、标签显示正确

## 扩展功能（本次实现）

### 1. Steam Tags 支持

**接口**：Steam AppDetails 已返回 tags 数据，无需额外调用

```javascript
// fetchSteamDetail 返回的 tags 字段
tags: data.data.tags?.map(tag => tag.name) || []
// 示例: ["Action", "RPG", "Indie", "Difficult"]
```

**实现方式**：
- 从 `appdetails` 响应的 `data.tags` 字段提取
- 映射到标准格式的 `tags: Array<String>`
- 写入 `game_tag` 表（通过现有 adopt 流程）

### 2. 多语言 Fallback 策略

**问题**：部分游戏无中文描述/名称

**解决方案**：自动 fallback 链路

```javascript
const fetchSteamDetail = async (appId) => {
  // 优先尝试简体中文
  let detail = await fetchWithLocale(appId, 'cn', 'schinese');
  
  // 中文缺失时 fallback 到英文
  if (!detail || !detail.title || detail.title === appId) {
    detail = await fetchWithLocale(appId, 'us', 'english');
  }
  
  return detail;
};

const fetchWithLocale = async (appId, cc, l) => {
  const url = `https://store.steampowered.com/api/appdetails?appids=${appId}&cc=${cc}&l=${l}`;
  const response = await retryGet(url);
  const data = response.data[appId];
  
  if (!data?.success) return null;
  
  return {
    id: appId,
    title: data.data.name,
    // ... 其他字段
  };
};
```

**Fallback 触发条件**：
- `title` 为空或等于 AppID（纯数字）
- `short_description` 为空或极短
- `developers` 为空

### 3. 搜索缓存持久化

**目标**：避免重复请求相同关键词，提升响应速度

**实现方案**：复用现有 `search_cache` 表结构（与 DLSite/VNDB/Bangumi 完全一致）

```javascript
// 在 searchSteam 中加入缓存逻辑
const searchSteam = async (keyword) => {
  const cacheKey = `steam:${keyword}`;

  // 1. 尝试从缓存读取（无过期检查，与其他数据源一致）
  const cached = await db.getSearchCache(cacheKey);
  if (cached) {
    return cached.results; // 已解析为对象数组
  }

  // 2. 缓存未命中，请求 API
  const results = await fetchFromSteamAPI(keyword);

  // 3. 写入缓存（永久有效，支持手动清理）
  if (results.length > 0) {
    await db.setSearchCache({
      key: cacheKey,
      source: 'steam',
      keyword,
      results
    });
  }

  return results;
};
```

**缓存策略**：
- **Key 格式**：`steam:{keyword}`（与 dlsite/bangumi/vndb 区分）
- **过期机制**：永久有效（与 DLSite/VNDB/Bangumi 一致）
- **失效方式**：通过 `/cache/search` DELETE 接口手动清理
- **存储复用**：使用现有 `search_cache` 表和 `setSearchCache()` 方法

## 后续优化（不在本次范围）

- [x] ~~Steam Tags 支持~~ ✅ 已纳入本次
- [x] ~~多语言 fallback~~ ✅ 已纳入本次
- [x] ~~搜索缓存持久化~~ ✅ 已纳入本次
- [ ] Steam 库目录扫描导入（非元数据补充场景）

## 变更清单

| 操作 | 文件 | 改动量 | 说明 |
|------|------|--------|------|
| **新建** | `server/scraper/steam.js` | ~140 行 | 核心 API + Tags + Fallback + 缓存逻辑 |
| **修改** | `server/routes/scraper.js` | +25 行 | +2 路由 + 更新 auto/search 策略 |

**总计**：1 个新文件 + 1 个文件微调

> 注：缓存功能复用现有 `db.getSearchCache()` / `db.setSearchCache()` 接口，无需修改 `db.js`