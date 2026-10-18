<template>
  <Sheet :open="show" @update:open="show = $event">
    <SheetContent side="bottom" class="mx-auto w-full max-w-2xl gap-0 rounded-t-xl p-0">
      <SheetHeader class="border-b px-4 py-3">
        <SheetTitle class="text-sm font-semibold">Background Tasks</SheetTitle>
      </SheetHeader>

      <div class="max-h-[45vh] overflow-y-auto px-2 py-1">
        <div
          v-for="task in sortedTasks"
          :key="task.id"
          class="flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-accent/50"
        >
          <component :is="taskIcon(task)" :class="['mt-0.5 size-4 shrink-0', statusColor(task)]" />
          <div class="min-w-0 flex-1">
            <div class="truncate text-sm">{{ task.label }}</div>
            <Progress
              v-if="task.status === 'running' || task.status === 'pending'"
              :model-value="task.progress"
              class="mt-1 h-1"
            />
            <div class="text-muted-foreground truncate text-xs">
              {{ task.detail }}
              <span v-if="task.status === 'running'"> ({{ task.progress }}%)</span>
            </div>
            <div v-if="task.error" class="text-destructive truncate text-xs">{{ task.error }}</div>
          </div>
          <div class="flex shrink-0 items-center">
            <Tooltip v-if="task.status === 'running' && canCancel(task)">
              <TooltipTrigger as-child>
                <Button variant="ghost" size="icon-sm" @click="cancelTask(task.id)">
                  <X class="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Cancel</TooltipContent>
            </Tooltip>
            <Tooltip v-if="isTerminalStatus(task.status)">
              <TooltipTrigger as-child>
                <Button variant="ghost" size="icon-sm" @click="removeTask(task.id)">
                  <Trash2 class="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Remove</TooltipContent>
            </Tooltip>
          </div>
        </div>
        <div v-if="sortedTasks.length === 0" class="text-muted-foreground py-8 text-center text-sm">
          No tasks
        </div>
      </div>
    </SheetContent>
  </Sheet>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  Archive,
  ArchiveRestore,
  Copy,
  DatabaseBackup,
  Eye,
  FolderOutput,
  Trash2,
  X,
} from '@lucide/vue';
import api from '@/composables/useApi';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { isTerminalStatus, useTaskStore, type Task } from '@/stores/taskStore';

const taskStore = useTaskStore();

const show = defineModel<boolean>({ default: false });

const sortedTasks = computed(() =>
  [...taskStore.tasks.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  ),
);

const TASK_ICONS = {
  move: FolderOutput,
  'similar-scan': Copy,
  'nsfw-scan': Eye,
  backup: DatabaseBackup,
  compress: Archive,
  extract: ArchiveRestore,
} as const;

const taskIcon = (task: Task) => TASK_ICONS[task.type] ?? Archive;

const canCancel = (task: Task) =>
  task.type === 'extract' || task.type === 'compress' || task.type === 'backup';

const statusColor = (task: Task) => {
  if (task.status === 'completed') return 'text-success';
  if (task.status === 'failed') return 'text-destructive';
  if (task.status === 'cancelled') return 'text-muted-foreground';
  return 'text-primary';
};

const cancelTask = async (id: string) => {
  await api.delete(`/tasks/${id}`);
};

const removeTask = async (id: string) => {
  try {
    await api.delete(`/tasks/${id}`);
  } catch (err) {
    // 404 means the server no longer has it, which is what the click asked for - the row must go
    // either way, or a stale row can never be cleared. Any other failure keeps the row visible, so
    // a refused delete does not look like a successful one.
    if ((err as { response?: { status?: number } })?.response?.status !== 404) return;
  }
  taskStore.tasks.delete(id);
};
</script>
