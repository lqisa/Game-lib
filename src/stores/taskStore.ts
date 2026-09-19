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
    connectSSE,
    disconnectSSE,
  };
});