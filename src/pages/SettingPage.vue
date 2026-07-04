<template>
  <q-page>
    <div class="q-pa-md">
      <div class="text-h6 q-mb-md">Setting</div>

      <q-card class="q-mb-md">
        <q-card-section>
          <div class="text-subtitle1">Game Libraries</div>
        </q-card-section>
        <q-card-section>
          <q-list separator>
            <q-item v-for="lib in libraries" :key="lib.id">
              <q-item-section>
                <q-item-label>{{ lib.name }}</q-item-label>
                <q-item-label caption>{{ lib.path }}</q-item-label>
              </q-item-section>
              <q-item-section side>
                <div class="row q-gutter-xs">
                  <q-btn flat round color="primary" icon="edit" @click="openEditDialog(lib)">
                    <q-tooltip>Edit</q-tooltip>
                  </q-btn>
                  <q-btn flat round color="negative" icon="delete" @click="deleteLibrary(lib.id)" />
                </div>
              </q-item-section>
            </q-item>
          </q-list>
        </q-card-section>
        <q-card-section>
          <q-btn color="primary" label="Add Library" @click="showAddDialog = true" />
        </q-card-section>
      </q-card>

      <q-card class="q-mb-md">
        <q-card-section>
          <div class="text-subtitle1">Bangumi Token</div>
        </q-card-section>
        <q-card-section>
          <q-input v-model="token" label="Token" type="password" outlined />
        </q-card-section>
        <q-card-section>
          <q-btn color="primary" label="Save Token" @click="saveToken" />
        </q-card-section>
      </q-card>

      <q-card class="q-mb-md">
        <q-card-section>
          <div class="text-subtitle1">Scrape Concurrency</div>
        </q-card-section>
        <q-card-section>
          <q-input
            v-model.number="concurrency"
            label="Max concurrent scrapes"
            type="number"
            outlined
            :min="1"
            :max="10"
            style="max-width: 200px"
          />
        </q-card-section>
        <q-card-section>
          <q-btn color="primary" label="Save" @click="saveConcurrency" />
        </q-card-section>
      </q-card>

      <q-card class="q-mb-md">
        <q-card-section>
          <div class="text-subtitle1">Proxy</div>
          <div class="text-caption text-grey">HTTP proxy for scraper (e.g. Clash, v2ray). Restart required after change.</div>
        </q-card-section>
        <q-card-section>
          <div class="row q-gutter-md items-center">
            <q-toggle v-model="proxyEnabled" label="Enable" />
            <q-input v-model="proxyHost" label="Host" outlined dense style="max-width: 180px" />
            <q-input v-model.number="proxyPort" label="Port" type="number" outlined dense style="max-width: 120px" :min="1" :max="65535" />
            <q-btn color="primary" label="Save" @click="saveProxy" />
          </div>
        </q-card-section>
      </q-card>

      <q-card class="q-mb-md">
        <q-card-section>
          <div class="text-subtitle1">Blacklist</div>
          <div class="text-caption text-grey">Directories in this list will be excluded from scan results, game list, and cache.</div>
        </q-card-section>
        <q-card-section>
          <q-markup-table flat bordered dense>
            <thead>
              <tr>
                <th class="text-left">Directory Name</th>
                <th class="text-right" style="width: 80px">Action</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, idx) in blacklist" :key="idx">
                <td>{{ item }}</td>
                <td class="text-right">
                  <q-btn flat round color="negative" size="sm" icon="delete" @click="removeBlacklist(idx)" />
                </td>
              </tr>
              <tr v-if="blacklist.length === 0">
                <td colspan="2" class="text-center text-grey">No entries</td>
              </tr>
            </tbody>
          </q-markup-table>
        </q-card-section>
        <q-card-section>
          <div class="row q-gutter-sm items-center">
            <q-input v-model="newBlacklistItem" label="Directory name" outlined dense style="max-width: 300px" @keyup.enter="addBlacklist" />
            <q-btn color="primary" label="Add" dense @click="addBlacklist" />
          </div>
        </q-card-section>
      </q-card>
    </div>

    <q-dialog v-model="showAddDialog">
      <q-card style="min-width: 400px">
        <q-card-section>
          <div class="text-h6">Add Library</div>
        </q-card-section>
        <q-card-section>
          <q-input v-model="newLibName" label="Library Name" outlined class="q-mb-md" />
          <q-input v-model="newLibPath" label="Library Path" outlined>
            <template v-slot:append>
              <q-icon
                v-if="hasElectronAPI"
                name="folder_open"
                class="cursor-pointer"
                @click="browseDirectory('add')"
              />
            </template>
          </q-input>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" v-close-popup />
          <q-btn color="primary" label="Add" @click="addLibrary" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <q-dialog v-model="showEditDialog">
      <q-card style="min-width: 400px">
        <q-card-section>
          <div class="text-h6">Edit Library</div>
        </q-card-section>
        <q-card-section>
          <q-input v-model="editLibName" label="Library Name" outlined class="q-mb-md" />
          <q-input v-model="editLibPath" label="Library Path" outlined>
            <template v-slot:append>
              <q-icon
                v-if="hasElectronAPI"
                name="folder_open"
                class="cursor-pointer"
                @click="browseDirectory('edit')"
              />
            </template>
          </q-input>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" v-close-popup />
          <q-btn color="primary" label="Save" @click="saveEditLibrary" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import api from '../composables/useApi';

interface Library {
  id: number;
  name: string;
  path: string;
}

const libraries = ref<Library[]>([]);
const token = ref('');
const showAddDialog = ref(false);
const newLibName = ref('');
const newLibPath = ref('');

const showEditDialog = ref(false);
const editLibId = ref(0);
const editLibName = ref('');
const editLibPath = ref('');

const concurrency = ref(4);
const proxyEnabled = ref(false);
const proxyHost = ref('127.0.0.1');
const proxyPort = ref(7890);

const blacklist = ref<string[]>([]);
const newBlacklistItem = ref('');

const hasElectronAPI = computed(() => !!window.electronAPI);

const $q = useQuasar();

const normalizePath = (p: string) => p.replace(/\//g, '\\').toLowerCase().replace(/\\+$/, '');

const checkNestedLibrary = (newPath: string, excludeId?: number): { conflict: 'child' | 'parent'; lib: Library } | null => {
  const newNorm = normalizePath(newPath);
  for (const lib of libraries.value) {
    if (excludeId && lib.id === excludeId) continue;
    const libNorm = normalizePath(lib.path);
    if (newNorm.startsWith(libNorm + '\\')) {
      return { conflict: 'child', lib };
    }
    if (libNorm.startsWith(newNorm + '\\')) {
      return { conflict: 'parent', lib };
    }
  }
  return null;
};

const fetchLibraries = async () => {
  const res = await api.get('/libraries');
  libraries.value = res.data;
};

const fetchToken = async () => {
  try {
    const res = await api.get('/settings/bangumi_token');
    token.value = res.data.value;
  } catch {
    token.value = '';
  }
};

const addLibrary = async () => {
  if (!newLibName.value || !newLibPath.value) return;
  const nested = checkNestedLibrary(newLibPath.value);
  if (nested) {
    $q.notify({
      type: 'negative',
      message: nested.conflict === 'child'
        ? `Path is a subdirectory of library "${nested.lib.name}"`
        : `Path contains existing library "${nested.lib.name}"`,
    });
    return;
  }
  await api.post('/libraries', { name: newLibName.value, path: newLibPath.value });
  newLibName.value = '';
  newLibPath.value = '';
  showAddDialog.value = false;
  await fetchLibraries();
};

const openEditDialog = (lib: Library) => {
  editLibId.value = lib.id;
  editLibName.value = lib.name;
  editLibPath.value = lib.path;
  showEditDialog.value = true;
};

const saveEditLibrary = async () => {
  if (!editLibName.value || !editLibPath.value) return;
  const nested = checkNestedLibrary(editLibPath.value, editLibId.value);
  if (nested) {
    $q.notify({
      type: 'negative',
      message: nested.conflict === 'child'
        ? `Path is a subdirectory of library "${nested.lib.name}"`
        : `Path contains existing library "${nested.lib.name}"`,
    });
    return;
  }
  await api.put(`/libraries/${editLibId.value}`, {
    name: editLibName.value,
    path: editLibPath.value,
  });
  showEditDialog.value = false;
  await fetchLibraries();
};

const browseDirectory = async (target: 'add' | 'edit') => {
  if (!window.electronAPI) return;
  const dir = await window.electronAPI.openDirectory('Select Library Path');
  if (dir) {
    if (target === 'add') newLibPath.value = dir;
    else editLibPath.value = dir;
  }
};

const deleteLibrary = async (id: number) => {
  await api.delete(`/libraries/${id}`);
  await fetchLibraries();
};

const saveToken = async () => {
  await api.put('/settings/bangumi_token', { value: token.value });
};

const fetchConcurrency = async () => {
  try {
    const res = await api.get('/settings/scrape_concurrency');
    concurrency.value = parseInt(res.data.value, 10) || 4;
  } catch {
    concurrency.value = 4;
  }
};

const saveConcurrency = async () => {
  const val = Math.max(1, Math.min(10, concurrency.value || 4));
  concurrency.value = val;
  await api.put('/settings/scrape_concurrency', { value: String(val) });
};

const fetchBlacklist = async () => {
  try {
    const res = await api.get('/settings/blacklist');
    blacklist.value = JSON.parse(res.data.value);
  } catch {
    blacklist.value = [];
  }
};

const saveBlacklist = async () => {
  await api.put('/settings/blacklist', { value: JSON.stringify(blacklist.value) });
};

const addBlacklist = async () => {
  const item = newBlacklistItem.value.trim();
  if (!item || blacklist.value.includes(item)) return;
  blacklist.value.push(item);
  newBlacklistItem.value = '';
  await saveBlacklist();
};

const removeBlacklist = async (idx: number) => {
  blacklist.value.splice(idx, 1);
  await saveBlacklist();
};

const fetchProxy = async () => {
  try {
    const enabled = await api.get('/settings/proxy_enabled');
    proxyEnabled.value = enabled.data.value === 'true';
  } catch { proxyEnabled.value = false; }
  try {
    const host = await api.get('/settings/proxy_host');
    proxyHost.value = host.data.value || '127.0.0.1';
  } catch { proxyHost.value = '127.0.0.1'; }
  try {
    const port = await api.get('/settings/proxy_port');
    proxyPort.value = parseInt(port.data.value, 10) || 7890;
  } catch { proxyPort.value = 7890; }
};

const saveProxy = async () => {
  await api.put('/settings/proxy_enabled', { value: String(proxyEnabled.value) });
  await api.put('/settings/proxy_host', { value: proxyHost.value || '127.0.0.1' });
  await api.put('/settings/proxy_port', { value: String(proxyPort.value || 7890) });
};

onMounted(() => {
  void fetchLibraries();
  void fetchToken();
  void fetchConcurrency();
  void fetchBlacklist();
  void fetchProxy();
});
</script>