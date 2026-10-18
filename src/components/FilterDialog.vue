<template>
  <Dialog :open="show" @update:open="show = $event">
    <DialogContent
      class="flex max-h-[85vh] w-[560px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[560px]"
    >
      <DialogHeader
        class="flex shrink-0 flex-row items-center gap-2.5 space-y-0 border-b px-5 py-2.5"
      >
        <div
          class="bg-primary/15 text-primary flex size-7 shrink-0 items-center justify-center rounded-md"
        >
          <SlidersHorizontal class="size-4" />
        </div>
        <DialogTitle class="text-sm font-semibold">Filter</DialogTitle>
        <DialogDescription class="sr-only">
          Narrow the game list down by library, maker, genre, tag and status.
        </DialogDescription>
      </DialogHeader>

      <!-- Active filter summary: one removable chip per applied filter, plus Clear all. -->
      <div
        v-if="activeFilterChips.length > 0"
        class="flex shrink-0 flex-wrap items-center gap-1.5 border-b px-5 py-2.5"
      >
        <span class="text-muted-foreground mr-1 text-[11px] font-medium tracking-wider uppercase">
          Active:
        </span>
        <span
          v-for="chip in activeFilterChips"
          :key="chip.key"
          class="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs"
          :class="chip.classes"
        >
          {{ chip.label }}
          <button
            type="button"
            class="cursor-pointer opacity-70 hover:opacity-100"
            :aria-label="'Remove ' + chip.label"
            @click="chip.remove"
          >
            <X class="size-3.5" />
          </button>
        </span>
        <button
          type="button"
          class="bg-destructive/15 text-destructive hover:bg-destructive/25 cursor-pointer rounded-md px-2 py-0.5 text-[11px] transition-colors"
          @click="clearAllFilters"
        >
          Clear all
        </button>
      </div>

      <div class="min-h-0 max-h-[70vh] overflow-y-auto -mx-1 px-1">
        <div class="px-5 py-3.5">
          <div class="mb-2 flex items-center gap-2">
            <div
              class="bg-primary/15 text-primary flex size-7 shrink-0 items-center justify-center rounded-md"
            >
              <Folder class="size-4" />
            </div>
            <span class="text-sm font-semibold">Libraries</span>
          </div>
          <div v-if="librariesLoading" class="flex justify-center py-1">
            <Loader2 class="text-primary size-5 animate-spin" />
          </div>
          <template v-else>
            <div class="relative mb-2">
              <Search
                class="text-muted-foreground absolute top-1/2 left-2 size-4 -translate-y-1/2"
              />
              <Input
                v-model="librarySearch"
                placeholder="Search libraries..."
                class="h-8 pl-8 text-[13px]"
              />
            </div>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="lib in filteredLibraries"
                :key="lib.id"
                type="button"
                class="inline-flex cursor-pointer items-center gap-1 rounded-md border px-2.5 py-1 text-xs transition-colors select-none"
                :class="
                  localFilter.libraryIds.includes(lib.id)
                    ? 'border-primary bg-primary/15 text-primary font-medium'
                    : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
                "
                @click="toggleLibraryId(lib.id)"
              >
                {{ lib.name }}
                <Check v-if="localFilter.libraryIds.includes(lib.id)" class="size-3.5" />
              </button>
              <button
                type="button"
                class="inline-flex cursor-pointer items-center gap-1 rounded-md border px-2.5 py-1 text-xs transition-colors select-none"
                :class="
                  localFilter.noLibrary
                    ? 'border-primary bg-primary/15 text-primary font-medium'
                    : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
                "
                @click="localFilter.noLibrary = !localFilter.noLibrary"
              >
                Dropped
                <Check v-if="localFilter.noLibrary" class="size-3.5" />
              </button>
              <div
                v-if="filteredLibraries.length === 0"
                class="text-muted-foreground flex items-center py-1 text-xs"
              >
                No match
              </div>
            </div>
          </template>
        </div>
        <div class="bg-border mx-5 h-px" />

        <div class="px-5 py-3.5">
          <div class="mb-2 flex items-center gap-2">
            <div
              class="bg-warning/15 text-warning flex size-7 shrink-0 items-center justify-center rounded-md"
            >
              <User class="size-4" />
            </div>
            <span class="text-sm font-semibold">Makers</span>
          </div>
          <div v-if="makersLoading" class="flex justify-center py-1">
            <Loader2 class="text-primary size-5 animate-spin" />
          </div>
          <div v-else>
            <!-- q-select multiple + use-input + use-chips: a searchable popover picker with the
                 selected values kept as removable chips under the trigger. -->
            <Popover v-model:open="makerPickerOpen">
              <PopoverTrigger as-child>
                <Button
                  variant="outline"
                  size="sm"
                  role="combobox"
                  :aria-expanded="makerPickerOpen"
                  class="w-full justify-between text-[13px] font-normal"
                  :class="localFilter.makerIds.length === 0 ? 'text-muted-foreground' : ''"
                >
                  <span class="truncate">
                    {{
                      localFilter.makerIds.length === 0
                        ? 'Search makers...'
                        : localFilter.makerIds.length + ' selected'
                    }}
                  </span>
                  <ChevronsUpDown class="size-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" class="w-(--reka-popover-trigger-width) p-0">
                <Command>
                  <CommandInput placeholder="Search makers..." />
                  <CommandList>
                    <CommandEmpty>No match</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        v-for="maker in makers"
                        :key="maker.id"
                        :value="String(maker.id)"
                        @select="toggleMakerId(maker.id)"
                      >
                        <Check
                          class="size-4"
                          :class="
                            localFilter.makerIds.includes(maker.id) ? 'opacity-100' : 'opacity-0'
                          "
                        />
                        <span class="truncate">{{ maker.name }}</span>
                      </CommandItem>
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <div v-if="selectedMakers.length > 0" class="mt-2 flex flex-wrap gap-1">
              <span
                v-for="maker in selectedMakers"
                :key="maker.id"
                class="bg-secondary text-secondary-foreground inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs"
              >
                <span class="max-w-[200px] truncate">{{ maker.name }}</span>
                <button
                  type="button"
                  class="text-muted-foreground hover:text-foreground cursor-pointer"
                  :aria-label="'Remove ' + maker.name"
                  @click="removeId(localFilter.makerIds, maker.id)"
                >
                  <X class="size-3" />
                </button>
              </span>
            </div>
          </div>
        </div>
        <div class="bg-border mx-5 h-px" />

        <div class="px-5 py-3.5">
          <div class="mb-2 flex items-center gap-2">
            <div
              class="bg-info/15 text-info flex size-7 shrink-0 items-center justify-center rounded-md"
            >
              <Shapes class="size-4" />
            </div>
            <span class="text-sm font-semibold">Genres</span>
          </div>
          <div v-if="genresLoading" class="flex justify-center py-1">
            <Loader2 class="text-primary size-5 animate-spin" />
          </div>
          <div v-else>
            <Popover v-model:open="genrePickerOpen">
              <PopoverTrigger as-child>
                <Button
                  variant="outline"
                  size="sm"
                  role="combobox"
                  :aria-expanded="genrePickerOpen"
                  class="w-full justify-between text-[13px] font-normal"
                  :class="localFilter.genreIds.length === 0 ? 'text-muted-foreground' : ''"
                >
                  <span class="truncate">
                    {{
                      localFilter.genreIds.length === 0
                        ? 'Search genres...'
                        : localFilter.genreIds.length + ' selected'
                    }}
                  </span>
                  <ChevronsUpDown class="size-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" class="w-(--reka-popover-trigger-width) p-0">
                <Command>
                  <CommandInput placeholder="Search genres..." />
                  <CommandList>
                    <CommandEmpty>No match</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        v-for="genre in genres"
                        :key="genre.id"
                        :value="String(genre.id)"
                        @select="toggleGenreId(genre.id)"
                      >
                        <Check
                          class="size-4"
                          :class="
                            localFilter.genreIds.includes(genre.id) ? 'opacity-100' : 'opacity-0'
                          "
                        />
                        <span class="truncate">{{ genre.name }}</span>
                      </CommandItem>
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <div v-if="selectedGenres.length > 0" class="mt-2 flex flex-wrap gap-1">
              <span
                v-for="genre in selectedGenres"
                :key="genre.id"
                class="bg-secondary text-secondary-foreground inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs"
              >
                <span class="max-w-[200px] truncate">{{ genre.name }}</span>
                <button
                  type="button"
                  class="text-muted-foreground hover:text-foreground cursor-pointer"
                  :aria-label="'Remove ' + genre.name"
                  @click="removeId(localFilter.genreIds, genre.id)"
                >
                  <X class="size-3" />
                </button>
              </span>
            </div>
          </div>
        </div>
        <div class="bg-border mx-5 h-px" />

        <div class="px-5 py-3.5">
          <div class="mb-2 flex items-center gap-2">
            <div
              class="bg-success/15 text-success flex size-7 shrink-0 items-center justify-center rounded-md"
            >
              <Tag class="size-4" />
            </div>
            <span class="text-sm font-semibold">Tags</span>
          </div>
          <div v-if="tagsLoading" class="flex justify-center py-1">
            <Loader2 class="text-primary size-5 animate-spin" />
          </div>
          <div v-else>
            <Popover v-model:open="tagPickerOpen">
              <PopoverTrigger as-child>
                <Button
                  variant="outline"
                  size="sm"
                  role="combobox"
                  :aria-expanded="tagPickerOpen"
                  class="w-full justify-between text-[13px] font-normal"
                  :class="localFilter.tagIds.length === 0 ? 'text-muted-foreground' : ''"
                >
                  <span class="truncate">
                    {{
                      localFilter.tagIds.length === 0
                        ? 'Search tags...'
                        : localFilter.tagIds.length + ' selected'
                    }}
                  </span>
                  <ChevronsUpDown class="size-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" class="w-(--reka-popover-trigger-width) p-0">
                <Command>
                  <CommandInput placeholder="Search tags..." />
                  <CommandList>
                    <CommandEmpty>No match</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        v-for="tag in tags"
                        :key="tag.id"
                        :value="String(tag.id)"
                        @select="toggleTagId(tag.id)"
                      >
                        <Check
                          class="size-4"
                          :class="localFilter.tagIds.includes(tag.id) ? 'opacity-100' : 'opacity-0'"
                        />
                        <span class="truncate">{{ tag.name }}</span>
                      </CommandItem>
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <div v-if="selectedTags.length > 0" class="mt-2 flex flex-wrap gap-1">
              <span
                v-for="tag in selectedTags"
                :key="tag.id"
                class="bg-secondary text-secondary-foreground inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs"
              >
                <span class="max-w-[200px] truncate">{{ tag.name }}</span>
                <button
                  type="button"
                  class="text-muted-foreground hover:text-foreground cursor-pointer"
                  :aria-label="'Remove ' + tag.name"
                  @click="removeId(localFilter.tagIds, tag.id)"
                >
                  <X class="size-3" />
                </button>
              </span>
            </div>
          </div>
        </div>
        <div class="bg-border mx-5 h-px" />

        <div class="px-5 py-3.5">
          <div class="mb-2 flex items-center gap-2">
            <div
              class="bg-success/15 text-success flex size-7 shrink-0 items-center justify-center rounded-md"
            >
              <SearchCheck class="size-4" />
            </div>
            <span class="text-sm font-semibold">Scrape Status</span>
          </div>
          <div class="border-border flex overflow-hidden rounded-lg border">
            <button
              type="button"
              :class="segItemClass(localFilter.scraped === 'all')"
              @click="localFilter.scraped = 'all'"
            >
              All
            </button>
            <button
              type="button"
              :class="segItemClass(localFilter.scraped === 'yes')"
              @click="localFilter.scraped = 'yes'"
            >
              Scraped
            </button>
            <button
              type="button"
              :class="segItemClass(localFilter.scraped === 'no')"
              @click="localFilter.scraped = 'no'"
            >
              Not scraped
            </button>
          </div>
        </div>
        <div class="bg-border mx-5 h-px" />

        <div class="px-5 py-3.5">
          <div class="mb-2 flex items-center gap-2">
            <div
              class="bg-destructive/15 text-destructive flex size-7 shrink-0 items-center justify-center rounded-md"
            >
              <Copy class="size-4" />
            </div>
            <span class="text-sm font-semibold">Duplicate</span>
          </div>
          <div class="border-border flex overflow-hidden rounded-lg border">
            <button
              type="button"
              :class="segItemClass(localFilter.duplicate === 'all')"
              @click="localFilter.duplicate = 'all'"
            >
              All
            </button>
            <button
              type="button"
              :class="segItemClass(localFilter.duplicate === 'yes')"
              @click="localFilter.duplicate = 'yes'"
            >
              Has duplicate
            </button>
            <button
              type="button"
              :class="segItemClass(localFilter.duplicate === 'no')"
              @click="localFilter.duplicate = 'no'"
            >
              No duplicate
            </button>
          </div>
        </div>
        <div class="bg-border mx-5 h-px" />

        <div class="px-5 py-3.5">
          <div class="mb-2 flex items-center gap-2">
            <div
              class="bg-destructive/15 text-destructive flex size-7 shrink-0 items-center justify-center rounded-md"
            >
              <ShieldAlert class="size-4" />
            </div>
            <span class="text-sm font-semibold">R18</span>
          </div>
          <div class="border-border flex overflow-hidden rounded-lg border">
            <button
              type="button"
              :class="segItemClass(localFilter.r18 === 'all')"
              @click="localFilter.r18 = 'all'"
            >
              All
            </button>
            <button
              type="button"
              :class="segItemClass(localFilter.r18 === 'yes')"
              @click="localFilter.r18 = 'yes'"
            >
              R18
            </button>
            <button
              type="button"
              :class="segItemClass(localFilter.r18 === 'no')"
              @click="localFilter.r18 = 'no'"
            >
              Safe
            </button>
          </div>
        </div>
      </div>

      <div class="bg-muted/50 flex shrink-0 items-center justify-end gap-2 border-t px-5 py-2.5">
        <Button variant="outline" size="sm" @click="resetFilter">Reset</Button>
        <Button variant="ghost" size="sm" @click="show = false">Cancel</Button>
        <Button size="sm" @click="applyFilter">Apply</Button>
      </div>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import {
  Check,
  ChevronsUpDown,
  Copy,
  Folder,
  Loader2,
  Search,
  SearchCheck,
  Shapes,
  ShieldAlert,
  SlidersHorizontal,
  Tag,
  User,
  X,
} from '@lucide/vue';
import { cn } from 'cn';
import api from '../composables/useApi';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface FilterState {
  libraryIds: number[];
  noLibrary: boolean;
  makerIds: number[];
  genreIds: number[];
  tagIds: number[];
  scraped: 'all' | 'yes' | 'no';
  duplicate: 'all' | 'yes' | 'no';
  r18: 'all' | 'yes' | 'no';
}

interface Option {
  id: number;
  name: string;
}

const props = defineProps<{
  modelValue: boolean;
  filter: FilterState;
}>();

const emit = defineEmits<{
  'update:modelValue': [val: boolean];
  apply: [filter: FilterState];
}>();

const show = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
});

const localFilter = ref<FilterState>({
  libraryIds: [],
  noLibrary: false,
  makerIds: [],
  genreIds: [],
  tagIds: [],
  scraped: 'yes',
  duplicate: 'all',
  r18: 'all',
});

const libraries = ref<{ id: number; name: string; path: string }[]>([]);
const makers = ref<Option[]>([]);
const genres = ref<Option[]>([]);
const tags = ref<Option[]>([]);

const librariesLoading = ref(false);
const makersLoading = ref(false);
const genresLoading = ref(false);
const tagsLoading = ref(false);

const librarySearch = ref('');
// One popover per multi-select; each holds its own open flag.
const makerPickerOpen = ref(false);
const genrePickerOpen = ref(false);
const tagPickerOpen = ref(false);

const filteredLibraries = computed(() => {
  if (!librarySearch.value) return libraries.value;
  const q = librarySearch.value.toLowerCase();
  return libraries.value.filter((l) => l.name.toLowerCase().includes(q));
});

const CHIP_COLORS = {
  library: 'bg-primary/15 text-primary',
  noLibrary: 'bg-destructive/15 text-destructive',
  maker: 'bg-warning/15 text-warning',
  genre: 'bg-info/15 text-info',
  tag: 'bg-success/15 text-success',
  scraped: 'bg-success/15 text-success',
  duplicate: 'bg-destructive/15 text-destructive',
  r18: 'bg-destructive/15 text-destructive',
} as const;

interface FilterChip {
  key: string;
  label: string;
  classes: string;
  remove: () => void;
}

const activeFilterChips = computed<FilterChip[]>(() => {
  const chips: FilterChip[] = [];
  const f = localFilter.value;

  for (const id of f.libraryIds) {
    const lib = libraries.value.find((l) => l.id === id);
    if (lib) {
      const libId = id;
      chips.push({
        key: `lib-${id}`,
        label: lib.name,
        classes: CHIP_COLORS.library,
        remove: () => {
          localFilter.value.libraryIds = localFilter.value.libraryIds.filter((i) => i !== libId);
        },
      });
    }
  }

  if (f.noLibrary) {
    chips.push({
      key: 'noLib',
      label: 'Dropped',
      classes: CHIP_COLORS.noLibrary,
      remove: () => {
        localFilter.value.noLibrary = false;
      },
    });
  }

  for (const id of f.makerIds) {
    const maker = makers.value.find((m) => m.id === id);
    if (maker) {
      const makerId = id;
      chips.push({
        key: `maker-${id}`,
        label: maker.name,
        classes: CHIP_COLORS.maker,
        remove: () => {
          localFilter.value.makerIds = localFilter.value.makerIds.filter((i) => i !== makerId);
        },
      });
    }
  }

  for (const id of f.genreIds) {
    const genre = genres.value.find((g) => g.id === id);
    if (genre) {
      const genreId = id;
      chips.push({
        key: `genre-${id}`,
        label: genre.name,
        classes: CHIP_COLORS.genre,
        remove: () => {
          localFilter.value.genreIds = localFilter.value.genreIds.filter((i) => i !== genreId);
        },
      });
    }
  }

  for (const id of f.tagIds) {
    const tag = tags.value.find((t) => t.id === id);
    if (tag) {
      const tagId = id;
      chips.push({
        key: `tag-${id}`,
        label: tag.name,
        classes: CHIP_COLORS.tag,
        remove: () => {
          localFilter.value.tagIds = localFilter.value.tagIds.filter((i) => i !== tagId);
        },
      });
    }
  }

  if (f.scraped !== 'all') {
    chips.push({
      key: 'scraped',
      label: f.scraped === 'yes' ? 'Scraped' : 'Not scraped',
      classes: CHIP_COLORS.scraped,
      remove: () => {
        localFilter.value.scraped = 'all';
      },
    });
  }

  if (f.duplicate !== 'all') {
    chips.push({
      key: 'duplicate',
      label: f.duplicate === 'yes' ? 'Has duplicate' : 'No duplicate',
      classes: CHIP_COLORS.duplicate,
      remove: () => {
        localFilter.value.duplicate = 'all';
      },
    });
  }

  if (f.r18 !== 'all') {
    chips.push({
      key: 'r18',
      label: f.r18 === 'yes' ? 'R18' : 'Safe',
      classes: CHIP_COLORS.r18,
      remove: () => {
        localFilter.value.r18 = 'all';
      },
    });
  }

  return chips;
});

const removeId = (ids: number[], id: number) => {
  const idx = ids.indexOf(id);
  if (idx >= 0) ids.splice(idx, 1);
};

// The multi-select pickers keep selection as a plain id array (what the old q-select emitted),
// so add/remove is done by hand now.
const toggleId = (ids: number[], id: number) => {
  const idx = ids.indexOf(id);
  if (idx >= 0) {
    ids.splice(idx, 1);
  } else {
    ids.push(id);
  }
};

const toggleLibraryId = (id: number) => {
  toggleId(localFilter.value.libraryIds, id);
};

const toggleMakerId = (id: number) => {
  toggleId(localFilter.value.makerIds, id);
};

const toggleGenreId = (id: number) => {
  toggleId(localFilter.value.genreIds, id);
};

const toggleTagId = (id: number) => {
  toggleId(localFilter.value.tagIds, id);
};

// Ids can point at options that are not loaded (yet), so only the resolvable ones get a chip.
const resolveSelected = (ids: number[], options: Option[]) =>
  ids.map((id) => options.find((o) => o.id === id)).filter((o): o is Option => o !== undefined);

const selectedMakers = computed(() => resolveSelected(localFilter.value.makerIds, makers.value));
const selectedGenres = computed(() => resolveSelected(localFilter.value.genreIds, genres.value));
const selectedTags = computed(() => resolveSelected(localFilter.value.tagIds, tags.value));

// The old dialog's segmented buttons, mapped to tokens: the active segment wears the primary tint.
const segItemClass = (active: boolean) =>
  cn(
    'flex-1 cursor-pointer border-r border-border px-2 py-1.5 text-xs transition-colors last:border-r-0',
    active ? 'bg-primary/15 text-primary font-semibold' : 'text-muted-foreground hover:bg-accent',
  );

const loadLibraries = async () => {
  if (libraries.value.length > 0) return;
  librariesLoading.value = true;
  try {
    const res = await api.get('/libraries');
    libraries.value = res.data;
  } finally {
    librariesLoading.value = false;
  }
};

const loadMakers = async () => {
  if (makers.value.length > 0) return;
  makersLoading.value = true;
  try {
    const res = await api.get('/games/makers');
    makers.value = res.data;
  } finally {
    makersLoading.value = false;
  }
};

const loadGenres = async () => {
  if (genres.value.length > 0) return;
  genresLoading.value = true;
  try {
    const res = await api.get('/games/genres');
    genres.value = res.data;
  } finally {
    genresLoading.value = false;
  }
};

const loadTags = async () => {
  if (tags.value.length > 0) return;
  tagsLoading.value = true;
  try {
    const res = await api.get('/games/tags');
    tags.value = res.data;
  } finally {
    tagsLoading.value = false;
  }
};

// The dialog edits a working copy of the applied filter; only Apply replaces it.
const seedLocalFilter = () => {
  localFilter.value = {
    libraryIds: [...props.filter.libraryIds],
    noLibrary: props.filter.noLibrary,
    makerIds: [...props.filter.makerIds],
    genreIds: [...props.filter.genreIds],
    tagIds: [...props.filter.tagIds],
    scraped: props.filter.scraped,
    duplicate: props.filter.duplicate,
    r18: props.filter.r18,
  };
};

// Same job the old q-dialog @hide handler did: closing by any route (X, Esc, backdrop, Cancel)
// drops the pending edits, so a cancelled edit never leaks into the next open.
const onDialogHide = () => {
  seedLocalFilter();
  // A picker can still be open when the dialog itself is dismissed; it must not pop back up.
  makerPickerOpen.value = false;
  genrePickerOpen.value = false;
  tagPickerOpen.value = false;
};

const onDialogShow = () => {
  seedLocalFilter();
  librarySearch.value = '';
  void loadLibraries();
  void loadMakers();
  void loadGenres();
  void loadTags();
};

watch(
  () => props.modelValue,
  (val) => {
    if (val) {
      onDialogShow();
    } else {
      onDialogHide();
    }
  },
);

// A mounted-but-open dialog (e.g. restored state) needs the same preparation the watcher does.
if (props.modelValue) {
  onDialogShow();
}

const resetFilter = () => {
  localFilter.value = {
    libraryIds: [],
    noLibrary: false,
    makerIds: [],
    genreIds: [],
    tagIds: [],
    scraped: 'yes',
    duplicate: 'all',
    r18: 'all',
  };
};

const clearAllFilters = () => {
  resetFilter();
};

const applyFilter = () => {
  emit('apply', {
    ...localFilter.value,
    libraryIds: [...localFilter.value.libraryIds],
    makerIds: [...localFilter.value.makerIds],
    genreIds: [...localFilter.value.genreIds],
    tagIds: [...localFilter.value.tagIds],
  });
  show.value = false;
};
</script>
