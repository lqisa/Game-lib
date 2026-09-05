<template>
  <q-page>
    <div class="q-pa-md" style="max-width: 800px; margin: 0 auto;">
      <div class="m3-title q-mb-lg">Settings</div>

      <q-card class="m3-card q-mb-md">
        <q-card-section>
          <div class="m3-label-large q-mb-sm">Game Libraries</div>
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
                  <q-btn flat round icon="edit" style="color: var(--m3-primary);" @click="openEditDialog(lib)">
                    <q-tooltip>Edit</q-tooltip>
                  </q-btn>
                  <q-btn flat round icon="delete" style="color: var(--m3-error);" @click="deleteLibrary(lib.id)" />
                </div>
              </q-item-section>
            </q-item>
          </q-list>
        </q-card-section>
        <q-card-section>
          <q-btn unelevated class="m3-btn--tonal" icon="add" label="Add Library" @click="showAddDialog = true" />
        </q-card-section>
      </q-card>

      <q-card class="m3-card q-mb-md">
        <q-card-section>
          <div class="m3-label-large q-mb-sm">Bangumi Token</div>
        </q-card-section>
        <q-card-section>
          <q-input v-model="token" label="Token" type="password" outlined class="m3-input" />
        </q-card-section>
        <q-card-section>
          <q-btn unelevated class="m3-btn--filled" label="Save Token" @click="saveToken" />
        </q-card-section>
      </q-card>

      <q-card class="m3-card q-mb-md">
        <q-card-section>
          <div class="m3-label-large q-mb-sm">Scrape Concurrency</div>
        </q-card-section>
        <q-card-section>
          <q-input
            v-model.number="concurrency"
            label="Max concurrent scrapes"
            type="number"
            outlined
            class="m3-input"
            :min="1"
            :max="10"
            style="max-width: 200px"
          />
        </q-card-section>
        <q-card-section>
          <q-btn unelevated class="m3-btn--filled" label="Save" @click="saveConcurrency" />
        </q-card-section>
      </q-card>

      <q-card class="m3-card q-mb-md">
        <q-card-section>
          <div class="m3-label-large q-mb-sm">Proxy</div>
          <div class="m3-label-medium q-mb-sm">HTTP proxy for scraper (e.g. Clash, v2ray). Restart required after change.</div>
        </q-card-section>
        <q-card-section>
          <div class="row q-gutter-md items-center">
            <q-toggle v-model="proxyEnabled" label="Enable" color="primary" />
            <q-input v-model="proxyHost" label="Host" outlined dense class="m3-input" style="max-width: 180px" />
            <q-input v-model.number="proxyPort" label="Port" type="number" outlined dense class="m3-input" style="max-width: 120px" :min="1" :max="65535" />
            <q-btn unelevated class="m3-btn--filled" label="Save" @click="saveProxy" />
          </div>
        </q-card-section>
      </q-card>

      <q-card class="m3-card q-mb-md">
        <q-card-section>
          <div class="m3-label-large q-mb-sm">Blacklist</div>
          <div class="m3-label-medium q-mb-sm">Directories in this list will be excluded from scan results, game list, and cache.</div>
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
                  <q-btn flat round size="sm" icon="delete" style="color: var(--m3-error);" @click="removeBlacklist(idx)" />
                </td>
              </tr>
              <tr v-if="blacklist.length === 0">
                <td colspan="2" class="text-center" style="color: var(--m3-on-surface-variant);">No entries</td>
              </tr>
            </tbody>
          </q-markup-table>
        </q-card-section>
        <q-card-section>
          <div class="row q-gutter-sm items-center">
            <q-input v-model="newBlacklistItem" label="Directory name" outlined dense class="m3-input" style="max-width: 300px" @keyup.enter="addBlacklist" />
            <q-btn unelevated class="m3-btn--tonal" label="Add" dense @click="addBlacklist" />
          </div>
        </q-card-section>
      </q-card>

      <q-card v-if="hasElectronAPI" class="m3-card q-mb-md">
        <q-card-section>
          <div class="m3-label-large q-mb-sm">Application</div>
        </q-card-section>
        <q-card-section>
          <q-toggle v-model="closeToTray" label="Close to tray" color="primary" @update:model-value="saveCloseToTray" />
          <div class="m3-label-medium q-ml-sm q-mt-xs">When closing the window, minimize to tray instead of quitting. The server keeps running in the background.</div>
        </q-card-section>
        <q-card-section>
          <q-toggle v-model="autoStart" label="Launch at startup" color="primary" @update:model-value="saveAutoStart" />
          <div class="m3-label-medium q-ml-sm q-mt-xs">Automatically start Game Lib when the system boots. Starts minimized to tray.</div>
        </q-card-section>
      </q-card>
    </div>

    <q-dialog v-model="showAddDialog">
      <q-card style="min-width: 400px">
        <q-card-section>
          <div class="m3-title">Add Library</div>
        </q-card-section>
        <q-card-section>
          <q-input v-model="newLibName" label="Library Name" outlined class="m3-input q-mb-md" />
          <q-input v-model="newLibPath" label="Library Path" outlined class="m3-input">
            <template v-slot:append>
              <q-icon
                v-if="hasElectronAPI"
                name="folder_open"
                class="cursor-pointer"
                style="color: var(--m3-on-surface-variant);"
                @click="browseDirectory('add')"
              />
            </template>
          </q-input>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat class="m3-btn--text" label="Cancel" v-close-popup />
          <q-btn unelevated class="m3-btn--filled" label="Add" @click="addLibrary" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <q-dialog v-model="showEditDialog">
      <q-card style="min-width: 400px">
        <q-card-section>
          <div class="m3-title">Edit Library</div>
        </q-card-section>
        <q-card-section>
          <q-input v-model="editLibName" label="Library Name" outlined class="m3-input q-mb-md" />
          <q-input v-model="editLibPath" label="Library Path" outlined class="m3-input">
            <template v-slot:append>
              <q-icon
                v-if="hasElectronAPI"
                name="folder_open"
                class="cursor-pointer"
                style="color: var(--m3-on-surface-variant);"
                @click="browseDirectory('edit')"
              />
            </template>
          </q-input>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat class="m3-btn--text" label="Cancel" v-close-popup />
          <q-btn unelevated class="m3-btn--filled" label="Save" @click="saveEditLibrary" />
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

const autoStart = ref(false);
const closeToTray = ref(false);

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

const saveAutoStart = async (val: boolean) => {
  if (!window.electronAPI) return;
  await window.electronAPI.setAutoStart(val);
};

const fetchAutoStart = async () => {
  if (!window.electronAPI) return;
  try {
    autoStart.value = await window.electronAPI.getAutoStart();
  } catch {
    autoStart.value = false;
  }
};

const saveCloseToTray = async (val: boolean) => {
  if (!window.electronAPI) return;
  await window.electronAPI.setCloseToTray(val);
  await api.put('/settings/close_to_tray', { value: String(val) });
};

const fetchCloseToTray = async () => {
  if (!window.electronAPI) return;
  try {
    closeToTray.value = await window.electronAPI.getCloseToTray();
  } catch {
    closeToTray.value = false;
  }
};

onMounted(() => {
  void fetchLibraries();
  void fetchToken();
  void fetchConcurrency();
  void fetchBlacklist();
  void fetchProxy();
  void fetchAutoStart();
  void fetchCloseToTray();
});
</script>

<style>
.m3-card {
  background: var(--m3-surface-container-low) !important;
  border: 1px solid var(--m3-outline-variant) !important;
  border-radius: var(--m3-shape-corner-md) !important;
  box-shadow: none !important;
}
</style>