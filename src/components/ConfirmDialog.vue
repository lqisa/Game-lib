<template>
  <AlertDialog :open="confirmState.open" @update:open="onOpenChange">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ confirmState.title }}</AlertDialogTitle>
        <AlertDialogDescription v-if="confirmState.message">
          {{ confirmState.message }}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel v-if="!confirmState.noCancel" @click="answerConfirm(false)">
          {{ confirmState.cancelLabel || 'Cancel' }}
        </AlertDialogCancel>
        <AlertDialogAction
          :class="
            confirmState.destructive
              ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
              : ''
          "
          @click="answerConfirm(true)"
        >
          {{ confirmState.okLabel || 'OK' }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>

<script setup lang="ts">
import { nextTick } from 'vue';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { answerConfirm, confirmState } from '@/composables/useConfirm';

// Both reka buttons close the dialog through an internal handler that runs
// *before* our own @click handler (the internal one sits ahead in the merged
// listener array), so resolving here directly would always pre-empt the button's
// answer - every OK came out as "cancelled". Defer a tick instead: the button
// handlers have run by then, and this only fires for a close that nobody
// answered, so a caller's promise can never hang.
//
// (Reka's AlertDialog does not close on outside click / ESC; a dismissal can
// practically only arrive through the buttons.)
const onOpenChange = (open: boolean) => {
  if (open) return;
  void nextTick(() => {
    if (confirmState.resolve) answerConfirm(false);
  });
};
</script>
