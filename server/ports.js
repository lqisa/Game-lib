// Single source of truth for Express API listen ports.
// DEV and PROD are deliberately disjoint so the packaged app and `pnpm dev`
// can run side-by-side without port conflicts. TEST gets its own port so
// e2e suites never collide with dev work.
export const API_PORTS = Object.freeze({
  dev: 19700,
  test: 19701,
  prod: 19770,
});

/**
 * Runtime overrides for standalone/self-hosted deployments: `GAME_LIB_PORT`
 * (or the conventional `PORT`) wins over the built-in default. The Electron
 * shell keeps the constants for dev/test so the renderer proxy and the server
 * always agree on the port.
 */
export const resolveApiPort = (fallbackPort) => {
  const raw = process.env.GAME_LIB_PORT || process.env.PORT;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isInteger(parsed) && parsed > 0 && parsed < 65536 ? parsed : fallbackPort;
};

/**
 * Listen address. Anything started by the Electron shell or the dev tooling
 * keeps the loopback default; standalone deployments pass '0.0.0.0' explicitly
 * (see server/standalone.js). `GAME_LIB_HOST` overrides both.
 */
export const resolveListenHost = (fallbackHost) => {
  const host = process.env.GAME_LIB_HOST?.trim();
  return host || fallbackHost;
};
