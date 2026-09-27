<template>
  <q-dialog v-model="show" position="bottom" seamless>
    <q-card style="min-width: 400px; max-width: 600px; max-height: 400px" class="q-pa-sm">
      <div class="row items-center q-mb-sm">
        <div class="text-subtitle2" style="color: var(--m3-on-surface)">Background Tasks</div>
        <q-space />
        <q-btn
          flat
          round
          dense
          size="sm"
          icon="close"
          style="color: var(--m3-on-surface-variant)"
          @click="show = false"
        />
      </div>
      <q-scroll-area style="height: 300px">
        <q-list dense>
          <q-item v-for="task in sortedTasks" :key="task.id" class="q-pa-xs">
            <q-item-section avatar>
              <q-icon
                :name="
                  task.type === 'move'
                    ? 'drive_file_move'
                    : task.type === 'similar-scan'
                      ? 'content_copy'
                      : task.type === 'nsfw-scan'
                        ? 'visibility'
                        : 'archive'
                "
                :color="statusColor(task)"
                size="sm"
              />
            </q-item-section>
            <q-item-section>
              <q-item-label caption style="color: var(--m3-on-surface)">{{
                task.label
              }}</q-item-label>
              <q-linear-progress
                v-if="task.status === 'running' || task.status === 'pending'"
                :value="task.progress / 100"
                color="primary"
                size="4px"
                class="q-mt-xs"
              />
              <div class="text-caption" style="color: var(--m3-on-surface-variant)">
                {{ task.detail }}
                <span v-if="task.status === 'running'"> ({{ task.progress }}%)</span>
              </div>
              <div v-if="task.error" class="text-caption text-negative">{{ task.error }}</div>
            </q-item-section>
            <q-item-section side>
              <q-btn
                v-if="task.status === 'running' && task.type === 'extract'"
                flat
                round
                dense
                size="sm"
                icon="close"
                color="grey-7"
                @click="cancelTask(task.id)"
              >
                <q-tooltip>Cancel</q-tooltip>
              </q-btn>
              <q-btn
                v-if="
                  task.status === 'completed' ||
                  task.status === 'failed' ||
                  task.status === 'cancelled'
                "
                flat
                round
                dense
                size="sm"
                icon="delete"
                color="grey-7"
                @click="removeTask(task.id)"
              >
                <q-tooltip>Remove</q-tooltip>
              </q-btn>
            </q-item-section>
          </q-item>
          <q-item v-if="sortedTasks.length === 0">
            <q-item-section>
              <q-item-label caption class="text-center" style="color: var(--m3-on-surface-variant)"
                >No tasks</q-item-label
              >
            </q-item-section>
          </q-item>
        </q-list>
      </q-scroll-area>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import api from '../composables/useApi';
import { useTaskStore, type Task } from '../stores/taskStore';

const taskStore = useTaskStore();

const show = defineModel<boolean>({ default: false });

const sortedTasks = computed(() =>
  [...taskStore.tasks.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  ),
);

const statusColor = (task: Task) => {
  if (task.status === 'completed') return 'positive';
  if (task.status === 'failed') return 'negative';
  if (task.status === 'cancelled') return 'grey';
  return 'primary';
};

const cancelTask = async (id: string) => {
  await api.delete(`/tasks/${id}`);
};

const removeTask = async (id: string) => {
  await api.delete(`/tasks/${id}`);
};
</script>