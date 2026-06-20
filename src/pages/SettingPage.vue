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
                <q-btn flat round color="negative" icon="delete" @click="deleteLibrary(lib.id)" />
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
          <div class="text-subtitle1">DLSite Token</div>
        </q-card-section>
        <q-card-section>
          <q-input v-model="token" label="Token" type="password" outlined />
        </q-card-section>
        <q-card-section>
          <q-btn color="primary" label="Save Token" @click="saveToken" />
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
          <q-input v-model="newLibPath" label="Library Path" outlined />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" v-close-popup />
          <q-btn color="primary" label="Add" @click="addLibrary" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import api from '../composables/useApi'

interface Library {
  id: number
  name: string
  path: string
}

const libraries = ref<Library[]>([])
const token = ref('')
const showAddDialog = ref(false)
const newLibName = ref('')
const newLibPath = ref('')

const fetchLibraries = async () => {
  const res = await api.get('/libraries')
  libraries.value = res.data
}

const fetchToken = async () => {
  try {
    const res = await api.get('/settings/dlsite_token')
    token.value = res.data.value
  } catch {
    token.value = ''
  }
}

const addLibrary = async () => {
  if (!newLibName.value || !newLibPath.value) return
  await api.post('/libraries', { name: newLibName.value, path: newLibPath.value })
  newLibName.value = ''
  newLibPath.value = ''
  showAddDialog.value = false
  await fetchLibraries()
}

const deleteLibrary = async (id: number) => {
  await api.delete(`/libraries/${id}`)
  await fetchLibraries()
}

const saveToken = async () => {
  await api.put('/settings/dlsite_token', { value: token.value })
}

onMounted(() => {
  fetchLibraries()
  fetchToken()
})
</script>