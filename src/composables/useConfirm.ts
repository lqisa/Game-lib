import { reactive } from 'vue';

/**
 * Imperative confirm dialog - the replacement for Quasar's $q.dialog.
 *
 * A single <ConfirmDialog /> is mounted once in App.vue; every call site just
 * awaits `confirm({...})`. Promise-based because that is how the call sites
 * read best (`if (!(await confirm(...))) return;`).
 */
export interface ConfirmOptions {
  title: string;
  message?: string;
  okLabel?: string;
  cancelLabel?: string;
  /** Style the confirm action as destructive. */
  destructive?: boolean;
  /** Hide the cancel button entirely (pure acknowledgement). */
  noCancel?: boolean;
}

interface ConfirmState extends ConfirmOptions {
  open: boolean;
  resolve: ((ok: boolean) => void) | null;
}

export const confirmState = reactive<ConfirmState>({
  open: false,
  title: '',
  resolve: null,
});

export function confirm(options: ConfirmOptions): Promise<boolean> {
  // Resolve any previous pending dialog as cancelled - it can no longer be answered.
  confirmState.resolve?.(false);
  Object.assign(confirmState, options, { open: true });
  return new Promise<boolean>((resolve) => {
    confirmState.resolve = resolve;
  });
}

export function answerConfirm(ok: boolean) {
  confirmState.open = false;
  const resolve = confirmState.resolve;
  confirmState.resolve = null;
  resolve?.(ok);
}
