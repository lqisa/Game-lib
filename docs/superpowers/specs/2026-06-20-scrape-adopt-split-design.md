# 采集流程重构设计

## 概述

将采集（Scrape）与入库（Adopt）分离，搜索结果暂存供用户确认，支持修改关键字重新搜索，最终一键提交入库。

## 核心变更

当前流程：Scrape → 自动 adopt 入库（一步完成）
新流程：Scrape → 暂存结果 → 用户确认 → 一键提交入库（两步分离）

## ScannerDialog 改造

### 行数据结构

```typescript
interface ScanRow {
  gameId: number
  name: string          // 原始目录名
  subPath: string
  status: 'pending' | 'searching' | 'searched' | 'adopted' | 'error'
  searchResult: null | SearchResult
  loading: boolean
}

interface SearchResult {
  rjcode: string
  name: string
  makerName: string
  coverUrl: string      // 从 JSON API 的 work_image 字段获取
  detail?: {            // fetchDetail 后填充
    title: string
    coverURL: string
    makers: string[]
    genres: string[]
    tags: string[]
    description: string
  }
}
```

### 列表列

封面缩略图 | 游戏目录名 | 匹配标题 | 状态 | 操作

### 操作按钮

- pending → "Scrape"（打开弹窗）
- searched → "重选"（打开弹窗）
- adopted → "重选"（打开弹窗）
- error → "重试"（打开弹窗）

### 底部按钮

- "Scrape All" — 批量搜索（不自动采纳，结果暂存到行）
- "提交入库" — 将所有 adopted 状态的游戏执行 adopt 入库

## ScrapeDialog（新弹窗组件）

### 布局

- 顶部：Input（预填关键字）+ Search 按钮
- 中部：搜索结果卡片列表（封面缩略图 + 标题 + 厂商）
- 底部：选中结果详情预览 + "采纳" 按钮

### 交互

1. 打开弹窗 → Input 预填关键字（RJ 号或目录名）→ 自动触发搜索
2. 修改关键字 → 点 Search → 刷新结果列表
3. 点选一条结果 → 下方展示详情（标题/厂商/类型/标签/描述）
4. 点"采纳" → 关闭弹窗，结果暂存到行，行状态变为 adopted

## 后端变更

### 搜索 API 返回封面

`searchDLSite` 从 JSON API 的 `work_image` 字段获取封面 URL，拼为完整 https 链接返回。

### adopt 不再自动调用

单个 Scrape 不再自动调用 adopt，仅暂存结果。
"提交入库"按钮批量调用 `/scraper/adopt`。

## 状态流转

```
pending → (点Scrape/Scrape All) → searching → searched
                                                          ↓ (弹窗采纳)
                                                        adopted → (点提交入库) → 入库完成，行从列表移除
searching → (搜索失败) → error
searched/adopted → (点重选) → 弹窗打开，可重新搜索
```