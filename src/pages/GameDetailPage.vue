<template>
  <div class="h-full overflow-y-auto">
    <div v-if="game" class="mx-auto max-w-5xl p-6">
      <div class="mb-4 flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          class="text-muted-foreground"
          aria-label="Back"
          @click="router.push('/')"
        >
          <ArrowLeft class="size-4" />
        </Button>
        <Tooltip>
          <TooltipTrigger as-child>
            <Button
              variant="ghost"
              size="icon-sm"
              class="text-primary"
              aria-label="Re-scrape"
              @click="showScrapeDialog = true"
            >
              <RefreshCw class="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Re-scrape</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger as-child>
            <Button
              variant="ghost"
              size="icon-sm"
              class="text-muted-foreground"
              :aria-label="game.is_archived ? 'Unarchive' : 'Archive'"
              @click="toggleArchive"
            >
              <ArchiveRestore v-if="game.is_archived" class="size-4" />
              <Archive v-else class="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{{ game.is_archived ? 'Unarchive' : 'Archive' }}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger as-child>
            <Button
              variant="ghost"
              size="icon-sm"
              class="text-destructive"
              aria-label="Delete"
              @click="doDelete"
            >
              <Trash2 class="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Delete</TooltipContent>
        </Tooltip>
      </div>

      <div class="flex flex-col gap-6 md:flex-row">
        <aside class="w-full shrink-0 md:w-[300px]">
          <div
            class="relative w-full max-w-[300px]"
            @dragenter.prevent="onCoverDragEnter"
            @dragover.prevent="onCoverDragOver"
            @dragleave.prevent="onCoverDragLeave"
            @drop.prevent="onCoverDrop"
          >
            <div class="bg-muted aspect-[3/4] overflow-hidden rounded-lg">
              <!-- A cover can be missing for two different reasons - never scraped, or the
                   file is not a decodable image - and both fall back to a placeholder
                   instead of leaving the pane blank. -->
              <img
                v-if="game.cover_path && !coverFailed"
                :src="coverUrl"
                class="h-full w-full object-cover"
                draggable="false"
                alt=""
                @error="coverFailed = true"
              />
              <div
                v-else
                class="text-muted-foreground flex h-full w-full items-center justify-center"
              >
                <ImageOff v-if="coverFailed" class="size-16 opacity-60" />
                <Gamepad2 v-else class="size-16 opacity-60" />
              </div>
            </div>
            <div
              v-if="coverDragOver"
              class="border-primary absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed bg-black/50"
            >
              <div class="text-center text-white">
                <Image class="mx-auto size-10" />
                <div class="mt-1 text-sm font-medium">Drop image to set cover</div>
              </div>
            </div>
          </div>

          <div v-if="!editingPath" class="text-muted-foreground mt-2 text-xs">
            <span class="break-all"
              >Path:
              {{ game.library ? game.library.path + '\\' + game.sub_path : game.sub_path }}</span
            >
            <Tooltip v-if="hasElectronAPI">
              <TooltipTrigger as-child>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  class="text-muted-foreground ml-1 align-middle"
                  aria-label="Open Directory"
                  @click="openDir"
                >
                  <FolderOpen class="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Open Directory</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  class="text-muted-foreground ml-1 align-middle"
                  aria-label="Edit Path"
                  :disabled="gameBusy"
                  @click="startEditPath"
                >
                  <Pencil class="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{{
                gameBusy ? 'A task is still running for this game' : 'Edit Path'
              }}</TooltipContent>
            </Tooltip>
          </div>
          <div v-else class="mt-2 flex items-center gap-1">
            <Input
              v-model="editPathValue"
              class="h-8 min-w-0 flex-1 text-[13px]"
              @keyup.enter="submitEditPath"
              @keyup.escape="cancelEditPath"
            />
            <Tooltip v-if="hasElectronAPI">
              <TooltipTrigger as-child>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  class="text-muted-foreground"
                  aria-label="Browse"
                  @click="browseForRelocate"
                >
                  <FolderOpen class="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Browse</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  class="text-success"
                  aria-label="Save"
                  @click="submitEditPath"
                >
                  <Check class="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Save</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  class="text-muted-foreground"
                  aria-label="Cancel"
                  @click="cancelEditPath"
                >
                  <X class="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Cancel</TooltipContent>
            </Tooltip>
          </div>

          <div
            v-if="game.sources?.length"
            class="text-muted-foreground mt-1 flex flex-wrap gap-x-3 text-xs"
          >
            <span v-for="s in game.sources" :key="s.id">
              {{ s.source_type }}: {{ s.source_id }}
              <a
                v-if="s.source_url"
                :href="s.source_url"
                class="text-primary ml-1 hover:underline"
                @click.prevent="openExternal(s.source_url)"
                >Link</a
              >
            </span>
          </div>

          <div
            v-if="game.duplicateSources?.length"
            class="border-warning/40 bg-warning/10 mt-3 rounded-lg border p-2.5"
          >
            <div class="flex items-center gap-1.5 text-xs font-medium">
              <Copy class="text-warning size-4" />
              Shared Source
            </div>
            <div v-for="(dup, i) in game.duplicateSources" :key="i" class="mt-1">
              <span
                :class="
                  cn('rounded px-1.5 py-0.5 text-[11px] font-medium', sourceClass(dup.sourceType))
                "
                >{{ dup.sourceType }}</span
              >
              <span class="text-muted-foreground ml-1 text-xs">{{ dup.sourceId }}</span>
              <div v-for="g in dup.games" :key="g.gameId" class="ml-3">
                <router-link
                  :to="`/game/${g.gameId}`"
                  class="text-primary text-xs hover:underline"
                  >{{ g.name }}</router-link
                >
                <span class="text-muted-foreground ml-1 text-xs">(ID: {{ g.gameId }})</span>
              </div>
            </div>
          </div>
          <div
            v-if="game.similarGames?.length"
            class="border-warning/40 bg-warning/10 mt-3 rounded-lg border p-2.5"
          >
            <div class="flex items-center gap-1.5 text-xs font-medium">
              <Merge class="text-warning size-4" />
              Suspected duplicate
            </div>
            <div
              v-for="s in game.similarGames"
              :key="s.gameId"
              class="mt-1 flex items-center gap-2"
            >
              <router-link
                v-if="!s.isSelf"
                :to="`/game/${s.gameId}`"
                class="text-primary min-w-0 flex-1 truncate text-xs hover:underline"
                >{{ s.name }}</router-link
              >
              <span v-else class="min-w-0 flex-1 truncate text-xs font-medium">{{ s.name }}</span>
              <span
                :class="
                  cn(
                    'shrink-0 rounded px-1.5 py-0.5 text-[11px]',
                    s.isArchive ? 'bg-muted text-muted-foreground' : 'bg-success/15 text-success',
                  )
                "
                >{{ s.isArchive ? 'archive' : 'folder' }}</span
              >
              <span class="text-muted-foreground shrink-0 text-xs">{{
                formatDate(s.dirCreatedAt)
              }}</span>
            </div>
          </div>
        </aside>

        <div class="min-w-0 flex-1">
          <div>
            <div class="text-xl font-semibold">{{ displayName }}</div>
            <div
              v-if="displayName !== game.name"
              class="text-muted-foreground mt-1 flex items-center gap-1 text-xs"
            >
              <Folder class="size-3.5" />
              {{ game.name }}
            </div>

            <div class="mt-2 mb-2 flex items-center gap-2">
              <span class="text-muted-foreground text-xs">R18:</span>
              <div class="bg-muted inline-flex items-center gap-0.5 rounded-md p-0.5">
                <button
                  v-for="opt in r18Options"
                  :key="opt.value"
                  type="button"
                  :class="r18OptionClass(opt.value)"
                  @click="setR18(opt.value)"
                >
                  {{ opt.label }}
                </button>
              </div>
              <span v-if="game.r18_source" class="text-muted-foreground/70 text-xs"
                >({{ game.r18_source }})</span
              >
            </div>

            <div v-if="game.makers?.length" class="mb-2">
              <span class="text-muted-foreground text-sm">Makers: </span>
              <span
                v-for="m in game.makers"
                :key="m.id"
                class="bg-secondary text-secondary-foreground mr-1 rounded px-1.5 py-0.5 text-xs"
              >
                {{ m.name }}
              </span>
            </div>

            <div v-if="game.genres?.length" class="mb-2">
              <span class="text-muted-foreground text-sm">Genres: </span>
              <span
                v-for="g in game.genres"
                :key="g.id"
                class="bg-info/15 text-info mr-1 rounded px-1.5 py-0.5 text-xs"
              >
                {{ g.name }}
              </span>
            </div>

            <div v-if="game.tags?.length" class="mb-2">
              <span class="text-muted-foreground text-sm">Tags: </span>
              <span
                v-for="t in game.tags"
                :key="t.id"
                class="bg-success/15 text-success mr-1 rounded px-1.5 py-0.5 text-xs"
              >
                {{ t.name }}
              </span>
            </div>
          </div>

          <div v-if="game.description" class="mt-4">
            <span class="text-muted-foreground text-sm">Description: </span>
            <div class="mt-1 text-sm whitespace-pre-wrap">
              {{ game.description }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="text-muted-foreground flex h-full items-center justify-center">
      <Loader2 class="text-primary size-10 animate-spin" />
    </div>

    <ScrapeDialog
      v-model="showScrapeDialog"
      :game-name="game?.name || ''"
      :game-id="game?.id || 0"
      :default-keyword="game?.name || undefined"
      :default-source="scrapeDefaultSource"
      :initial-segments="splitKeyword(game?.name || '').segments"
      @adopted="onReScrape"
    />

    <!-- Richer than a yes/no: the target/source paths, the move/compress switches and the
         outcome preview all decide what the server does, so this stays a real dialog. -->
    <Dialog :open="confirmRelocate" @update:open="confirmRelocate = $event">
      <DialogContent class="sm:max-w-lg" @pointer-down-outside.prevent>
        <DialogHeader>
          <DialogTitle>Confirm Path Change</DialogTitle>
        </DialogHeader>

        <div class="space-y-3 text-sm">
          <div>
            <span class="text-muted-foreground">From: </span
            ><span class="break-all">{{ relocateInfo?.source }}</span>
          </div>
          <div>
            <span class="text-muted-foreground">To: </span
            ><span class="break-all">{{ relocateInfo?.target }}</span>
          </div>
        </div>

        <div class="space-y-2">
          <div class="flex items-center gap-2">
            <Switch v-model="relocateMoveFiles" :disabled="relocateInfo?.moveDisabled" />
            <span class="text-sm">Move files to new location</span>
          </div>
          <div v-if="!relocateInfo?.compressDisabled" class="flex items-center gap-2">
            <Switch v-model="relocateCompressFiles" :disabled="!relocateMoveFiles" />
            <span class="text-sm">Compress to .rar (archive folder)</span>
          </div>
        </div>

        <div
          v-if="relocateMoveFiles && relocateCompressFiles"
          class="border-primary/40 bg-primary/10 text-primary flex items-start gap-2 rounded-lg border p-2.5 text-xs"
        >
          <Archive class="mt-0.5 size-4 shrink-0" />
          <span>Will compress folder to .rar and move archive to new location</span>
        </div>
        <div
          v-else-if="relocateInfo?.sourceIsArchive && relocateInfo?.targetIsArchive"
          class="border-info/40 bg-info/10 text-info flex items-start gap-2 rounded-lg border p-2.5 text-xs"
        >
          <ArrowRightLeft class="mt-0.5 size-4 shrink-0" />
          <span>Will move the archive file to the new location (no extraction)</span>
        </div>
        <div
          v-else-if="relocateInfo?.sourceIsArchive"
          class="border-warning/40 bg-warning/10 text-warning flex items-start gap-2 rounded-lg border p-2.5 text-xs"
        >
          <Archive class="mt-0.5 size-4 shrink-0" />
          <span>Will extract the archive into a folder at the new location</span>
        </div>
        <div
          v-else-if="relocateMoveFiles"
          class="border-info/40 bg-info/10 text-info flex items-start gap-2 rounded-lg border p-2.5 text-xs"
        >
          <FolderOutput class="mt-0.5 size-4 shrink-0" />
          <span>Will move folder to new location</span>
        </div>
        <div
          v-else
          class="border-warning/40 bg-warning/10 text-warning flex items-start gap-2 rounded-lg border p-2.5 text-xs"
        >
          <PencilLine class="mt-0.5 size-4 shrink-0" />
          <span>Will only update path record (file will not be moved)</span>
        </div>

        <DialogFooter class="gap-2">
          <Button variant="ghost" size="sm" @click="confirmRelocate = false">Cancel</Button>
          <Button size="sm" :disabled="relocating" @click="doRelocate">
            <Loader2 v-if="relocating" class="size-4 animate-spin" />
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ArrowRightLeft,
  Check,
  Copy,
  Folder,
  FolderOpen,
  FolderOutput,
  Gamepad2,
  Image,
  ImageOff,
  Loader2,
  Merge,
  Pencil,
  PencilLine,
  RefreshCw,
  Trash2,
  X,
} from '@lucide/vue';
import { toast } from 'vue-sonner';
import { cn } from 'cn';
import api from '../composables/useApi';
import { confirm } from '@/composables/useConfirm';
import ScrapeDialog from '../components/ScrapeDialog.vue';
import { splitKeyword } from '../composables/useSplitKeyword';
import { useExpressUrl } from '../composables/useExpressUrl';
import { useTaskStore } from '../stores/taskStore';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const formatDate = (value: unknown): string => {
  if (!value) return 'unknown';
  const d = new Date(value as string | number | Date);
  if (isNaN(d.getTime())) return 'unknown';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

interface GameDetail {
  id: number;
  name: string;
  cover_path: string | null;
  r18: number | null;
  r18_source: string | null;
  description: string | null;
  sub_path: string;
  is_archived: boolean;
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
  similarGames: {
    gameId: number;
    name: string;
    coverPath: string | null;
    isArchive: boolean;
    dirCreatedAt: string | null;
    score?: number;
    isSelf?: boolean;
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

// Set when a cover file exists but is not a decodable image, so the pane falls back to the
// ImageOff placeholder rather than a broken <img>. Cleared whenever the URL changes, since a
// re-scrape or a manual drop can land on the very same file name.
const coverFailed = ref(false);
watch(coverUrl, () => {
  coverFailed.value = false;
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
    toast.warning('Please drop an image file to set the cover');
    return;
  }

  // Without Electron there is no way to give the server a real filesystem path, so say so
  // instead of appearing to do nothing.
  if (!window.electronAPI) {
    toast.warning('Setting a cover by drag and drop is only available in the desktop app');
    return;
  }

  const localImagePath = window.electronAPI.getFilePath(file);
  if (!localImagePath) {
    toast.warning('Could not read the dropped file');
    return;
  }

  try {
    const res = await api.put(`/games/${game.value?.id}/manual-cover`, {
      imagePath: localImagePath,
    });
    game.value = res.data;
    // A re-upload usually lands on the very same file name, so the URL watcher above would not
    // fire - clear the failed flag here or the repaired cover stays hidden behind the fallback.
    coverFailed.value = false;
    toast.success('Cover updated successfully');
  } catch (err) {
    // Surface the server's reason (unsupported format, missing file) - a bare "failed"
    // leaves the user with no idea which of their files was rejected or why.
    const detail = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
    toast.error(detail ? `Failed to update cover: ${detail}` : 'Failed to update cover');
  }
};

// Source list comes from match.js rather than a hardcoded union: the union had to be
// edited every time a source was added, and forgetting meant the tab silently fell back
// to the auto-detected source.
const scrapeDefaultSource = computed<SourceType | undefined>(() => {
  const type = game.value?.sources?.[0]?.source_type;
  return SOURCE_TYPES.includes(type as SourceType) ? (type as SourceType) : undefined;
});
const editingPath = ref(false);
const editPathValue = ref('');
const relocating = ref(false);

const r18Options = [
  { label: 'Safe', value: 0 },
  { label: '18+', value: 1 },
];

// The old q-btn-toggle tinted the selected option by meaning: Safe reads positive, 18+
// negative.
const r18OptionClass = (value: number) =>
  cn(
    'rounded px-2 py-0.5 text-xs font-medium transition-colors',
    (game.value?.r18 === 1 ? 1 : 0) !== value
      ? 'text-muted-foreground hover:text-foreground'
      : value === 1
        ? 'bg-destructive/15 text-destructive'
        : 'bg-success/15 text-success',
  );

const setR18 = async (value: number) => {
  if (!game.value) return;
  try {
    const res = await api.put(`/games/${game.value.id}/r18`, { r18: value });
    game.value = res.data;
  } catch {
    toast.error('Failed to update R18 status');
  }
};
const confirmRelocate = ref(false);
const relocateMoveFiles = ref(false);
const relocateCompressFiles = ref(false);
const relocateInfo = ref<{
  source: string;
  target: string;
  moveDisabled: boolean;
  compressDisabled: boolean;
  sourceIsArchive: boolean;
  targetIsArchive: boolean;
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
    toast.success(TASK_DONE_LABEL[task.type] || 'Task completed');
  } else if (task.status === 'failed') {
    toast.error(task.error || 'Task failed');
  }
});

const hasElectronAPI = computed(() => !!window.electronAPI);

const displayName = computed(() => {
  const source = game.value?.sources?.find((s) => s.name);
  return source?.name || game.value?.name || '';
});

// Vendor identity tint for the source rows; the vendor name itself is the only label there.
const sourceClass = (source: string) => {
  if (source === 'dlsite') return 'bg-primary/15 text-primary';
  if (source === 'dmm') return 'bg-destructive/15 text-destructive';
  if (source === 'bangumi') return 'bg-warning/15 text-warning';
  if (source === 'vndb') return 'bg-info/15 text-info';
  if (source === 'steam') return 'bg-success/15 text-success';
  return 'bg-muted text-muted-foreground';
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
    toast.info('A task is still running for this game');
    return;
  }
  editPathValue.value = currentFullPath.value;
  editingPath.value = true;
};

const cancelEditPath = () => {
  editingPath.value = false;
  editPathValue.value = '';
};

// Shared by every path-shape check below: an archive game is backed by one of these files, and
// its base name is the file name without the extension.
const ARCHIVE_EXTS = [
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
const fileExtension = (p: string) => (p.split('.').pop() || '').toLowerCase();
const isArchiveFilePath = (p: string) => ARCHIVE_EXTS.includes(fileExtension(p));
const stripArchiveExtension = (p: string) =>
  isArchiveFilePath(p) ? p.slice(0, p.lastIndexOf('.')) : p;

const getGameBaseName = () => {
  const fullPath = currentFullPath.value;
  const lastPart = fullPath.split('\\').pop() || '';
  return stripArchiveExtension(lastPart);
};

const browseForRelocate = async () => {
  if (!window.electronAPI?.openPathForRelocate) return;
  const selected = await window.electronAPI.openPathForRelocate();
  if (!selected) return;
  // Picking an archive file targets a file move and is used as-is; picking a folder targets
  // extraction, and the game-named subfolder is appended unless the selection already ends with it.
  if (isArchiveFilePath(selected)) {
    editPathValue.value = selected;
    return;
  }
  const baseName = getGameBaseName();
  if (baseName && !selected.endsWith(baseName)) {
    editPathValue.value = selected + '\\' + baseName;
  } else {
    editPathValue.value = selected;
  }
};

const submitEditPath = async () => {
  const newPath = editPathValue.value.trim();
  if (!newPath || newPath === currentFullPath.value) {
    editingPath.value = false;
    return;
  }

  const baseName = getGameBaseName();
  // An archive game's base name carries no extension, so a target like H:\Gal\name.rar only
  // "contains the game name" once its archive extension is ignored - comparing the raw path
  // warned on every archive → archive relocation.
  const comparablePath = stripArchiveExtension(newPath);
  if (baseName && !comparablePath.endsWith(baseName)) {
    const ok = await confirm({
      title: 'Path Warning',
      message: `The new path does not contain the game name "${baseName}". Apply anyway?`,
      okLabel: 'Apply',
      cancelLabel: 'Cancel',
    });
    if (!ok) return;
    showRelocateConfirm(newPath);
    return;
  }

  showRelocateConfirm(newPath);
};

const showRelocateConfirm = (newPath: string) => {
  const isArchive = isArchiveFilePath(currentFullPath.value);
  // An archive relocated onto an archive path moves the file itself (the server decides by the
  // target's extension); any other target is a folder the archive is extracted into.
  const targetIsArchive = isArchive && isArchiveFilePath(newPath);
  const moveDisabled = isArchive && !targetIsArchive;
  // Compress is only available for directories (not archives) and when moveFiles is enabled
  const compressDisabled = isArchive;

  relocateMoveFiles.value = !moveDisabled;
  relocateCompressFiles.value = !isArchive;
  relocateInfo.value = {
    source: currentFullPath.value,
    target: newPath,
    moveDisabled,
    compressDisabled,
    sourceIsArchive: isArchive,
    targetIsArchive,
  };
  confirmRelocate.value = true;
};

const doRelocate = async () => {
  if (!game.value || !editPathValue.value.trim()) return;
  if (gameBusy.value) {
    confirmRelocate.value = false;
    toast.info('A task is still running for this game');
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
        const ok = await confirm({
          title: 'Archive Relocated',
          message: 'Target path copied to clipboard. Open the archive for extraction?',
          okLabel: 'Open',
          cancelLabel: 'Cancel',
        });
        if (ok && sourcePath) {
          void window.electronAPI?.openPath(sourcePath);
        }
      }
      if (isCompressRelocate && res.data.compressSkipped) {
        toast.warning(`Compression skipped: ${res.data.reason}`);
      }
      return;
    }

    toast.info(
      operation === 'move'
        ? 'File move started in background'
        : operation === 'extract'
          ? 'Extraction started in background'
          : 'Compression started in background',
    );

    // The busy watcher above reloads the path and reports the outcome once this settles.
    pendingRelocate.value = taskId;
  } catch (err: unknown) {
    relocating.value = false;
    const e = err as {
      response?: { status?: number; data?: { conflict?: string; destExists?: boolean } };
    };
    if (e.response?.status === 409 && e.response.data?.conflict) {
      const ok = await confirm({
        title: 'Target Conflict',
        message: 'Target path already exists and is not empty. Continue anyway?',
        okLabel: 'Continue',
        cancelLabel: 'Cancel',
        // Continuing force-overwrites whatever already sits at the target.
        destructive: true,
      });
      if (ok) {
        await doRelocateWithForce(targetPath);
      }
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

    toast.info(
      operation === 'move'
        ? 'File move started in background'
        : operation === 'extract'
          ? 'Extraction started in background'
          : 'Compression started in background',
    );

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
    // Vendor metadata decides R18 where it exists (Bangumi's per-entry nsfw flag); without it the
    // server falls back to the per-vendor rule.
    nsfw: data.detail.nsfw,
  });
  await loadGame();
};

// A plain yes/no confirmation (the second line only spells out the cascade), so it goes
// through the shared imperative confirm instead of a local dialog.
const doDelete = async () => {
  if (!game.value) return;
  const ok = await confirm({
    title: 'Confirm Delete',
    message: `Are you sure you want to delete "${displayName.value}"? This will also remove all associated sources, makers, genres, and tags.`,
    okLabel: 'Delete',
    cancelLabel: 'Cancel',
    destructive: true,
  });
  if (!ok) return;
  try {
    await api.delete(`/games/${game.value.id}`);
    void router.replace('/');
  } catch {
    // handled by error interceptor
  }
};

// Same endpoints the lib page's right-click menu uses; the row only flips local state, since
// archiving never removes the detail page from anywhere - the game is already being viewed here.
const toggleArchive = async () => {
  if (!game.value) return;
  if (game.value.is_archived) {
    await api.delete(`/games/${game.value.id}/archive`);
  } else {
    await api.post(`/games/${game.value.id}/archive`);
  }
  game.value.is_archived = !game.value.is_archived;
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
