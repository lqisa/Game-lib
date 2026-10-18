import express from 'express';
import { getAllTasks, cancelTask, removeTask, onTaskChange } from '../tasks.js';
import { getSseToken } from '../config.js';

import { startBackgroundWorkers } from '../background-manager.js';

const router = express.Router();

// SSE token validation middleware. The token keeps other local apps and stray
// browser tabs out of the live task stream - it is not an authentication layer
// (the rest of the API has none). When no token is configured at all
// (self-hosted standalone deployments, see server/standalone.js) the stream is
// left open so browser clients on the LAN can connect, matching the trust level
// of the rest of the API.
const validateSseToken = (req, res, next) => {
  const expectedToken = getSseToken();
  if (!expectedToken) return next();
  const token = req.query.token;
  if (token !== expectedToken) {
    console.warn(`[SSE] Token mismatch: received "${token}"`);
    return res.status(401).send({ error: 'Invalid SSE token' });
  }
  next();
};

router.post('/start-workers', (_req, res) => {
  startBackgroundWorkers();
  res.send({ ok: true });
});

router.get('/', (_req, res) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  res.send(getAllTasks().map(({ childProcess, ...rest }) => rest));
});

router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const task = getAllTasks().find((t) => t.id === id);
  if (!task) {
    return res.status(404).send({ error: 'Task not found' });
  }
  if (task.status === 'running' && task.type === 'move') {
    return res.status(403).send({ error: 'Move tasks cannot be cancelled' });
  }
  if (task.status === 'running') {
    cancelTask(id); // Schedules removeTask after delay
  } else {
    removeTask(id); // Immediate removal for non-running
  }
  res.status(204).end();
});

router.get('/events', validateSseToken, (req, res) => {
  console.log('[SSE] Client connected, sending snapshot');
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const snapshot = getAllTasks().map(({ childProcess, ...rest }) => rest);
  res.write(`data: ${JSON.stringify({ type: 'snapshot', tasks: snapshot })}\n\n`);

  const onChange = (task, event) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { childProcess, ...rest } = task;
    if (event === 'remove') {
      res.write(`data: ${JSON.stringify({ type: 'remove', id: rest.id })}\n\n`);
      return;
    }
    res.write(`data: ${JSON.stringify({ type: 'update', task: rest })}\n\n`);
  };

  const unsubscribe = onTaskChange(onChange);

  const heartbeat = setInterval(() => {
    // A real message (not an SSE comment): the browser can observe it, which is what
    // lets taskStore detect silently dead streams (dev proxies swallow upstream
    // closes) and reconnect instead of waiting forever.
    res.write(`data: ${JSON.stringify({ type: 'ping' })}\n\n`);
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

export default router;
