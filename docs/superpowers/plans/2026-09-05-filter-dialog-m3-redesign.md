# Filter Dialog M3 Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign FilterDialog.vue from a plain utility dialog to a Material 3 aesthetic with active filter summary, searchable chip toggle for libraries, segmented buttons for status filters, and icon+color section headers.

**Architecture:** Single-component refactor of FilterDialog.vue. No API changes, no new dependencies. All visual improvements are template + style changes; script changes add computed properties for the active filter summary and chip toggle logic.

**Tech Stack:** Vue 3 + Quasar 2 (existing), no new libraries.

## Global Constraints

- Only modify `src/components/FilterDialog.vue`
- No changes to props/emits interface — GameLibPage.vue integration stays the same
- No new npm dependencies
- M3 color tokens defined as CSS custom properties in `<style>` scoped block
- All text in Chinese (matching existing UI language in GameCard tooltips etc.)

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/components/FilterDialog.vue` | Modify | All template, script, and style changes |

---

### Task 1: M3 CSS Variables + Section Header Component Pattern

**Files:**
- Modify: `src/components/FilterDialog.vue` (style block + template)

**Interfaces:**
- Produces: CSS custom properties `--m3-primary`, `--m3-primary-container`, `--m3-on-primary-container`, `--m3-outline`, `--m3-outline-variant`, `--m3-on-surface`, `--m3-on-surface-variant` available to all subsequent tasks

- [ ] **Step 1: Add M3 CSS variables to scoped style block**

Add the following `<style scoped>` block at the end of FilterDialog.vue (after the existing `</script>` tag, before any existing style or as a new style block):

```vue
<style scoped>
:root {
  --m3-primary: #6750a4;
  --m3-on-primary: #ffffff;
  --m3-primary-container: #e8def8;
  --m3-on-primary-container: #4a3f5c;
  --m3-outline: #c4c0cf;
  --m3-outline-variant: #e7e0ec;
  --m3-on-surface: #1d1b20;
  --m3-on-surface-variant: #49454f;
}

.filter-section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.filter-section-icon {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
}

.filter-section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--m3-on-surface);
}

.filter-divider {
  height: 1px;
  background: var(--m3-outline-variant);
  margin: 0 20px;
}
</style>
```

- [ ] **Step 2: Verify the dev server still runs**

Run: `npm run dev:frontend` (or check existing dev server)
Expected: No compilation errors, FilterDialog still renders (visually unchanged since CSS vars aren't used yet)

- [ ] **Step 3: Commit**

```bash
git add src/components/FilterDialog.vue
git commit -m "feat(filter): add M3 CSS variables and section header classes"
```

---

### Task 2: Replace Title Bar with M3 Header

**Files:**
- Modify: `src/components/FilterDialog.vue` (template)

**Interfaces:**
- Consumes: CSS vars from Task 1
- Produces: M3-styled dialog header

- [ ] **Step 1: Replace the `q-bar` title with M3 header**

Replace the existing `<q-bar>` element:

```html
<q-bar class="bg-primary text-white">
  <div class="text-subtitle2">Filter</div>
  <q-space />
  <q-btn dense flat icon="close" v-close-popup />
</q-bar>
```

With:

```html
<div class="q-px-lg q-pt-md q-pb-sm" style="display: flex; align-items: center; gap: 10px;">
  <div style="width: 36px; height: 36px; border-radius: 12px; background: var(--m3-primary-container); display: flex; align-items: center; justify-content: center;">
    <q-icon name="tune" size="20px" color="primary" />
  </div>
  <span style="font-size: 18px; font-weight: 600; color: var(--m3-on-surface);">筛选器</span>
  <q-space />
  <q-btn flat round dense icon="close" color="grey-7" v-close-popup />
</div>
```

- [ ] **Step 2: Verify dialog opens with new header**

Run: Open the app, click Filter button
Expected: Dialog shows "筛选器" title with tune icon in purple tinted container, close button on right

- [ ] **Step 3: Commit**

```bash
git add src/components/FilterDialog.vue
git commit -m "feat(filter): replace q-bar title with M3 header"
```

---

### Task 3: Add Active Filter Summary Area

**Files:**
- Modify: `src/components/FilterDialog.vue` (template + script)

**Interfaces:**
- Consumes: `localFilter`, `libraries`, `makers`, `genres`, `tags` refs
- Produces: `activeFilterChips` computed, `removeFilterChip()` method, `clearAllFilters()` method

- [ ] **Step 1: Add `activeFilterChips` computed and helper methods to script**

Add after the `filteredLibraries` computed in the `<script setup>` block:

```ts
const CHIP_COLORS: Record<string, string> = {
  library: '#e8def8',
  noLibrary: '#fce4ec',
  maker: '#fff3e0',
  genre: '#e3f2fd',
  tag: '#e0f2f1',
  scraped: '#e8f5e9',
  duplicate: '#fce4ec',
};

interface FilterChip {
  key: string;
  label: string;
  color: string;
  remove: () => void;
}

const activeFilterChips = computed<FilterChip[]>(() => {
  const chips: FilterChip[] = [];
  const f = localFilter.value;

  for (const id of f.libraryIds) {
    const lib = libraries.value.find((l) => l.id === id);
    if (lib) {
      chips.push({ key: `lib-${id}`, label: lib.name, color: CHIP_COLORS.library, remove: () => { localFilter.value.libraryIds = localFilter.value.libraryIds.filter((i) => i !== id); } });
    }
  }

  if (f.noLibrary) {
    chips.push({ key: 'noLib', label: 'Dropped', color: CHIP_COLORS.noLibrary, remove: () => { localFilter.value.noLibrary = false; } });
  }

  for (const id of f.makerIds) {
    const maker = makers.value.find((m) => m.id === id);
    if (maker) {
      chips.push({ key: `maker-${id}`, label: maker.name, color: CHIP_COLORS.maker, remove: () => { localFilter.value.makerIds = localFilter.value.makerIds.filter((i) => i !== id); } });
    }
  }

  for (const id of f.genreIds) {
    const genre = genres.value.find((g) => g.id === id);
    if (genre) {
      chips.push({ key: `genre-${id}`, label: genre.name, color: CHIP_COLORS.genre, remove: () => { localFilter.value.genreIds = localFilter.value.genreIds.filter((i) => i !== id); } });
    }
  }

  for (const id of f.tagIds) {
    const tag = tags.value.find((t) => t.id === id);
    if (tag) {
      chips.push({ key: `tag-${id}`, label: tag.name, color: CHIP_COLORS.tag, remove: () => { localFilter.value.tagIds = localFilter.value.tagIds.filter((i) => i !== id); } });
    }
  }

  if (f.scraped !== 'all') {
    chips.push({ key: 'scraped', label: f.scraped === 'yes' ? '已抓取' : '未抓取', color: CHIP_COLORS.scraped, remove: () => { localFilter.value.scraped = 'all'; } });
  }

  if (f.duplicate !== 'all') {
    chips.push({ key: 'duplicate', label: f.duplicate === 'yes' ? '有重复' : '无重复', color: CHIP_COLORS.duplicate, remove: () => { localFilter.value.duplicate = 'all'; } });
  }

  return chips;
});

const clearAllFilters = () => {
  resetFilter();
};
```

- [ ] **Step 2: Add summary area to template**

Insert after the M3 header div (from Task 2), before `<q-card-section>`:

```html
<div v-if="activeFilterChips.length > 0" class="q-px-lg q-pb-sm" style="display: flex; flex-wrap: wrap; gap: 6px; align-items: center;">
  <span style="font-size: 11px; color: var(--m3-on-surface-variant); text-transform: uppercase; letter-spacing: 0.5px; margin-right: 4px;">已选:</span>
  <span
    v-for="chip in activeFilterChips"
    :key="chip.key"
    style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px 2px 10px; border-radius: 8px; font-size: 12px; cursor: default;"
    :style="{ background: chip.color }"
  >
    {{ chip.label }}
    <q-icon name="close" size="14px" style="cursor: pointer; opacity: 0.7;" @click="chip.remove" />
  </span>
  <span
    style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 8px; font-size: 11px; cursor: pointer; background: #fce4ec; color: #c62828;"
    @click="clearAllFilters"
  >
    全部清除
  </span>
</div>
<div v-if="activeFilterChips.length > 0" class="filter-divider"></div>
```

- [ ] **Step 3: Verify chips appear when filters are selected**

Run: Open app, click Filter, select a library and a genre, observe chips in summary area
Expected: Chips show with correct labels and colors, × removes individual chip, "全部清除" resets all

- [ ] **Step 4: Commit**

```bash
git add src/components/FilterDialog.vue
git commit -m "feat(filter): add active filter summary with removable chips"
```

---

### Task 4: Replace Libraries Checkboxes with Searchable Chip Toggle

**Files:**
- Modify: `src/components/FilterDialog.vue` (template + style)

**Interfaces:**
- Consumes: `filteredLibraries` computed, `librarySearch` ref, `localFilter.libraryIds`, `localFilter.noLibrary`
- Produces: Chip toggle UI for library selection

- [ ] **Step 1: Add chip toggle CSS classes**

Add to the `<style scoped>` block:

```css
.lib-search-input {
  border: 1px solid var(--m3-outline);
  border-radius: 12px;
  padding: 8px 12px;
  margin-bottom: 8px;
}

.lib-search-input :deep(.q-field__control) {
  border: none !important;
  box-shadow: none !important;
}

.lib-chip-toggle {
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  border-radius: 8px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
}

.lib-chip-toggle--selected {
  background: var(--m3-primary-container);
  color: var(--m3-on-primary-container);
  border: 1px solid var(--m3-on-primary-container);
  font-weight: 500;
}

.lib-chip-toggle--unselected {
  background: transparent;
  color: var(--m3-on-surface-variant);
  border: 1px solid var(--m3-outline);
}
```

- [ ] **Step 2: Replace the Libraries section in template**

Replace the existing Libraries section:

```html
<div class="text-subtitle2 text-dark q-pb-sm q-pl-md">Libraries</div>
<div v-if="librariesLoading" class="text-center q-pa-xs">
  <q-spinner-dots size="20px" color="primary" />
</div>
<div v-else style="padding: 8px 16px; display: flex; flex-wrap: wrap; gap: 4px 12px">
  <q-checkbox
    v-for="lib in filteredLibraries"
    :key="lib.id"
    v-model="localFilter.libraryIds"
    :val="lib.id"
    :label="lib.name"
    dense
  />
  <q-checkbox
    v-model="localFilter.noLibrary"
    :true-value="true"
    :false-value="false"
    label="Dropped"
    dense
  />
  <div v-if="filteredLibraries.length === 0" class="text-caption text-grey">No match</div>
</div>
```

With:

```html
<div style="padding: 14px 20px;">
  <div class="filter-section-header">
    <div class="filter-section-icon" style="background: #fce4ec;">
      <q-icon name="folder" size="16px" color="pink" />
    </div>
    <span class="filter-section-title">库</span>
  </div>
  <div v-if="librariesLoading" class="text-center q-pa-xs">
    <q-spinner-dots size="20px" color="primary" />
  </div>
  <template v-else>
    <q-input
      v-model="librarySearch"
      dense
      borderless
      placeholder="搜索库..."
      class="lib-search-input"
      style="width: 100%"
    >
      <template v-slot:prepend>
        <q-icon name="search" size="16px" color="grey-6" />
      </template>
    </q-input>
    <div style="display: flex; flex-wrap: wrap; gap: 6px;">
      <span
        v-for="lib in filteredLibraries"
        :key="lib.id"
        class="lib-chip-toggle"
        :class="localFilter.libraryIds.includes(lib.id) ? 'lib-chip-toggle--selected' : 'lib-chip-toggle--unselected'"
        @click="toggleLibraryId(lib.id)"
      >
        {{ lib.name }}
        <q-icon v-if="localFilter.libraryIds.includes(lib.id)" name="check" size="14px" style="margin-left: 4px;" />
      </span>
      <span
        class="lib-chip-toggle"
        :class="localFilter.noLibrary ? 'lib-chip-toggle--selected' : 'lib-chip-toggle--unselected'"
        @click="localFilter.noLibrary = !localFilter.noLibrary"
      >
        Dropped
        <q-icon v-if="localFilter.noLibrary" name="check" size="14px" style="margin-left: 4px;" />
      </span>
      <div v-if="filteredLibraries.length === 0" style="font-size: 12px; color: var(--m3-on-surface-variant);">无匹配</div>
    </div>
  </template>
</div>
<div class="filter-divider"></div>
```

- [ ] **Step 3: Add `toggleLibraryId` method to script**

Add to the `<script setup>` block:

```ts
const toggleLibraryId = (id: number) => {
  const idx = localFilter.value.libraryIds.indexOf(id);
  if (idx >= 0) {
    localFilter.value.libraryIds.splice(idx, 1);
  } else {
    localFilter.value.libraryIds.push(id);
  }
};
```

- [ ] **Step 4: Verify library chip toggle works**

Run: Open app, click Filter, type in search, click chips to toggle
Expected: Chips toggle between selected (filled purple) and unselected (outline), search filters the list, checkmark appears on selected

- [ ] **Step 5: Commit**

```bash
git add src/components/FilterDialog.vue
git commit -m "feat(filter): replace library checkboxes with searchable chip toggle"
```

---

### Task 5: Add Icon Headers to Makers/Genres/Tags Sections

**Files:**
- Modify: `src/components/FilterDialog.vue` (template)

**Interfaces:**
- Consumes: CSS classes from Task 1
- Produces: Icon + color block headers for each select section

- [ ] **Step 1: Replace Makers section header and wrapper**

Replace:

```html
<div class="text-subtitle2 text-dark q-pb-sm q-pt-md q-pl-md">Makers</div>
<div v-if="makersLoading" class="text-center q-pa-xs">
  <q-spinner-dots size="20px" color="primary" />
</div>
<div v-else style="padding: 0 16px 8px">
  <q-select ... />
</div>
```

With:

```html
<div style="padding: 14px 20px;">
  <div class="filter-section-header">
    <div class="filter-section-icon" style="background: #fff3e0;">
      <q-icon name="person" size="16px" color="orange" />
    </div>
    <span class="filter-section-title">制作者</span>
  </div>
  <div v-if="makersLoading" class="text-center q-pa-xs">
    <q-spinner-dots size="20px" color="primary" />
  </div>
  <div v-else>
    <q-select
      v-model="localFilter.makerIds"
      :options="makerFilterOptions"
      multiple
      use-input
      use-chips
      input-debounce="300"
      emit-value
      map-options
      option-value="id"
      option-label="name"
      @filter="onMakerFilter"
      dense
      outlined
      placeholder="搜索制作者..."
      virtual-scroll-item-size="32"
      style="width: 100%; border-radius: 12px;"
    />
  </div>
</div>
<div class="filter-divider"></div>
```

- [ ] **Step 2: Replace Genres section header and wrapper**

Replace:

```html
<div class="text-subtitle2 text-dark q-pb-sm q-pt-md q-pl-md">Genres</div>
<div v-if="genresLoading" class="text-center q-pa-xs">
  <q-spinner-dots size="20px" color="primary" />
</div>
<div v-else style="padding: 0 16px 8px">
  <q-select ... />
</div>
```

With:

```html
<div style="padding: 14px 20px;">
  <div class="filter-section-header">
    <div class="filter-section-icon" style="background: #e3f2fd;">
      <q-icon name="category" size="16px" color="blue" />
    </div>
    <span class="filter-section-title">类型</span>
  </div>
  <div v-if="genresLoading" class="text-center q-pa-xs">
    <q-spinner-dots size="20px" color="primary" />
  </div>
  <div v-else>
    <q-select
      v-model="localFilter.genreIds"
      :options="genres"
      multiple
      use-input
      use-chips
      input-debounce="300"
      emit-value
      map-options
      option-value="id"
      option-label="name"
      @filter="onGenreFilter"
      dense
      outlined
      placeholder="搜索类型..."
      virtual-scroll-item-size="32"
      style="width: 100%; border-radius: 12px;"
    />
  </div>
</div>
<div class="filter-divider"></div>
```

- [ ] **Step 3: Replace Tags section header and wrapper**

Replace:

```html
<div class="text-subtitle2 text-dark q-pb-sm q-pt-md q-pl-md">Tags</div>
<div v-if="tagsLoading" class="text-center q-pa-xs">
  <q-spinner-dots size="20px" color="primary" />
</div>
<div v-else style="padding: 0 16px 8px">
  <q-select ... />
</div>
```

With:

```html
<div style="padding: 14px 20px;">
  <div class="filter-section-header">
    <div class="filter-section-icon" style="background: #e0f2f1;">
      <q-icon name="label" size="16px" color="teal" />
    </div>
    <span class="filter-section-title">标签</span>
  </div>
  <div v-if="tagsLoading" class="text-center q-pa-xs">
    <q-spinner-dots size="20px" color="primary" />
  </div>
  <div v-else>
    <q-select
      v-model="localFilter.tagIds"
      :options="tagFilterOptions"
      multiple
      use-input
      use-chips
      input-debounce="300"
      emit-value
      map-options
      option-value="id"
      option-label="name"
      @filter="onTagFilter"
      dense
      outlined
      placeholder="搜索标签..."
      virtual-scroll-item-size="32"
      style="width: 100%; border-radius: 12px;"
    />
  </div>
</div>
<div class="filter-divider"></div>
```

- [ ] **Step 4: Verify all three sections show icon headers**

Run: Open app, click Filter
Expected: Each section has colored icon + Chinese title, selects have rounded corners

- [ ] **Step 5: Commit**

```bash
git add src/components/FilterDialog.vue
git commit -m "feat(filter): add M3 icon headers to makers/genres/tags sections"
```

---

### Task 6: Replace Radio Groups with Segmented Buttons

**Files:**
- Modify: `src/components/FilterDialog.vue` (template + style)

**Interfaces:**
- Consumes: `localFilter.scraped`, `localFilter.duplicate`
- Produces: Segmented button UI for status filters

- [ ] **Step 1: Add segmented button CSS**

Add to `<style scoped>`:

```css
.segmented-btn {
  display: flex;
  border: 1px solid var(--m3-outline);
  border-radius: 12px;
  overflow: hidden;
}

.segmented-btn-item {
  flex: 1;
  text-align: center;
  padding: 6px 8px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
  border-right: 1px solid var(--m3-outline);
}

.segmented-btn-item:last-child {
  border-right: none;
}

.segmented-btn-item--selected {
  background: var(--m3-primary-container);
  color: var(--m3-on-primary-container);
  font-weight: 600;
}

.segmented-btn-item--unselected {
  background: transparent;
  color: var(--m3-on-surface-variant);
}
```

- [ ] **Step 2: Replace Scrape Status section**

Replace:

```html
<div class="text-subtitle2 text-dark q-pb-sm q-pt-md q-pl-md">Scrape Status</div>
<div style="padding: 8px 16px; display: flex; flex-wrap: wrap; gap: 4px 16px">
  <q-radio v-model="localFilter.scraped" val="all" label="All" dense />
  <q-radio v-model="localFilter.scraped" val="yes" label="Scraped" dense />
  <q-radio v-model="localFilter.scraped" val="no" label="Not scraped" dense />
</div>
```

With:

```html
<div style="padding: 14px 20px;">
  <div class="filter-section-header">
    <div class="filter-section-icon" style="background: #e8f5e9;">
      <q-icon name="manage_search" size="16px" color="green" />
    </div>
    <span class="filter-section-title">抓取状态</span>
  </div>
  <div class="segmented-btn">
    <div
      class="segmented-btn-item"
      :class="localFilter.scraped === 'all' ? 'segmented-btn-item--selected' : 'segmented-btn-item--unselected'"
      @click="localFilter.scraped = 'all'"
    >全部</div>
    <div
      class="segmented-btn-item"
      :class="localFilter.scraped === 'yes' ? 'segmented-btn-item--selected' : 'segmented-btn-item--unselected'"
      @click="localFilter.scraped = 'yes'"
    >已抓取</div>
    <div
      class="segmented-btn-item"
      :class="localFilter.scraped === 'no' ? 'segmented-btn-item--selected' : 'segmented-btn-item--unselected'"
      @click="localFilter.scraped = 'no'"
    >未抓取</div>
  </div>
</div>
<div class="filter-divider"></div>
```

- [ ] **Step 3: Replace Duplicate section**

Replace:

```html
<div class="text-subtitle2 text-dark q-pb-sm q-pt-md q-pl-md">Duplicate</div>
<div style="padding: 8px 16px; display: flex; flex-wrap: wrap; gap: 4px 16px">
  <q-radio v-model="localFilter.duplicate" val="all" label="All" dense />
  <q-radio v-model="localFilter.duplicate" val="yes" label="Has duplicate" dense />
  <q-radio v-model="localFilter.duplicate" val="no" label="No duplicate" dense />
</div>
```

With:

```html
<div style="padding: 14px 20px;">
  <div class="filter-section-header">
    <div class="filter-section-icon" style="background: #fce4ec;">
      <q-icon name="content_copy" size="16px" color="pink" />
    </div>
    <span class="filter-section-title">重复</span>
  </div>
  <div class="segmented-btn">
    <div
      class="segmented-btn-item"
      :class="localFilter.duplicate === 'all' ? 'segmented-btn-item--selected' : 'segmented-btn-item--unselected'"
      @click="localFilter.duplicate = 'all'"
    >全部</div>
    <div
      class="segmented-btn-item"
      :class="localFilter.duplicate === 'yes' ? 'segmented-btn-item--selected' : 'segmented-btn-item--unselected'"
      @click="localFilter.duplicate = 'yes'"
    >有重复</div>
    <div
      class="segmented-btn-item"
      :class="localFilter.duplicate === 'no' ? 'segmented-btn-item--selected' : 'segmented-btn-item--unselected'"
      @click="localFilter.duplicate = 'no'"
    >无重复</div>
  </div>
</div>
```

- [ ] **Step 4: Verify segmented buttons work**

Run: Open app, click Filter, click segments
Expected: Segments toggle with filled highlight on selected, only one selected at a time

- [ ] **Step 5: Commit**

```bash
git add src/components/FilterDialog.vue
git commit -m "feat(filter): replace radio groups with M3 segmented buttons"
```

---

### Task 7: M3 Pill Buttons for Bottom Actions

**Files:**
- Modify: `src/components/FilterDialog.vue` (template + style)

**Interfaces:**
- Consumes: `resetFilter`, `applyFilter` methods
- Produces: M3-styled pill action buttons

- [ ] **Step 1: Add pill button CSS**

Add to `<style scoped>`:

```css
.m3-btn-outlined {
  padding: 8px 20px;
  border: 1px solid var(--m3-outline);
  background: transparent;
  color: var(--m3-on-surface-variant);
  border-radius: 20px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.15s ease;
}

.m3-btn-outlined:hover {
  background: rgba(103, 80, 164, 0.08);
}

.m3-btn-filled {
  padding: 8px 24px;
  border: none;
  background: var(--m3-primary);
  color: var(--m3-on-primary);
  border-radius: 20px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.15s ease;
}

.m3-btn-filled:hover {
  background: #5a3d9e;
}
```

- [ ] **Step 2: Replace bottom action buttons**

Replace:

```html
<q-card-actions align="right">
  <q-btn flat label="Reset" @click="resetFilter" />
  <q-btn color="primary" label="Apply" @click="applyFilter" />
</q-card-actions>
```

With:

```html
<div style="padding: 12px 20px 16px; display: flex; justify-content: flex-end; gap: 10px;">
  <button class="m3-btn-outlined" @click="resetFilter">重置</button>
  <button class="m3-btn-filled" @click="applyFilter">应用</button>
</div>
```

- [ ] **Step 3: Verify pill buttons render and function**

Run: Open app, click Filter, test Reset and Apply
Expected: Outlined "重置" pill + filled purple "应用" pill, both functional

- [ ] **Step 4: Commit**

```bash
git add src/components/FilterDialog.vue
git commit -m "feat(filter): replace action buttons with M3 pill buttons"
```

---

### Task 8: Final Cleanup and Verification

**Files:**
- Modify: `src/components/FilterDialog.vue` (template cleanup)

- [ ] **Step 1: Remove the outer `<q-card-section class="q-py-xs">` wrapper**

All section divs now have their own padding. Remove the wrapping `<q-card-section class="q-py-xs">` and its closing `</q-card-section>` so sections sit directly inside `<q-card>`.

- [ ] **Step 2: Remove any trailing duplicate divider**

The last section (Duplicate) should not have a `filter-divider` after it (before the action buttons). Remove the trailing `<div class="filter-divider"></div>` after the Duplicate section if present.

- [ ] **Step 3: Run lint and typecheck**

Run: `npm run lint:check && npm run typecheck`
Expected: No errors

- [ ] **Step 4: Full manual smoke test**

Open the app, click Filter, verify:
- M3 header with icon and "筛选器"
- Active filter chips appear when filters selected, removable
- Library chip toggle with search works
- Makers/Genres/Tags sections with icon headers
- Segmented buttons for Scrape Status and Duplicate
- Pill Reset/Apply buttons
- Apply closes dialog and filters work
- Reset clears all filters

- [ ] **Step 5: Commit**

```bash
git add src/components/FilterDialog.vue
git commit -m "feat(filter): final cleanup for M3 redesign"
```