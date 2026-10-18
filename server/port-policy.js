/**
 * Port-conflict policy for the Express server that Electron runs in-process.
 *
 * This lives here (plain JS, no Electron imports) so the decision can be unit tested
 * without booting Electron - see server/__tests__/port-policy.test.js.
 *
 * Why dev must not move ports: in dev the renderer is served by the Vite dev server,
 * whose /api and /covers proxy target is fixed at dev-server start (VITE_API_PORT),
 * so the page cannot follow this server to a different port. In production the
 * renderer is served by this same Express server, so its urls are same-origin and
 * port-agnostic.
 */

/**
 * @param {object} args
 * @param {string|undefined} args.errorCode  err.code from the failed listen()
 * @param {number} args.port                 the port that just failed
 * @param {number} args.startPort            the preferred port
 * @param {boolean} args.isDev               true when running under `quasar dev -m electron`
 * @returns {{action: 'retry', port: number} | {action: 'fail', reason: 'bind-error'|'dev-port-fixed'|'retry-exhausted'}}
 */
const decideListenRetry = ({ errorCode, port, startPort, isDev }) => {
  if (errorCode !== 'EADDRINUSE') {
    return { action: 'fail', reason: 'bind-error' };
  }
  if (isDev) {
    return { action: 'fail', reason: 'dev-port-fixed' };
  }
  if (port === startPort) {
    return { action: 'retry', port: port + 1 };
  }
  return { action: 'fail', reason: 'retry-exhausted' };
};

const portInUseMessage = (port) =>
  `Port ${port} is already in use. Stop whatever is listening on it ` +
  `(e.g. a leftover "npm run dev:server") and start again.`;

export { decideListenRetry, portInUseMessage };
