// Single source of truth for Express API listen ports.
// DEV and PROD are deliberately disjoint so the packaged app and `pnpm dev`
// can run side-by-side without port conflicts. TEST gets its own port so
// e2e suites never collide with dev work.
export const API_PORTS = Object.freeze({
  dev: 19700,
  test: 19701,
  prod: 19770,
});
