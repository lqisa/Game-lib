# Game Lib

A desktop application for managing your local game library. Built with Quasar (Vue 3) + Electron, backed by an Express + SQLite server.

## Features

- **Library Management** — Add multiple game library directories, scan and import games automatically
- **Multi-Source Scraping** — Fetch game metadata and covers from:
  - [DLSite](https://www.dlsite.com/)
  - [Bangumi](https://bgm.tv/)
  - [VNDB](https://vndb.org/)
  - [Steam](https://store.steampowered.com/)
- **Search & Filter** — Keyword search, filter by genre/tag/maker, sort by various fields
- **Batch Operations** — Multi-select games for batch deletion
- **Virtual Grid** — Efficient virtual scrolling for large game collections
- **Cover Cache** — Downloaded covers cached locally for fast loading

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vue 3, Quasar 2, Pinia, Vue Router |
| Desktop | Electron |
| Backend | Express 5, Knex.js, SQLite3 |
| Build | Vite (via Quasar CLI) |

## Project Structure

```
src/                  # Quasar frontend
  pages/              # Route pages (GameLib, GameDetail, Setting)
  components/         # Vue components (ScrapeDialog, ScannerDialog, GameCard, …)
  composables/        # Composables (useApi, useSplitKeyword, …)
  layouts/            # App layout
  stores/             # Pinia stores
  boot/               # Quasar boot files
src-electron/         # Electron main & preload scripts
server/               # Express backend (bundled into Electron)
  routes/             # API routes (games, libraries, scraper, settings, cover, cache)
  scraper/            # Scraper modules (bangumi, steam, vndb, dlsite)
  database/           # Knex schema & initialization (SQLite)
  scanner.js          # Directory scanner
  config.js           # Data directory configuration
  app.js              # Express app factory
```

## Getting Started

### Prerequisites

- Node.js >= 22.12
- pnpm (recommended)

### Install dependencies

```bash
pnpm install
```

### Development

Run the full Electron app (frontend + backend):

```bash
pnpm dev
```

Or run frontend and backend separately:

```bash
pnpm dev:frontend    # Quasar dev server only
pnpm dev:server      # Express backend only (with --watch)
```

### Build for production

```bash
pnpm build
```

This produces a packaged Electron app in `dist/electron/Packaged/`.

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

| Method | Path | Description |
|--------|------|-------------|
| | `GET /api/health` | Health check |
| | `/api/libraries` | Library CRUD |
| | `/api/games` | Game CRUD & listing |
| | `/api/scraper` | Search & scrape from external sources |
| | `/api/settings` | App settings (Bangumi token, concurrency, etc.) |
| | `/api/cover` | Cover image management |
| | `/api/cache` | Search & adopt cache management |

## Configuration

See [quasar.config.ts](quasar.config.ts) for full build/dev/electron configuration.

Data is stored in the `data/` directory by default (overridable via `GAME_LIB_DATA_DIR` env var).