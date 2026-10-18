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

// Reka's AlertDialog does not close on outside click / ESC, so a dismissal can
// only arrive through the buttons; a report of open=false is still handled to
// never leave a caller's promise hanging.
const onOpenChange = (open: boolean) => {
  if (!open) answerConfirm(false);
};
</script>
