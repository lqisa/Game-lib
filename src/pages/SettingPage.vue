<template>
  <q-page>
    <div class="q-pa-md" style="max-width: 800px; margin: 0 auto">
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
                  <q-btn
                    flat
                    round
                    icon="edit"
                    style="color: var(--m3-primary)"
                    @click="openEditDialog(lib)"
                  >
                    <q-tooltip>Edit</q-tooltip>
                  </q-btn>
                  <q-btn
                    flat
                    round
                    icon="delete"
                    style="color: var(--m3-error)"
                    @click="deleteLibrary(lib.id)"
                  />
                </div>
              </q-item-section>
            </q-item>
          </q-list>
        </q-card-section>
        <q-card-section>
          <q-btn
            unelevated
            class="m3-btn--tonal"
            icon="add"
            label="Add Library"
            @click="showAddDialog = true"
          />
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
          <div class="m3-label-large q-mb-sm">Scrape Match Priority</div>
          <div class="m3-label-medium q-mb-sm">
            Sources are tried in this order for each game until one matches. A result matches when
            its name is the same, nearly the same, or contains your game name at the start or end.
          </div>
        </q-card-section>
        <q-card-section>
          <div v-for="lang in MATCH_LANGS" :key="lang.key" class="q-mb-md">
            <div class="text-body2 q-mb-xs" style="color: var(--m3-on-surface)">
              {{ lang.label }}
            </div>
            <div class="row items-center q-gutter-xs">
              <div
                v-for="(source, idx) in matchPriority[lang.key]"
                :key="source"
                class="row items-center q-px-sm q-py-xs"
                style="border: 1px solid var(--m3-outline-variant); border-radius: 8px"
              >
                <span
                  class="text-caption q-mr-sm"
                  style="min-width: 14px; color: var(--m3-on-surface-variant)"
                  >{{ idx + 1 }}</span
                >
                <span class="text-body2 q-mr-xs" style="color: var(--m3-on-surface)">{{
                  source
                }}</span>
                <q-btn
                  flat
                  dense
                  round
                  size="xs"
                  icon="arrow_upward"
                  :disable="idx === 0"
                  @click="moveSource(lang.key, idx, -1)"
                />
                <q-btn
                  flat
                  dense
                  round
                  size="xs"
                  icon="arrow_downward"
                  :disable="idx === matchPriority[lang.key].length - 1"
                  @click="moveSource(lang.key, idx, 1)"
                />
              </div>
            </div>
          </div>

          <q-input
            v-model.number="matchThreshold"
            label="Match threshold (0.5 - 1.0)"
            type="number"
            outlined
            class="m3-input"
            :min="0.5"
            :max="1"
            :step="0.05"
            style="max-width: 240px"
          />
        </q-card-section>
        <q-card-section>
          <q-btn unelevated class="m3-btn--filled" label="Save" @click="saveMatchSettings" />
          <q-btn flat class="m3-btn--text q-ml-sm" label="Reset" @click="resetMatchSettings" />
        </q-card-section>
      </q-card>

      <q-card class="m3-card q-mb-md">
        <q-card-section>
          <div class="m3-label-large q-mb-sm">Proxy</div>
          <div class="m3-label-medium q-mb-sm">
            HTTP proxy for scraper (e.g. Clash, v2ray). Restart required after change.
          </div>
        </q-card-section>
        <q-card-section>
          <div class="row q-gutter-md items-center">
            <q-toggle v-model="proxyEnabled" label="Enable" color="primary" />
            <q-input
              v-model="proxyHost"
              label="Host"
              outlined
              dense
              class="m3-input"
              style="max-width: 180px"
            />
            <q-input
              v-model.number="proxyPort"
              label="Port"
              type="number"
              outlined
              dense
              class="m3-input"
              style="max-width: 120px"
              :min="1"
              :max="65535"
            />
            <q-btn unelevated class="m3-btn--filled" label="Save" @click="saveProxy" />
            <q-btn
              flat
              class="m3-btn--outlined"
              label="Check Exit"
              :loading="checkingExit"
              @click="checkRegion"
            />
          </div>
          <!-- DLsite/DMM filter some works by IP and never say so, so the exit country is
               the difference between "no results" and "results you cannot see". -->
          <div v-if="regionResult" class="q-mt-md">
            <q-banner
              dense
              rounded
              :class="
                regionResult.isJapan ? 'bg-green-1 text-green-9' : 'bg-orange-1 text-orange-9'
              "
            >
              <template v-slot:avatar>
                <q-icon :name="regionResult.isJapan ? 'check_circle' : 'warning'" />
              </template>
              <div class="text-caption">
                <template v-if="regionResult.isJapan">
                  Exit is Japan{{ regionResult.country ? ' (' + regionResult.country + ')' : '' }} —
                  DLsite/DMM content is fully visible.
                </template>
                <template v-else>
                  {{
                    regionResult.region?.message ||
                    'Exit is not Japan — some DLsite/DMM works will be missing from search results.'
                  }}
                </template>
              </div>
            </q-banner>
          </div>
        </q-card-section>
      </q-card>

      <q-card class="m3-card q-mb-md">
        <q-card-section>
          <div class="m3-label-large q-mb-sm">Blacklist</div>
          <div class="m3-label-medium q-mb-sm">
            Directories in this list will be excluded from scan results, game list, and cache.
          </div>
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
                  <q-btn
                    flat
                    round
                    size="sm"
                    icon="delete"
                    style="color: var(--m3-error)"
                    @click="removeBlacklist(idx)"
                  />
                </td>
              </tr>
              <tr v-if="blacklist.length === 0">
                <td colspan="2" class="text-center" style="color: var(--m3-on-surface-variant)">
                  No entries
                </td>
              </tr>
            </tbody>
          </q-markup-table>
        </q-card-section>
        <q-card-section>
          <div class="row q-gutter-sm items-center">
            <q-input
              v-model="newBlacklistItem"
              label="Directory name"
              outlined
              dense
              class="m3-input"
              style="max-width: 300px"
              @keyup.enter="addBlacklist"
            />
            <q-btn unelevated class="m3-btn--tonal" label="Add" dense @click="addBlacklist" />
          </div>
        </q-card-section>
      </q-card>

      <q-card class="m3-card q-mb-md">
        <q-card-section>
          <div class="m3-label-large q-mb-sm">Archive Passwords</div>
          <div class="m3-label-medium q-mb-sm">
            Passwords to try when extracting encrypted archives. Tried in order, no password first.
          </div>
        </q-card-section>
        <q-card-section>
          <q-markup-table flat bordered dense>
            <thead>
              <tr>
                <th class="text-left">Password</th>
                <th class="text-right" style="width: 80px">Action</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(pwd, idx) in archivePasswords" :key="idx">
                <td>
                  <span v-if="!passwordVisible[idx]">••••••••</span>
                  <span v-else>{{ pwd }}</span>
                  <q-btn
                    flat
                    round
                    dense
                    size="xs"
                    :icon="passwordVisible[idx] ? 'visibility_off' : 'visibility'"
                    color="grey-7"
                    class="q-ml-xs"
                    @click="passwordVisible[idx] = !passwordVisible[idx]"
                  />
                </td>
                <td class="text-right">
                  <q-btn
                    flat
                    round
                    size="sm"
                    icon="delete"
                    style="color: var(--m3-error)"
                    @click="removePassword(idx)"
                  />
                </td>
              </tr>
              <tr v-if="archivePasswords.length === 0">
                <td colspan="2" class="text-center" style="color: var(--m3-on-surface-variant)">
                  No passwords
                </td>
              </tr>
            </tbody>
          </q-markup-table>
        </q-card-section>
        <q-card-section>
          <div class="row q-gutter-sm items-center">
            <q-input
              v-model="newPassword"
              label="Password"
              type="password"
              outlined
              dense
              class="m3-input"
              style="max-width: 300px"
              @keyup.enter="addPassword"
            />
            <q-btn unelevated class="m3-btn--tonal" label="Add" dense @click="addPassword" />
          </div>
        </q-card-section>
      </q-card>

      <q-card class="m3-card q-mb-md">
        <q-card-section>
          <div class="m3-label-large q-mb-sm">Extraction Tools</div>
          <div class="m3-label-medium q-mb-sm">
            Auto-detected paths. Override manually if needed.
          </div>
        </q-card-section>
        <q-card-section>
          <div class="q-gutter-sm">
            <div class="row items-center q-gutter-sm">
              <div class="text-body2" style="min-width: 100px; color: var(--m3-on-surface)">
                UnRAR.exe
              </div>
              <q-input
                v-model="extractTools.unrar"
                outlined
                dense
                class="m3-input"
                style="flex: 1"
              />
              <q-icon
                :name="extractTools.unrar ? 'check_circle' : 'cancel'"
                :color="extractTools.unrar ? 'positive' : 'negative'"
                size="sm"
              />
            </div>
            <div class="row items-center q-gutter-sm">
              <div class="text-body2" style="min-width: 100px; color: var(--m3-on-surface)">
                7z.exe
              </div>
              <q-input
                v-model="extractTools.sevenzip"
                outlined
                dense
                class="m3-input"
                style="flex: 1"
              />
              <q-icon
                :name="extractTools.sevenzip ? 'check_circle' : 'cancel'"
                :color="extractTools.sevenzip ? 'positive' : 'negative'"
                size="sm"
              />
            </div>
            <div class="row items-center q-gutter-sm">
              <div class="text-body2" style="min-width: 100px; color: var(--m3-on-surface)">
                7z-zstd
              </div>
              <q-input
                v-model="extractTools.sevenzipZstd"
                outlined
                dense
                class="m3-input"
                style="flex: 1"
              />
              <q-icon
                :name="extractTools.sevenzipZstd ? 'check_circle' : 'cancel'"
                :color="extractTools.sevenzipZstd ? 'positive' : 'negative'"
                size="sm"
              />
            </div>
          </div>
        </q-card-section>
        <q-card-section>
          <q-btn unelevated class="m3-btn--filled" label="Save Tools" @click="saveExtractTools" />
          <q-btn flat class="m3-btn--text q-ml-sm" label="Re-detect" @click="redetectTools" />
        </q-card-section>
      </q-card>

      <q-card class="m3-card q-mb-md">
        <q-card-section>
          <div class="m3-label-large q-mb-sm">Archived Archives</div>
          <div class="m3-label-medium q-mb-sm">
            Archives that have been extracted. Excluded from scans. Copy path to manually delete the
            archive file.
          </div>
        </q-card-section>
        <q-card-section>
          <q-markup-table flat bordered dense>
            <thead>
              <tr>
                <th class="text-left">Archive Path</th>
                <th class="text-right" style="width: 120px">Action</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, idx) in archivedArchives" :key="idx">
                <td
                  style="
                    max-width: 500px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                  "
                >
                  {{ item }}
                </td>
                <td class="text-right">
                  <q-btn
                    flat
                    round
                    size="sm"
                    icon="content_copy"
                    style="color: var(--m3-primary)"
                    @click="copyPath(item)"
                  >
                    <q-tooltip>Copy Path</q-tooltip>
                  </q-btn>
                  <q-btn
                    flat
                    round
                    size="sm"
                    icon="delete"
                    style="color: var(--m3-error)"
                    @click="removeArchivedArchive(idx)"
                  />
                </td>
              </tr>
              <tr v-if="archivedArchives.length === 0">
                <td colspan="2" class="text-center" style="color: var(--m3-on-surface-variant)">
                  No archived archives
                </td>
              </tr>
            </tbody>
          </q-markup-table>
        </q-card-section>
      </q-card>

      <q-card v-if="hasElectronAPI" class="m3-card q-mb-md">
        <q-card-section>
          <div class="m3-label-large q-mb-sm">Application</div>
        </q-card-section>
        <q-card-section>
          <q-toggle
            v-model="closeToTray"
            label="Close to tray"
            color="primary"
            @update:model-value="saveCloseToTray"
          />
          <div class="m3-label-medium q-ml-sm q-mt-xs">
            When closing the window, minimize to tray instead of quitting. The server keeps running
            in the background.
          </div>
        </q-card-section>
        <q-card-section>
          <q-toggle
            v-model="autoStart"
            label="Launch at startup"
            color="primary"
            @update:model-value="saveAutoStart"
          />
          <div class="m3-label-medium q-ml-sm q-mt-xs">
            Automatically start Game Lib when the system boots. Starts minimized to tray.
          </div>
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
                style="color: var(--m3-on-surface-variant)"
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
                style="color: var(--m3-on-surface-variant)"
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
import {
  SOURCE_TYPES,
  DEFAULT_MATCH_PRIORITY,
  DEFAULT_MATCH_THRESHOLD,
} from '../../server/scraper/match.js';
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

// Region check: DLsite/DMM filter some works by IP without reporting anything, so the
// exit country is worth surfacing here - this is where the user decides whether to
// switch proxy before searching.
interface RegionCheckResult {
  isJapan: boolean | null;
  country: string | null;
  region: { message?: string } | null;
}
const checkingExit = ref(false);
const regionResult = ref<RegionCheckResult | null>(null);

const checkRegion = async () => {
  checkingExit.value = true;
  try {
    const res = await api.get('/scraper/region');
    regionResult.value = res.data;
  } catch {
    regionResult.value = null;
    $q.notify({ type: 'negative', message: 'Could not check the network exit' });
  } finally {
    checkingExit.value = false;
  }
};

const blacklist = ref<string[]>([]);
const newBlacklistItem = ref('');

const archivePasswords = ref<string[]>([]);
const newPassword = ref('');
const passwordVisible = ref<boolean[]>([]);

const extractTools = ref<{ unrar: string; sevenzip: string; sevenzipZstd: string }>({
  unrar: '',
  sevenzip: '',
  sevenzipZstd: '',
});

const archivedArchives = ref<string[]>([]);

const autoStart = ref(false);
const closeToTray = ref(false);

const hasElectronAPI = computed(() => !!window.electronAPI);

const $q = useQuasar();

const normalizePath = (p: string) => p.replace(/\//g, '\\').toLowerCase().replace(/\\+$/, '');

const checkNestedLibrary = (
  newPath: string,
  excludeId?: number,
): { conflict: 'child' | 'parent'; lib: Library } | null => {
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
      message:
        nested.conflict === 'child'
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
      message:
        nested.conflict === 'child'
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

type MatchLang = 'en' | 'ja' | 'zh';

const MATCH_LANGS: { key: MatchLang; label: string }[] = [
  { key: 'en', label: 'English game names' },
  { key: 'ja', label: 'Japanese game names' },
  { key: 'zh', label: 'Chinese game names' },
];

const matchPriority = ref<Record<MatchLang, string[]>>({
  en: [...DEFAULT_MATCH_PRIORITY.en],
  ja: [...DEFAULT_MATCH_PRIORITY.ja],
  zh: [...DEFAULT_MATCH_PRIORITY.zh],
});
const matchThreshold = ref<number>(DEFAULT_MATCH_THRESHOLD);

// Keep every known source in the list, so a partial stored value can still be reordered
// and a source can never become unreachable from the UI.
const normalizePriority = (raw: unknown, fallback: string[]): string[] => {
  const stored = Array.isArray(raw) ? raw.filter((s) => SOURCE_TYPES.includes(String(s))) : [];
  const missing = fallback.filter((s) => !stored.includes(s));
  const merged = [...stored, ...missing];
  return merged.length > 0 ? merged.map(String) : [...fallback];
};

const parsePriority = (value: string | undefined, fallback: string[]): string[] => {
  if (!value) return [...fallback];
  try {
    return normalizePriority(JSON.parse(value), fallback);
  } catch {
    return [...fallback];
  }
};

const fetchMatchSettings = async () => {
  try {
    const [en, ja, zh, threshold] = await Promise.all([
      api.get('/settings/match_priority_en'),
      api.get('/settings/match_priority_ja'),
      api.get('/settings/match_priority_zh'),
      api.get('/settings/match_threshold'),
    ]);
    matchPriority.value = {
      en: parsePriority(en.data.value, DEFAULT_MATCH_PRIORITY.en),
      ja: parsePriority(ja.data.value, DEFAULT_MATCH_PRIORITY.ja),
      zh: parsePriority(zh.data.value, DEFAULT_MATCH_PRIORITY.zh),
    };
    const parsed = Number(threshold.data.value);
    matchThreshold.value =
      Number.isFinite(parsed) && parsed > 0 && parsed <= 1 ? parsed : DEFAULT_MATCH_THRESHOLD;
  } catch {
    // keep the defaults already in the refs
  }
};

const moveSource = (lang: MatchLang, index: number, delta: number) => {
  const list = matchPriority.value[lang];
  const target = index + delta;
  if (target < 0 || target >= list.length) return;
  const [moved] = list.splice(index, 1);
  if (moved !== undefined) list.splice(target, 0, moved);
};

const saveMatchSettings = async () => {
  const val = Math.min(1, Math.max(0.5, Number(matchThreshold.value) || DEFAULT_MATCH_THRESHOLD));
  matchThreshold.value = val;
  await Promise.all([
    api.put('/settings/match_priority_en', { value: JSON.stringify(matchPriority.value.en) }),
    api.put('/settings/match_priority_ja', { value: JSON.stringify(matchPriority.value.ja) }),
    api.put('/settings/match_priority_zh', { value: JSON.stringify(matchPriority.value.zh) }),
    api.put('/settings/match_threshold', { value: String(val) }),
  ]);
  $q.notify({ type: 'positive', message: 'Match settings saved' });
};

const resetMatchSettings = async () => {
  matchPriority.value = {
    en: [...DEFAULT_MATCH_PRIORITY.en],
    ja: [...DEFAULT_MATCH_PRIORITY.ja],
    zh: [...DEFAULT_MATCH_PRIORITY.zh],
  };
  matchThreshold.value = DEFAULT_MATCH_THRESHOLD;
  await saveMatchSettings();
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
  } catch {
    proxyEnabled.value = false;
  }
  try {
    const host = await api.get('/settings/proxy_host');
    proxyHost.value = host.data.value || '127.0.0.1';
  } catch {
    proxyHost.value = '127.0.0.1';
  }
  try {
    const port = await api.get('/settings/proxy_port');
    proxyPort.value = parseInt(port.data.value, 10) || 7890;
  } catch {
    proxyPort.value = 7890;
  }
};

const saveProxy = async () => {
  await api.put('/settings/proxy_enabled', { value: String(proxyEnabled.value) });
  await api.put('/settings/proxy_host', { value: proxyHost.value || '127.0.0.1' });
  await api.put('/settings/proxy_port', { value: String(proxyPort.value || 7890) });
};

const saveAutoStart = async (val: boolean) => {
  if (!window.electronAPI) return;
  const res = await window.electronAPI.setAutoStart(val);
  if (!res.ok) {
    // Dev builds cannot register a working auto-start entry, so put the toggle back
    // instead of showing a state the app cannot honour.
    autoStart.value = false;
    $q.notify({
      type: 'info',
      message: 'Launch at startup is only available in the installed build.',
    });
  }
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

const fetchArchivePasswords = async () => {
  try {
    const res = await api.get('/settings/archive-passwords/list');
    archivePasswords.value = res.data;
    passwordVisible.value = res.data.map(() => false);
  } catch {
    archivePasswords.value = [];
  }
};

const addPassword = async () => {
  const pwd = newPassword.value;
  if (!pwd) return;
  archivePasswords.value.push(pwd);
  passwordVisible.value.push(false);
  newPassword.value = '';
  await api.put('/settings/archive-passwords/save', { passwords: archivePasswords.value });
};

const removePassword = async (idx: number) => {
  archivePasswords.value.splice(idx, 1);
  passwordVisible.value.splice(idx, 1);
  await api.put('/settings/archive-passwords/save', { passwords: archivePasswords.value });
};

const fetchExtractTools = async () => {
  try {
    const res = await api.get('/settings/extract-tools/list');
    extractTools.value = {
      unrar: res.data.unrar || '',
      sevenzip: res.data.sevenzip || '',
      sevenzipZstd: res.data.sevenzipZstd || '',
    };
  } catch {
    extractTools.value = { unrar: '', sevenzip: '', sevenzipZstd: '' };
  }
};

const saveExtractTools = async () => {
  await api.put('/settings/extract-tools/save', { tools: extractTools.value });
  $q.notify({ type: 'positive', message: 'Tools saved' });
};

const redetectTools = async () => {
  try {
    const res = await api.get('/settings/detect-tools');
    extractTools.value = {
      unrar: res.data.unrar || '',
      sevenzip: res.data.sevenzip || '',
      sevenzipZstd: res.data.sevenzipZstd || '',
    };
    await api.put('/settings/extract-tools/save', { tools: extractTools.value });
    $q.notify({ type: 'positive', message: 'Tools re-detected' });
  } catch {
    $q.notify({ type: 'negative', message: 'Detection failed' });
  }
};

const fetchArchivedArchives = async () => {
  try {
    const res = await api.get('/settings/archived-archives/list');
    archivedArchives.value = res.data;
  } catch {
    archivedArchives.value = [];
  }
};

const copyPath = async (item: string) => {
  try {
    await navigator.clipboard.writeText(item);
    $q.notify({ type: 'positive', message: 'Path copied' });
  } catch {
    /* clipboard may not be available */
  }
};

const removeArchivedArchive = async (idx: number) => {
  await api.delete(`/settings/archived-archives/remove/${idx}`);
  await fetchArchivedArchives();
};

onMounted(() => {
  void fetchLibraries();
  void fetchToken();
  void fetchConcurrency();
  void fetchMatchSettings();
  void fetchBlacklist();
  void fetchProxy();
  void fetchAutoStart();
  void fetchCloseToTray();
  void fetchArchivePasswords();
  void fetchExtractTools();
  void fetchArchivedArchives();
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
