<template>
  <q-dialog v-model="show" @hide="onDialogHide">
    <q-card style="width: 560px; max-height: 85vh; display: flex; flex-direction: column;" class="filter-dialog">
      <div class="q-px-lg q-pt-md q-pb-sm" style="display: flex; align-items: center; gap: 10px; flex-shrink: 0;">
        <div style="width: 36px; height: 36px; border-radius: 12px; background: var(--m3-primary-container); display: flex; align-items: center; justify-content: center;">
          <q-icon name="tune" size="20px" color="primary" />
        </div>
        <span style="font-size: 18px; font-weight: 600; color: var(--m3-on-surface);">Filter</span>
        <q-space />
        <q-btn flat round dense icon="close" color="grey-7" v-close-popup />
      </div>

      <div v-if="activeFilterChips.length > 0" class="q-px-lg q-pb-sm" style="display: flex; flex-wrap: wrap; gap: 6px; align-items: center; flex-shrink: 0;">
        <span style="font-size: 11px; color: var(--m3-on-surface-variant); text-transform: uppercase; letter-spacing: 0.5px; margin-right: 4px;">Active:</span>
        <span
          v-for="chip in activeFilterChips"
          :key="chip.key"
          class="filter-chip"
          :style="{ background: chip.color }"
        >
          {{ chip.label }}
          <q-icon name="close" size="14px" class="filter-chip-close" @click="chip.remove" />
        </span>
        <span class="filter-chip-clear" @click="clearAllFilters">Clear all</span>
      </div>
      <div v-if="activeFilterChips.length > 0" class="filter-divider" style="flex-shrink: 0;"></div>

      <div class="filter-scroll-area">
      <div style="padding: 14px 20px;">
        <div class="filter-section-header">
          <div class="filter-section-icon" style="background: var(--m3-icon-lib-bg);">
            <q-icon name="folder" size="16px" color="pink" />
          </div>
          <span class="filter-section-title">Libraries</span>
        </div>
        <div v-if="librariesLoading" class="text-center q-pa-xs">
          <q-spinner-dots size="20px" color="primary" />
        </div>
        <template v-else>
          <q-input
            v-model="librarySearch"
            dense
            borderless
            placeholder="Search libraries..."
            class="lib-search-input"
            style="width: 100%"
          >
            <template v-slot:prepend>
              <q-icon name="search" size="16px" color="grey-6" />
            </template>
          </q-input>
          <div style="display: flex; flex-wrap: wrap; gap: 6px;">
            <span
              v-for="lib in filteredLibraries"
              :key="lib.id"
              class="lib-chip-toggle"
              :class="localFilter.libraryIds.includes(lib.id) ? 'lib-chip-toggle--selected' : 'lib-chip-toggle--unselected'"
              @click="toggleLibraryId(lib.id)"
            >
              {{ lib.name }}
              <q-icon v-if="localFilter.libraryIds.includes(lib.id)" name="check" size="14px" style="margin-left: 4px;" />
            </span>
            <span
              class="lib-chip-toggle"
              :class="localFilter.noLibrary ? 'lib-chip-toggle--selected' : 'lib-chip-toggle--unselected'"
              @click="localFilter.noLibrary = !localFilter.noLibrary"
            >
              Dropped
              <q-icon v-if="localFilter.noLibrary" name="check" size="14px" style="margin-left: 4px;" />
            </span>
            <div v-if="filteredLibraries.length === 0" style="font-size: 12px; color: var(--m3-on-surface-variant); padding: 4px 0; display: flex; align-items: center;">No match</div>
          </div>
        </template>
      </div>
      <div class="filter-divider"></div>

      <div style="padding: 14px 20px;">
        <div class="filter-section-header">
          <div class="filter-section-icon" style="background: var(--m3-icon-maker-bg);">
            <q-icon name="person" size="16px" color="orange" />
          </div>
          <span class="filter-section-title">Makers</span>
        </div>
        <div v-if="makersLoading" class="text-center q-pa-xs">
          <q-spinner-dots size="20px" color="primary" />
        </div>
        <div v-else>
          <q-select
            v-model="localFilter.makerIds"
            :options="makerFilterOptions"
            multiple
            use-input
            use-chips
            input-debounce="300"
            emit-value
            map-options
            option-value="id"
            option-label="name"
            @filter="onMakerFilter"
            dense
            outlined
            placeholder="Search makers..."
            virtual-scroll-item-size="32"
            class="m3-select"
          />
        </div>
      </div>
      <div class="filter-divider"></div>

      <div style="padding: 14px 20px;">
        <div class="filter-section-header">
          <div class="filter-section-icon" style="background: var(--m3-icon-genre-bg);">
            <q-icon name="category" size="16px" color="blue" />
          </div>
          <span class="filter-section-title">Genres</span>
        </div>
        <div v-if="genresLoading" class="text-center q-pa-xs">
          <q-spinner-dots size="20px" color="primary" />
        </div>
        <div v-else>
          <q-select
            v-model="localFilter.genreIds"
            :options="genres"
            multiple
            use-input
            use-chips
            input-debounce="300"
            emit-value
            map-options
            option-value="id"
            option-label="name"
            @filter="onGenreFilter"
            dense
            outlined
            placeholder="Search genres..."
            virtual-scroll-item-size="32"
            class="m3-select"
          />
        </div>
      </div>
      <div class="filter-divider"></div>

      <div style="padding: 14px 20px;">
        <div class="filter-section-header">
          <div class="filter-section-icon" style="background: var(--m3-icon-tag-bg);">
            <q-icon name="label" size="16px" color="teal" />
          </div>
          <span class="filter-section-title">Tags</span>
        </div>
        <div v-if="tagsLoading" class="text-center q-pa-xs">
          <q-spinner-dots size="20px" color="primary" />
        </div>
        <div v-else>
          <q-select
            v-model="localFilter.tagIds"
            :options="tagFilterOptions"
            multiple
            use-input
            use-chips
            input-debounce="300"
            emit-value
            map-options
            option-value="id"
            option-label="name"
            @filter="onTagFilter"
            dense
            outlined
            placeholder="Search tags..."
            virtual-scroll-item-size="32"
            class="m3-select"
          />
        </div>
      </div>
      <div class="filter-divider"></div>

      <div style="padding: 14px 20px;">
        <div class="filter-section-header">
          <div class="filter-section-icon" style="background: var(--m3-icon-scraped-bg);">
            <q-icon name="manage_search" size="16px" color="green" />
          </div>
          <span class="filter-section-title">Scrape Status</span>
        </div>
        <div class="segmented-btn">
          <div
            class="segmented-btn-item"
            :class="localFilter.scraped === 'all' ? 'segmented-btn-item--selected' : 'segmented-btn-item--unselected'"
            @click="localFilter.scraped = 'all'"
          >All</div>
          <div
            class="segmented-btn-item"
            :class="localFilter.scraped === 'yes' ? 'segmented-btn-item--selected' : 'segmented-btn-item--unselected'"
            @click="localFilter.scraped = 'yes'"
          >Scraped</div>
          <div
            class="segmented-btn-item"
            :class="localFilter.scraped === 'no' ? 'segmented-btn-item--selected' : 'segmented-btn-item--unselected'"
            @click="localFilter.scraped = 'no'"
          >Not scraped</div>
        </div>
      </div>
      <div class="filter-divider"></div>

      <div style="padding: 14px 20px;">
        <div class="filter-section-header">
          <div class="filter-section-icon" style="background: var(--m3-icon-duplicate-bg);">
            <q-icon name="content_copy" size="16px" color="pink" />
          </div>
          <span class="filter-section-title">Duplicate</span>
        </div>
        <div class="segmented-btn">
          <div
            class="segmented-btn-item"
            :class="localFilter.duplicate === 'all' ? 'segmented-btn-item--selected' : 'segmented-btn-item--unselected'"
            @click="localFilter.duplicate = 'all'"
          >All</div>
          <div
            class="segmented-btn-item"
            :class="localFilter.duplicate === 'yes' ? 'segmented-btn-item--selected' : 'segmented-btn-item--unselected'"
            @click="localFilter.duplicate = 'yes'"
          >Has duplicate</div>
          <div
            class="segmented-btn-item"
            :class="localFilter.duplicate === 'no' ? 'segmented-btn-item--selected' : 'segmented-btn-item--unselected'"
            @click="localFilter.duplicate = 'no'"
          >No duplicate</div>
        </div>
      </div>
      </div>

      <div style="padding: 12px 20px 16px; display: flex; justify-content: flex-end; gap: 10px; flex-shrink: 0; border-top: 1px solid var(--m3-outline-variant);">
        <button class="m3-btn-outlined" @click="resetFilter">Reset</button>
        <button class="m3-btn-filled" @click="applyFilter">Apply</button>
      </div>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import api from '../composables/useApi';

interface FilterState {
  libraryIds: number[];
  noLibrary: boolean;
  makerIds: number[];
  genreIds: number[];
  tagIds: number[];
  scraped: 'all' | 'yes' | 'no';
  duplicate: 'all' | 'yes' | 'no';
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
});

const libraries = ref<{ id: number; name: string; path: string }[]>([]);
const makers = ref<{ id: number; name: string }[]>([]);
const genres = ref<{ id: number; name: string }[]>([]);
const tags = ref<{ id: number; name: string }[]>([]);

const librariesLoading = ref(false);
const makersLoading = ref(false);
const genresLoading = ref(false);
const tagsLoading = ref(false);

const librarySearch = ref('');
const makerFilterOptions = ref<{ id: number; name: string }[]>([]);
const tagFilterOptions = ref<{ id: number; name: string }[]>([]);

const filteredLibraries = computed(() => {
  if (!librarySearch.value) return libraries.value;
  const q = librarySearch.value.toLowerCase();
  return libraries.value.filter((l) => l.name.toLowerCase().includes(q));
});

const CHIP_COLORS = {
  library: 'var(--m3-chip-lib)',
  noLibrary: 'var(--m3-chip-nolib)',
  maker: 'var(--m3-chip-maker)',
  genre: 'var(--m3-chip-genre)',
  tag: 'var(--m3-chip-tag)',
  scraped: 'var(--m3-chip-scraped)',
  duplicate: 'var(--m3-chip-duplicate)',
} as const;

interface FilterChip {
  key: string;
  label: string;
  color: string;
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
        color: CHIP_COLORS.library,
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
      color: CHIP_COLORS.noLibrary,
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
        color: CHIP_COLORS.maker,
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
        color: CHIP_COLORS.genre,
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
        color: CHIP_COLORS.tag,
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
      color: CHIP_COLORS.scraped,
      remove: () => {
        localFilter.value.scraped = 'all';
      },
    });
  }

  if (f.duplicate !== 'all') {
    chips.push({
      key: 'duplicate',
      label: f.duplicate === 'yes' ? 'Has duplicate' : 'No duplicate',
      color: CHIP_COLORS.duplicate,
      remove: () => {
        localFilter.value.duplicate = 'all';
      },
    });
  }

  return chips;
});

const toggleLibraryId = (id: number) => {
  const idx = localFilter.value.libraryIds.indexOf(id);
  if (idx >= 0) {
    localFilter.value.libraryIds.splice(idx, 1);
  } else {
    localFilter.value.libraryIds.push(id);
  }
};

const onMakerFilter = (val: string, update: (fn: () => void) => void) => {
  update(() => {
    if (!val) {
      makerFilterOptions.value = makers.value;
    } else {
      const needle = val.toLowerCase();
      makerFilterOptions.value = makers.value.filter((m) => m.name.toLowerCase().includes(needle));
    }
  });
};

const onGenreFilter = (val: string, update: (fn: () => void) => void) => {
  update(() => {
    if (!val) return;
    const needle = val.toLowerCase();
    return genres.value.filter((g) => g.name.toLowerCase().includes(needle));
  });
};

const onTagFilter = (val: string, update: (fn: () => void) => void) => {
  update(() => {
    if (!val) {
      tagFilterOptions.value = tags.value;
    } else {
      const needle = val.toLowerCase();
      tagFilterOptions.value = tags.value.filter((t) => t.name.toLowerCase().includes(needle));
    }
  });
};

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
    makerFilterOptions.value = res.data;
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
    tagFilterOptions.value = res.data;
  } finally {
    tagsLoading.value = false;
  }
};

watch(
  () => props.modelValue,
  (val) => {
    if (val) {
      localFilter.value = {
        libraryIds: [...props.filter.libraryIds],
        noLibrary: props.filter.noLibrary,
        makerIds: [...props.filter.makerIds],
        genreIds: [...props.filter.genreIds],
        tagIds: [...props.filter.tagIds],
        scraped: props.filter.scraped,
        duplicate: props.filter.duplicate,
      };
      librarySearch.value = '';
      makerFilterOptions.value = makers.value;
      tagFilterOptions.value = tags.value;
      void loadLibraries();
      void loadMakers();
      void loadGenres();
      void loadTags();
    }
  },
);

const resetFilter = () => {
  localFilter.value = { libraryIds: [], noLibrary: false, makerIds: [], genreIds: [], tagIds: [], scraped: 'yes', duplicate: 'all' };
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

const onDialogHide = () => {
  localFilter.value = {
    libraryIds: [...props.filter.libraryIds],
    noLibrary: props.filter.noLibrary,
    makerIds: [...props.filter.makerIds],
    genreIds: [...props.filter.genreIds],
    tagIds: [...props.filter.tagIds],
    scraped: props.filter.scraped,
    duplicate: props.filter.duplicate,
  };
};
</script>

<style scoped>
.filter-scroll-area {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}

.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px 2px 10px;
  border-radius: 8px;
  font-size: 12px;
  cursor: default;
}

.filter-chip-close {
  cursor: pointer;
  opacity: 0.7;
}

.filter-chip-clear {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 8px;
  font-size: 11px;
  cursor: pointer;
  background: var(--m3-chip-clear-bg);
  color: var(--m3-chip-clear-fg);
}

.filter-section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.filter-section-icon {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
}

.filter-section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--m3-on-surface);
}

.filter-divider {
  height: 1px;
  background: var(--m3-outline-variant);
  margin: 0 20px;
}

.lib-search-input {
  border: 1px solid var(--m3-outline);
  border-radius: 12px;
  padding: 0 12px;
  margin-bottom: 8px;
}

.lib-search-input :deep(.q-field__control) {
  border: none !important;
  box-shadow: none !important;
}

.lib-chip-toggle {
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  border-radius: 8px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
}

.lib-chip-toggle--selected {
  background: var(--m3-primary-container);
  color: var(--m3-on-primary-container);
  border: 1px solid var(--m3-on-primary-container);
  font-weight: 500;
}

.lib-chip-toggle--unselected {
  background: transparent;
  color: var(--m3-on-surface-variant);
  border: 1px solid var(--m3-outline);
}

.m3-select {
  width: 100%;
  border-radius: 12px;
}

.segmented-btn {
  display: flex;
  border: 1px solid var(--m3-outline);
  border-radius: 12px;
  overflow: hidden;
}

.segmented-btn-item {
  flex: 1;
  text-align: center;
  padding: 6px 8px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
  border-right: 1px solid var(--m3-outline);
}

.segmented-btn-item:last-child {
  border-right: none;
}

.segmented-btn-item--selected {
  background: var(--m3-primary-container);
  color: var(--m3-on-primary-container);
  font-weight: 600;
}

.segmented-btn-item--unselected {
  background: transparent;
  color: var(--m3-on-surface-variant);
}

.m3-btn-outlined {
  padding: 8px 20px;
  border: 1px solid var(--m3-outline);
  background: transparent;
  color: var(--m3-on-surface-variant);
  border-radius: 20px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.15s ease;
}

.m3-btn-outlined:hover {
  background: rgba(103, 80, 164, 0.08);
}

body.body--dark .m3-btn-outlined:hover {
  background: rgba(208, 188, 255, 0.08);
}

.m3-btn-filled {
  padding: 8px 24px;
  border: none;
  background: var(--m3-primary);
  color: var(--m3-on-primary);
  border-radius: 20px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.15s ease;
}

.m3-btn-filled:hover {
  background: #5a3d9e;
}

body.body--dark .m3-btn-filled:hover {
  background: #b69df8;
}
</style>