# Multi-Select + Batch Delete & Fetch Fallback Design

## Feature 1: List Multi-Select + Batch Delete

### Interaction

- **Enter select mode**: Long-press card OR click "Select" button in toolbar
- **Select mode behavior**:
  - Click: toggle select/deselect
  - Shift+Click: range select (from last selected to clicked)
  - Ctrl+Click: toggle individual item
  - Drag: draw rectangle to box-select cards
- **Toolbar**: When items selected, show "N selected" + "Batch Delete" button
- **Exit select mode**: Click "Cancel" button or press ESC

### Data

- `selectedIds: Set<number>` in GameLibPage
- `selectable: boolean`, `selected: boolean` props on GameCard
- Selected card: blue border + checkmark overlay

### Backend

- Already has `POST /games/batch-delete` with `{ ids: number[] }`, no changes needed

### Components

- **GameLibPage.vue**: Add select mode state, selection logic, drag-select, toolbar
- **GameCard.vue**: Add `selectable`/`selected` props, visual feedback

## Feature 2: Fetch Detail Fallback

### Problem

When BGM token is invalid, `fetchBangumiDetail` returns null, causing cover/title loss on adopt.

### Solution

In ScannerDialog, when fetch detail fails (returns null/empty), construct a fallback from the search result:

```typescript
const fallbackDetail: DetailResult = {
  id: searchResult.id,
  title: searchResult.name,
  coverURL: searchResult.coverUrl,
  makers: [],
  genres: [],
  tags: [],
  description: ''
}
```

### Where

- `quickAdopt()`: after fetch, if detail is null, use fallback
- `onAdopted()`: same logic when ScrapeDialog provides no detail

This ensures at minimum cover and title are preserved from search results.