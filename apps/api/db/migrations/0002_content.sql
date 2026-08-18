-- Everything else the Board maintains: places, start points, hotels,
-- e-rickshaw stands, and the home screen's hero carousel.
--
-- One table, discriminated by `kind`, with the item stored as the JSON the app
-- already consumes. Three reasons it is not a table per kind with real columns:
--
--   1. Nothing queries across these fields. The app fetches the whole array for
--      a kind and filters in JS; the Worker never asks "which hotels are under
--      2000 rupees". Columns would buy WHERE clauses nobody writes.
--   2. A destination has 26 fields, half of them bilingual objects or arrays
--      ({en,hi} names, galleries, opening hours, facilities). Flattening that
--      into columns means a migration every time the shape gains a field, and
--      the shape is still moving.
--   3. The app is the schema. `doc` is byte-for-byte what destinations.json
--      holds, so import is a copy and the bundled fallback cannot drift from
--      what the endpoint serves.
--
-- Point 3 is also why `doc` is text and not jsonb — see 0001.
--
-- The events table stays separate and columnar: the cron genuinely queries it
-- by date and time-window, which is the one place a WHERE clause earns itself.
CREATE TABLE IF NOT EXISTS content (
  kind       text NOT NULL,        -- 'places' | 'startpoints' | 'hotels' | 'erickshaw' | 'hero'
  id         text NOT NULL,        -- the item's own id, unique within its kind
  doc        text NOT NULL,        -- the item as JSON, exactly as the app reads it
  updated_at bigint NOT NULL,
  PRIMARY KEY (kind, id)
);

-- serving a feed is "every row of one kind, newest change first"
CREATE INDEX IF NOT EXISTS content_kind ON content (kind, updated_at);
