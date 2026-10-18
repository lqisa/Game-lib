# Game Lib

A desktop + multi-device application for managing your local game library. The UI is a
Vue 3 SPA built with shadcn-vue + Tailwind CSS, the backend is an Express + SQLite server
that runs in-process in the Electron app or standalone on any machine.

## Features

- **Library Management** — Add multiple game library directories, scan and import games automatically
- **Multi-Source Scraping** — Fetch game metadata and covers from:
  - [DLSite](https://www.dlsite.com/)
  - [Bangumi](https://bgm.tv/)
  - [VNDB](https://vndb.org/)
  - [Steam](https://store.steampowered.com/)
- **Search & Filter** — Keyword search, filter by genre/tag/maker, sort by various fields
- **Batch Operations** — Multi-select games for batch deletion / archive / favorites
- **Virtual Grid** — Efficient virtual scrolling for large game collections
- **Cover Cache** — Downloaded covers cached locally for fast loading
- **Multi-device** — The same build runs as a desktop app, in dev, or as a
  standalone LAN server you open from any browser

## Tech Stack

| Layer    | Technology                                         |
| -------- | -------------------------------------------------- |
| Frontend | Vue 3, shadcn-vue (Reka UI), Tailwind CSS 4, Pinia |
| Desktop  | Electron                                           |
| Backend  | Express 5, Knex.js, SQLite3                        |
| Build    | electron-vite + electron-builder                   |

## Project Structure

```
src/                  # SPA frontend
  pages/              # Route pages (GameLib, GameDetail, Setting, Recently)
  components/         # Vue components
    ui/               # vendored shadcn-vue primitives (CLI-managed, not hand-edited)
  composables/        # useApi, useTheme, useConfirm, …
  layouts/            # App shell
  stores/             # Pinia stores
  css/app.css         # Tailwind v4 entry + design tokens
src-electron/         # Electron main & preload scripts
server/               # Express backend (bundled into Electron, also standalone)
  routes/             # API routes (games, libraries, scraper, settings, cover, cache)
  scraper/            # Scraper modules (bangumi, steam, vndb, dlsite)
  database/           # Knex schema & initialization (SQLite)
  scanner.js          # Directory scanner
  config.js           # Data directory configuration
  app.js              # Express app factory
  standalone.js       # Standalone server entry (no Electron)
config/               # Shared renderer Vite config (dev proxy + aliases)
scripts/              # Packaging helpers (server payload for electron-builder)
```

## Getting Started

### Prerequisites

- Node.js >= 22.12
- pnpm >= 12

### Install dependencies

```bash
pnpm install
```

### Development

Run the full Electron app (frontend + backend in one process tree):

```bash
pnpm dev
```

Or run frontend and backend separately:

```bash
pnpm dev:frontend    # Vite dev server only (proxies /api + /covers to the backend)
pnpm dev:server      # Express backend only (with --watch)
```

### Standalone server (multi-device)

```bash
pnpm standalone      # or: node server/standalone.js
```

Listens on `0.0.0.0:19770` by default and serves both the API and the built SPA
(`out/renderer`), so any device on the LAN can open it in a browser. Override with
`GAME_LIB_HOST` / `GAME_LIB_PORT` / `GAME_LIB_DATA_DIR`. There is no authentication:
trusted networks only.

### Build for production

```bash
pnpm build
```

Runs the renderer/main/preload builds, prepares the backend payload
(`.packaging/server`) and packages with electron-builder into `release/`.

### Lint & Format

```bash
pnpm lint            # Auto-fix with Prettier + ESLint
pnpm lint:check      # Check only, no writes
```

### Type Check

```bash
pnpm typecheck
```

## API Endpoints

| Method | Path              | Description                                     |
| ------ | ----------------- | ----------------------------------------------- |
|        | `GET /api/health` | Health check                                    |
|        | `/api/libraries`  | Library CRUD                                    |
|        | `/api/games`      | Game CRUD & listing                             |
|        | `/api/scraper`    | Search & scrape from external sources           |
|        | `/api/settings`   | App settings (Bangumi token, concurrency, etc.) |
|        | `/api/cover`      | Cover image management                          |
|        | `/api/cache`      | Search & adopt cache management                 |

## Configuration

Build/dev configuration lives in `electron.vite.config.ts` (Electron) and
`vite.config.ts` + `config/vite.renderer.ts` (frontend-only dev), packaging in
`electron-builder.yml`.

Data storage: `test-data/` in development, `%APPDATA%/Game Lib/` (Windows) or
`~/.game-lib` in production, or `GAME_LIB_DATA_DIR` when set.
