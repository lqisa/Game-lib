# Filter Dialog M3 Redesign

## Overview

Redesign the `FilterDialog.vue` component from a plain utility-style dialog to a modern Material 3 (M3) aesthetic, while keeping the dialog interaction form.

## Current Problems

- Flat visual hierarchy — sections separated only by plain text subtitles
- No icons or color differentiation between filter categories
- Libraries section uses bare checkboxes, hard to scan when many items
- No active filter summary — users can't see all active filters at a glance
- Scrape Status / Duplicate use bare radio buttons, visually dated
- Bottom buttons are flat/plain, no M3 pill shape

## Design Decisions

### 1. Dialog Form: Keep Dialog (confirmed)

Stay with `q-dialog` popup, optimize internal layout and visuals.

### 2. Visual Style: Material 3 (confirmed)

Rounded card groups, soft color blocks, icon accents, M3 color tokens.

### 3. Active Filter Summary (confirmed)

Add a chip summary area below the title bar showing all active filters. Each chip is removable via ×. A "Clear all" chip resets everything.

### 4. Libraries: Searchable Chip Toggle List (confirmed)

Replace bare `q-checkbox` list with:
- A search input at the top for filtering library names
- Flat chip toggle list below — selected chips use filled background + border (M3 toggle chip), unselected use outline style
- "Dropped" chip included with distinct styling

### 5. Scrape Status / Duplicate: Segmented Button (confirmed)

Replace bare `q-radio` groups with M3 segmented button (`q-btn-toggle`):
- Three segments in a row with rounded container
- Selected segment gets filled background (primary tint)
- More compact and visually modern than radio

### 6. Section Grouping: Icon + Color Block Headers

Each filter section gets:
- A small icon in a rounded color-tinted container (e.g., 📁 for Libraries, 👤 for Makers, 🎮 for Genres, 🏷 for Tags, 🔍 for Scrape Status, 📋 for Duplicate)
- Section title text next to the icon
- Thin divider line between sections

### 7. Bottom Actions: M3 Pill Buttons

- Reset: outlined pill button (border + text, no fill)
- Apply: filled pill button (primary purple `#6750a4`)
- Both use `border-radius: 20px` for pill shape

## Component Changes

### FilterDialog.vue

**Template changes:**

1. **Title bar**: Replace `q-bar` with custom header — icon in tinted container + "筛选器" title + close button
2. **Active filter summary**: New section below title, renders chips for each active filter value, with × to remove, and "全部清除" chip
3. **Libraries section**: Replace `q-checkbox` list with search input + chip toggle list
4. **Makers/Genres/Tags sections**: Add icon + color block header above each `q-select`; style `q-select` with `border-radius: 12px` via CSS
5. **Scrape Status section**: Replace `q-radio` group with `q-btn-toggle` (segmented button)
6. **Duplicate section**: Replace `q-radio` group with `q-btn-toggle` (segmented button)
7. **Section dividers**: Add thin `1px` line between sections using M3 outline variant color `#e7e0ec`
8. **Bottom buttons**: Style as M3 pill buttons — Reset outlined, Apply filled

**Script changes:**

1. Add `librarySearch` ref (already exists) — wire to the new search input in Libraries section
2. Add computed `activeFilterChips` that returns an array of `{ key, label, color, removeFn }` objects for the summary area
3. Add `removeFilterChip(key, value)` method to remove individual filter values
4. Add `clearAllFilters()` method that resets `localFilter` to defaults
5. `q-btn-toggle` for Scrape Status: `v-model="localFilter.scraped"` with options `[{ label: '全部', value: 'all' }, { label: '已抓取', value: 'yes' }, { label: '未抓取', value: 'no' }]`
6. `q-btn-toggle` for Duplicate: same pattern

**Style changes:**

1. M3 color tokens as CSS variables:
   - `--m3-primary: #6750a4`
   - `--m3-on-primary: #ffffff`
   - `--m3-primary-container: #e8def8`
   - `--m3-on-primary-container: #4a3f5c`
   - `--m3-outline: #c4c0cf`
   - `--m3-outline-variant: #e7e0ec`
   - `--m3-on-surface: #1d1b20`
   - `--m3-on-surface-variant: #49454f`
2. Section icon color mapping:
   - Libraries: `#fce4ec` (pink tint)
   - Makers: `#fff3e0` (orange tint)
   - Genres: `#e3f2fd` (blue tint)
   - Tags: `#e0f2f1` (teal tint)
   - Scrape Status: `#e8f5e9` (green tint)
   - Duplicate: `#fce4ec` (pink tint)
3. Chip toggle selected state: `background: var(--m3-primary-container); color: var(--m3-on-primary-container); border: 1px solid var(--m3-on-primary-container)`
4. Chip toggle unselected state: `background: transparent; color: var(--m3-on-surface-variant); border: 1px solid var(--m3-outline)`

### GameLibPage.vue

No structural changes needed. The `FilterDialog` API (props/emits) stays the same.

## Active Filter Chips Logic

The `activeFilterChips` computed iterates over `localFilter`:

| Filter Key | Condition | Chip Label | Chip Color |
|---|---|---|---|
| `libraryIds[i]` | id in array | Library name (lookup) | `#e8def8` |
| `noLibrary` | `true` | "Dropped" | `#fce4ec` |
| `makerIds[i]` | id in array | Maker name (lookup) | `#fff3e0` |
| `genreIds[i]` | id in array | Genre name (lookup) | `#e3f2fd` |
| `tagIds[i]` | id in array | Tag name (lookup) | `#e0f2f1` |
| `scraped` | not `'all'` | "已抓取" / "未抓取" | `#e8f5e9` |
| `duplicate` | not `'all'` | "有重复" / "无重复" | `#fce4ec` |

Removing a chip calls the appropriate mutation on `localFilter` (splice from array, or reset to `'all'`).

## Scope

- Only `FilterDialog.vue` template/script/style changes
- No API changes
- No new dependencies
- No changes to other components