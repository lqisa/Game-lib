# Compress Store Mode & Task Cancel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Switch relocate folder→archive compression to store mode, and enable cancel button for compress tasks in Task Panel.

**Architecture:** One backend parameter change (`-m0`), two frontend type/UI patches. No new files, no new routes, no schema changes.

**Tech Stack:** Node.js, Express, Vue 3 + Quasar + Pinia, WinRAR rar.exe

## Global Constraints

- Follow existing code style: no comments unless asked, single quotes in JS/TS
- Run `npm run typecheck && npm run lint:check` after each task
- No new dependencies

---

### Task 1: Backend — Store mode for compress

**Files:**

- Modify: `server/tasks.js`

**Interfaces:**

- Consumes: None new
- Produces: `tryCompress` now uses `-m0` flag

- [ ] **Step 1: Add `-m0` to rar args in `tryCompress`**

In `server/tasks.js`, locate `tryCompress` (around line 630). Change the args array:

```javascript
const args = ['a', '-r', '-ep1', '-idq', '-m0', destArchive, `${sourceDir}\\*`];
```

- [ ] **Step 2: Verify existing tests still pass**

Run: `npm test -- --test-name-pattern="Integration: Compress"`
Expected: All compress tests pass (if WinRAR is installed)

- [ ] **Step 3: Run lint and typecheck**

Run: `npm run typecheck && npm run lint:check`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add server/tasks.js
git commit -m "feat: use store mode (-m0) for folder-to-archive compression"
```

---

### Task 2: Frontend — Task Panel compress type support

**Files:**

- Modify: `src/stores/taskStore.ts`
- Modify: `src/components/TaskPanel.vue`

**Interfaces:**

- Consumes: `Task` interface from taskStore
- Produces: `Task.type` now includes `'compress'`; TaskPanel shows cancel button for compress tasks

- [ ] **Step 1: Add `'compress'` to Task type union**

In `src/stores/taskStore.ts`, update the type line:

```typescript
type: 'move' | 'extract' | 'compress' | 'similar-scan' | 'nsfw-scan' | 'backup';
```

- [ ] **Step 2: Add cancel button condition for compress**

In `src/components/TaskPanel.vue`, update the cancel button `v-if`:

```html
v-if="task.status === 'running' && (task.type === 'extract' || task.type === 'compress' || task.type
=== 'backup')"
```

- [ ] **Step 3: Add compress icon branch (optional but explicit)**

In the icon ternary, add an explicit branch before the current fallback:

```typescript
task.type === 'backup'
  ? 'settings_backup_restore'
  : task.type === 'compress'
    ? 'archive'
    : 'archive';
```

- [ ] **Step 4: Run typecheck and lint**

Run: `npm run typecheck && npm run lint:check`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/stores/taskStore.ts src/components/TaskPanel.vue
git commit -m "feat: add compress type to TaskPanel with cancel support"
```
