-- A revision counter per feed, so "has anything changed?" stops costing a scan.
--
-- The revision served as an ETag was `MAX(updated_at)-COUNT(*)` over the rows
-- of a kind. Measured against production, on 58 places:
--
--   SELECT MAX(updated_at) ... WHERE kind='places'    1 row read
--   SELECT COUNT(*)        ... WHERE kind='places'   58 rows read
--
-- MAX is free — `content_kind (kind, updated_at)` answers it with a single
-- index seek. The COUNT is the whole cost, and it exists for exactly one
-- reason: a deletion leaves MAX(updated_at) unchanged or moves it BACKWARDS,
-- so the timestamp alone cannot notice one. Counting rows noticed it, at the
-- price of reading every row on every revalidation — a request whose entire
-- purpose is to answer "no".
--
-- This table replaces the count with a number that only ever goes up, bumped
-- by the Worker on every write. `MAX(updated_at)-n` is then a 2-row read.
--
-- Why keep MAX at all, when `n` alone would be a valid revision? Because `n`
-- is only bumped by code that goes through store.neon.ts, and this database is
-- also written to by the import script and by hand. Those set `updated_at`, so
-- MAX still moves and clients still refresh. The one case neither half covers
-- is a row DELETED out of band — if you ever do that, bump the counter
-- yourself:
--
--   INSERT INTO rev (scope, n) VALUES ('places', 1)
--     ON CONFLICT (scope) DO UPDATE SET n = rev.n + 1;
--
-- `scope` is a content kind ('places', 'startpoints', …) or 'events'.
--
-- `n` is a plain integer, not bigint: it counts admin edits, and int4 runs to
-- two billion of them. Keeping it int4 means it arrives as a JS number rather
-- than a string, which is one fewer place to remember a cast.
CREATE TABLE IF NOT EXISTS rev (
  scope text PRIMARY KEY,
  n     integer NOT NULL DEFAULT 0
);

-- Start every existing feed at its current row count. Not strictly required —
-- a missing row reads as 0 — but it means the revision this migration produces
-- differs from the one served a minute earlier for the same data, which is
-- exactly right: every client refetches once, then settles.
--
-- The SQLite original needed a `WHERE true` here to stop the parser reading
-- the upsert's ON as a join's ON. Postgres has no such trouble, so it is gone.
INSERT INTO rev (scope, n)
  SELECT kind, COUNT(*) FROM content GROUP BY kind
  ON CONFLICT (scope) DO UPDATE SET n = excluded.n;

INSERT INTO rev (scope, n)
  SELECT 'events', COUNT(*) FROM events
  ON CONFLICT (scope) DO UPDATE SET n = excluded.n;
