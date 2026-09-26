/**
 * Add types (that are not auto-magically added by Quasar CLI already)
 * for your custom variables to avoid TypeScript errors, like dynamic
 * process.env variables or definitions in dotenv files configured ONLY
 * for the /quasar.config file itself.
 *
 * https://quasar.dev/quasar-cli-vite/handling-import-meta-env#type-inference
 *
 * @example
 * interface ImportMetaEnv {
 *   readonly MY_VAR: string;
 *   readonly MY_OTHER_VAR: string;
 * }
 */
// Declared empty on purpose: this is the augmentation target for Vite/Quasar's env vars,
// so it is meant to be merged into rather than to carry members itself.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface ImportMetaEnv {}
