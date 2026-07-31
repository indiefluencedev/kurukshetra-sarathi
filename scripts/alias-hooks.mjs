// Make Node resolve modules the way Vite does, so the self-checks can import
// the real app code instead of a copy of it that can drift. Three differences,
// all of them bundler conventions Node deliberately does not implement:
//
//   "@/x"           → <repo>/src/x        (tsconfig paths)
//   "./routing"     → ./routing/index.ts  (directory index)
//   "./graph"       → ./graph.ts          (extensionless)
//   *.json          → needs `type: json`  (Vite adds it implicitly)
//
// See alias.mjs.
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { existsSync, statSync } from "node:fs";

const SRC = join(dirname(dirname(fileURLToPath(import.meta.url))), "src");

/** Try the bundler's candidates for a path that Node would reject outright. */
function widen(path) {
  if (existsSync(path) && !statSync(path).isDirectory()) return path;
  for (const c of [path + ".ts", path + ".tsx", join(path, "index.ts"), join(path, "index.tsx")]) {
    if (existsSync(c)) return c;
  }
  return path;
}

export async function resolve(specifier, context, next) {
  let spec = specifier;
  if (spec.startsWith("@/")) spec = pathToFileURL(widen(join(SRC, spec.slice(2)))).href;
  else if (spec.startsWith(".") && context.parentURL?.startsWith("file:")) {
    const abs = join(dirname(fileURLToPath(context.parentURL)), spec);
    spec = pathToFileURL(widen(abs)).href;
  }
  const r = await next(spec, context);
  if (r.url.endsWith(".json")) return { ...r, format: "json", importAttributes: { type: "json" } };
  return r;
}
