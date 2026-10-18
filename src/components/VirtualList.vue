<template>
  <div ref="containerRef" class="min-h-0 flex-1 overflow-y-auto" @scroll="onScroll">
    <div :style="{ height: `${totalHeight}px`, position: 'relative' }">
      <div :style="{ transform: `translateY(${offsetTop}px)`, willChange: 'transform' }">
        <div
          v-for="entry in visibleItems"
          :key="itemKey(entry.item)"
          :style="{ height: `${itemHeight}px` }"
        >
          <slot :item="entry.item" :index="entry.__index" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts" generic="T">
import { ref, computed, onMounted, onUnmounted } from 'vue';

/**
 * Single-column fixed-height virtual list - the plain-DOM replacement for
 * Quasar's q-virtual-scroll. Same windowing idea as VirtualGrid: only the rows
 * around the viewport are rendered, so a scan with thousands of files scrolls
 * without mounting thousands of DOM subtrees.
 */
const props = withDefaults(
  defineProps<{
    items: T[];
    itemKey: (item: T) => string | number;
    itemHeight: number;
    /** Extra rows rendered above/below the viewport. */
    buffer?: number;
  }>(),
  {
    buffer: 4,
  },
);

const containerRef = ref<HTMLElement | null>(null);
const scrollTop = ref(0);
const containerHeight = ref(0);

let resizeObserver: ResizeObserver | null = null;

const totalHeight = computed(() => props.items.length * props.itemHeight);

const visibleRange = computed(() => {
  const rawStart = Math.floor(scrollTop.value / props.itemHeight) - props.buffer;
  const start = Math.max(0, rawStart);
  const visible = Math.ceil(containerHeight.value / props.itemHeight);
  const end = Math.min(props.items.length, start + visible + 2 * props.buffer);
  return { start, end };
});

const offsetTop = computed(() => visibleRange.value.start * props.itemHeight);

interface VisibleItem {
  item: T;
  __index: number;
}

const visibleItems = computed<VisibleItem[]>(() => {
  const { start, end } = visibleRange.value;
  const result: VisibleItem[] = [];
  for (let i = start; i < end; i++) {
    result.push({ item: props.items[i]!, __index: i });
  }
  return result;
});

const onScroll = () => {
  if (containerRef.value) {
    scrollTop.value = containerRef.value.scrollTop;
  }
};

const updateSize = () => {
  if (containerRef.value) {
    containerHeight.value = containerRef.value.clientHeight;
  }
};

onMounted(() => {
  updateSize();
  resizeObserver = new ResizeObserver(() => {
    updateSize();
  });
  if (containerRef.value) {
    resizeObserver.observe(containerRef.value);
  }
});

onUnmounted(() => {
  resizeObserver?.disconnect();
});

defineExpose({
  scrollTo: (top: number) => {
    if (containerRef.value) {
      containerRef.value.scrollTop = top;
    }
  },
  getScrollTop: () => containerRef.value?.scrollTop ?? 0,
});
</script>
