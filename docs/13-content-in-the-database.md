# 13 · Content in the database, and how the app stays usable offline

The calendar moved out of the bundle first (docs/11, docs/12). Places, hotels,
start points, e-rickshaw and the home hero follow it, through the *same*
mechanism rather than a second one.

> The store was Cloudflare D1 until 11 August 2026 and is now Neon Postgres.
> Nothing in this document's *design* changed with it — one `content` table,
> whole JSON documents, a revision served as an ETag — because all of it lived
> behind `Store` in `src/store.ts`. What changed is the file underneath
> (`store.neon.ts`) and how migrations run. See
> [tasks/2026-08-11](tasks/2026-08-11.md).

---

## The rule that governs all of this

**The network is an optimisation, never a dependency.**

The app ships a complete copy of its data and always will. That bundled copy is
what renders on a dead signal in a village outside Pehowa, and it is the floor
below which the app cannot fall. The database exists so the Board can *change*
that data without a release — not so the app has somewhere to fetch it from.

Concretely, `apps/web/src/content/live.ts` applies three sources in order:

1. **bundled** — compiled in, always there, drawn first.
2. **IndexedDB** — the last copy fetched, applied at boot before any network.
3. **network** — asked afterwards, in the background, and allowed to fail.

A failed fetch is not an error state. Nothing waits on step 3 and nothing
reports it.

---

## One table for three kinds

```sql
content(kind, id, doc, updated_at)   PRIMARY KEY (kind, id)
```

`doc` is the item as JSON, byte-for-byte what the bundled file holds. Not a
column per field, for three reasons:

1. **Nothing queries across these fields.** The app fetches the whole array and
   filters in JS. The Worker never asks "which hotels are under 2000 rupees".
   Columns would buy `WHERE` clauses nobody writes.
2. **A destination has 26 fields**, half of them bilingual objects or arrays.
   Flattening that means a migration every time the shape moves, and it is
   still moving.
3. **The app is the schema.** Import is a copy, so the endpoint and the bundled
   fallback cannot drift apart.

`events` stays columnar and separate, because the cron genuinely queries it by
date and time window — the one place a `WHERE` clause earns itself.

`kind` is checked against a closed list (`CONTENT_KINDS` in `store.ts`) before
it reaches SQL. `/content/<anything>.json` is public and must not become a way
to ask what else is in the database.

---

## Conditional GET, and why it is not a micro-optimisation

The calendar is 5 KB. The places feed is **147 KB**. Without revalidation every
app launch re-downloads the entire catalogue to discover nothing changed — on
rural mobile data, for a district app.

`rev` is already an exact content revision (`MAX(updated_at)-COUNT(*)`), so it
makes an honest `ETag` and the browser does the rest. Measured against the
local Worker:

| request | status | bytes |
|---|---|---|
| cold | 200 | 146,916 |
| `If-None-Match` current | **304** | **0** |
| `If-None-Match` stale | 200 | 146,916 |

The etag is namespaced by kind (`"places-…"`), verified so that a places etag
cannot 304 the events feed.

`rev` counts rows as well as taking the max timestamp, because the timestamp
alone does not move when the only change was a deletion — and a stale
catalogue that will not refresh is the worst failure this layer can have.

---

## A place that arrives live but is not in the distance matrix

`matrix.json` is a fixed 42×42 of real road distances measured by OSRM at
authoring time. A place added through the dashboard is not in it.

This already degrades correctly and needed no new code:
`CachedProvider.idx()` returns `-1` for an id it does not know, `pair()`
returns `null`, and the leg falls through to `EstimateProvider` — the same path
a hotel, a dropped pin or a GPS fix already takes. The travel time is estimated
rather than measured.

So a new place **plans**, it just plans approximately. Run
`npm run build-matrix` when it matters enough to be exact.

---

## The floor guard

`data/destinations.ts` refuses a live feed with fewer than half the bundled
number of places. `live.ts` already refuses an empty list — "no places" and
"the request went wrong" look identical from the client — and this extends the
same reasoning to a half-finished import. Silently shrinking the catalogue is
worse than ignoring an update.

<!-- ponytail: a fraction of the bundled count, not a real integrity check.
     If partial feeds ever become legitimate, this becomes a server-sent
     expected-count instead. -->

---

## Loading it

```bash
cd apps/api
npm run migrate            # applies every migration in db/migrations, in order
npm run import             # bundled JSON into the content table
npm run import -- hero     # or just one kind
```

`import-content.mjs` writes to Postgres directly, with parameters. It used to
emit SQL for `wrangler d1 execute --file` and hand-escape every quote to do it;
sending parameters over the wire removed the escaping, which was one apostrophe
in a blurb away from a syntax error in the middle of a bulk import.

**There is one database now, not a local one and a remote one.** Under D1 the
default was a copy on your laptop and reaching production took an extra flag.
That safety net is gone: `npm run dev` and `npm run import` both point at the
real rows. Use a Neon branch if you want somewhere to practise.

Re-running is safe: every statement is an upsert on `(kind, id)`. It
deliberately **does not** delete rows missing from the JSON. A script that can
empty the live catalogue because someone mistyped a filename is a worse failure
than a stale row; deletions go through the dashboard, where they are audited.

Migrations are applied by `db/migrate.mjs`, which records what has run in a
`_migrations` table and runs each file **inside a transaction**. That last part
is the one thing D1 could not do: a migration that failed halfway used to leave
a half-built table to be repaired by hand.

---

## Verified

Against a local Worker on the real schema, 4 Aug 2026:

| | |
|---|---|
| `GET /content/places.json` | 200 · 36 items · correct rev |
| `GET /content/{events,hotels,erickshaw}.json` | 200 |
| `GET /content/nope.json` | 404 — closed kind list holds |
| `GET /admin/content/places` no identity | 403 |
| `GET /admin/content/wombats` | 404 |
| `PUT` without an id | 400 |
| `PUT` a place | rev moved, feed went 36 → 37, audit row written |
| `DELETE` it | feed back to 36 |
