import type { Directive } from 'vue';

let observer: IntersectionObserver | null = null;
const pending = new Set<HTMLImageElement>();

let lastScrollY = window.scrollY;
let lastScrollTime = 0;
let scrollSpeed = 0;
let scrollTimer: number | null = null;

const ROOT_MARGIN = 200;

function isInViewport(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  const vh = window.innerHeight;
  return rect.bottom > -ROOT_MARGIN && rect.top < vh + ROOT_MARGIN;
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

function getObserver() {
  if (observer) return observer;
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const el = entry.target as HTMLImageElement;
        if (entry.isIntersecting) {
          if (scrollSpeed >= 3000) {
            pending.add(el);
          } else if (el.dataset.lazySrc) {
            el.src = el.dataset.lazySrc;
            observer!.unobserve(el);
          }
        } else {
          pending.delete(el);
        }
      }
    },
    { rootMargin: '200px' },
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
