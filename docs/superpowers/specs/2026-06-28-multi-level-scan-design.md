# Multi-Level Directory Scan & Archive Recognition Design

## Overview

Extend the game library scanner to support:
1. **Manual expand-scan** — scan sub-directories on demand, one level at a time
2. **Archive recognition** — identify compressed game files (.zip, .7z, .rar) with volume deduplication
3. **Heuristic filtering** — automatically exclude non-game directories when expanding

## Data Model Changes

### `sub_path` field semantics

| | Before | After |
|---|---|---|
| Format | Single segment `"GameA"` | Relative path `"GameA"` or `"Collection/GameC"` |
| Migration | — | None required; existing root-level paths are naturally compatible |

### `ScanRow` type extension (frontend only)

```typescript
interface ScanRow {
  // Existing fields (unchanged)
  gameId: number;
  name: string;
  subPath: string;
  status: 'pending' | 'searching' | 'searched' | 'adopted' | 'error' | 'stale';
  searchResult: SearchResult | null;
  adoptData: AdoptData | null;
  searchKeyword: string;
  source: SourceType | null;
  loading: boolean;

  // New fields
  children: ScanRow[];          // Child nodes (populated after expand-scan)
  expanded: boolean;            // Whether currently expanded
  isArchive: boolean;           // Whether this is an archive entry
  depth: number;                // Nesting depth (root = 0)
  hasChildren: boolean | null;  // null = unprobed, true = has sub-dirs, false = none
}
```

### Database schema

No changes. The `sub_path` column already supports path-format strings.

## Backend Changes

### `server/constants.js` (new file)

Heuristic filter constant `NON_GAME_DIRS` — a `Set` of lowercase directory names to exclude during expand-scan. Sources:

- **RPG Maker MV/MZ**: www, audio, img, data, js, fonts, movies, save, icon, css
- **RPG Maker VX/VX Ace/XP**: Graphics, Audio, Data, System
- **Kirikiri (krkr)**: savedata, bgm, se, voice, vo, fg, bg, rule, scenario, image, system, patch, patch2, data, others, anim, env, ubin
- **Ren'Py**: game, cache, saves, tl, gui, log, persistent, renpy
- **Unity**: Managed, Plugins, Resources, StreamingAssets, MonoBleedingEdge
- **Wolf RPG Editor**: data, graphic, sound, save
- **LiveMaker**: dat, save, bg, cg, se, bgm, voice
- **Generic**: save, saves, savedata, cg, bg, fg, bgm, se, voice, vo, audio, sound, music, me, data, system, config, scenario, script, patch, plugin, plugins, mod, mods, www, cache, temp, tmp, log, logs, backup, screenshot, screenshots, thumbnail, thumbnails, thumb, doc, manual, readme, movie, movies, video, dlc, extra, extras, bonus, image, img, images, graphic, graphics, font, fonts, icon, icons, update, crack, dll, lib, libs, docs, help, tool, tools, sdk, assets, resource, resources, locale, lang, localization, i18n, conf, cfg, settings, profile, profiles, userdata, user, meta, info, en, zh, ja, ko, cn, tw

All entries stored lowercase; comparison uses `toLowerCase()`.

### `server/scanner.js` changes

```javascript
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

const deduplicateArchives = (archiveNames) => {
  const map = new Map();
  for (const name of archiveNames) {
    let baseName = null;
    for (const pattern of VOLUME_PATTERNS) {
      const match = name.match(pattern);
      if (match) { baseName = match[1]; break; }
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

const expandDirectory = (dirPath) => {
  if (!fs.existsSync(dirPath)) return { dirs: [], archives: [], hasSubDirs: {} };
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const dirs = entries.filter(e => e.isDirectory()).map(e => e.name);
  const archives = entries
    .filter(e => e.isFile())
    .filter(e => ARCHIVE_EXTENSIONS.has(path.extname(e.name).toLowerCase()))
    .map(e => e.name);
  const hasSubDirs = {};
  for (const d of dirs) {
    const subPath = path.join(dirPath, d);
    try {
      hasSubDirs[d] = fs.readdirSync(subPath, { withFileTypes: true }).some(e => e.isDirectory());
    } catch { hasSubDirs[d] = false; }
  }
  return { dirs, archives, hasSubDirs };
};

const filterGameDirs = (dirNames) => {
  return dirNames.filter(d => !NON_GAME_DIRS.has(d.toLowerCase()));
};
```

### New API: `POST /games/scan/expand`

```
Request:  { libraryId: number, subPath: string }
Response: {
  dirs: string[],                    // Filtered sub-directory names
  archives: string[],                // Deduplicated archive file names
  hasSubDirs: Record<string, boolean> // Whether each dir has sub-dirs
}
```

Logic:
1. Look up library path from `libraryId`
2. Construct full path: `library.path + path.sep + subPath`
3. Call `expandDirectory(fullPath)`
4. Apply `filterGameDirs` to `dirs`
5. Apply `deduplicateArchives` to `archives`
6. Return result

### Modified API: `POST /games/scan`

Response changes:
- Add `archives` field (deduplicated archive file names at root level)
- `newDirs` now includes both directories and archives
- `sub_path` for archives uses filename (e.g., `RJ123456.7z`)

### Modified API: `POST /games/scan/add`

- `sub_path` supports relative path format (e.g., `Collection/GameC`)
- Archive entries use filename as `sub_path`
- `name` for archives strips extension for search keyword purposes

## Frontend Changes

### Tree rendering

- `sortedResults` computed flattens the tree via depth-first traversal, preserving `depth`
- Each row gets `padding-left: depth * 24px`
- Expandable rows show toggle button
- Archive rows show `archive` icon instead of `folder` icon

### Expand-scan interaction

1. User clicks expand button on a row
2. Frontend calls `POST /games/scan/expand` with `{ libraryId, subPath: row.subPath }`
3. Response `dirs` and `archives` are converted to `ScanRow[]` with `depth = row.depth + 1` and `subPath = row.subPath + '/' + name`
4. Results fill `row.children`; set `row.expanded = true`
5. Expand-scan results are NOT persisted to DB until Submit

### Archive display

- Archive icon distinguishes from directory
- Name retains extension (e.g., `RJ123456.7z`)
- Search keyword extraction strips archive extension and volume suffix

### Submit behavior

- All levels of the tree are submitted together
- `sub_path` with relative paths (e.g., `Collection/GameC`) are stored as-is
- Existing duplicate detection handles directory+archive overlap

## API Summary

| Method | Path | Change |
|--------|------|--------|
| POST | `/games/scan/expand` | **New** — expand-scan one level |
| POST | `/games/scan` | **Modified** — add archives, support relative sub_path |
| POST | `/games/scan/add` | **Modified** — support relative sub_path format |
| GET | `/games/unscraped` | No change |
| GET/PUT | `/settings/*` | No change |