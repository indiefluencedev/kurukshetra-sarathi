-- Kurukshetra Saarthi — content and push schema.
--
-- The variable-shaped parts of an event (places, bias, corridor) are JSON text
-- rather than child tables: they are always read and written as a whole event
-- and never queried across, so normalising would buy joins nobody performs and
-- cost a migration every time the shape gains a field.

CREATE TABLE IF NOT EXISTS events (
  id            TEXT PRIMARY KEY,
  kind          TEXT NOT NULL,
  name_en       TEXT NOT NULL,
  name_hi       TEXT NOT NULL,
  date_from     TEXT NOT NULL,          -- ISO yyyy-mm-dd, inclusive
  date_to       TEXT NOT NULL,          -- inclusive; same as from for one day
  places        TEXT NOT NULL DEFAULT '[]',
  visit_factor  REAL NOT NULL DEFAULT 1,
  travel_factor REAL NOT NULL DEFAULT 1,
  blurb_en      TEXT NOT NULL,
  blurb_hi      TEXT NOT NULL,
  notice_en     TEXT NOT NULL,
  notice_hi     TEXT NOT NULL,
  bias          TEXT,
  img           TEXT,
  win_from      TEXT,                   -- HH:MM; overlays only
  win_to        TEXT,
  corridor      TEXT,                   -- JSON [{lat,lng}]; overlays only
  advice        TEXT,                   -- 'join' | 'avoid'
  updated_at    INTEGER NOT NULL
);

-- the app asks "what changed" far more often than "what is on"
CREATE INDEX IF NOT EXISTS events_updated ON events (updated_at);
CREATE INDEX IF NOT EXISTS events_dates   ON events (date_from, date_to);

-- One row per browser that asked to be told. The endpoint URL is unique per
-- browser installation, so it is the natural key — no id of our own to keep
-- in step, and a re-subscribe overwrites rather than duplicates.
CREATE TABLE IF NOT EXISTS subs (
  endpoint   TEXT PRIMARY KEY,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  lang       TEXT NOT NULL DEFAULT 'en',
  created_at INTEGER NOT NULL
);

-- What has already been pushed. The cron runs every quarter hour and must be
-- able to run twice without telling anyone twice; this is what makes it
-- idempotent. Keyed by (event, day) because an annual event recurs.
CREATE TABLE IF NOT EXISTS sent (
  event_id TEXT NOT NULL,
  day      TEXT NOT NULL,
  at       INTEGER NOT NULL,
  PRIMARY KEY (event_id, day)
);

-- Who changed what. Management is several people sharing a login; the first
-- time a date changes and nobody remembers changing it, this is the only
-- question anyone will ask. `after` holds the whole row, so a bad edit is
-- recoverable by reading it back out.
CREATE TABLE IF NOT EXISTS audit (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  at        INTEGER NOT NULL,
  who       TEXT NOT NULL,
  action    TEXT NOT NULL,
  entity    TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  after     TEXT
);
CREATE INDEX IF NOT EXISTS audit_at ON audit (at DESC);
