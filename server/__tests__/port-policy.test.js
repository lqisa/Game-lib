import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { decideListenRetry, portInUseMessage } from '../port-policy.js';
import { API_PORTS } from '../ports.js';

const START_PORT = API_PORTS.dev;

describe('decideListenRetry', () => {
  it('retries startPort + 1 once in production on EADDRINUSE', () => {
    const decision = decideListenRetry({
      errorCode: 'EADDRINUSE',
      port: START_PORT,
      startPort: START_PORT,
      isDev: false,
    });
    assert.deepEqual(decision, { action: 'retry', port: START_PORT + 1 });
  });

  it('does not retry a second time in production', () => {
    const decision = decideListenRetry({
      errorCode: 'EADDRINUSE',
      port: START_PORT + 1,
      startPort: START_PORT,
      isDev: false,
    });
    assert.deepEqual(decision, { action: 'fail', reason: 'retry-exhausted' });
  });

  // In dev the renderer's API base url is baked from VITE_API_PORT, so moving the
  // server to another port would leave the UI talking to the original one.
  it('never retries in dev, so the UI cannot end up pointed at a stale port', () => {
    for (const port of [START_PORT, START_PORT + 1]) {
      const decision = decideListenRetry({
        errorCode: 'EADDRINUSE',
        port,
        startPort: START_PORT,
        isDev: true,
      });
      assert.deepEqual(decision, { action: 'fail', reason: 'dev-port-fixed' });
    }
  });

  it('fails on non-EADDRINUSE errors without retrying', () => {
    for (const errorCode of ['EACCES', 'ENOTFOUND', undefined]) {
      const decision = decideListenRetry({
        errorCode,
        port: START_PORT,
        startPort: START_PORT,
        isDev: false,
      });
      assert.deepEqual(decision, { action: 'fail', reason: 'bind-error' });
    }
  });

  it('dev fail-fast takes precedence over the production retry', () => {
    const dev = decideListenRetry({
      errorCode: 'EADDRINUSE',
      port: START_PORT,
      startPort: START_PORT,
      isDev: true,
    });
    const prod = decideListenRetry({
      errorCode: 'EADDRINUSE',
      port: START_PORT,
      startPort: START_PORT,
      isDev: false,
    });
    assert.equal(dev.action, 'fail');
    assert.equal(prod.action, 'retry');
  });
});

describe('portInUseMessage', () => {
  it('names the port and tells the user how to recover', () => {
    const message = portInUseMessage(API_PORTS.dev);
    assert.match(message, /19700/);
    assert.match(message, /already in use/);
    assert.match(message, /npm run dev:server/);
  });
});
