import en from "@/content/i18n/en.json";
import hi from "@/content/i18n/hi.json";
import destinations from "@/content/data/destinations.json";
import themes from "@/content/data/themes.json";
import reels from "@/content/data/reels.json";
import hero from "@/content/data/hero.json";
import places from "@/content/data/places-index.json";

// Content integrity: every {en,hi} pair is fully translated, and the two UI
// dictionaries have the same keys. Returns a list of problems (empty = OK).
// See docs/04. Runs as a dev self-check (main.tsx) and via scripts/check-content.mjs.

function walkLoc(node: unknown, path: string, out: string[]) {
  if (Array.isArray(node)) {
    node.forEach((v, i) => walkLoc(v, `${path}[${i}]`, out));
    return;
  }
  if (node && typeof node === "object") {
    const o = node as Record<string, unknown>;
    if (typeof o.en === "string" || typeof o.hi === "string") {
      if (!String(o.en ?? "").trim()) out.push(`missing en at ${path}`);
      if (!String(o.hi ?? "").trim()) out.push(`missing hi at ${path}`);
    }
    for (const k of Object.keys(o)) walkLoc(o[k], `${path}.${k}`, out);
  }
}

export function validateContent(): string[] {
  const out: string[] = [];

  // UI dictionaries: key parity
  const ek = Object.keys(en),
    hk = Object.keys(hi);
  const hset = new Set(hk),
    eset = new Set(ek);
  ek.filter((k) => !hset.has(k)).forEach((k) => out.push(`i18n: hi missing key "${k}"`));
  hk.filter((k) => !eset.has(k)).forEach((k) => out.push(`i18n: en missing key "${k}"`));
  ek.filter((k) => hset.has(k) && !String((hi as Record<string, string>)[k] ?? "").trim())
    .forEach((k) => out.push(`i18n: empty hi for "${k}"`));

  // Domain content: every {en,hi} fully translated
  walkLoc(destinations, "destinations", out);
  walkLoc(themes, "themes", out);
  walkLoc(reels, "reels", out);
  walkLoc(hero, "hero", out);
  walkLoc(places, "places", out);

  return out;
}
