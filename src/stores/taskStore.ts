import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useExpressUrl } from '../composables/useExpressUrl';

export interface Task {
  id: string;
  type: 'move' | 'extract' | 'compress' | 'similar-scan' | 'nsfw-scan' | 'backup';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  label: string;
  progress: number;
  detail: string;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
  meta: {
    source?: string;
    dest?: string;
    gameId?: number;
    totalFiles?: number;
    copiedFiles?: number;
    archivePath?: string;
    passwordUsed?: string;
    mode?: string;
    phase?: string;
    count?: number;
    games?: number;
  };
}

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

export const isTerminalStatus = (status: Task['status']) => TERMINAL_STATUSES.has(status);

export const useTaskStore = defineStore('task', () => {
  const tasks = ref<Map<string, Task>>(new Map());
  let eventSource: EventSource | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let zombieTimer: ReturnType<typeof setInterval> | null = null;
  let lastSseActivity = 0;

  // No message (not even a ping) for this long means the stream is dead even if
  // EventSource still reports OPEN - see the watchdog in connectSSE.
  const SSE_PING_TIMEOUT_MS = 40000;

  const runningCount = computed(
    () =>
      [...tasks.value.values()].filter((t) => t.status === 'running' || t.status === 'pending')
        .length,
  );

  const hasRunningMoveTasks = computed(() =>
    [...tasks.value.values()].some((t) => t.status === 'running' && t.type === 'move'),
  );

  const hasRunningTasks = computed(() =>
    [...tasks.value.values()].some((t) => t.status === 'running'),
  );

  // Games that currently have a relocate-style task in flight. Derived from the task list
  // rather than tracked separately, so it needs no persistence and cannot drift: the SSE
  // completion update flips the game back to idle by itself.
  const busyGameIds = computed(() => {
    const ids = new Set<number>();
    for (const task of tasks.value.values()) {
      if (task.status === 'pending' || task.status === 'running') {
        const gameId = task.meta?.gameId;
        if (typeof gameId === 'number') ids.add(gameId);
      }
    }
    return ids;
  });

  const isGameBusy = (gameId: number | undefined | null) =>
    typeof gameId === 'number' && busyGameIds.value.has(gameId);

  const taskFor = (gameId: number | undefined | null): Task | undefined => {
    if (typeof gameId !== 'number') return undefined;
    for (const task of tasks.value.values()) {
      if (
        task.meta?.gameId === gameId &&
        (task.status === 'pending' || task.status === 'running')
      ) {
        return task;
      }
    }
    return undefined;
  };

  const connectSSE = async () => {
    if (eventSource) return;

    const { getApiUrl } = useExpressUrl();
    const token = await window.electronAPI?.getSseToken();
    const url = token ? `${getApiUrl('/tasks/events')}?token=${token}` : getApiUrl('/tasks/events');
    lastSseActivity = Date.now();
    eventSource = new EventSource(url);

    // A stream can be silently dead while EventSource still reports OPEN (the dev
    // proxy eating the upstream close never fires onerror). The server pings every
    // 15s; if nothing arrives for SSE_PING_TIMEOUT_MS, force a fresh connection.
    if (!zombieTimer) {
      zombieTimer = setInterval(() => {
        if (
          eventSource &&
          eventSource.readyState === EventSource.OPEN &&
          Date.now() - lastSseActivity > SSE_PING_TIMEOUT_MS
        ) {
          disconnectSSE();
          void connectSSE();
        }
      }, 10000);
    }

    let batchMap: Map<string, Task> | null = null;

    const flushBatch = () => {
      if (!batchMap) return;
      const updates = batchMap;
      batchMap = null;
      for (const [id, task] of updates) {
        tasks.value.set(id, task);
      }
    };

    eventSource.onmessage = (event) => {
      lastSseActivity = Date.now();
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'snapshot') {
          batchMap = null;
          const newMap = new Map<string, Task>();
          for (const task of data.tasks) {
            newMap.set(task.id, task);
          }
          tasks.value = newMap;
        } else if (data.type === 'remove') {
          // The server announces removals so the row goes away without waiting for a reconnect.
          tasks.value.delete(data.id);
        } else if (data.type === 'update') {
          if (!batchMap) {
            batchMap = new Map();
            void Promise.resolve().then(flushBatch);
          }
          batchMap.set(data.task.id, data.task);
        }
        // 'ping' (and anything else) only refreshes lastSseActivity above.
      } catch {
        /* ignore SSE parse errors */
      }
    };

    eventSource.onerror = () => {
      disconnectSSE();
      reconnectTimer = setTimeout(() => {
        void connectSSE();
      }, 3000);
    };
  };

  const disconnectSSE = () => {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (zombieTimer) {
      clearInterval(zombieTimer);
      zombieTimer = null;
    }
  };

  return {
    tasks,
    runningCount,
    hasRunningMoveTasks,
    hasRunningTasks,
    busyGameIds,
    isGameBusy,
    taskFor,
    connectSSE,
    disconnectSSE,
  };
});
