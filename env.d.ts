/// <reference types="vite/client" />

/**
 * Vite env typing. The frontend deliberately has no custom VITE_* variables:
 * every backend url is same-origin (src/composables/useExpressUrl.ts), so there
 * is nothing to configure per deployment. This interface exists as the
 * augmentation target for future use.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface ImportMetaEnv {}
