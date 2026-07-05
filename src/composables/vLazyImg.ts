import type { Directive } from 'vue';

let observer: IntersectionObserver | null = null;
const pending = new Set<HTMLImageElement>();

let lastScrollY = window.scrollY;
let lastScrollTime = 0;
let scrollSpeed = 0;
let scrollTimer: number | null = null;

const ROOT_MARGIN = 200;
const UNLOAD_MARGIN = 600;
const EMPTY_SRC = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

function isInViewport(el: HTMLElement, margin = ROOT_MARGIN): boolean {
  const rect = el.getBoundingClientRect();
  const vh = window.innerHeight;
  return rect.bottom > -margin && rect.top < vh + margin;
}

function measureSpeed() {
  const now = performance.now();
  const y = window.scrollY;
  if (lastScrollTime > 0) {
    const dt = now - lastScrollTime;
    if (dt > 0) {
      const instant = (Math.abs(y - lastScrollY) / dt) * 1000;
      scrollSpeed = scrollSpeed * 0.5 + instant * 0.5;
    }
  }
  lastScrollY = y;
  lastScrollTime = now;

  if (scrollTimer !== null) {
    window.clearTimeout(scrollTimer);
  }
  scrollTimer = window.setTimeout(() => {
    scrollSpeed = 0;
    flushPending();
  }, 150);
}

function flushPending() {
  const items = Array.from(pending);
  pending.clear();
  for (const el of items) {
    if (el.isConnected && el.dataset.lazySrc && isInViewport(el)) {
      el.src = el.dataset.lazySrc;
    }
  }
}

function unloadImage(el: HTMLImageElement) {
  if (el.src && el.dataset.lazySrc && el.src !== EMPTY_SRC) {
    el.src = EMPTY_SRC;
  }
}

function getObserver() {
  if (observer) return observer;
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const el = entry.target as HTMLImageElement;
        if (entry.isIntersecting) {
          if (scrollSpeed >= 3000) {
            pending.add(el);
          } else if (el.dataset.lazySrc && el.src !== el.dataset.lazySrc) {
            el.src = el.dataset.lazySrc;
          }
        } else {
          pending.delete(el);
          unloadImage(el);
        }
      }
    },
    { rootMargin: `${UNLOAD_MARGIN}px` },
  );
  return observer;
}

window.addEventListener('scroll', measureSpeed, { passive: true });

export const vLazyImg: Directive<HTMLImageElement, string> = {
  mounted(el, binding) {
    el.dataset.lazySrc = binding.value;
    getObserver().observe(el);
  },
  updated(el, binding) {
    if (binding.value !== el.dataset.lazySrc) {
      el.dataset.lazySrc = binding.value;
      if (scrollSpeed < 3000 && isInViewport(el)) {
        el.src = binding.value;
      }
    }
  },
  unmounted(el) {
    pending.delete(el);
    getObserver().unobserve(el);
  },
};