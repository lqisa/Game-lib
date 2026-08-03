<template>
  <div
    ref="containerRef"
    :style="{ overflowY: 'auto', position: 'relative', flex: 1, minHeight: 0 }"
    @scroll="onScroll"
  >
    <div :style="{ height: `${totalHeight}px` }">
      <div :style="{ transform: `translateY(${offsetTop}px)`, willChange: 'transform' }">
        <div :style="gridStyle">
          <div
            v-for="vis in visibleItems"
            :key="itemKey(vis.item)"
            :data-item-index="vis.__index"
            :style="{ height: `${rowHeight}px`, overflow: 'hidden' }"
          >
            <slot :item="vis.item" :index="vis.__index" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts" generic="T">
import { ref, computed, onMounted, onUnmounted } from 'vue';

const props = withDefaults(
  defineProps<{
    items: T[];
    itemKey: (item: T) => string | number;
    rowHeight: number;
    gutter: number;
    bufferRows: number;
  }>(),
  {
    gutter: 16,
    bufferRows: 3,
  },
);

const emit = defineEmits<{
  scroll: [];
}>();

const containerRef = ref<HTMLElement | null>(null);
const scrollTop = ref(0);
const containerHeight = ref(0);

let resizeObserver: ResizeObserver | null = null;

const viewportWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 0);

const cols = computed(() => {
  const w = viewportWidth.value;
  if (w >= 1440) return 6;
  if (w >= 1024) return 4;
  if (w >= 600) return 3;
  return 2;
});

const rowStride = computed(() => props.rowHeight + props.gutter);

const totalRows = computed(() => Math.ceil(props.items.length / cols.value));

const totalHeight = computed(() => {
  if (totalRows.value === 0) return 0;
  return totalRows.value * props.rowHeight + (totalRows.value - 1) * props.gutter;
});

const visibleRange = computed(() => {
  const stride = rowStride.value;
  const rawStart = Math.floor(scrollTop.value / stride) - props.bufferRows;
  const startRow = Math.max(0, rawStart);
  const visibleRows = Math.ceil(containerHeight.value / stride);
  const endRow = Math.min(
    totalRows.value,
    startRow + visibleRows + 2 * props.bufferRows,
  );
  return { startRow, endRow };
});

const offsetTop = computed(() => {
  const { startRow } = visibleRange.value;
  if (startRow === 0) return 0;
  return startRow * rowStride.value;
});

const gridStyle = computed(() => ({
  display: 'grid',
  gridTemplateColumns: `repeat(${cols.value}, 1fr)`,
  gap: `${props.gutter}px`,
  alignItems: 'start',
}));

interface VisibleItem {
  item: T;
  __index: number;
}

const visibleItems = computed(() => {
  const { startRow, endRow } = visibleRange.value;
  const c = cols.value;
  const result: VisibleItem[] = [];
  for (let row = startRow; row < endRow; row++) {
    for (let col = 0; col < c; col++) {
      const idx = row * c + col;
      if (idx < props.items.length) {
        result.push({ item: props.items[idx]!, __index: idx });
      }
    }
  }
  return result;
});

const onScroll = () => {
  if (containerRef.value) {
    scrollTop.value = containerRef.value.scrollTop;
  }
  emit('scroll');
};

const updateSize = () => {
  if (containerRef.value) {
    containerHeight.value = containerRef.value.clientHeight;
  }
  viewportWidth.value = window.innerWidth;
};

onMounted(() => {
  updateSize();
  resizeObserver = new ResizeObserver(() => {
    updateSize();
  });
  if (containerRef.value) {
    resizeObserver.observe(containerRef.value);
  }
  window.addEventListener('resize', updateSize);
});

onUnmounted(() => {
  resizeObserver?.disconnect();
  window.removeEventListener('resize', updateSize);
});

defineExpose({
  containerRef,
  scrollTo: (top: number) => {
    if (containerRef.value) {
      containerRef.value.scrollTop = top;
    }
  },
  getScrollTop: () => containerRef.value?.scrollTop ?? 0,
});
</script>