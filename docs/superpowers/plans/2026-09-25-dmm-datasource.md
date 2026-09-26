# DMM / FANZA 数据源集成调研与实现报告

> 日期：2026-09-25  
> 状态：**已按方案 B 实现完成**（见文末「实现记录」），待用户验收

> ### 📌 实现记录（2026-09-25，方案 B）
>
> 本报告推荐并已落地的实现：
>
> | 文件                           | 改动                                                                                                          |
> | ------------------------------ | ------------------------------------------------------------------------------------------------------------- |
> | `server/scraper/dmm.js`        | 🆕 搜索 + 详情抓取、区域/改版分类、标题清洗、图片升级                                                         |
> | `server/scraper/match.js`      | `SOURCE_TYPES` +`dmm`；`DEFAULT_MATCH_PRIORITY` 三语言 +`dmm`；`extractIdHint`/`detectLanguage` 认 `d_\d{3,}` |
> | `server/routes/scraper.js`     | `searchBySource` +dmm 分支；`POST /dmm/search`、`POST /dmm/fetch`；区域错误返回 **503 + code**                |
> | `server/scraper/cover.js`      | `resolveCoverUrl` +dmm 分支；**未**加入 `DETAIL_FETCH_SOURCES`                                                |
> | `server/database/init.js`      | **migration v11**：把 `dmm` 并入存量 `match_priority_*`                                                       |
> | 前端 5 处                      | `types/scrape.ts`、`ScrapeDialog.vue`、`GameDetailPage.vue`、`GameLibPage.vue`、`ScannerDialog.vue`           |
> | `server/__tests__/dmm.test.js` | 🆕 31 个纯函数测试（离线）                                                                                    |
>
> **实现中新增的两个发现：**
>
> 1. **封面图路径含类型段，无法从 id 推导**（`/digital/game/` vs `/digital/comic/`）。
>    解法：搜索页卡片自带**完整正确 URL**（200x150 缩略图），去掉 `-WxH` 即得 560x420 大图；
>    详情页用 `og:image`（DMM 自己指定的代表图）。确定性 URL 仅作兜底。
> 2. **`accounts.dmm.co.jp/service/login` 不能拿去匹配 body** —— 正常商品页正文里出现 **5 次**
>    （页头登录链接），会导致每个页面都被误判成地区封锁。该标记**只能匹配最终 URL**。
>    E2E 抓到了这个 bug，已加回归测试锁定。
>
> **另一个顺带发现**：项目里**没有任何 axios 错误拦截器**（多处注释写的 "handled by error
> interceptor" 是过时的）。抓取失败此前被静默吞掉 —— 与"搜不到"无法区分。已在
> `ScrapeDialog.vue` 加 `reportScrapeError()`，把 DMM 的区域错误以 warning 形式提示用户。
>
> **又一个顺带修复（批量采纳丢封面 URL）**：`/scraper/adopt/batch` 写入
> `raw_data: null`，而单条 `/scraper/adopt` 写入 `{coverUrl}`。对 DLsite 无所谓
> （封面 URL 可由 RJ 码重建），但 **DMM 的封面路径无法从 id 推导**（`game/` vs `comic/`），
> 所以批量采纳的 DMM 游戏一旦封面下载失败就**永远修不回来**。
> 已统一为与单条路径一致，并加 `server/__tests__/adopt.test.js`（3 个测试，
> 已验证**用旧代码会全部失败**，是真回归测试）。
>
> **验证结果**：`npm test` **248/248**（含 36 个 DMM 测试、14 个 region 测试、3 个 adopt 测试）；
> typecheck 干净；SPA 构建通过；
> 真实站点 E2E：搜索 10 条 → 详情字段完整 → 采纳落库 → 封面下载 73KB；
> 浏览器实测 DMM tab 出现、可搜索、10 条结果、封面经 `/api/proxy/image` 正常渲染；
> 设置页 Check Exit → 「Exit is Japan (JP)」。
>
> **续修三个问题（端到端验证发现）：**
>
> 1. **`searchDMM` 缺少编号兜底** —— `searchDLSite` 有「从关键词提取 RJ 码直接查商品页」，
>    DMM 没有，所以 `[d_216826] some folder` 这种文件夹名**永远搜不到**（DMM 的搜索不理解该串）。
>    已补上同样的兜底。修复后该关键词 → 1 条结果。
> 2. **不存在的 cid 被当成通用错误** —— DMM 对不存在的作品返回 **404**，
>    原先会冒泡成通用 500。已抽出 `isDmmNotFound()`：**只有 404** 视为「不存在」并返回 null
>    （路由给干净 404），503/超时等继续抛，避免吞掉真错误。
> 3. **`scrapeDefaultSource` 的硬编码联合类型** —— 每加数据源都要手改，漏了会静默回退。
>    已改用 `SOURCE_TYPES`（单一事实来源）。浏览器实测 `defaultActive=DMM` ✅
>
> **⚠️ 环境注意（重要）**：本机直连出口是 **China/Shanghai**，只有走 `127.0.0.1:7890`
> 才是 **Japan/Tokyo**。任何网络验证脚本都必须显式 `initProxy()`，否则 DLsite/Bangumi
> 会 15s×3 次重试后超时（≈48s/源），看起来像"卡住"，实际是出口不对。
>
> **格式说明**：仓库**本身不是 prettier-clean** —— 工作区全部是 CRLF 而 prettier 默认 `lf`，
> 导致每个文件都会"失败"；去掉行尾后仍有历史偏差（`SettingPage` 277 行、`GameDetailPage` 497 行）。
> 本次**只修了自己引入的部分**（6 个新文件 + `dlsite.js` 用 `--write`，
> `SettingPage.vue`/`GameDetailPage.vue` 手工只改新增行），未擅自重排无关代码。
> 全仓库欠账可由 `npm run lint` 一次性处理，需你决定。

> ### ⚠️ 重大更正（同日第二次实测）
>
> **本文档初版的结论是错的。** 初版所有 FANZA 网页测试都是在**美国出口**下做的，因此得出
> 「HTML 抓取已失效（地区封锁 + 登录墙 + 选择器全挂）」。**换成日本出口后该结论被推翻**：
>
> | 阻塞项                 | 美国出口                 | 日本出口（东京）                   |
> | ---------------------- | ------------------------ | ---------------------------------- |
> | FANZA 搜索页           | ❌ 307 地区封锁          | ✅ **200，正常返回结果**           |
> | FANZA 详情页           | ❌ 302 → 登录墙          | ✅ **200，完整商品页**             |
> | 详情页 Playnite 选择器 | 0 命中（拿到的是登录页） | ✅ **全部命中，字段可正常提取**    |
> | 搜索页 `.tmb` 选择器   | —                        | ❌ **真失效**（已改版为 Tailwind） |
>
> **教训**：初版把「在美国 IP 下被拦截」误判成「方案本身失效」。同一个 URL、同一份代码，
> 仅因出口 IP 不同就得出相反结论 —— 测网络方案时**必须先确认出口地**，否则整个调研结论无效。

---

## 一、结论摘要（已更正）

| 项                | 结论                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------- |
| 是否可行          | ✅ **可行**。两条路线都通，取决于愿意付哪种成本                                             |
| **前置条件**      | 无论哪条路线，**都需要日本出口 IP**（已实测：美国 IP 直接吃地区封锁）                       |
| 路线 A：官方 API  | 需申请 `api_id` + `affiliate_id`（DMM アフィリエイト账号）；结构化、稳定；字段较少          |
| 路线 B：HTML 抓取 | **加日本代理后可用**；详情页字段最全；但搜索页已改版为 Tailwind，选择器需重写               |
| 推荐              | **路线 B（HTML 抓取）+ 日本代理** —— 不必申请 affiliate 账号，字段最全；API 可作可选增强    |
| 最大阻碍          | ① **日本出口 IP**（必需且需长期稳定）② 搜索页 Tailwind 选择器需重写                         |
| 实测亮点          | 详情页 6 类字段全部可提取；封面有确定性 URL；搜索页结果在 HTML 里（60 链接 / 10 个 cid）    |
| 实测坑点          | 搜索页已从语义类名（`.tmb`）迁移到 Tailwind 工具类，旧选择器**真失效**                      |
| ⚠️ 顺带发现       | **DLsite 同样按作品做 IP 限制**（非 DMM 独有），而本项目对此**零处理、静默失败** —— 见 §6.7 |

---

## 二、现状：现有数据源的接入架构

要新增一个数据源，需要同时改后端和前端共 **11 处**。这是本次实现的工作面。

### 2.1 后端

| 文件                       | 需要做的事                                                                                                     |
| -------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `server/scraper/dmm.js`    | 🆕 新建，实现 `searchDMM()` / `fetchDMMDetail()`                                                               |
| `server/scraper/match.js`  | `SOURCE_TYPES` 加 `'dmm'`；`DEFAULT_MATCH_PRIORITY` 三个语言各加 `'dmm'`；`extractIdHint` 支持 DMM cid         |
| `server/routes/scraper.js` | import；`searchBySource()` 加分支；新增 `/dmm/search`、`/dmm/fetch` 路由                                       |
| `server/scraper/cover.js`  | 把 DMM 封面做成确定性 URL（**不要**加进 `DETAIL_FETCH_SOURCES`，原因见 §6.3）                                  |
| `server/database/init.js`  | ⚠️ **新增 migration，把 `'dmm'` 追加进已有的 `match_priority_*` 设置**（见 §6.5，漏了会导致 DMM 永远不被尝试） |

### 2.2 前端

| 文件                               | 需要做的事                                                         |
| ---------------------------------- | ------------------------------------------------------------------ |
| `src/types/scrape.ts`              | `SourceType` 加 `'dmm'`                                            |
| `src/components/ScrapeDialog.vue`  | 加 `<q-tab name="dmm">`、id 输入提示、`validSources`、默认源启发式 |
| `src/pages/GameDetailPage.vue`     | `scrapeDefaultSource`、`sourceColor`、`getSourceUrl`               |
| `src/pages/GameLibPage.vue`        | `getSourceUrl`                                                     |
| `src/components/ScannerDialog.vue` | `sourceColor`、`getSourceUrl`                                      |
| `src/pages/SettingPage.vue`        | 数据源优先级配置界面（若为硬编码则需同步）                         |

### 2.3 现有接口契约（新数据源必须对齐）

```javascript
// search —— 与 searchDLSite / searchVNDB / searchSteam 一致
searchXxx(keyword) -> Promise<Array<{ id, name, makerName, coverUrl }>>

// detail —— 与 fetchDLSiteDetail / fetchVNDBDetail 一致
fetchXxxDetail(id) -> Promise<{
  id, title, coverURL, makers[], genres[], tags[], description
} | null>
```

`server/routes/scraper.js` 的 `adoptOne()` 负责把 detail 落库到 `game` + `game_source` + `game_maker` / `game_genre` / `game_tag`，并持久化 `raw_data.coverUrl` 供封面自愈使用。

---

## 三、网上方案调研

### 3.1 Playnite：`erri120/Playnite.Extensions` 的 Fanza Provider（主要参考）

这是目前唯一一个成熟的开源 DMM/FANZA 元数据实现。**已拉取全部源码逐行分析**。

**代码结构：**

```
src/FanzaMetadata/
├── FanzaMetadataPlugin.cs      # 插件入口 + Fields 声明
├── FanzaMetadataProvider.cs    # OnDemandMetadataProvider 实现（字段映射）
├── Scrapper.cs                 # ★ 真正的抓取逻辑（AngleSharp HTML 解析）
├── ScrapperResult.cs           # 数据模型
├── Settings.cs                 # ジャンル / ゲームジャンル 落到哪个字段
└── SettingsView.xaml.cs
```

**核心事实：它不做 API 调用，是纯 HTML 抓取（AngleSharp）**，靠一个年龄确认 Cookie 绕过年龄门：

```csharp
// FanzaMetadataProvider.SetupScrapper()
cookieContainer.Add(new Cookie("age_check_done", "1", "/", ".dmm.co.jp"));
clientHandler.Properties.Add("User-Agent", "Playnite.Extensions");
```

**URL 模式：**

```csharp
GameBaseUrl   = "https://www.dmm.co.jp/dc/doujin/-/detail/=/cid=d_"   // + cid
SearchBaseUrl = "https://www.dmm.co.jp/search/=/searchstr="           // + keyword
IconUrlFormat = "https://doujin-assets.dmm.co.jp/digital/game/d_{0}/d_{0}pt.jpg"
```

**字段提取（CSS 选择器）：**

| 目标           | 选择器                                                                  | 备注                                           |
| -------------- | ----------------------------------------------------------------------- | ---------------------------------------------- |
| 标题           | `.productTitle__txt` (h1)                                               | 需剥掉 `.productTitle__txt--campaign` 促销前缀 |
| 社团/厂商      | `.circleName__txt`                                                      | → Playnite Developers                          |
| 预览图         | `.productPreview` → `li.productPreview__item` → `a.fn-colorbox` 的 href |                                                |
| 评分           | `.userReview__item` → `a` 内 `u-common__ico--review{00,05..50}`         | class 名直接编码 0.5 星档位                    |
| 发行日         | `.informationList__ttl == 配信開始日`                                   | 格式 `yyyy/MM/dd HH:mm`，需切掉时间            |
| 游戏类型(主题) | `.informationList__ttl == ゲームジャンル`                               | 如 "RPG"，单独一个字段                         |
| 系列           | `.informationList__ttl == シリーズ`                                     | `----` 视为空                                  |
| 类型/标签      | `.informationList__ttl == ジャンル` → `.genreTag__txt`                  | 多个                                           |
| 搜索结果       | `.tmb` (p) → `a` → `.txt` 为名称，href 取 id                            |                                                |

**ID 提取逻辑：**

```csharp
public static string? GetIdFromLink(string link) {
    if (!link.StartsWith(Scrapper.GameBaseUrl, ...)) return null;
    var id = link.Substring(Scrapper.GameBaseUrl.Length);  // GameBaseUrl 已含 "cid=d_"
    var index = id.IndexOf('/');
    return index == -1 ? id : id.Substring(0, index);      // → "216826"
}
```

**值得借鉴的设计（与路线无关）：**

1. **「有 ID 就直接取详情，没有 ID 才搜索」** —— 和本项目的 `extractIdHint`（RJ 码）思路一致，可直接复用。
2. **后台批量下载 vs 手动下载分流** —— `IsBackgroundDownload` 为真时静默取第一条结果，为假时弹窗让用户挑。本项目 `auto/search` 的 `bestMatch` 阈值 + 手动兜底已经是这个模型。
3. **`ゲームジャンル` 与 `ジャンル` 分开** —— 前者是主题（RPG/ADV），后者更像 tag。建议分别映射到 `genre` 和 `tag`。
4. **评分是 0.5 星档位的离散值**，不是连续小数。

> ✅ **它的抓取路线在日本出口下仍然可用** —— 详情页选择器 2022→2026 未变，实测全部命中（见 §4.2 #11/#12）。
> ⚠️ 但**搜索页已改版**：`.tmb` 语义类名被 Tailwind 工具类取代，需重新推导选择器（见 §4.2 #13~#16）。

### 3.2 DMM 官方 Affiliate Web API v3（可选增强路线）

**基址：** `https://api.dmm.com/affiliate/v3`

**可用端点：**

| 端点            | 用途     | 对本项目的价值                         |
| --------------- | -------- | -------------------------------------- |
| `ItemList`      | 商品搜索 | ★ 核心：搜索                           |
| `FloorList`     | 楼层清单 | ★ 运行时发现 service/floor，避免硬编码 |
| `MakerSearch`   | 厂商搜索 | ★ 可用于补 `makers`                    |
| `GenreSearch`   | 类型搜索 | ★ 可用于补 `genres`                    |
| `SeriesSearch`  | 系列搜索 | 可选                                   |
| `AuthorSearch`  | 作者搜索 | 可选                                   |
| `ActressSearch` | 演员搜索 | 不适用                                 |

**`ItemList` 参数：**

| 参数           | 必需 | 说明                                    |
| -------------- | ---- | --------------------------------------- |
| `api_id`       | ✅   | 申请获得                                |
| `affiliate_id` | ✅   | 申请获得                                |
| `site`         | ✅   | `FANZA`（成人）或 `DMM.com`（一般）     |
| `service`      | 推荐 | 如 `doujin`                             |
| `floor`        | 推荐 | 如 `digital_doujin`                     |
| `keyword`      |      | 关键词（需 URL 编码）                   |
| `hits`         |      | 每页条数（1-100）                       |
| `offset`       |      | 分页偏移                                |
| `sort`         |      | `rank` / `date` / `review` / `price` 等 |
| `output`       |      | `json`（本项目用 JSON）                 |

**响应结构：**

```json
{
  "result": {
    "status": 200, "result_count": 10, "total_count": 100,
    "items": [{
      "service_code": "...", "floor_code": "...",
      "content_id": "...", "title": "...",
      "URL": "...", "affiliateURL": "...",
      "sampleImageURL": { "small": "...", "large": "..." },
      "prices": { "price": "..." },
      "date": "...", "iteminfo": { ... }
    }]
  }
}
```

**FANZA 楼层（来自社区 FloorList 导出，用于确定 `service`/`floor` 取值）：**

| service   | floor             | floor id | 名称             | 相关性                 |
| --------- | ----------------- | -------- | ---------------- | ---------------------- |
| `doujin`  | `digital_doujin`  | 81       | 同人             | ★★★ **同人游戏主战场** |
| `pcgame`  | `digital_pcgame`  | 80       | アダルトPCゲーム | ★★★ 商业 eroge         |
| `mono`    | `doujin`          | 79       | 同人（通販）     | ★ 实体同人             |
| `mono`    | `pcgame`          | 77       | PCゲーム（通販） | ★ 实体                 |
| `digital` | `anime`           | 46       | アニメ動画       | ✗                      |
| `ebook`   | `comic` / `novel` | 82/83    | 漫画/小说        | ✗                      |

> 本项目应主要使用 `site=FANZA&service=doujin&floor=digital_doujin`，次要 `service=pcgame&floor=digital_pcgame`。

### 3.3 其他实现

| 项目                      | 语言   | 路线             | 参考价值                 |
| ------------------------- | ------ | ---------------- | ------------------------ |
| `miya/dmm-search3`        | Python | 官方 API v3 封装 | ★★★ 确认了端点与参数签名 |
| `zeroAlcBeer/dmm-scraper` | Python | 抓取（影片向）   | ★ 非游戏向，参考价值低   |
| Playnite 官方 IGDB 插件   | C#     | 官方 API         | 参考架构分层             |

---

## 四、实测验证（本节全部是真实请求结果）

> 环境：Windows / Node 22  
> **关键**：出口 IP 决定结论。以下分两轮实测 —— 第一轮美国出口（❌ 被拦截），第二轮日本出口（✅ 通过）。
> 方法：`curl` 真实请求，仅统计 HTTP 状态、选择器命中数与结构性字段（不记录页面内容）

### 4.1 第一轮：美国出口（初版结论的依据）

> 出口：直连 `103.62.49.138` 前为 **US / California**（AS46997 Black Mesa）

| #   | 测试项                                                                      | 实测结果                                                                                                                                                          | 结论                                                                                    |
| --- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1   | FANZA 搜索页 `dmm.co.jp/search/=/searchstr=…`                               | `302` → `special.fanza.jp/not-available-in-your-region/`，`.tmb` 命中 **0**                                                                                       | ❌ **地区封锁**                                                                         |
| 2   | 同人详情页 `…/dc/doujin/-/detail/=/cid=d_216826/`                           | `302` → `accounts.dmm.co.jp/service/login/password?path=…`；Playnite 全部 10 个选择器命中 **0**                                                                   | ❌ 拿到的是登录页，**不是**「选择器失效」                                               |
| 3   | 一般站 `www.dmm.com`                                                        | `200`                                                                                                                                                             | ✅ 封锁**仅针对 FANZA 成人内容**                                                        |
| 4   | `api.dmm.com/affiliate/v3/ItemList`（dummy 凭证）                           | `400` + 结构化 JSON：`{"result":{"status":400,"errors":{"api_id":"Invalid Request Error","affiliate_id":"Invalid Request Error"}}}`；**加代理与不加代理结果相同** | ✅ **API 不受地区封锁**                                                                 |
| 5   | API 参数校验顺序                                                            | 合法 floor `digital_doujin` 与故意伪造的 floor **返回完全相同的错误**                                                                                             | ⚠️ **API 先校验凭证并短路**，因此**不能**由 #4 推断 doujin floor 可用（自我更正，见下） |
| 6   | 确定性封面 URL `doujin-assets.dmm.co.jp/digital/game/d_{cid}/d_{cid}pt.jpg` | 有效 id → `206` `image/jpeg`；无效 id → `302` `application/xml`                                                                                                   | ✅ **封面有确定性 URL，不受地区封锁，且能区分有效/无效 id**                             |
| 7   | 封面 URL 走代理                                                             | `206` `image/jpeg`                                                                                                                                                | ✅ 封面走不走代理都行                                                                   |

### 4.2 第二轮：日本出口（推翻初版结论）

> 出口：`103.62.49.138` → **Japan / Tokyo**（GSL Networks）

| #   | 测试项                        | 实测结果                                                                                                      | 结论                                                              |
| --- | ----------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 9   | FANZA 搜索页                  | `200`，`<title>忍法の検索結果 - FANZA</title>`，无地区封锁                                                    | ✅ **地区封锁消失**                                               |
| 10  | 同人详情页 `cid=d_216826`     | `200`，完整商品页（491KB），**无登录墙**                                                                      | ✅ **登录墙消失**（说明它本就是地区拦截的表现，不是真的需要登录） |
| 11  | 详情页 Playnite 选择器        | `productTitle__txt`×3 / `circleName__txt`×1 / `informationList`×28 / `genreTag__txt`×13 / `productPreview`×17 | ✅ **选择器全部存活**                                             |
| 12  | **用 cheerio 真实解析详情页** | 见下表 —— 6 类字段全部成功提取                                                                                | ✅ **字段可用**                                                   |
| 13  | 搜索页 `.tmb` 选择器          | 命中 **0**                                                                                                    | ❌ **真失效**（页面已改版为 Tailwind）                            |
| 14  | 搜索页结果是否在 HTML 里      | `a[href*="/detail/=/cid="]` → **60 个 anchor / 10 个唯一 cid**                                                | ✅ 结果**是**服务端渲染的，可抓                                   |
| 15  | 搜索页标题选择器              | `p.text-sm.font-bold.line-clamp-2`（徽章是兄弟节点 `div.space-x-1`）                                          | 🟡 可提取，但依赖 Tailwind 类名                                   |
| 16  | 搜索页页面框架                | 出现 `div.tailwind-scope`、`flex py-1.5 pl-3` 等工具类                                                        | ⚠️ **已从语义类名迁移到 Tailwind**                                |

**详情页 cheerio 解析实测结果（#12）：**

| 字段           | 提取到的值                                                           |
| -------------- | -------------------------------------------------------------------- |
| title          | `爆乳忍法チチシノビ`（⚠️ 剥促销前缀后需再 `.trim()`，Playnite 有做） |
| circle         | `みかん畑`                                                           |
| previews       | 10 张（`…/d_216826pr.jpg` 确定性路径）                               |
| rating         | `u-common__ico--review40` → 4.0 星                                   |
| 配信開始日     | `2021/12/25 00:00`                                                   |
| 作品形式       | `ゲーム`                                                             |
| ゲームジャンル | `ロールプレイング`                                                   |
| 題材           | `オリジナル`                                                         |
| ジャンル       | 13 个标签（映射到 tag）                                              |
| ファイル容量   | `1.16GB`                                                             |

### ⚠️ 自我更正（#5）

我最初从 #4 的响应推断「`site=FANZA&service=doujin&floor=digital_doujin` 通过了参数校验，说明该 floor 有效」。**这个推断是错的**：用一个明显不存在的 floor 重测，返回了**完全相同**的 `api_id/affiliate_id` 错误 —— 说明 API 在凭证校验阶段就短路返回了，根本没走到 floor 校验。

**所以：`digital_doujin` 这个 floor 是否真能返回数据，目前只有第三方 FloorList 导出作为证据，我没有端到端验证过。** 拿到凭证后这是第一件要验的事（见 §8）。

### 关键推论（已更正）

1. **日本出口是必需项，不是可选项**：美国 IP 下搜索页 307 地区封锁、详情页 302 登录墙 —— 初版把这两者误读为「方案失效」，实际只是**出口地不对**。
2. **详情页抓取路线成立**：Playnite 2022 年的选择器到 2026 年**仍然存活**，字段可完整提取（#11/#12）。这是字段最全的路线。
3. **搜索页需要重写选择器**：DMM 已把搜索页迁到 Tailwind 工具类，`.tmb` 死了。但结果仍在 HTML 里（#14），标题在 `p.font-bold`（#15）—— 可做，但比语义类名脆。
4. **封面图是确定性 URL**（#6），和本项目已有的 `buildDlsiteCoverUrl` 同一套思路，可直接复用该模式。
5. **官方 API 仍值得作为可选增强**：不受地区限制、结构化、稳定；但需要 affiliate 账号。

---

## 五、方案对比与推荐（已更正）

| 维度         | A. 官方 Affiliate API                              | B. HTML 抓取（Playnite 路线）                   | C. A+B 混合           |
| ------------ | -------------------------------------------------- | ----------------------------------------------- | --------------------- |
| 前置条件     | 申请 `api_id`+`affiliate_id`                       | **日本出口 IP** + `age_check_done=1` cookie     | 日本 IP + 凭证        |
| 地区限制     | ✅ 不受限                                          | ✅ 日本 IP 下不受限（实测 #9/#10）              | ✅                    |
| 稳定性       | ✅ 官方接口                                        | 🟡 详情页稳（BEM 语义类）；搜索页脆（Tailwind） | 🟡                    |
| 字段完整度   | 🟡 title/date/price/图；genres 需 `GenreSearch` 补 | 🟢 **最全**：系列/主题/评分/预览图/容量         | 🟢                    |
| 维护成本     | 🟢 低                                              | 🔴 中高（搜索页选择器需重写、且会再变）         | 🔴 高（两套都要维护） |
| 评分字段     | 🔴 无                                              | 🟢 有（0.5 星档）                               | 🟢                    |
| 系列字段     | 🟡 需 `SeriesSearch`                               | 🟢 有                                           | 🟢                    |
| 申请门槛     | 🔴 需 DMM アフィリエイト账号                       | 🟢 无需账号                                     | 🔴                    |
| 本项目契合度 | ★★                                                 | **★★★（推荐）**                                 | ★★                    |

### 推荐：方案 B（HTML 抓取）+ 日本代理

理由：

1. **不需要申请 affiliate 账号** —— 这是最大的摩擦点，省掉。
2. **字段最全**，尤其评分、系列、作品形式、容量这些 API 未必给的字段。
3. 详情页结构稳定（BEM 语义类名，2022→2026 未变），**搜索页是唯一需要重写选择器的部分**。
4. 封面走确定性 URL，与现有 `buildDlsiteCoverUrl` 模式一致。

**实施要点：**

- 详情页直接照搬 Playnite 的选择器（已验证存活）。
- 搜索页改用结构性选择器（`a[href*="/detail/=/cid="]` 取 id，`p.font-bold` 取标题），**不要**再依赖 `.tmb` 这类语义类名。
- 复用本项目的 `scraperAxios` 代理机制（`proxy_enabled` / `proxy_host` / `proxy_port` 设置），这样日本代理可以直接用你已有的代理配置，无需改代码。
- 搜索可选的降级：若搜索页抓取失败，仍可用「用户手动粘贴 DMM 链接 / cid」的方式走详情页（Playnite 本身就支持这种用法）。

**关于方案 A 的位置**：不是不用，而是**降级为可选增强**。若你之后申请了 affiliate 账号，可以用 API 替代搜索页（更稳），详情页仍走 HTML。但这属于优化，不是前置条件。

### ⚠️ 一个必须正视的运维风险（已更正）

方案 B 把「日本出口」变成这个数据源的**硬依赖**：代理挂了 → DMM 抓取全挂。

> **更正**：初版说「其它数据源不需要日本代理」，**错了**。DLsite 同样对部分作品做 IP 限制
> （2025-02 起明确限制特定国家/地区用户，部分作品无法显示或购买）。所以这不是 DMM 引入的
> **新**成本，而是**你已经付着但没意识到**的成本 —— 见 §6.7。

需要注意：

- 建议做**跨数据源**的「日本出口代理」配置（DLsite / DMM 共用），而不是每个源各配一套。
  既然 DLsite 也需要，就没理由只给 DMM 开一个开关。
- 搜索结果为空时要区分「真的没结果」和「代理/地区问题」，给出可诊断的报错（参考本项目已有的「不要吞异常」原则）。
- 详情页与搜索页的失败要分开报，否则用户无法判断是代理问题还是选择器又变了。
- **顺带修 DLsite**：含 `RJ\d+` 却搜不到结果时给出「可能被区域限制」的提示。
  这是当前代码里的一个静默失败，比缺 DMM 数据源更值得先修。

---

## 六、需求规格

### 6.1 标识符策略

DMM 同人内容 ID 形如 `d_216826`（`d_` 前缀 + 数字）。对应：

```
详情页:  https://www.dmm.co.jp/dc/doujin/-/detail/=/cid=d_216826/
封面图:  https://doujin-assets.dmm.co.jp/digital/game/d_216826/d_216826pt.jpg
source_id 存:  d_216826
```

**`extractIdHint` 需要扩展**（当前只认 `RJ\d+`）：

```javascript
// server/scraper/match.js
const extractIdHint = (name) => {
  const rj = (name || '').match(/RJ\d+/i);
  if (rj) return rj[0].toLowerCase();
  const dmm = (name || '').match(/\bd_\d{5,}\b/i); // 🆕
  return dmm ? dmm[0].toLowerCase() : null;
};
```

> 注意：本地目录名**通常不含** `d_xxxxx`（不像 DLsite 的 RJ 码是目录名惯例），所以 DMM 主要依赖**搜索 + 阈值匹配**，ID 命中是少数幸运情况。这一点与 DLsite 有本质差别，也是 DMM 自动匹配成功率预期较低的原因。

`detectLanguage` 也应把 `d_\d+` 归入 `'ja'`。

### 6.2 字段映射（按方案 B / HTML 抓取，选择器已实测）

**详情页** `https://www.dmm.co.jp/dc/doujin/-/detail/=/cid={cid}/`

| 本项目字段    | DMM 来源                                                                     | 实测提取值示例         |
| ------------- | ---------------------------------------------------------------------------- | ---------------------- |
| `title`       | `h1.productTitle__txt`（剥 `.productTitle__txt--campaign` 前缀后 `.trim()`） | `爆乳忍法チチシノビ`   |
| `makers`      | `.circleName__txt`                                                           | `みかん畑`             |
| `coverURL`    | 确定性 URL（首选，见 6.3）→ 详情页预览图（兜底）                             | `…/d_216826pt.jpg`     |
| `genres`      | `informationList` 中 `ゲームジャンル`（作品形式/主题）                       | `ロールプレイング`     |
| `tags`        | `informationList` 中 `ジャンル` → `.genreTag__txt`                           | 13 个标签              |
| `description` | ⚠️ **实测 informationList 里没有简介字段**                                   | 可能需留空，或另找位置 |
| `source_type` | `'dmm'`                                                                      |                        |
| `source_id`   | `d_216826`                                                                   |                        |
| `source_url`  | 详情页 URL                                                                   |                        |

**额外可采（其它数据源没有，值得考虑是否入库）**

| 字段     | 来源选择器                                            | 实测值              |
| -------- | ----------------------------------------------------- | ------------------- |
| 评分     | `.userReview__item` → `u-common__ico--review{00..50}` | `review40` → 4.0 星 |
| 发行日   | `informationList` 中 `配信開始日`                     | `2021/12/25`        |
| 作品形式 | `informationList` 中 `作品形式`                       | `ゲーム`            |
| 题材     | `informationList` 中 `題材`                           | `オリジナル`        |
| 容量     | `informationList` 中 `ファイル容量`                   | `1.16GB`            |
| 预览图   | `.productPreview__item a.fn-colorbox` 的 href         | 10 张               |
| 系列     | `informationList` 中 `シリーズ`                       | —                   |

> 当前 schema 没有「评分 / 容量」字段。建议**先不入库**，只取 title / cover / makers / genres / tags / description 六项对齐现有契约；额外字段留待以后需要时再加列。

**搜索页** `https://www.dmm.co.jp/search/=/searchstr={keyword}/`

| 输出        | 选择器                                               | 备注                                   |
| ----------- | ---------------------------------------------------- | -------------------------------------- |
| `id`        | `a[href*="/detail/=/cid="]` 的 href 中 `cid=(d_\d+)` | ✅ 实测 60 anchor → 10 个唯一 cid      |
| `name`      | 该结果卡片内 `p.text-sm.font-bold.line-clamp-2`      | 🟡 依赖 Tailwind 类名                  |
| `makerName` | 同卡片内 `-サークル：XXX` 文本                       | 🟡 需从 `660円-サークル：CAISSON` 里切 |
| `coverUrl`  | `buildDmmCoverUrl(cid)`                              | ✅ 确定性                              |

> ⚠️ 搜索页的卡片结构：`div.flex.py-1.5.pl-3` → `a`(图) + `div.flex-auto.flex.flex-col` → `a`(标题) + `a`(价格/社团)。标题锚点内是 `div.mr-3` → `div.space-x-1`(格式徽章) + `p.font-bold`(标题)。**徽章与标题是两个兄弟节点**，所以标题可干净提取。

### 6.3 封面三级策略（与 DLsite 对齐）

本项目 `server/scraper/cover.js` 已有「存量 raw_data → 确定性 URL → 回源详情页」三级自愈。DMM 的确定性 URL 已验证可用（实测 #6），所以：

```javascript
// server/scraper/dmm.js
const buildDmmCoverUrl = (cid) => {
  const m = (cid || '').match(/^d_(\d+)$/i);
  if (!m) return '';
  return `https://doujin-assets.dmm.co.jp/digital/game/${cid.toLowerCase()}/${cid.toLowerCase()}pt.jpg`;
};
```

⚠️ **不要**把 `'dmm'` 加进 `cover.js` 的 `DETAIL_FETCH_SOURCES` —— 那个集合的语义是「封面 URL 非确定性、需要回源抓详情」，DMM 不满足这个前提，加进去只会白白多一次网络请求。

### 6.4 匹配与优先级

`DEFAULT_MATCH_PRIORITY` 建议（把 DMM 放在靠后，不干扰现有行为）：

```javascript
en: ['steam', 'vndb', 'bangumi', 'dlsite', 'dmm'],
ja: ['dlsite', 'bangumi', 'dmm', 'steam', 'vndb'],   // 同人领域 DMM 补 DLsite 的漏
zh: ['steam', 'bangumi', 'dlsite', 'vndb', 'dmm'],
```

### 6.5 ⚠️ 必须做的迁移（否则 DMM 永远不生效）

`server/routes/scraper.js` 的 `getMatchConfig()` 逻辑是：

```javascript
if (priorityRaw) {
  const parsed = JSON.parse(priorityRaw);
  if (Array.isArray(parsed)) {
    const valid = parsed.filter((s) => SOURCE_TYPES.includes(s));
    if (valid.length > 0) priority = valid; // ← 已存的旧数组会直接胜出
  }
}
```

**已存在的用户 DB 里 `match_priority_ja` 是 `["dlsite","bangumi","steam","vndb"]`，不含 `'dmm'`。** 光改 `DEFAULT_MATCH_PRIORITY` 对老库无效 —— DMM 会被静默跳过。必须加 migration：

```javascript
// server/database/init.js —— migration v11
const v11 = await knex('setting').where({ key: 'migration_v11' }).first();
if (!v11) {
  console.log(' * Running migration v11: append dmm to match priorities...');
  for (const lang of ['en', 'ja', 'zh']) {
    const key = `match_priority_${lang}`;
    const row = await knex('setting').where({ key }).first();
    if (!row) continue;
    try {
      const arr = JSON.parse(row.value);
      if (Array.isArray(arr) && !arr.includes('dmm')) {
        arr.push('dmm');
        await knex('setting')
          .where({ key })
          .update({ value: JSON.stringify(arr) });
      }
    } catch {
      /* malformed: leave as is, getMatchConfig will fall back */
    }
  }
  await knex('setting').insert({ key: 'migration_v11', value: '1' }).onConflict('key').ignore();
  console.log(' * Migration v11 done.');
}
```

### 6.6 配置与前置条件（已更正）

方案 B（HTML 抓取）**不需要 API 凭证**，但需要日本出口 IP。

| 设置项             | 存储         | 说明                                                           |
| ------------------ | ------------ | -------------------------------------------------------------- |
| `dmm_enabled`      | `setting` 表 | 是否启用该数据源                                               |
| `dmm_use_proxy`    | `setting` 表 | DMM 是否走代理（默认继承全局 `proxy_enabled`，但允许单独覆盖） |
| `dmm_api_id`       | `setting` 表 | **可选**：仅在启用「API 搜索」增强时需要                       |
| `dmm_affiliate_id` | `setting` 表 | **可选**：同上                                                 |

**为什么建议给 DMM 单独的代理开关**：日本出口是这个数据源的**硬依赖**，代理一关 DMM 就静默失效。单独开关至少让意图显式。

> ⚠️ **更正（用户指出）**：本文档初版说「其它数据源不需要日本代理」，**这是错的**。
> **DLsite 同样对部分作品做 IP 限制**（2025-02 起 DLsite 明确对特定国家/地区用户实施限制，
> 部分作品**无法显示或购买**）。详见 §6.7。所以「需要日本出口」不是 DMM 独有的问题，
> 而是**所有面向日本同人站点的数据源的共性**。

**未配置/代理不可用时的行为**：`searchDMM()` / `fetchDMMDetail()` 返回空并 `console.warn` 写明原因（「DMM 需要日本出口 IP」），**不能**抛异常中断 `auto/search` 的循环（该循环已有 `catch { continue }`，但返回空数组语义更清晰）。

**必须区分的两种失败**（否则用户无法诊断）：

- 「地区封锁」→ 说明代理没生效或不是日本出口
- 「选择器未命中」→ 说明 DMM 又改版了，需要更新选择器

SettingPage 需给出「DMM 需要日本出口 IP」的明确提示。

### 6.7 ⚠️ 区域限制是跨数据源的共性问题（不是 DMM 独有）

**已确认的事实：**

| 来源                | 结论                                                                                           |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| 用户反馈            | DLSite 也有很多游戏封禁非日本 IP                                                               |
| DLsite 2025-02 公告 | 「DLsite將對特定國家地區的用戶實施限制，**部分作品可能無法顯示或購買**」                       |
| 社区经验            | 「部分商品是有 ip 限制的，建议尽量挂日本」；「DLsite部分作品**搜不到**，转日区或解决搜索问题」 |

**关键点：限制是「按作品」的，不是整站封锁。** 同一站点里，A 作品能搜到能买、B 作品直接不显示。

**实测（DLsite 搜索 API，255 个字段）：**

| 检查项                             | 结果                                                                              |
| ---------------------------------- | --------------------------------------------------------------------------------- |
| 是否有 `area` / `region` 类字段    | ❌ **没有**。`limit_*` 系列字段全是库存/促销限制，与地域无关                      |
| `work_attributes` 里的 `JPN`       | 50/50 都有 —— 但 `ENG`(7) / `CHI`(8) 同时存在，说明这是**语言**标记，不是地域标记 |
| 商品页（日本出口）里的地域限制标记 | 0 命中（`お住まいの地域` / `地域制限` / `ご利用いただけません` 全为 0）           |

**结论：区域限制是「靠缺席实现的」，没有字段可以检测。** 被限制的作品在搜索结果里**根本不出现**，
API 不会告诉你「这个作品被限制了」。所以：

- ❌ 不能靠读某个字段判断「这个作品被锁了」
- ✅ 只能**间接诊断**：本地有 `RJ123456` 的目录，但 DLsite 搜索这个关键词返回 0 结果 / 商品页拿不到
- ⚠️ **本项目目前对这种情况零处理**：`server/scraper/dlsite.js` 只发 `locale=zh-cn`，
  没有任何区域/年龄逻辑；被限制的作品会**静默返回空结果**，用户看到的就是「搜不到」，
  无法区分「真的没有这个作品」和「被 IP 限制了」

**建议（超出本次 DMM 范围，但值得单独开一个任务）：**

> **用户反馈（2026-09-25）**：这不是新发现 —— 用户在 kikoeru 抓 ASMR 时就遇到过同样的问题，
> 同人游戏同理，**一直以来的做法是搜索前手动切代理**。
> 所以真正要解决的不是「教育用户存在区域限制」，而是
> **「用户忘了切代理时，app 要告诉他」** —— 现在的静默失败让用户无法察觉自己漏切了。

1. 把「地区限制」提升为**跨数据源的一等公民**：在设置页做统一的「日本出口代理」配置，
   DLsite / DMM 共用，而不是每个源各配一套。
2. **DLsite 有现成的零成本检测手段（本轮实测发现）**：

   DLsite 在**本项目正在使用的那个 API 端点**上返回响应头：

   ```
   GET https://www.dlsite.com/maniax/api/=/product.json?keyword=…
   → X-Geo-Country-Code: JP
   ```

   | 检查项                           | 结果                             |
   | -------------------------------- | -------------------------------- |
   | `maniax/api/` 端点（项目在用）   | ✅ 返回 `X-Geo-Country-Code: JP` |
   | 站点根 `https://www.dlsite.com/` | ❌ 不返回该头                    |
   | DMM 详情页 / 搜索页              | ❌ 不返回任何 geo 头             |

   **这意味着 DLsite 的区域预检是免费的** —— 该头就在 app 已经在调的那次响应里，
   **不需要任何额外请求**。只要读一下 header，不是 `JP` 就提示用户即可。

3. **DMM 没有 geo 头**，只能靠**间接特征**判断：
   - 最终 URL 落到 `special.*.jp/not-available-in-your-region/` → 地区封锁
   - 最终 URL 落到 `accounts.dmm.co.jp/service/login/password` → 同样是地区拦截的表现
   - 页面 200 但核心选择器命中 0 → 页面改版（与地区无关，要分开报）

4. `dlsite.js` 加诊断：当**关键词里含 `RJ\d+` 却搜不到任何结果**时，明确提示
   「可能被区域限制，请检查代理出口是否为日本」，而不是静默返回空数组。
   这是本项目「不要吞异常」原则的直接应用。

5. 仍待验证：**从非日本出口访问一个已知受限作品时，DLsite 返回的确切形态**
   （是 404？是限制页？还是商品页但无购买按钮？）。
   —— 本轮**未能验证**（当前出口是日本，无法复现封锁；且我无法控制代理切换到非日本节点）。
   不过有了 #2 的 `X-Geo-Country-Code`，**这个未验证项的重要性下降了**：
   预检可以直接在「出口对不对」这一层拦住，不必依赖识别受限作品的返回形态。

> **这条对本项目的实际影响**：如果某次 DLsite 抓取是在非日本出口下跑的，
> **会有一批作品静默抓取失败**，而用户只看到「搜不到」。
> 既然 `X-Geo-Country-Code` 已经免费躺在现有响应里，这个诊断的成本几乎为零 ——
> **建议先于 DMM 数据源做掉**。

---

## 七、实现计划（已按方案 B 重写）

> 遵循本项目 `docs/superpowers/plans/` 既有格式。每个任务独立 commit。

### 任务 1：后端 `dmm.js` 核心模块（HTML 抓取）

**文件：** 创建 `server/scraper/dmm.js`；参考 `server/scraper/dlsite.js`（同为 cheerio HTML 解析）

- [ ] 步骤 1：实现 `buildDmmCoverUrl(cid)`（见 §6.3）
- [ ] 步骤 2：实现 `searchDMM(keyword)` —— 抓 `https://www.dmm.co.jp/search/=/searchstr={keyword}/`，**必须带 `age_check_done=1` cookie 与浏览器 UA**；用 `a[href*="/detail/=/cid="]` 取 id、`p.text-sm.font-bold` 取标题；标准化为 `{ id, name, makerName, coverUrl }[]`
- [ ] 步骤 3：实现 `fetchDMMDetail(cid)` —— 抓 `https://www.dmm.co.jp/dc/doujin/-/detail/=/cid={cid}/`，按 §3.1 的 Playnite 选择器提取 title / circle / rating / 配信開始日 / ゲームジャンル / ジャンル / 预览图；映射为 `{ id, title, coverURL, makers[], genres[], tags[], description }`
- [ ] 步骤 4：**地区封锁检测** —— 若最终 URL 含 `not-available-in-your-region` 或 `accounts.dmm.co.jp/service/login`，抛出可识别的错误（不要静默返回空），让上层能提示「需要日本代理」
- [ ] 步骤 5：**选择器失效检测** —— 若页面 200 但核心选择器（`.productTitle__txt`）命中 0，`console.warn` 明确写出「DMM 页面结构可能已变更」
- [ ] 步骤 6：`node --check server/scraper/dmm.js`
- [ ] 步骤 7：接入搜索缓存（复用 `db.getSearchCache` / `setSearchCache`，key 用 `dmm:{keyword}`）
- [ ] 步骤 8：Commit

> ⚠️ 注意：`scraperAxios` 已有全局代理设置（`initProxy`），DMM 请求会自动走代理。若实现了 `dmm_use_proxy` 独立开关，需要在请求级别覆盖 agent。

### 任务 2：`match.js` 扩展

- [ ] 步骤 1：`SOURCE_TYPES` 追加 `'dmm'`
- [ ] 步骤 2：`DEFAULT_MATCH_PRIORITY` 三个语言按 §6.4 调整
- [ ] 步骤 3：`extractIdHint` 支持 `d_\d{5,}`（见 §6.1）
- [ ] 步骤 4：`detectLanguage` 把 `d_\d+` 归入 `ja`
- [ ] 步骤 5：跑 `npm test`（现有 `match.test.js` 必须全绿）
- [ ] 步骤 6：Commit

### 任务 3：路由接入

**文件：** `server/routes/scraper.js`

- [ ] 步骤 1：import `searchDMM, fetchDMMDetail`
- [ ] 步骤 2：`searchBySource()` 加 `if (source === 'dmm') return searchDMM(keyword)`
- [ ] 步骤 3：新增 `POST /dmm/search` 与 `POST /dmm/fetch`（严格照抄 vndb 路由形态）
- [ ] 步骤 4：`node -e "import('./server/routes/scraper.js').then(()=>console.log('ok'))"`
- [ ] 步骤 5：Commit

### 任务 4：数据库迁移

- [ ] 步骤 1：在 `init.js` 加 migration v11（见 §6.5）
- [ ] 步骤 2：**在真实库副本上验证**：跑一次后 `setting` 表里 `match_priority_*` 确实含 `'dmm'`
- [ ] 步骤 3：Commit

### 任务 5：封面接入

- [ ] 步骤 1：`cover.js` 的 `resolveCoverUrl()` 加 `dmm` 分支 → `buildDmmCoverUrl`
- [ ] 步骤 2：确认 **未**把 `'dmm'` 加入 `DETAIL_FETCH_SOURCES`
- [ ] 步骤 3：补 `cover.test.js` 用例（有效 cid / 无效 cid）
- [ ] 步骤 4：Commit

### 任务 6：前端接入（11 处）

- [ ] 步骤 1：`src/types/scrape.ts` 加 `'dmm'`
- [ ] 步骤 2：`ScrapeDialog.vue` 加 tab + `validSources` + id 提示（`DMM ID (e.g. d_216826)`）
- [ ] 步骤 3：`GameDetailPage.vue` / `GameLibPage.vue` / `ScannerDialog.vue` 加 `sourceColor` 与 `getSourceUrl`
- [ ] 步骤 4：`SettingPage.vue` 加 `dmm_api_id` / `dmm_affiliate_id` 输入项 + 说明文案
- [ ] 步骤 5：`npm run typecheck` + `npx quasar build -m spa`
- [ ] 步骤 6：浏览器实测（搜索 → 采纳 → 封面显示）
- [ ] 步骤 7：Commit

### 任务 7：端到端验证（**需要日本代理**）

- [ ] 步骤 1：在**日本出口**下抓一次真实搜索页，确认 `a[href*="/detail/=/cid="]` + `p.font-bold` 能稳定取出 `{id, name}` 对（10 条左右）
- [ ] 步骤 2：抓 5~10 个不同 cid 的详情页，确认 `.productTitle__txt` 等选择器**命中率 100%**（若个别页面结构不同，记录差异）
- [ ] 步骤 3：验证同人游戏的封面是否都走 `digital/game/` 路径（实测 `digital/comic/` 返回 `302`，说明路径与内容类型相关）—— 对没有封面的用 `sampleImageURL` / 预览图兜底
- [ ] 步骤 4：验证「非日本出口」时的报错是否可识别（应能明确提示「需要日本代理」，而不是静默空结果）
- [ ] 步骤 5：测请求频率容忍度（连续抓 20 页是否被限流/封禁），据此定批量抓取的并发与间隔
- [ ] 步骤 6：记录实测结果到本文档

### 任务 8：区域预检 ✅ 已完成

**背景**：见 §6.7。用户一直靠**手动切代理**规避 DLsite 的区域限制，痛点是「忘了切时 app 不告诉他」。

- [x] 步骤 1：新建 `server/scraper/region.js` —— `readGeoCountry()` / `buildRegionNotice()` / `buildEmptyResultNotice()`（纯函数，可离线测）
- [x] 步骤 2：`searchDLSiteDetailed()` 读取响应头 `X-Geo-Country-Code`（**零额外请求**），随结果返回 `region`
- [x] 步骤 3：`searchDLSite()` 保留为 list-only 包装，`auto/search`、`/dlsite/batch` 不受影响
- [x] 步骤 4：空结果 + 作品编号 → 分三种情况给**准确**诊断（出口非日本 / 出口已是日本 / 出口未知）
- [x] 步骤 5：`fetchDLSiteDetail()` 抛 `DLSITE_NOT_FOUND`，带 `region` 提示，不静默失败
- [x] 步骤 6：DMM 侧用间接特征判断（已在任务 1 完成）
- [x] 步骤 7：新增 `GET /api/scraper/region` —— 按需探测出口（DLsite 报国家 + DMM 探可达性）
- [x] 步骤 8：前端 —— `ScrapeDialog` 搜索时提示；`SettingPage` Proxy 卡片加 **Check Exit** 按钮 + 结果横幅
- [x] 步骤 9：`server/__tests__/region.test.js` 14 个离线测试
- [x] 步骤 10：`npm test` **240/240**；typecheck 干净；SPA 构建通过；E2E + 浏览器实测通过

**一个刻意的设计选择**：出口**已经是日本**时，空结果**不会**提示去检查代理，而是说
「更可能是该作品不存在或已下架」。把用户支使去查一个本来就正确的设置，比不提示更糟。

> 剩余待验证：非日本出口下 DLsite 对受限作品的**具体返回形态**。
> 有了 `X-Geo-Country-Code` 后此项重要性下降（预检已在更上游拦住），但若要区分
> 「作品被限」和「作品不存在」，仍需一次非日本节点下的抓取样本。

---

## 八、风险与待验证项（已更正）

| 级别  | 项                                   | 影响                                                                                                                                | 处置                                                                                                                              |
| ----- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 🔴 高 | **日本出口成为硬依赖**               | 代理挂 / 出口非日本 → DMM 抓取全挂。**但注意：这不是 DMM 独有** —— DLsite 同样按作品做 IP 限制（见 §6.7）                           | 做成**跨数据源**的「日本出口代理」配置（DLsite/DMM 共用）；失败时给出可诊断报错（区分地区封锁 vs 选择器失效）                     |
| 🔴 高 | **DLsite 区域限制静默失败**          | 区域限制「靠缺席实现」，无字段可检测；`dlsite.js` 现在零处理 → 出口不对时受限作品静默消失，用户无从察觉（用户一直靠手动切代理规避） | ✅ **有低成本解法**：读 `X-Geo-Country-Code` 响应头（已在现有响应里，零额外请求）；含 `RJ\d+` 却 0 结果时给提示。见 §6.7 / 任务 8 |
| 🔴 高 | **搜索页选择器基于 Tailwind 工具类** | Tailwind 类名比 BEM 语义类名**脆弱得多**，DMM 改版即失效                                                                            | 优先用结构性选择器（`a[href*=cid]`、兄弟/父子位置关系）而非纯类名；写好失效告警                                                   |
| 🟡 中 | **批量抓取可能触发限流/封禁**        | 2032 个游戏的批量抓取量不小                                                                                                         | 任务 7 步骤 5 先测阈值；复用 `retryGet` 退避；批量限流                                                                            |
| 🟡 中 | **封面路径可能因内容类型而异**       | 实测 `digital/game/` 有效、`digital/comic/` 返回 302                                                                                | 按类型判断，或用详情页里的预览图/`og:image` 兜底                                                                                  |
| 🟡 中 | **本地目录名不含 DMM cid**           | 自动匹配命中率低于 DLsite（RJ 码有目录名惯例）                                                                                      | 依赖搜索 + 阈值；UI 给足手动挑选入口；支持手动粘贴 DMM 链接                                                                       |
| 🟡 中 | **详情页无 description 字段**        | 实测 informationList 里没有简介，只有结构化属性                                                                                     | 需确认页面别处是否有；若确实没有，接受该字段为空（其它源会补）                                                                    |
| 🟢 低 | 地区封锁本身                         | 已验证日本 IP 下消失                                                                                                                | 无需额外处理，但需在 UI 说明                                                                                                      |
| 🟢 低 | 年龄门 cookie                        | `age_check_done=1` 已足够（实测）                                                                                                   | 硬编码该 cookie 即可                                                                                                              |

---

## 九、工作量估算（已更正）

| 任务                         | 预估                             |
| ---------------------------- | -------------------------------- |
| 1. 后端核心模块（HTML 抓取） | 60 min（搜索页选择器需现场推导） |
| 2. match.js 扩展             | 15 min                           |
| 3. 路由接入                  | 15 min                           |
| 4. 数据库迁移                | 15 min                           |
| 5. 封面接入                  | 20 min                           |
| 6. 前端 11 处                | 40 min                           |
| 7. 端到端验证                | ~40 min（需日本代理）            |
| **合计**                     | **~3.5 小时**                    |

---

## 十、参考

| 来源                                                             | 用途                                                          |
| ---------------------------------------------------------------- | ------------------------------------------------------------- |
| `erri120/Playnite.Extensions` → `src/FanzaMetadata/`             | 主要参考：字段映射、选择器、ID 提取、评分档位                 |
| DMM Web API v3 官方文档 `affiliate.dmm.com/api/v3/itemlist.html` | API 规范（⚠️ 该站点对非日本 IP 返回地区封锁，需另寻途径查阅） |
| `miya/dmm-search3`                                               | 确认 API 端点与参数签名                                       |
| DMM FloorList 社区导出（ytakeuchi.jp）                           | FANZA service/floor 取值表                                    |
| 本项目 `docs/superpowers/plans/2026-06-28-steam-datasource.md`   | 实现计划格式模板                                              |

---

## 附：本次调研用到的验证命令

> ⚠️ **先确认出口地**，否则结论无意义（初版就是在这里栽的）：
>
> ```bash
> curl -s https://ipwho.is/ | python -c "import sys,json;d=json.load(sys.stdin);print(d['country'],d['city'])"
> # 必须是 Japan 才能测 FANZA 页面
> ```

```bash
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36"

# 1. 出口地检查（先跑这个！）
curl -s https://ipwho.is/ | python -c "import sys,json;d=json.load(sys.stdin);print(d['country'],d['city'])"

# 2. 搜索页 —— 日本出口下应 200 且 <title> 是「XXXの検索結果 - FANZA」
curl -sL -H "Cookie: age_check_done=1" -H "User-Agent: $UA" \
  "https://www.dmm.co.jp/search/=/searchstr=%E5%BF%8D%E6%B3%95/" -o s.html -w "%{http_code}\n"
grep -o "<title>[^<]*</title>" s.html

# 3. 详情页 —— 日本出口下应 200 且是完整商品页
curl -sL -H "Cookie: age_check_done=1" -H "User-Agent: $UA" \
  "https://www.dmm.co.jp/dc/doujin/-/detail/=/cid=d_216826/" -o d.html -w "%{http_code}\n"

# 4. 快速判断拿到的是什么页面（0 命中说明被拦或改版）
for cls in productTitle__txt circleName__txt informationList genreTag__txt; do
  printf "%-22s %s\n" "$cls" "$(grep -o "$cls" d.html | wc -l)"
done

# 5. 搜索页结构性选择器（不依赖类名）
grep -o 'href="[^"]*cid=[^"]*"' s.html | wc -l        # 应为 ~60

# 6. 确定性封面 URL（有效 id → 206 image/jpeg；无效 id → 302）
curl -s -o /dev/null -H "Range: bytes=0-64" -w "%{http_code} %{content_type}\n" \
  "https://doujin-assets.dmm.co.jp/digital/game/d_216826/d_216826pt.jpg"

# 7. （可选）官方 API 可达性 —— 不受地区限制
curl -s "https://api.dmm.com/affiliate/v3/ItemList?api_id=X&affiliate_id=Y&site=FANZA&service=doujin&floor=digital_doujin&hits=1&output=json"
```

**cheerio 解析骨架**（已验证可跑通，见 §4.2 #12）：

```javascript
const $ = load(html);
// 详情页
const title = $('h1.productTitle__txt').first().text().trim();
const circle = $('.circleName__txt').first().text().trim();
const info = {};
$('.informationList').each((_, el) => {
  const k = $(el).find('.informationList__ttl').first().text().trim();
  const tags = $(el)
    .find('.genreTag__txt')
    .map((_, t) => $(t).text().trim())
    .get();
  if (k) info[k] = tags.length ? tags : $(el).find('.informationList__txt').first().text().trim();
});
// 搜索页
$('a[href*="/detail/=/cid="]').each((_, el) => {
  const cid = ($(el).attr('href') || '').match(/cid=(d_\d+)/)?.[1];
  const card = $(el).closest('div').parent();
  const name = card.find('p.text-sm.font-bold').first().text().trim();
  // ...
});
```
