<template>
  <div class="flex h-full">
    <!-- Navigation rail: the same information architecture as before (Games /
         Favorites / Archive / Recently / Settings), restyled on tokens. -->
    <aside
      class="bg-sidebar flex h-full w-20 shrink-0 flex-col items-center justify-between border-r py-3"
    >
      <nav class="flex flex-col items-center gap-1">
        <Tooltip>
          <TooltipTrigger as-child>
            <button
              type="button"
              :class="navItemClass(gameListStore.mode === 'games' && route.path === '/')"
              @click="navigateTo('/', 'games')"
            >
              <Gamepad2 class="size-5" />
              <span class="nav-label">Games</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Game Lib</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger as-child>
            <button
              type="button"
              :class="navItemClass(gameListStore.mode === 'favorites' && route.path === '/')"
              @click="navigateTo('/', 'favorites')"
            >
              <Star class="size-5" />
              <span class="nav-label">Favorites</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Favorites</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger as-child>
            <button
              type="button"
              :class="navItemClass(gameListStore.mode === 'archived' && route.path === '/')"
              @click="navigateTo('/', 'archived')"
            >
              <Archive class="size-5" />
              <span class="nav-label">Archive</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Archived Games</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger as-child>
            <button
              type="button"
              :class="navItemClass(route.path === '/recently')"
              @click="void router.push('/recently')"
            >
              <History class="size-5" />
              <span class="nav-label">Recently</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Recently Opened</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger as-child>
            <button
              type="button"
              :class="navItemClass(route.path === '/settings')"
              @click="void router.push('/settings')"
            >
              <SettingsIcon class="size-5" />
              <span class="nav-label">Settings</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Settings</TooltipContent>
        </Tooltip>
      </nav>

      <div class="flex flex-col items-center gap-1">
        <Tooltip>
          <TooltipTrigger as-child>
            <button type="button" :class="navItemClass(false)" @click="toggle()">
              <Moon v-if="isDark" class="size-5" />
              <Sun v-else class="size-5" />
              <span class="nav-label">{{ isDark ? 'Dark' : 'Light' }}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {{ isDark ? 'Switch to Light' : 'Switch to Dark' }}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger as-child>
            <button type="button" :class="navItemClass(false)" @click="setHideR18(!hideR18)">
              <EyeOff v-if="hideR18" class="size-5" />
              <Eye v-else class="size-5" />
              <span class="nav-label">{{ hideR18 ? 'R18 off' : 'R18 on' }}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {{ hideR18 ? 'Show R18 covers' : 'Hide R18 covers' }}
          </TooltipContent>
        </Tooltip>

        <Tooltip v-if="hasElectronAPI">
          <TooltipTrigger as-child>
            <button type="button" :class="navItemClass(false)" @click="enterLightweightMode">
              <Power class="size-5" />
              <span class="nav-label">Exit</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Enter Lightweight Mode</TooltipContent>
        </Tooltip>
      </div>
    </aside>

    <div class="flex min-w-0 flex-1 flex-col">
      <header class="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <h1 class="text-[15px] font-semibold">
          Game Lib<template v-if="route.path === '/' && gameListStore.favoritesMode">
            - Favorites</template
          ><template v-else-if="route.path === '/' && gameListStore.archivedMode">
            - Archived</template
          >
        </h1>
        <span v-if="showGameCount" class="text-muted-foreground text-sm"
          >({{ filteredCount }})</span
        >
      </header>

      <main class="min-h-0 flex-1">
        <router-view />
      </main>
    </div>

    <!-- Floating task button -->
    <Tooltip>
      <TooltipTrigger as-child>
        <Button
          size="icon"
          class="fixed right-4 bottom-4 z-40 size-12 rounded-full shadow-lg"
          @click="showTaskPanel = true"
        >
          <ListTodo class="size-5" />
          <span
            v-if="taskStore.runningCount > 0"
            class="bg-destructive text-destructive-foreground absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-medium"
          >
            {{ taskStore.runningCount }}
          </span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>Tasks</TooltipContent>
    </Tooltip>

    <TaskPanel v-model="showTaskPanel" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  Archive,
  Eye,
  EyeOff,
  Gamepad2,
  History,
  ListTodo,
  Moon,
  Power,
  Settings as SettingsIcon,
  Star,
  Sun,
} from '@lucide/vue';
import { toast } from 'vue-sonner';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useGameListStore } from '@/stores/gameListStore';
import type { GameListMode } from '@/stores/gameListStore';
import { useTaskStore } from '@/stores/taskStore';
import { useR18Toggle } from '@/composables/useR18Toggle';
import { useTheme } from '@/composables/useTheme';
import { confirm } from '@/composables/useConfirm';
import TaskPanel from '@/components/TaskPanel.vue';

const { hideR18, setHideR18 } = useR18Toggle();
const { isDark, toggle } = useTheme();
const router = useRouter();
const route = useRoute();

const gameListStore = useGameListStore();
const taskStore = useTaskStore();
const showTaskPanel = ref(false);
const filteredCount = computed(() => gameListStore.filteredCount);

const navItemClass = (active: boolean) =>
  cn(
    'flex w-14 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl py-2 select-none',
    'text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
    active && 'bg-secondary text-secondary-foreground',
  );

// Backup results are announced wherever the user happens to be - the TaskPanel row alone was
// too easy to miss, so a failed backup looked like nothing happened. Only tasks seen active
// first are announced, so terminal tasks replayed by an SSE reconnect stay silent.
const seenActiveBackups = new Set<string>();
watch(
  () =>
    [...taskStore.tasks.values()]
      .filter((t) => t.type === 'backup')
      .map((t) => `${t.id}:${t.status}`)
      .join('|'),
  () => {
    for (const task of taskStore.tasks.values()) {
      if (task.type !== 'backup') continue;
      if (task.status === 'pending' || task.status === 'running') {
        seenActiveBackups.add(task.id);
      } else if (seenActiveBackups.has(task.id)) {
        seenActiveBackups.delete(task.id);
        if (task.status === 'completed') {
          toast.success(task.detail || 'Backup completed');
        } else if (task.status === 'failed') {
          toast.error(`Backup failed: ${(task.error || 'unknown error').slice(0, 160)}`);
        }
        // cancelled: the user cancelled it themselves, no announcement needed
      }
    }
  },
);

// The count describes the game list, so it is only shown on the list route
// (both the normal and the favorites view) - not on the detail or settings pages.
const showGameCount = computed(() => route.path === '/');

const hasElectronAPI = computed(() => !!window.electronAPI);

const navigateTo = (path: string, listMode: GameListMode) => {
  // Record which rail entry owns the list page, so the list can reset view-only state
  // (selection mode in particular) instead of leaking it across Games, Favorites and Archive.
  gameListStore.favoritesMode = listMode === 'favorites';
  gameListStore.archivedMode = listMode === 'archived';
  gameListStore.mode = listMode;
  void router.push(path);
};

const enterLightweightMode = async () => {
  if (!window.electronAPI) return;
  await window.electronAPI.enterLightweightMode();
};

onMounted(() => {
  void taskStore.connectSSE();

  if (window.electronAPI) {
    window.electronAPI.onMoveInProgress?.(() => {
      void confirm({
        title: 'Task In Progress',
        message:
          'A file task (move / extract / compress) is still running. Closing now may leave it half-finished. Force quit?',
        okLabel: 'Force Quit',
        cancelLabel: 'Stay',
        destructive: true,
      }).then((ok) => {
        if (ok) void window.electronAPI?.forceQuit?.();
      });
    });
  }

  // Fallback for non-root routes (e.g. directly landing on /settings)
  if (route.path !== '/') {
    setTimeout(() => {
      if (window.electronAPI?.readyForBackgroundTasks) {
        void window.electronAPI.readyForBackgroundTasks();
      }
    }, 1000);
  }
});
</script>

<style scoped>
/* Rail label styling that is easier to keep in one place than repeated on
   every rail button. */
.nav-label {
  font-size: 11px;
  font-weight: 500;
  line-height: 1.2;
  white-space: nowrap;
}
</style>
