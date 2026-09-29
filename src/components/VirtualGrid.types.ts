import type { Ref } from 'vue';

export interface VirtualGridExposed<T> {
  containerRef: Ref<HTMLElement | null, HTMLElement | null>;
  getVisibleItems: () => { item: T; __index: number }[];
  scrollTo: (top: number) => void;
  getScrollTop: () => number;
}
