/// <reference types="vite/client" />

/**
 * Where the Worker serves updatable content. Unset in a plain offline build,
 * in which case Vite inlines `undefined` here and the whole network path in
 * content/live.ts is dead code.
 */
interface ImportMetaEnv {
  readonly VITE_CONTENT_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
