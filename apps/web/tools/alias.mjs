// Teach `node --experimental-strip-types` the "@/…" alias the app uses.
//
// Vite and tsc both read it from tsconfig; Node does not, and Node's own
// subpath imports only accept specifiers beginning with "#". Fifteen lines
// here is what lets the self-checks import the real modules instead of a copy
// of them that can drift.
//
// Usage:  node --experimental-strip-types --import ./tools/alias.mjs <file>
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./alias-hooks.mjs", pathToFileURL("./tools/"));

/* A tiny in-memory localStorage.
   app/state.ts reads it at module load, so the self-checks cannot import any
   app module without one. Node has a localStorage global but only when started
   with --localstorage-file, and the checks should not need a file on disk to
   answer a question about arithmetic. */
const mem = new Map();
const shim = {
  getItem: (k) => (mem.has(String(k)) ? mem.get(String(k)) : null),
  setItem: (k, v) => void mem.set(String(k), String(v)),
  removeItem: (k) => void mem.delete(String(k)),
  clear: () => mem.clear(),
  key: (i) => [...mem.keys()][i] ?? null,
  get length() {
    return mem.size;
  },
};
try {
  Object.defineProperty(globalThis, "localStorage", { value: shim, configurable: true, writable: true });
} catch {
  globalThis.localStorage = shim;
}
