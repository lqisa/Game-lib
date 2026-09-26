import { ref, onMounted, onUnmounted } from 'vue';

// Single source of truth for the game grid's column count. It used to be duplicated in
// VirtualGrid.vue and GameLibPage.vue; the copies could drift, and GameLibPage's
// row-height computation was not reactive to window resizes, so the row height kept the
// old column width and the cards no longer filled their rows.
const GRID_BREAKPOINTS = [
  { minWidth: 1440, cols: 6 },
  { minWidth: 1024, cols: 4 },
  { minWidth: 600, cols: 3 },
];
const GRID_MIN_COLS = 2;

const getGridCols = (width: number) =>
  GRID_BREAKPOINTS.find((b) => width >= b.minWidth)?.cols ?? GRID_MIN_COLS;

const useViewportWidth = () => {
  const width = ref(typeof window === 'undefined' ? 0 : window.innerWidth);
  const update = () => {
    width.value = window.innerWidth;
  };
  onMounted(() => window.addEventListener('resize', update));
  onUnmounted(() => window.removeEventListener('resize', update));
  return width;
};

export { getGridCols, useViewportWidth, GRID_MIN_COLS };
