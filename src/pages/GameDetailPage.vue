<template>
  <q-page style="overflow: hidden; display: flex; flex-direction: column">
    <div v-if="game" class="q-pa-md" style="display: flex; flex-direction: column; height: 100%">
      <div>
        <q-btn
          flat
          round
          icon="arrow_back"
          style="color: var(--m3-on-surface-variant)"
          class="q-mb-md"
          @click="$router.push('/')"
        />
        <q-btn
          flat
          round
          icon="refresh"
          style="color: var(--m3-primary)"
          class="q-mb-md"
          @click="showScrapeDialog = true"
        >
          <q-tooltip>Re-scrape</q-tooltip>
        </q-btn>
        <q-btn
          flat
          round
          icon="delete"
          style="color: var(--m3-error)"
          class="q-mb-md"
          @click="confirmDelete = true"
        >
          <q-tooltip>Delete</q-tooltip>
        </q-btn>
      </div>

      <div style="flex: 1; min-height: 0; overflow: hidden">
        <div style="display: flex; gap: 16px; height: 100%">
          <div
            style="
              flex-shrink: 0;
              max-width: 300px;
              display: flex;
              flex-direction: column;
              min-height: 0;
            "
          >
            <div
              style="min-height: 0; flex-shrink: 1; overflow: hidden; position: relative"
              @dragenter.prevent="onCoverDragEnter"
              @dragover.prevent="onCoverDragOver"
              @dragleave.prevent="onCoverDragLeave"
              @drop.prevent="onCoverDrop"
            >
              <q-img
                v-if="game.cover_path"
                :src="coverUrl"
                :ratio="3 / 4"
                class="rounded-borders"
                style="max-height: 100%"
              />
              <div
                v-else
                class="bg-grey-4 rounded-borders"
                style="
                  aspect-ratio: 3/4;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  max-height: 100%;
                "
              >
                <q-icon name="videogame_asset" size="64px" color="grey-6" />
              </div>
              <div
                v-if="coverDragOver"
                class="absolute-full rounded-borders flex flex-center"
                style="
                  background: rgba(0, 0, 0, 0.5);
                  border: 2px dashed var(--m3-primary);
                  z-index: 10;
                "
              >
                <div class="text-center text-white">
                  <q-icon name="image" size="48px" />
                  <div class="text-subtitle2 q-mt-sm">Drop image to set cover</div>
                </div>
              </div>
            </div>

            <div v-if="!editingPath" class="text-caption text-grey q-mt-sm">
              Path: {{ game.library ? game.library.path + '\\' + game.sub_path : game.sub_path }}
              <q-btn
                v-if="hasElectronAPI"
                flat
                round
                dense
                size="sm"
                icon="folder_open"
                color="grey-7"
                @click="openDir"
              >
                <q-tooltip>Open Directory</q-tooltip>
              </q-btn>
              <q-btn
                flat
                round
                dense
                size="sm"
                icon="edit"
                color="grey-7"
                :disable="gameBusy"
                @click="startEditPath"
              >
                <q-tooltip>{{
                  gameBusy ? 'A task is still running for this game' : 'Edit Path'
                }}</q-tooltip>
              </q-btn>
            </div>
            <div v-else class="q-mt-sm row items-center q-gutter-xs">
              <q-input
                v-model="editPathValue"
                dense
                outlined
                style="flex: 1; min-width: 0"
                @keyup.enter="submitEditPath"
                @keyup.escape="cancelEditPath"
              />
              <q-btn
                v-if="hasElectronAPI"
                flat
                round
                dense
                size="sm"
                icon="folder_open"
                color="grey-7"
                @click="browseForRelocate"
              >
                <q-tooltip>Browse</q-tooltip>
              </q-btn>
              <q-btn
                flat
                round
                dense
                size="sm"
                icon="check"
                color="positive"
                @click="submitEditPath"
              >
                <q-tooltip>Save</q-tooltip>
              </q-btn>
              <q-btn flat round dense size="sm" icon="close" color="grey-7" @click="cancelEditPath">
                <q-tooltip>Cancel</q-tooltip>
              </q-btn>
            </div>

            <div v-if="game.sources?.length" class="text-caption text-grey q-mt-xs">
              <span v-for="s in game.sources" :key="s.id" class="q-mr-md">
                {{ s.source_type }}: {{ s.source_id }}
                <a
                  v-if="s.source_url"
                  :href="s.source_url"
                  class="text-blue"
                  @click.prevent="openExternal(s.source_url)"
                  >Link</a
                >
              </span>
            </div>

            <div v-if="game.duplicateSources?.length" class="q-mt-sm">
              <q-banner dense class="bg-orange-1 text-orange-9 rounded-borders">
                <template v-slot:avatar>
                  <q-icon name="content_copy" color="warning" />
                </template>
                <div class="text-caption text-weight-medium">Shared Source</div>
                <div v-for="(dup, i) in game.duplicateSources" :key="i" class="q-mt-xs">
                  <q-badge :color="sourceColor(dup.sourceType)" class="q-mr-xs">{{
                    dup.sourceType
                  }}</q-badge>
                  <span class="text-caption text-grey">{{ dup.sourceId }}</span>
                  <div v-for="g in dup.games" :key="g.gameId" class="q-ml-md">
                    <router-link :to="`/game/${g.gameId}`" class="text-blue text-caption">{{
                      g.name
                    }}</router-link>
                    <span class="text-caption text-grey q-ml-xs">(ID: {{ g.gameId }})</span>
                  </div>
                </div>
              </q-banner>
            </div>
          </div>

          <div
            style="flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden"
          >
            <div>
              <div class="text-h5 q-mb-sm" style="color: var(--m3-on-surface)">
                {{ displayName }}
              </div>
              <div
                v-if="displayName !== game.name"
                class="text-caption"
                style="color: var(--m3-on-surface-variant)"
              >
                <q-icon name="folder" size="xs" class="q-mr-xs" />
                {{ game.name }}
              </div>

              <div v-if="game.makers?.length" class="q-mb-sm">
                <span style="color: var(--m3-on-surface-variant)">Makers: </span>
                <q-chip
                  v-for="m in game.makers"
                  :key="m.id"
                  dense
                  size="sm"
                  style="
                    background: var(--m3-tertiary-container);
                    color: var(--m3-on-tertiary-container);
                  "
                >
                  {{ m.name }}
                </q-chip>
              </div>

              <div v-if="game.genres?.length" class="q-mb-sm">
                <span style="color: var(--m3-on-surface-variant)">Genres: </span>
                <q-chip
                  v-for="g in game.genres"
                  :key="g.id"
                  dense
                  size="sm"
                  style="
                    background: var(--m3-primary-container);
                    color: var(--m3-on-primary-container);
                  "
                >
                  {{ g.name }}
                </q-chip>
              </div>

              <div v-if="game.tags?.length" class="q-mb-sm">
                <span style="color: var(--m3-on-surface-variant)">Tags: </span>
                <q-chip
                  v-for="t in game.tags"
                  :key="t.id"
                  dense
                  size="sm"
                  style="
                    background: var(--m3-secondary-container);
                    color: var(--m3-on-secondary-container);
                  "
                >
                  {{ t.name }}
                </q-chip>
              </div>
            </div>

            <div v-if="game.description" style="flex: 1; min-height: 0; overflow-y: auto">
              <span style="color: var(--m3-on-surface-variant)">Description: </span>
              <div
                class="text-body2 q-mt-xs"
                style="white-space: pre-wrap; color: var(--m3-on-surface)"
              >
                {{ game.description }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="text-center text-grey q-mt-xl">
      <q-spinner-dots size="40px" />
    </div>

    <q-dialog v-model="confirmDelete" persistent>
      <q-card>
        <q-card-section class="text-h6" style="color: var(--m3-on-surface)"
          >Confirm Delete</q-card-section
        >
        <q-card-section>
          <span style="color: var(--m3-on-surface)"
            >Are you sure you want to delete "{{ displayName }}"?</span
          >
          <div class="text-caption q-mt-xs" style="color: var(--m3-on-surface-variant)">
            This will also remove all associated sources, makers, genres, and tags.
          </div>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat class="m3-btn--text" label="Cancel" v-close-popup />
          <q-btn
            unelevated
            style="background: var(--m3-error) !important; color: var(--m3-on-error) !important"
            label="Delete"
            @click="doDelete"
            :loading="deleting"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <ScrapeDialog
      v-model="showScrapeDialog"
      :game-name="game?.name || ''"
      :game-id="game?.id || 0"
      :default-keyword="game?.name || undefined"
      :default-source="scrapeDefaultSource"
      :initial-segments="splitKeyword(game?.name || '').segments"
      @adopted="onReScrape"
    />

    <q-dialog v-model="confirmRelocate" persistent>
      <q-card>
        <q-card-section class="text-h6" style="color: var(--m3-on-surface)"
          >Confirm Path Change</q-card-section
        >
        <q-card-section>
          <div class="q-mb-sm">
            <span style="color: var(--m3-on-surface-variant)">From: </span
            ><span style="color: var(--m3-on-surface)">{{ relocateInfo?.source }}</span>
          </div>
          <div class="q-mb-md">
            <span style="color: var(--m3-on-surface-variant)">To: </span
            ><span style="color: var(--m3-on-surface)">{{ relocateInfo?.target }}</span>
          </div>
          <q-toggle
            v-model="relocateMoveFiles"
            label="Move files to new location"
            color="primary"
            :disable="relocateInfo?.moveDisabled"
          />
          <q-toggle
            v-if="!relocateInfo?.compressDisabled"
            v-model="relocateCompressFiles"
            label="Compress to .rar (archive folder)"
            color="primary"
            :disable="!relocateMoveFiles"
          />
          <q-banner
            v-if="relocateMoveFiles && relocateCompressFiles"
            dense
            class="bg-purple-1 text-purple-9 rounded-borders q-mt-sm"
          >
            <template v-slot:avatar>
              <q-icon name="archive" color="purple" />
            </template>
            Will compress folder to .rar and move archive to new location
          </q-banner>
          <q-banner
            v-else-if="relocateMoveFiles"
            dense
            class="bg-blue-1 text-blue-9 rounded-borders q-mt-sm"
          >
            <template v-slot:avatar>
              <q-icon name="drive_file_move" color="blue" />
            </template>
            Will move folder to new location
          </q-banner>
          <q-banner v-else dense class="bg-orange-1 text-orange-9 rounded-borders q-mt-sm">
            <template v-slot:avatar>
              <q-icon name="edit_note" color="orange" />
            </template>
            Will only update path record (file will not be moved)
          </q-banner>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat class="m3-btn--text" label="Cancel" v-close-popup />
          <q-btn
            unelevated
            class="m3-btn--filled"
            label="Confirm"
            @click="doRelocate"
            :loading="relocating"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useQuasar } from 'quasar';
import { useRoute, useRouter } from 'vue-router';
import api from '../composables/useApi';
import ScrapeDialog from '../components/ScrapeDialog.vue';
import { splitKeyword } from '../composables/useSplitKeyword';
import { useExpressUrl } from '../composables/useExpressUrl';
import { useTaskStore } from '../stores/taskStore';

interface GameDetail {
  id: number;
  name: string;
  cover_path: string | null;
  description: string | null;
  sub_path: string;
  makers: { id: number; name: string }[];
  genres: { id: number; name: string }[];
  tags: { id: number; name: string }[];
  sources: {
    id: number;
    source_type: string;
    source_id: string;
    source_url: string | null;
    name: string | null;
  }[];
  library: { id: number; name: string; path: string } | null;
  duplicateSources: {
    sourceType: string;
    sourceId: string;
    games: { gameId: number; name: string }[];
  }[];
}

const route = useRoute();
const router = useRouter();
const game = ref<GameDetail | null>(null);
const showScrapeDialog = ref(false);

const { getCoversUrl } = useExpressUrl();

const coverUrl = computed(() => {
  if (game.value?.cover_path) {
    return getCoversUrl(game.value.cover_path);
  }
  return '';
});

const coverDragOver = ref(false);
let coverDragCounter = 0;

// preventDefault is handled by the `.prevent` modifiers in the template, so these take no
// event argument.
const onCoverDragEnter = () => {
  coverDragCounter++;
  coverDragOver.value = true;
};

const onCoverDragOver = () => {
  coverDragOver.value = true;
};

const onCoverDragLeave = () => {
  coverDragCounter--;
  if (coverDragCounter <= 0) {
    coverDragCounter = 0;
    coverDragOver.value = false;
  }
};

const onCoverDrop = async (e: DragEvent) => {
  coverDragOver.value = false;
  coverDragCounter = 0;

  const file = e.dataTransfer?.files[0];
  if (!file || !file.type.startsWith('image/')) {
    $q.notify({ type: 'warning', message: 'Please drop an image file to set the cover' });
    return;
  }

  // Without Electron there is no way to give the server a real filesystem path, so say so
  // instead of appearing to do nothing.
  if (!window.electronAPI) {
    $q.notify({
      type: 'warning',
      message: 'Setting a cover by drag and drop is only available in the desktop app',
    });
    return;
  }

  const localImagePath = window.electronAPI.getFilePath(file);
  if (!localImagePath) {
    $q.notify({ type: 'warning', message: 'Could not read the dropped file' });
    return;
  }

  try {
    const res = await api.put(`/games/${game.value?.id}/manual-cover`, {
      imagePath: localImagePath,
    });
    game.value = res.data;
    $q.notify({ type: 'positive', message: 'Cover updated successfully' });
  } catch (err) {
    // Surface the server's reason (unsupported format, missing file) - a bare "failed"
    // leaves the user with no idea which of their files was rejected or why.
    const detail = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
    $q.notify({
      type: 'negative',
      message: detail ? `Failed to update cover: ${detail}` : 'Failed to update cover',
    });
  }
};

// Source list comes from match.js rather than a hardcoded union: the union had to be
// edited every time a source was added, and forgetting meant the tab silently fell back
// to the auto-detected source.
const scrapeDefaultSource = computed<SourceType | undefined>(() => {
  const type = game.value?.sources?.[0]?.source_type;
  return SOURCE_TYPES.includes(type as SourceType) ? (type as SourceType) : undefined;
});
const confirmDelete = ref(false);
const deleting = ref(false);
const editingPath = ref(false);
const editPathValue = ref('');
const relocating = ref(false);
const $q = useQuasar();
const confirmRelocate = ref(false);
const relocateMoveFiles = ref(false);
const relocateCompressFiles = ref(false);
const relocateInfo = ref<{
  source: string;
  target: string;
  moveDisabled: boolean;
  compressDisabled: boolean;
} | null>(null);

const taskStore = useTaskStore();

// A game with a relocate task still in flight must not be relocated again. The flag is derived
// from the in-memory task list, so nothing is persisted and the SSE completion update re-enables
// editing by itself - no page-side bookkeeping to get out of sync.
const gameBusy = computed(() => taskStore.isGameBusy(game.value?.id));
// The task this page started, so its outcome can be reported once it settles.
const pendingRelocate = ref<string | null>(null);

const TASK_DONE_LABEL: Record<string, string> = {
  move: 'Move completed',
  extract: 'Extraction completed',
  compress: 'Compression completed',
};

// Watching the derived busy flag (instead of subscribing to the task itself) cannot miss the
// completion: a task that finishes before we start watching already leaves the flag false, and
// any later settle flips it true -> false, which a watcher always observes.
watch(gameBusy, (busy, wasBusy) => {
  if (!wasBusy || busy) return;
  void loadGame();
  const taskId = pendingRelocate.value;
  if (!taskId) return;
  pendingRelocate.value = null;
  const task = taskStore.tasks.get(taskId);
  if (!task) return;
  if (task.status === 'completed') {
    $q.notify({ type: 'positive', message: TASK_DONE_LABEL[task.type] || 'Task completed' });
  } else if (task.status === 'failed') {
    $q.notify({ type: 'negative', message: task.error || 'Task failed' });
  }
});

const hasElectronAPI = computed(() => !!window.electronAPI);

const displayName = computed(() => {
  const source = game.value?.sources?.find((s) => s.name);
  return source?.name || game.value?.name || '';
});

const sourceColor = (source: string) => {
  if (source === 'dlsite') return 'deep-purple';
  if (source === 'dmm') return 'pink';
  if (source === 'bangumi') return 'orange';
  if (source === 'vndb') return 'cyan';
  if (source === 'steam') return 'blue-grey';
  return 'grey';
};

const openExternal = (url: string) => {
  if (window.electronAPI) {
    void window.electronAPI.openExternal(url);
  } else {
    window.open(url, '_blank');
  }
};

const isAbsolute = (p: string) => /^[a-zA-Z]:/.test(p) || p.startsWith('\\\\');

const openDir = async () => {
  if (!window.electronAPI) return;
  if (!game.value?.sub_path) return;
  const fullPath = isAbsolute(game.value.sub_path)
    ? game.value.sub_path
    : game.value.library?.path
      ? game.value.library.path + '\\' + game.value.sub_path
      : null;
  if (!fullPath) return;
  await window.electronAPI.openPath(fullPath);
  // Opening the folder is the event that feeds the Recently list, so record it after the
  // shell actually took the path - not when the click happened.
  void recordRecentOpen(game.value.id);
};

// A failed history write must never break the open itself (a game with no row in `recently`
// still opens fine), so this deliberately swallows and only logs.
const recordRecentOpen = async (gameId: number) => {
  try {
    await api.post(`/recently/${gameId}`);
  } catch (err) {
    console.warn('Failed to record recent open', err);
  }
};

const currentFullPath = computed(() => {
  if (!game.value?.sub_path) return '';
  return isAbsolute(game.value.sub_path)
    ? game.value.sub_path
    : game.value.library?.path
      ? game.value.library.path + '\\' + game.value.sub_path
      : '';
});

const startEditPath = () => {
  // One relocate per game: the button is disabled while a task runs, and this keeps the
  // keyboard/other entry points honest too.
  if (gameBusy.value) {
    $q.notify({ type: 'info', message: 'A task is still running for this game' });
    return;
  }
  editPathValue.value = currentFullPath.value;
  editingPath.value = true;
};

const cancelEditPath = () => {
  editingPath.value = false;
  editPathValue.value = '';
};

const getGameBaseName = () => {
  const fullPath = currentFullPath.value;
  const lastPart = fullPath.split('\\').pop() || '';
  const archiveExts = [
    'zip',
    '7z',
    'rar',
    '001',
    '002',
    '003',
    '004',
    '005',
    '006',
    '007',
    '008',
    '009',
  ];
  const ext = lastPart.split('.').pop()?.toLowerCase() || '';
  if (archiveExts.includes(ext)) {
    return lastPart.substring(0, lastPart.lastIndexOf('.'));
  }
  return lastPart;
};

const browseForRelocate = async () => {
  if (!window.electronAPI?.openPathForRelocate) return;
  const selected = await window.electronAPI.openPathForRelocate();
  if (selected) {
    const baseName = getGameBaseName();
    if (baseName && !selected.endsWith(baseName)) {
      editPathValue.value = selected + '\\' + baseName;
    } else {
      editPathValue.value = selected;
    }
  }
};

const submitEditPath = () => {
  const newPath = editPathValue.value.trim();
  if (!newPath || newPath === currentFullPath.value) {
    editingPath.value = false;
    return;
  }

  const baseName = getGameBaseName();
  if (baseName && !newPath.endsWith(baseName)) {
    $q.dialog({
      title: 'Path Warning',
      message: `The new path does not contain the game name "${baseName}". Apply anyway?`,
      cancel: true,
      persistent: true,
    }).onOk(() => {
      showRelocateConfirm(newPath);
    });
    return;
  }

  showRelocateConfirm(newPath);
};

const showRelocateConfirm = (newPath: string) => {
  const ext = currentFullPath.value.split('.').pop()?.toLowerCase() || '';
  const archiveExts = [
    'zip',
    '7z',
    'rar',
    '001',
    '002',
    '003',
    '004',
    '005',
    '006',
    '007',
    '008',
    '009',
  ];
  const isArchive = archiveExts.includes(ext);
  const moveDisabled = isArchive;
  // Compress is only available for directories (not archives) and when moveFiles is enabled
  const compressDisabled = isArchive;

  relocateMoveFiles.value = !isArchive;
  relocateCompressFiles.value = !isArchive;
  relocateInfo.value = {
    source: currentFullPath.value,
    target: newPath,
    moveDisabled,
    compressDisabled,
  };
  confirmRelocate.value = true;
};

const doRelocate = async () => {
  if (!game.value || !editPathValue.value.trim()) return;
  if (gameBusy.value) {
    confirmRelocate.value = false;
    $q.notify({ type: 'info', message: 'A task is still running for this game' });
    return;
  }
  const isArchiveRelocate = relocateInfo.value?.moveDisabled;
  const isCompressRelocate = relocateCompressFiles.value;
  const targetPath = editPathValue.value.trim();
  const sourcePath = relocateInfo.value?.source || '';
  confirmRelocate.value = false;
  relocating.value = true;
  try {
    const res = await api.put(`/games/${game.value.id}/relocate`, {
      newPath: targetPath,
      moveFiles: relocateMoveFiles.value,
      compressFiles: relocateCompressFiles.value,
    });

    const { taskId, operation } = res.data;

    editingPath.value = false;
    relocating.value = false;

    if (!taskId) {
      await loadGame();
      if (isArchiveRelocate) {
        try {
          await navigator.clipboard.writeText(targetPath);
        } catch {
          /* clipboard may not be available */
        }
        $q.dialog({
          title: 'Archive Relocated',
          message: 'Target path copied to clipboard. Open the archive for extraction?',
          cancel: true,
          persistent: false,
        }).onOk(() => {
          if (sourcePath) {
            void window.electronAPI?.openPath(sourcePath);
          }
        });
      }
      if (isCompressRelocate && res.data.compressSkipped) {
        $q.notify({
          type: 'warning',
          message: `Compression skipped: ${res.data.reason}`,
        });
      }
      return;
    }

    $q.notify({
      type: 'info',
      message:
        operation === 'move'
          ? 'File move started in background'
          : operation === 'extract'
            ? 'Extraction started in background'
            : 'Compression started in background',
      icon:
        operation === 'move' ? 'drive_file_move' : operation === 'extract' ? 'archive' : 'compress',
    });

    // The busy watcher above reloads the path and reports the outcome once this settles.
    pendingRelocate.value = taskId;
  } catch (err: unknown) {
    relocating.value = false;
    const e = err as {
      response?: { status?: number; data?: { conflict?: string; destExists?: boolean } };
    };
    if (e.response?.status === 409 && e.response.data?.conflict) {
      $q.dialog({
        title: 'Target Conflict',
        message: 'Target path already exists and is not empty. Continue anyway?',
        cancel: true,
        persistent: true,
      }).onOk(() => {
        void doRelocateWithForce(targetPath);
      });
    }
  }
};

const doRelocateWithForce = async (targetPath: string) => {
  if (!game.value) return;
  relocating.value = true;
  try {
    const res = await api.put(`/games/${game.value.id}/relocate`, {
      newPath: targetPath,
      moveFiles: relocateMoveFiles.value,
      compressFiles: relocateCompressFiles.value,
      force: true,
    });
    const { taskId, operation } = res.data;
    editingPath.value = false;
    relocating.value = false;

    if (!taskId) {
      await loadGame();
      return;
    }

    $q.notify({
      type: 'info',
      message:
        operation === 'move'
          ? 'File move started in background'
          : operation === 'extract'
            ? 'Extraction started in background'
            : 'Compression started in background',
    });

    // The busy watcher above reloads the path and reports the outcome once this settles.
    pendingRelocate.value = taskId;
  } catch {
    relocating.value = false;
  }
};

const loadGame = async () => {
  const gameId = String(route.params.id);
  const res = await api.get(`/games/${gameId}`);
  game.value = res.data;
};

import type { SourceType, AdoptData } from '../types/scrape';
import { SOURCE_TYPES } from '../../server/scraper/match.js';

const getSourceUrl = (source: SourceType, sourceId: string): string => {
  if (source === 'dlsite')
    return `https://www.dlsite.com/maniax/work/=/product_id/${sourceId}.html`;
  if (source === 'dmm') return `https://www.dmm.co.jp/dc/doujin/-/detail/=/cid=${sourceId}/`;
  if (source === 'bangumi') return `https://bgm.tv/subject/${sourceId}`;
  if (source === 'vndb') return `https://vndb.org/${sourceId}`;
  if (source === 'steam') return `https://store.steampowered.com/app/${sourceId}`;
  return '';
};

const onReScrape = async (data: AdoptData) => {
  if (!game.value) return;
  await api.post('/scraper/adopt', {
    gameId: game.value.id,
    sourceType: data.source,
    sourceId: data.sourceId,
    sourceUrl: getSourceUrl(data.source, data.sourceId),
    name: data.detail.title,
    coverUrl: data.detail.coverURL || data.coverUrl,
    makers: data.detail.makers,
    genres: data.detail.genres,
    tags: data.detail.tags,
    description: data.detail.description,
  });
  await loadGame();
};

const doDelete = async () => {
  if (!game.value) return;
  deleting.value = true;
  try {
    await api.delete(`/games/${game.value.id}`);
    confirmDelete.value = false;
    void router.replace('/');
  } catch {
    // handled by error interceptor
  } finally {
    deleting.value = false;
  }
};

onMounted(() => {
  void loadGame();
});

watch(
  () => route.params.id,
  () => {
    void loadGame();
  },
);
</script>
