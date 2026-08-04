# 04 · Content & i18n

Goal: **content is data, not code**, and **every string carries its
translation with its key** — so adding content forces you to add its
translations, and translators can work without touching `.tsx`.

## Where things live

```
apps/web/src/content/
├── i18n/
│   ├── en.json        UI microcopy, keyed  { "home": "Home", … }
│   └── hi.json        same keys, Hindi      { "home": "होम", … }
└── data/
    ├── destinations.json   the 36 tirthas   (each text field = { en, hi })
    ├── themes.json         interest groups
    ├── hero.json           home carousel facts
    ├── reels.json          visitor reels
    └── places-index.json   stations / bus stands / stays (start-end picker)
```

`apps/web/src/data/*.ts` are thin **typed loaders** that `import` these JSON files and
re-export them as typed objects, so the rest of the app is unchanged
(`import { D } from "@/data/destinations"` still works). `resolveJsonModule` is
on, and Vite bundles JSON natively.

## Two kinds of strings

1. **UI microcopy** (`i18n/en.json` + `hi.json`) — looked up by key with
   `t("key")`. The key is shared across both files; a missing key falls back to
   English then to the key itself.
2. **Content strings** (inside `data/*.json`) — stored **inline as
   `{ en, hi }`** on each field (name, short, why, …). The "key" is the entry's
   `id`; the translation travels *with* the content, so you can't add a place
   without its Hindi.

*Why inline `{en,hi}` for content and keyed dicts for UI:* content translations
are authored together with the content (one PR adds a place + both languages);
UI strings are reused in many places and are better keyed and deduplicated.

## Adding content — the rule

- Add an object to the relevant `data/*.json` with **both `en` and `hi`** on
  every `{ en, hi }` field.
- Add any new **UI** strings to **both** `i18n/en.json` and `i18n/hi.json`.

## Enforcement (so nothing ships half-translated)

`apps/web/src/content/validate.ts` exports `validateContent()`:
- every `{en,hi}` in `data/*.json` has non-empty `en` **and** `hi`;
- every key in `en.json` exists in `hi.json` and vice-versa.

It runs as a dev self-check (logged on load in `import.meta.env.DEV`) and via
`npm run check-content` in CI/precommit. A missing translation fails
loudly instead of silently rendering English.

## Language switching

`S.lang` (`"en" | "hi"`) is the current language, persisted in `localStorage`.
`t(key)` and `nm({en,hi})` (in `shared/i18n/i18n.ts`) read it; `setLangStay` /
`flipLang` change it and `bump()` re-renders. `document.documentElement.lang` is
kept in sync for correct font shaping.
