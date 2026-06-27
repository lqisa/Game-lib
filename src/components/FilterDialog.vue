<template>
  <q-dialog v-model="show" persistent>
    <q-card style="min-width: 500px; max-width: 600px; max-height: 85vh">
      <q-bar class="bg-primary text-white">
        <div class="text-subtitle2">Filter</div>
        <q-space />
        <q-btn dense flat icon="close" v-close-popup />
      </q-bar>

      <q-card-section class="q-py-xs">
        <div class="text-subtitle2 text-dark q-pb-sm q-pl-md">Libraries</div>
        <div v-if="librariesLoading" class="text-center q-pa-xs">
          <q-spinner-dots size="20px" color="primary" />
        </div>
        <div v-else style="padding: 8px 16px; display: flex; flex-wrap: wrap; gap: 4px 12px">
          <q-checkbox
            v-for="lib in filteredLibraries"
            :key="lib.id"
            v-model="localFilter.libraryIds"
            :val="lib.id"
            :label="lib.name"
            dense
          />
          <q-checkbox
            v-model="localFilter.noLibrary"
            :true-value="true"
            :false-value="false"
            label="Dropped"
            dense
          />
          <div v-if="filteredLibraries.length === 0" class="text-caption text-grey">No match</div>
        </div>

        <div class="text-subtitle2 text-dark q-pb-sm q-pt-md q-pl-md">Makers</div>
        <div v-if="makersLoading" class="text-center q-pa-xs">
          <q-spinner-dots size="20px" color="primary" />
        </div>
        <div v-else style="padding: 0 16px 8px">
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
            placeholder="Select makers..."
            virtual-scroll-item-size="32"
            style="width: 100%"
          />
        </div>

        <div class="text-subtitle2 text-dark q-pb-sm q-pt-md q-pl-md">Genres</div>
        <div v-if="genresLoading" class="text-center q-pa-xs">
          <q-spinner-dots size="20px" color="primary" />
        </div>
        <div v-else style="padding: 0 16px 8px">
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
            placeholder="Select genres..."
            virtual-scroll-item-size="32"
            style="width: 100%"
          />
        </div>

        <div class="text-subtitle2 text-dark q-pb-sm q-pt-md q-pl-md">Tags</div>
        <div v-if="tagsLoading" class="text-center q-pa-xs">
          <q-spinner-dots size="20px" color="primary" />
        </div>
        <div v-else style="padding: 0 16px 8px">
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
            placeholder="Select tags..."
            virtual-scroll-item-size="32"
            style="width: 100%"
          />
        </div>

        <div class="text-subtitle2 text-dark q-pb-sm q-pt-md q-pl-md">Scrape Status</div>
        <div style="padding: 8px 16px; display: flex; flex-wrap: wrap; gap: 4px 16px">
          <q-radio v-model="localFilter.scraped" val="all" label="All" dense />
          <q-radio v-model="localFilter.scraped" val="yes" label="Scraped" dense />
          <q-radio v-model="localFilter.scraped" val="no" label="Not scraped" dense />
        </div>
      </q-card-section>

      <q-card-actions align="right">
        <q-btn flat label="Reset" @click="resetFilter" />
        <q-btn color="primary" label="Apply" @click="applyFilter" />
      </q-card-actions>
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
  localFilter.value = { libraryIds: [], noLibrary: false, makerIds: [], genreIds: [], tagIds: [], scraped: 'yes' };
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