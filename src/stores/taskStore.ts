import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useExpressUrl } from '../composables/useExpressUrl';

export interface Task {
  id: string;
  type: 'move' | 'extract';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  label: string;
  progress: number;
  detail: string;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
  meta: {
    source: string;
    dest: string;
    gameId: number;
    totalFiles?: number;
    copiedFiles?: number;
    archivePath?: string;
    passwordUsed?: string;
  };
}

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

export const isTerminalStatus = (status: Task['status']) => TERMINAL_STATUSES.has(status);

export const useTaskStore = defineStore('task', () => {
  const tasks = ref<Map<string, Task>>(new Map());
  let eventSource: EventSource | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const runningCount = computed(() =>
    [...tasks.value.values()].filter((t) => t.status === 'running' || t.status === 'pending').length
  );

  const hasRunningMoveTasks = computed(() =>
    [...tasks.value.values()].some((t) => t.status === 'running' && t.type === 'move')
  );

  const hasRunningTasks = computed(() =>
    [...tasks.value.values()].some((t) => t.status === 'running')
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
      if (task.meta?.gameId === gameId && (task.status === 'pending' || task.status === 'running')) {
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
    eventSource = new EventSource(url);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'snapshot') {
          const newMap = new Map<string, Task>();
          for (const task of data.tasks) {
            newMap.set(task.id, task);
          }
          tasks.value = newMap;
        } else if (data.type === 'update') {
          tasks.value.set(data.task.id, data.task);
        }
      } catch { /* ignore SSE parse errors */ }
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