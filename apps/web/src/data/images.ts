// Image registry — replaces the demo's inlined base64 IMG/HIMG maps.
// Photos now live as real files in src/assets/images/ and are bundled/hashed
// by Vite. Keyed by the same ids the data uses (d.img, gallery[], hero img).
const files = import.meta.glob("../assets/images/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

const byKey: Record<string, string> = {};
for (const path in files) {
  const key = path.split("/").pop()!.replace(/\.webp$/, "");
  byKey[key] = files[path];
}

/** URL for an image id, or undefined if none exists (caller shows a fallback). */
export const imgUrl = (id?: string): string | undefined =>
  id ? byKey[id] : undefined;

export const LOGO = byKey["logo"];
export const LOGO_SM = byKey["logo-sm"];
