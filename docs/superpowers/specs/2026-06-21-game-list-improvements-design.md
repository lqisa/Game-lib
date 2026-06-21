# 游戏列表页改进设计

## 一、筛选弹窗（FilterDialog）

### 入口
搜索栏区域新增"筛选"按钮（漏斗图标 `filter_list`），点击弹出筛选弹窗。按钮旁显示当前生效筛选条件数量的 badge。

### 弹窗结构
使用 Quasar QDialog，内部用 QExpansionPanel 实现可展开的筛选维度（懒加载）：

- **游戏库（Library）**：多选 checkbox 列表，展开时从 `GET /libraries` 加载
- **制作者（Maker）**：多选 checkbox 列表 + 搜索框过滤，展开时从 `GET /makers` 加载
- **类型（Genre）**：多选 checkbox 列表，展开时从 `GET /genres` 加载
- **标签（Tag）**：多选 checkbox 列表 + 搜索框过滤，展开时从 `GET /tags` 加载
- **爬取状态**：单选（全部 / 已爬取 / 未爬取），默认"全部"

### 交互
- 确认后筛选：选好条件后点"应用"按钮，弹窗关闭，列表刷新
- 搜索栏筛选按钮上的 badge 显示生效条件数量
- 弹窗内有"重置"按钮清空所有条件
- 筛选条件变更后分页重置到第 1 页

### 前端数据结构
```typescript
interface FilterState {
  libraryIds: number[]
  makerIds: number[]
  genreIds: number[]
  tagIds: number[]
  scraped: 'all' | 'yes' | 'no'
}
```

### 后端变更

**新增接口：**
- `GET /makers` — 返回所有 maker（id, name）
- `GET /genres` — 返回所有 genre（id, name）
- `GET /tags` — 返回所有 tag（id, name）

**修改接口：**
- `GET /games` 新增查询参数：
  - `libraryIds` — 逗号分隔的 ID 列表
  - `makerIds` — 逗号分隔的 ID 列表
  - `genreIds` — 逗号分隔的 ID 列表
  - `tagIds` — 逗号分隔的 ID 列表
  - `scraped` — `true`/`false`，不传则不过滤

**修改 `getGames` 方法：**
- `libraryIds`：`WHERE game.library_id IN (...)`
- `makerIds`：`JOIN game_maker` + `WHERE game_maker.maker_id IN (...)`
- `genreIds`：`JOIN game_genre` + `WHERE game_genre.genre_id IN (...)`
- `tagIds`：`JOIN game_tag` + `WHERE game_tag.tag_id IN (...)`
- `scraped=true`：`JOIN game_source`（EXISTS 子查询）
- `scraped=false`：`LEFT JOIN game_source WHERE game_source.id IS NULL`

### 涉及文件
- 新建：`src/components/FilterDialog.vue`
- 修改：`src/pages/GameLibPage.vue` — 引入 FilterDialog，传递筛选参数
- 修改：`server/routes/game.js` — 新增接口，修改 GET /games
- 修改：`server/database/db.js` — 修改 getGames，新增 getMakers/getGenres/getTags

---

## 二、空白封面占位图标

### 问题
`GameCard.vue` 中 `cover_path` 为 null 时，`coverSrc` 返回空字符串。`q-img` 组件空 src 不触发 error slot，导致卡片封面区域一片空白。

### 方案
当 `cover_path` 为 null 时，不渲染 `q-img`，改为直接渲染占位 div：

```html
<q-img v-if="game.cover_path" :src="coverSrc" :ratio="16/9" class="game-cover">
  <template v-slot:error>...</template>
  <!-- 选中勾选图标 -->
</q-img>
<div v-else class="game-cover game-cover--placeholder flex flex-center bg-grey-4 text-grey-6">
  <q-icon name="videogame_asset" size="48px" />
  <!-- 选中勾选图标 -->
</div>
```

占位 div 样式与 error slot 一致：灰色背景 + 游戏手柄图标。选中状态的勾选图标在两种情况下都要显示。

### 涉及文件
- 修改：`src/components/GameCard.vue`

---

## 三、搜索栏固定顶部

### 方案
将操作栏（搜索框 + 筛选按钮 + Scan & Scrape + Select 等）从页面内容流中提取出来，设为 `position: sticky; top: 0; z-index: 100;`，加上白色背景和底部阴影。

```css
.toolbar-sticky {
  position: sticky;
  top: 0;
  z-index: 100;
  background: white;
  box-shadow: 0 2px 4px rgba(0,0,0,0.08);
}
```

注意：sticky 定位要求父容器没有 `overflow: hidden`，且 `q-page` 需要允许滚动。当前 `q-page` 默认行为满足此条件。

### 涉及文件
- 修改：`src/pages/GameLibPage.vue`

---

## 四、ScrapeDialog Adopt 按钮移至底部 Action 栏

### 当前问题
Adopt 按钮在右侧详情区底部（`<div class="row justify-end q-mt-md">`），当详情内容较长时被挤到视口外，用户需要滚动才能看到。

### 方案
1. 将 Adopt 按钮从右侧详情区移出
2. 在 `q-card` 底部新增 `q-card-actions` 区域，`align="right"`
3. 底部 Action 栏只放 Adopt 按钮，关闭仍用右上角 ✕
4. 右侧详情区只展示信息，不再有操作按钮
5. 选中状态的勾选图标在两种情况下都要显示

```html
<q-card style="min-width:800px;max-width:1000px;max-height:80vh;display:flex;flex-direction:column;">
  <q-bar>...</q-bar>
  <q-card-section><!-- tabs + search + content --></q-card-section>
  <q-card-actions align="right" class="bg-grey-1">
    <q-btn color="positive" label="Adopt" @click="adopt" :disable="!selectedResult" />
  </q-card-actions>
</q-card>
```

### 涉及文件
- 修改：`src/components/ScrapeDialog.vue`