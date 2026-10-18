<template>
  <div class="h-full overflow-y-auto">
    <div class="mx-auto max-w-3xl space-y-8 p-6">
      <h1 class="text-lg font-semibold">Settings</h1>

      <Card class="gap-0 py-0">
        <CardHeader class="px-4 py-3">
          <CardTitle class="text-sm font-semibold">Game Libraries</CardTitle>
        </CardHeader>
        <Separator />
        <CardContent class="flex flex-col gap-3 px-4 py-3">
          <div class="divide-y">
            <div v-for="lib in libraries" :key="lib.id" class="flex items-center gap-1 py-2">
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm">{{ lib.name }}</div>
                <div class="text-muted-foreground truncate text-xs">{{ lib.path }}</div>
              </div>
              <Tooltip>
                <TooltipTrigger as-child>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    class="text-primary"
                    @click="openEditDialog(lib)"
                  >
                    <Pencil class="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Edit</TooltipContent>
              </Tooltip>
              <Button
                variant="ghost"
                size="icon-sm"
                class="text-destructive"
                @click="deleteLibrary(lib.id)"
              >
                <Trash2 class="size-4" />
              </Button>
            </div>
          </div>

          <div>
            <Button variant="secondary" size="sm" @click="showAddDialog = true">
              <Plus class="size-4" />
              Add Library
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card class="gap-0 py-0">
        <CardHeader class="px-4 py-3">
          <CardTitle class="text-sm font-semibold">Bangumi Token</CardTitle>
        </CardHeader>
        <Separator />
        <CardContent class="flex flex-col gap-3 px-4 py-3">
          <div class="flex flex-col gap-1.5">
            <Label for="bangumi-token" class="text-xs">Token</Label>
            <Input id="bangumi-token" v-model="token" type="password" class="h-8 text-[13px]" />
          </div>
          <div>
            <Button size="sm" @click="saveToken">Save Token</Button>
          </div>
        </CardContent>
      </Card>

      <Card class="gap-0 py-0">
        <CardHeader class="px-4 py-3">
          <CardTitle class="text-sm font-semibold">Scrape Concurrency</CardTitle>
        </CardHeader>
        <Separator />
        <CardContent class="flex flex-col gap-3 px-4 py-3">
          <div class="flex flex-col gap-1.5">
            <Label for="scrape-concurrency" class="text-xs">Max concurrent scrapes</Label>
            <Input
              id="scrape-concurrency"
              :model-value="concurrency"
              type="number"
              :min="1"
              :max="10"
              class="h-8 w-[200px] text-[13px]"
              @update:model-value="concurrency = toNumber($event)"
            />
          </div>
          <div>
            <Button size="sm" @click="saveConcurrency">Save</Button>
          </div>
        </CardContent>
      </Card>

      <Card class="gap-0 py-0">
        <CardHeader class="px-4 py-3">
          <CardTitle class="text-sm font-semibold">Scrape Match Priority</CardTitle>
          <CardDescription class="text-xs">
            Sources are tried in this order for each game until one matches. A result matches when
            its name is the same, nearly the same, or contains your game name at the start or end.
          </CardDescription>
        </CardHeader>
        <Separator />
        <CardContent class="flex flex-col gap-3 px-4 py-3">
          <div v-for="lang in MATCH_LANGS" :key="lang.key" class="flex flex-col gap-1.5">
            <div class="text-sm">{{ lang.label }}</div>
            <div class="flex flex-wrap items-center gap-1.5">
              <div
                v-for="(source, idx) in matchPriority[lang.key]"
                :key="source"
                class="flex items-center gap-0.5 rounded-lg border px-2 py-0.5"
              >
                <span class="text-muted-foreground mr-1.5 w-3.5 text-xs">{{ idx + 1 }}</span>
                <span class="mr-1 text-sm">{{ source }}</span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  :disabled="idx === 0"
                  @click="moveSource(lang.key, idx, -1)"
                >
                  <ArrowUp class="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  :disabled="idx === matchPriority[lang.key].length - 1"
                  @click="moveSource(lang.key, idx, 1)"
                >
                  <ArrowDown class="size-3.5" />
                </Button>
              </div>
            </div>
          </div>

          <div class="flex flex-col gap-1.5">
            <Label for="match-threshold" class="text-xs">Match threshold (0.5 - 1.0)</Label>
            <Input
              id="match-threshold"
              :model-value="matchThreshold"
              type="number"
              :min="0.5"
              :max="1"
              :step="0.05"
              class="h-8 w-[240px] text-[13px]"
              @update:model-value="matchThreshold = toNumber($event)"
            />
          </div>
          <div class="flex gap-2">
            <Button size="sm" @click="saveMatchSettings">Save</Button>
            <Button variant="ghost" size="sm" @click="resetMatchSettings">Reset</Button>
          </div>
        </CardContent>
      </Card>

      <Card class="gap-0 py-0">
        <CardHeader class="px-4 py-3">
          <CardTitle class="text-sm font-semibold">Proxy</CardTitle>
          <CardDescription class="text-xs">
            HTTP proxy for scraper (e.g. Clash, v2ray). Restart required after change.
          </CardDescription>
        </CardHeader>
        <Separator />
        <CardContent class="flex flex-col gap-3 px-4 py-3">
          <div class="flex flex-wrap items-end gap-3">
            <div class="flex h-8 items-center gap-2">
              <Switch id="proxy-enabled" v-model="proxyEnabled" />
              <Label for="proxy-enabled" class="text-xs">Enable</Label>
            </div>
            <div class="flex flex-col gap-1.5">
              <Label for="proxy-host" class="text-xs">Host</Label>
              <Input id="proxy-host" v-model="proxyHost" class="h-8 w-[180px] text-[13px]" />
            </div>
            <div class="flex flex-col gap-1.5">
              <Label for="proxy-port" class="text-xs">Port</Label>
              <Input
                id="proxy-port"
                :model-value="proxyPort"
                type="number"
                :min="1"
                :max="65535"
                class="h-8 w-[120px] text-[13px]"
                @update:model-value="proxyPort = toNumber($event)"
              />
            </div>
            <div class="flex items-center gap-2">
              <Button size="sm" @click="saveProxy">Save</Button>
              <Button variant="outline" size="sm" :disabled="checkingExit" @click="checkRegion">
                <Loader2 v-if="checkingExit" class="size-4 animate-spin" />
                Check Exit
              </Button>
            </div>
          </div>

          <!-- DLsite/DMM filter some works by IP and never say so, so the exit country is
               the difference between "no results" and "results you cannot see". -->
          <Alert
            v-if="regionResult"
            :class="
              regionResult.isJapan
                ? 'border-success/30 bg-success/15 text-success'
                : 'border-warning/30 bg-warning/15 text-warning'
            "
          >
            <CheckCircle2 v-if="regionResult.isJapan" />
            <TriangleAlert v-else />
            <AlertDescription
              class="text-xs"
              :class="regionResult.isJapan ? 'text-success' : 'text-warning'"
            >
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
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <Card class="gap-0 py-0">
        <CardHeader class="px-4 py-3">
          <CardTitle class="text-sm font-semibold">Blacklist</CardTitle>
          <CardDescription class="text-xs">
            Directories in this list will be excluded from scan results, game list, and cache.
          </CardDescription>
        </CardHeader>
        <Separator />
        <CardContent class="flex flex-col gap-3 px-4 py-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead class="h-8 text-xs">Directory Name</TableHead>
                <TableHead class="h-8 w-20 text-right text-xs">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="(item, idx) in blacklist" :key="idx">
                <TableCell>{{ item }}</TableCell>
                <TableCell>
                  <div class="flex justify-end">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      class="text-destructive"
                      @click="removeBlacklist(idx)"
                    >
                      <Trash2 class="size-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
              <TableRow v-if="blacklist.length === 0">
                <TableCell :colspan="2" class="text-muted-foreground py-4 text-center text-xs">
                  No entries
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>

          <div class="flex items-end gap-2">
            <div class="flex flex-col gap-1.5">
              <Label for="new-blacklist-item" class="text-xs">Directory name</Label>
              <Input
                id="new-blacklist-item"
                v-model="newBlacklistItem"
                class="h-8 w-[300px] text-[13px]"
                @keyup.enter="addBlacklist"
              />
            </div>
            <Button variant="secondary" size="sm" @click="addBlacklist">Add</Button>
          </div>
        </CardContent>
      </Card>

      <Card class="gap-0 py-0">
        <CardHeader class="px-4 py-3">
          <CardTitle class="text-sm font-semibold">Archive Passwords</CardTitle>
          <CardDescription class="text-xs">
            Passwords to try when extracting encrypted archives. Tried in order, no password first.
          </CardDescription>
        </CardHeader>
        <Separator />
        <CardContent class="flex flex-col gap-3 px-4 py-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead class="h-8 text-xs">Password</TableHead>
                <TableHead class="h-8 w-20 text-right text-xs">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="(pwd, idx) in archivePasswords" :key="idx">
                <TableCell>
                  <div class="flex items-center gap-1">
                    <span v-if="!passwordVisible[idx]">••••••••</span>
                    <span v-else>{{ pwd }}</span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      class="text-muted-foreground"
                      @click="passwordVisible[idx] = !passwordVisible[idx]"
                    >
                      <EyeOff v-if="passwordVisible[idx]" class="size-3.5" />
                      <Eye v-else class="size-3.5" />
                    </Button>
                  </div>
                </TableCell>
                <TableCell>
                  <div class="flex justify-end">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      class="text-destructive"
                      @click="removePassword(idx)"
                    >
                      <Trash2 class="size-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
              <TableRow v-if="archivePasswords.length === 0">
                <TableCell :colspan="2" class="text-muted-foreground py-4 text-center text-xs">
                  No passwords
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>

          <div class="flex items-end gap-2">
            <div class="flex flex-col gap-1.5">
              <Label for="new-archive-password" class="text-xs">Password</Label>
              <Input
                id="new-archive-password"
                v-model="newPassword"
                type="password"
                class="h-8 w-[300px] text-[13px]"
                @keyup.enter="addPassword"
              />
            </div>
            <Button variant="secondary" size="sm" @click="addPassword">Add</Button>
          </div>
        </CardContent>
      </Card>

      <Card class="gap-0 py-0">
        <CardHeader class="px-4 py-3">
          <CardTitle class="text-sm font-semibold">Extraction Tools</CardTitle>
          <CardDescription class="text-xs">
            Auto-detected paths. Override manually if needed.
          </CardDescription>
        </CardHeader>
        <Separator />
        <CardContent class="flex flex-col gap-3 px-4 py-3">
          <div class="flex items-center gap-2">
            <div class="w-[100px] shrink-0 text-sm">UnRAR.exe</div>
            <Input v-model="extractTools.unrar" class="h-8 flex-1 text-[13px]" />
            <CheckCircle2 v-if="extractTools.unrar" class="size-4 shrink-0 text-success" />
            <XCircle v-else class="size-4 shrink-0 text-destructive" />
          </div>
          <div class="flex items-center gap-2">
            <div class="w-[100px] shrink-0 text-sm">7z.exe</div>
            <Input v-model="extractTools.sevenzip" class="h-8 flex-1 text-[13px]" />
            <CheckCircle2 v-if="extractTools.sevenzip" class="size-4 shrink-0 text-success" />
            <XCircle v-else class="size-4 shrink-0 text-destructive" />
          </div>
          <div class="flex items-center gap-2">
            <div class="w-[100px] shrink-0 text-sm">7z-zstd</div>
            <Input v-model="extractTools.sevenzipZstd" class="h-8 flex-1 text-[13px]" />
            <CheckCircle2 v-if="extractTools.sevenzipZstd" class="size-4 shrink-0 text-success" />
            <XCircle v-else class="size-4 shrink-0 text-destructive" />
          </div>

          <div class="flex gap-2">
            <Button size="sm" @click="saveExtractTools">Save Tools</Button>
            <Button variant="ghost" size="sm" :disabled="redetectingTools" @click="redetectTools">
              <Loader2 v-if="redetectingTools" class="size-4 animate-spin" />
              Re-detect
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card class="gap-0 py-0">
        <CardHeader class="px-4 py-3">
          <CardTitle class="text-sm font-semibold">Archived Archives</CardTitle>
          <CardDescription class="text-xs">
            Archives that have been extracted. Excluded from scans. Copy path to manually delete the
            archive file.
          </CardDescription>
        </CardHeader>
        <Separator />
        <CardContent class="flex flex-col gap-3 px-4 py-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead class="h-8 text-xs">Archive Path</TableHead>
                <TableHead class="h-8 w-[120px] text-right text-xs">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="(item, idx) in archivedArchives" :key="idx">
                <TableCell>
                  <div class="max-w-[500px] truncate">{{ item }}</div>
                </TableCell>
                <TableCell>
                  <div class="flex items-center justify-end gap-1">
                    <Tooltip>
                      <TooltipTrigger as-child>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          class="text-primary"
                          @click="copyPath(item)"
                        >
                          <Copy class="size-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Copy Path</TooltipContent>
                    </Tooltip>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      class="text-destructive"
                      @click="removeArchivedArchive(idx)"
                    >
                      <Trash2 class="size-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
              <TableRow v-if="archivedArchives.length === 0">
                <TableCell :colspan="2" class="text-muted-foreground py-4 text-center text-xs">
                  No archived archives
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card class="gap-0 py-0">
        <CardHeader class="px-4 py-3">
          <CardTitle class="text-sm font-semibold">Backup</CardTitle>
          <CardDescription class="text-xs">
            Packs the database and the covers directory into a single rar archive (store mode) in
            the backup directory.
          </CardDescription>
        </CardHeader>
        <Separator />
        <CardContent class="flex flex-col gap-3 px-4 py-3">
          <div class="flex flex-col gap-1.5">
            <Label for="backup-dir" class="text-xs">Backup Directory</Label>
            <div class="relative">
              <Input id="backup-dir" v-model="backupDir" class="h-8 pr-8 text-[13px]" />
              <Button
                v-if="hasElectronAPI"
                variant="ghost"
                size="icon-xs"
                class="text-muted-foreground absolute top-1/2 right-1 -translate-y-1/2"
                @click="browseBackupDirectory"
              >
                <FolderOpen class="size-3.5" />
              </Button>
            </div>
          </div>

          <div class="flex flex-wrap items-end gap-3">
            <div class="flex flex-col gap-1.5">
              <Label class="text-xs">Auto Backup</Label>
              <Select v-model="backupSchedule">
                <SelectTrigger class="h-8 w-[160px] text-[13px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    v-for="opt in backupScheduleOptions"
                    :key="opt.value"
                    :value="opt.value"
                  >
                    {{ opt.label }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="flex flex-col gap-1.5">
              <Label for="backup-keep" class="text-xs">Keep Backups</Label>
              <Input
                id="backup-keep"
                :model-value="backupKeep"
                type="number"
                class="h-8 w-[130px] text-[13px]"
                @update:model-value="backupKeep = toNumber($event)"
              />
            </div>
          </div>

          <div class="text-muted-foreground text-xs">
            Checked at startup and then hourly. Daily backs up every 24 hours, weekly every 7 days;
            a manual backup resets the interval. Oldest backups beyond "Keep Backups" are deleted.
          </div>
          <div v-if="backupLastRun" class="text-muted-foreground text-xs">
            Last backup: {{ new Date(backupLastRun).toLocaleString() }}
          </div>

          <div class="flex gap-2">
            <Button variant="outline" size="sm" @click="saveBackupSettings">Save</Button>
            <Button size="sm" :disabled="backupStarting" @click="startBackup">
              <Loader2 v-if="backupStarting" class="size-4 animate-spin" />
              <DatabaseBackup v-else class="size-4" />
              Backup Now
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card v-if="hasElectronAPI" class="gap-0 py-0">
        <CardHeader class="px-4 py-3">
          <CardTitle class="text-sm font-semibold">Application</CardTitle>
        </CardHeader>
        <Separator />
        <CardContent class="flex flex-col gap-4 px-4 py-3">
          <div class="flex flex-col gap-1.5">
            <div class="flex items-center gap-2">
              <Switch
                id="close-to-tray"
                v-model="closeToTray"
                @update:model-value="saveCloseToTray"
              />
              <Label for="close-to-tray" class="text-xs">Close to tray</Label>
            </div>
            <div class="text-muted-foreground ml-10 text-xs">
              When closing the window, minimize to tray instead of quitting. The server keeps
              running in the background.
            </div>
          </div>
          <div class="flex flex-col gap-1.5">
            <div class="flex items-center gap-2">
              <Switch id="auto-start" v-model="autoStart" @update:model-value="saveAutoStart" />
              <Label for="auto-start" class="text-xs">Launch at startup</Label>
            </div>
            <div class="text-muted-foreground ml-10 text-xs">
              Automatically start Game Lib when the system boots. Starts minimized to tray.
            </div>
          </div>
        </CardContent>
      </Card>
    </div>

    <Dialog :open="showAddDialog" @update:open="showAddDialog = $event">
      <DialogContent class="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle class="text-base font-semibold">Add Library</DialogTitle>
          <DialogDescription class="sr-only">Register a game library folder.</DialogDescription>
        </DialogHeader>
        <div class="flex flex-col gap-3">
          <div class="flex flex-col gap-1.5">
            <Label for="new-lib-name" class="text-xs">Library Name</Label>
            <Input id="new-lib-name" v-model="newLibName" class="h-8 text-[13px]" />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label for="new-lib-path" class="text-xs">Library Path</Label>
            <div class="relative">
              <Input id="new-lib-path" v-model="newLibPath" class="h-8 pr-8 text-[13px]" />
              <Button
                v-if="hasElectronAPI"
                variant="ghost"
                size="icon-xs"
                class="text-muted-foreground absolute top-1/2 right-1 -translate-y-1/2"
                @click="browseDirectory('add')"
              >
                <FolderOpen class="size-3.5" />
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" @click="showAddDialog = false">Cancel</Button>
          <Button size="sm" @click="addLibrary">Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog :open="showEditDialog" @update:open="showEditDialog = $event">
      <DialogContent class="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle class="text-base font-semibold">Edit Library</DialogTitle>
          <DialogDescription class="sr-only">
            Change the name or folder of a library.
          </DialogDescription>
        </DialogHeader>
        <div class="flex flex-col gap-3">
          <div class="flex flex-col gap-1.5">
            <Label for="edit-lib-name" class="text-xs">Library Name</Label>
            <Input id="edit-lib-name" v-model="editLibName" class="h-8 text-[13px]" />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label for="edit-lib-path" class="text-xs">Library Path</Label>
            <div class="relative">
              <Input id="edit-lib-path" v-model="editLibPath" class="h-8 pr-8 text-[13px]" />
              <Button
                v-if="hasElectronAPI"
                variant="ghost"
                size="icon-xs"
                class="text-muted-foreground absolute top-1/2 right-1 -translate-y-1/2"
                @click="browseDirectory('edit')"
              >
                <FolderOpen class="size-3.5" />
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" @click="showEditDialog = false">Cancel</Button>
          <Button size="sm" @click="saveEditLibrary">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Copy,
  DatabaseBackup,
  Eye,
  EyeOff,
  FolderOpen,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  TriangleAlert,
  XCircle,
} from '@lucide/vue';
import { toast } from 'vue-sonner';
import {
  SOURCE_TYPES,
  DEFAULT_MATCH_PRIORITY,
  DEFAULT_MATCH_THRESHOLD,
} from '../../server/scraper/match.js';
import api from '../composables/useApi';
import { useTaskStore } from '../stores/taskStore';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

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
    toast.error('Could not check the network exit');
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

// The shadcn Input has no `v-model.number` modifier handling, so numeric fields coerce
// where the value enters the ref. An empty field becomes 0, which every save path below
// already clamps back to its own default.
const toNumber = (value: string | number) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

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
    toast.error(
      nested.conflict === 'child'
        ? `Path is a subdirectory of library "${nested.lib.name}"`
        : `Path contains existing library "${nested.lib.name}"`,
    );
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
    toast.error(
      nested.conflict === 'child'
        ? `Path is a subdirectory of library "${nested.lib.name}"`
        : `Path contains existing library "${nested.lib.name}"`,
    );
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
  toast.success('Match settings saved');
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
    toast.info('Launch at startup is only available in the installed build.');
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
  toast.success('Tools saved');
};

// Detection talks to the filesystem (which can be slow on a cold cache), so the button
// reports that it is working instead of looking dead.
const redetectingTools = ref(false);

const redetectTools = async () => {
  redetectingTools.value = true;
  try {
    const res = await api.get('/settings/detect-tools');
    extractTools.value = {
      unrar: res.data.unrar || '',
      sevenzip: res.data.sevenzip || '',
      sevenzipZstd: res.data.sevenzipZstd || '',
    };
    await api.put('/settings/extract-tools/save', { tools: extractTools.value });
    toast.success('Tools re-detected');
  } catch {
    toast.error('Detection failed');
  } finally {
    redetectingTools.value = false;
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
    toast.success('Path copied');
  } catch {
    /* clipboard may not be available */
  }
};

const removeArchivedArchive = async (idx: number) => {
  await api.delete(`/settings/archived-archives/remove/${idx}`);
  await fetchArchivedArchives();
};

const taskStore = useTaskStore();

const backupDir = ref('');
const backupSchedule = ref('off');
const backupKeep = ref(10);
const backupLastRun = ref('');
const backupStarting = ref(false);

const backupScheduleOptions = [
  { label: 'Off', value: 'off' },
  { label: 'Daily', value: 'daily' },
  { label: 'Weekly', value: 'weekly' },
];

const fetchBackupSettings = async () => {
  const get = async (key: string): Promise<string | null> => {
    try {
      const res = await api.get(`/settings/${key}`);
      return res.data.value ?? null;
    } catch {
      return null;
    }
  };
  backupDir.value = (await get('backup_dir')) ?? '';
  backupSchedule.value = (await get('backup_schedule')) ?? 'off';
  const keep = Number.parseInt((await get('backup_keep')) ?? '', 10);
  backupKeep.value = Number.isNaN(keep) ? 10 : keep;
  backupLastRun.value = (await get('backup_last_run')) ?? '';
};

const persistBackupSettings = async () => {
  // Clamp here so a stray value on screen cannot end up as 0 (= delete everything but one) or
  // garbage the scheduler would have to second-guess.
  const keep = Math.max(1, Math.floor(Number(backupKeep.value) || 10));
  backupKeep.value = keep;
  await api.put('/settings/backup_dir', { value: backupDir.value });
  await api.put('/settings/backup_schedule', { value: backupSchedule.value });
  await api.put('/settings/backup_keep', { value: String(keep) });
};

const saveBackupSettings = async () => {
  try {
    await persistBackupSettings();
    toast.success('Backup settings saved');
  } catch {
    toast.error('Could not save backup settings');
  }
};

const browseBackupDirectory = async () => {
  if (!window.electronAPI) return;
  const dir = await window.electronAPI.openDirectory('Select Backup Directory');
  if (dir) backupDir.value = dir;
};

const startBackup = async () => {
  if (backupStarting.value) return;
  backupStarting.value = true;
  try {
    // Persist first: "Backup Now" should use exactly what is on screen, saved or not.
    await persistBackupSettings();
    await api.post('/backup/run');
    toast.success('Backup started');
  } catch (err) {
    const resp = (err as { response?: { status?: number; data?: { error?: string } } })?.response;
    if (resp?.status === 409) {
      // Not a failure - the click just found the running backup. Blue info, not red/warning,
      // so it cannot be mistaken for a backup that went wrong.
      toast.info(resp?.data?.error || 'A backup is already running');
    } else {
      toast.error(resp?.data?.error || 'Could not start the backup');
    }
  } finally {
    backupStarting.value = false;
  }
};

// "Last backup" is written by the server after every attempt, so refresh it whenever a backup
// task settles (manual or scheduled) instead of leaving a stale timestamp on screen.
watch(
  () => {
    for (const t of taskStore.tasks.values()) {
      if (t.type === 'backup' && (t.status === 'completed' || t.status === 'failed')) {
        return t.completedAt;
      }
    }
    return null;
  },
  (settledAt) => {
    if (settledAt) void fetchBackupSettings();
  },
);

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
  void fetchBackupSettings();
});
</script>
