import { neon } from "@neondatabase/serverless";
import type { Store, EventRow, SubRow, AuditRow, ContentKind } from "./store";

/**
 * The Neon Postgres implementation — the ONLY file in the Worker that knows
 * any SQL.
 *
 * Replaces `store.d1.ts`, and the interface in `store.ts` is why that was a
 * day and not a fortnight: "every query lives behind this interface and D1
 * appears in exactly one file". It did. This is the second implementation that
 * comment promised.
 *
 * Events are stored as one row per event with the variable-shaped parts
 * (`places`, `bias`, `corridor`, `window`) as JSON text. That is a deliberate
 * choice over normalising them into child tables: they are always read and
 * written as a whole event, never queried across, and a district calendar is
 * tens of rows. Normalising would buy joins nobody performs and cost a
 * migration every time the shape gains a field. Text and not jsonb for a
 * reason recorded in db/migrations/0001.
 *
 * ── The driver ─────────────────────────────────────────────────────────────
 *
 * `neon()` is the HTTP driver: each query is one fetch to Neon's endpoint, no
 * socket to open, nothing to close, and no connection to leak when a Worker
 * isolate is discarded mid-request. That last part is why it is here rather
 * than a pooled client — a Worker has no lifecycle in which to hand a
 * connection back.
 *
 * The cost is that every query is a round trip, so the two-query methods below
 * issue theirs with `Promise.all` rather than one after the other. Nothing
 * here needs an interactive transaction; auth does, and holds its own pooled
 * connection for it (see auth.ts).
 *
 * ── One thing Postgres does that SQLite did not ────────────────────────────
 *
 * `bigint` comes back as a *string*, because it does not fit a JS number
 * safely in the general case. Epoch milliseconds do fit, so every read below
 * that touches one puts a `Number()` on it. Miss one and nothing throws — you
 * get `"1786425672458"` where a number was expected, and it compares wrong
 * rather than failing.
 */
export class NeonStore implements Store {
  private sql: ReturnType<typeof neon>;

  constructor(url: string) {
    if (!url) throw new Error("NEON_DB_URL is not set — the Worker has no database to talk to");
    this.sql = neon(url);
  }

  /** One query, positional parameters, rows out. Never string-interpolate SQL. */
  private q<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
    return this.sql.query(text, params) as Promise<T[]>;
  }

  private async one<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T | null> {
    const rows = await this.q<T>(text, params);
    return rows[0] ?? null;
  }

  private static toEvent(r: Record<string, unknown>): EventRow {
    const j = <T>(v: unknown, fb: T): T => {
      try {
        return v == null || v === "" ? fb : (JSON.parse(String(v)) as T);
      } catch {
        return fb;
      }
    };
    return {
      id: String(r.id),
      kind: String(r.kind),
      name: { en: String(r.name_en), hi: String(r.name_hi) },
      from: String(r.date_from),
      to: String(r.date_to),
      places: j<string[]>(r.places, []),
      visitFactor: Number(r.visit_factor),
      travelFactor: Number(r.travel_factor),
      blurb: { en: String(r.blurb_en), hi: String(r.blurb_hi) },
      notice: { en: String(r.notice_en), hi: String(r.notice_hi) },
      ...(r.bias ? { bias: j<Record<string, number>>(r.bias, {}) } : {}),
      ...(r.img ? { img: String(r.img) } : {}),
      ...(r.win_from ? { window: { from: String(r.win_from), to: String(r.win_to) } } : {}),
      ...(r.corridor ? { corridor: j<{ lat: number; lng: number }[]>(r.corridor, []) } : {}),
      ...(r.advice ? { advice: String(r.advice) as "join" | "avoid" } : {}),
    };
  }

  async listEvents(): Promise<EventRow[]> {
    const rows = await this.q("SELECT * FROM events ORDER BY date_from");
    return rows.map(NeonStore.toEvent);
  }

  async getEvent(id: string): Promise<EventRow | null> {
    const r = await this.one("SELECT * FROM events WHERE id = $1", [id]);
    return r ? NeonStore.toEvent(r) : null;
  }

  async upsertEvent(e: EventRow, who: string): Promise<void> {
    const existed = await this.getEvent(e.id);
    await this.q(
      `INSERT INTO events (id, kind, name_en, name_hi, date_from, date_to, places,
         visit_factor, travel_factor, blurb_en, blurb_hi, notice_en, notice_hi,
         bias, img, win_from, win_to, corridor, advice, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       ON CONFLICT (id) DO UPDATE SET
         kind=excluded.kind, name_en=excluded.name_en, name_hi=excluded.name_hi,
         date_from=excluded.date_from, date_to=excluded.date_to, places=excluded.places,
         visit_factor=excluded.visit_factor, travel_factor=excluded.travel_factor,
         blurb_en=excluded.blurb_en, blurb_hi=excluded.blurb_hi,
         notice_en=excluded.notice_en, notice_hi=excluded.notice_hi,
         bias=excluded.bias, img=excluded.img, win_from=excluded.win_from,
         win_to=excluded.win_to, corridor=excluded.corridor, advice=excluded.advice,
         updated_at=excluded.updated_at`,
      [
        e.id, e.kind, e.name.en, e.name.hi, e.from, e.to, JSON.stringify(e.places),
        e.visitFactor, e.travelFactor, e.blurb.en, e.blurb.hi, e.notice.en, e.notice.hi,
        e.bias ? JSON.stringify(e.bias) : null,
        e.img ?? null,
        e.window?.from ?? null, e.window?.to ?? null,
        e.corridor ? JSON.stringify(e.corridor) : null,
        e.advice ?? null,
        Date.now(),
      ],
    );
    await this.bumpRev("events");
    await this.audit(who, existed ? "update" : "create", "event", e.id, JSON.stringify(e));
  }

  async deleteEvent(id: string, who: string): Promise<void> {
    await this.q("DELETE FROM events WHERE id = $1", [id]);
    await this.bumpRev("events");
    await this.audit(who, "delete", "event", id, null);
  }

  private async audit(who: string, action: string, entity: string, entityId: string, after: string | null) {
    await this.q("INSERT INTO audit (at, who, action, entity, entity_id, after) VALUES ($1,$2,$3,$4,$5,$6)", [
      Date.now(), who, action, entity, entityId, after,
    ]);
  }

  /**
   * Move a feed's revision on. Called by every write, deletes included.
   *
   * Deletes are the ones that matter: MAX(updated_at) cannot see a row that is
   * no longer there, which is why the revision used to carry a COUNT(*). See
   * db/migrations/0004_rev.sql. Bumping on writes too costs one tiny upsert per
   * admin edit and removes the last-millisecond edge case, where two writes
   * land in the same tick and MAX does not move between them.
   */
  private async bumpRev(scope: string): Promise<void> {
    await this.q("INSERT INTO rev (scope, n) VALUES ($1, 1) ON CONFLICT (scope) DO UPDATE SET n = rev.n + 1", [
      scope,
    ]);
  }

  /** The counter half of a revision. Missing row = 0, which is a valid start. */
  private async revCount(scope: string): Promise<number> {
    const r = await this.one<{ n: number }>("SELECT n FROM rev WHERE scope = $1", [scope]);
    return Number(r?.n ?? 0);
  }

  /**
   * The revision the app compares against: MAX(updated_at) and a counter.
   *
   * It was MAX(updated_at) plus COUNT(*) — the count being there because the
   * timestamp alone cannot see a deletion, and a stale calendar that will not
   * refresh is the worst failure this can have. That reasoning still holds;
   * only the way of noticing a deletion has changed. COUNT(*) read every row
   * of the table to answer a question asked on every launch, so it is now a
   * counter the writes maintain. See db/migrations/0004_rev.sql.
   */
  async eventsRev(): Promise<string> {
    const [m, n] = await Promise.all([
      this.one<{ m: string }>("SELECT COALESCE(MAX(updated_at),0) AS m FROM events"),
      this.revCount("events"),
    ]);
    return `${Number(m?.m ?? 0)}-${n}`;
  }

  /* ---- content: places, start points, hotels, e-rickshaw, hero ---- */

  async listContent(kind: ContentKind): Promise<unknown[]> {
    const rows = await this.q<{ doc: string }>("SELECT doc FROM content WHERE kind = $1 ORDER BY id", [kind]);
    // A row that will not parse is skipped rather than thrown: one malformed
    // doc must not blank a feed of 57 good ones, and the app's bundled copy is
    // no help once a 200 with a short list has already been applied.
    const out: unknown[] = [];
    for (const r of rows) {
      try {
        out.push(JSON.parse(r.doc));
      } catch {
        /* skip */
      }
    }
    return out;
  }

  /**
   * Same shape as eventsRev, and for the same reason — see above.
   *
   * This is the one that was expensive: every row of production's places feed
   * read per call, on every launch, purely to answer "still current?". The MAX
   * is a single index seek on content_kind (kind, updated_at); the counter is
   * one row by primary key. Two rows, whatever the size of the feed.
   */
  async contentRev(kind: ContentKind): Promise<string> {
    const [m, n] = await Promise.all([
      this.one<{ m: string }>("SELECT COALESCE(MAX(updated_at),0) AS m FROM content WHERE kind = $1", [kind]),
      this.revCount(kind),
    ]);
    return `${Number(m?.m ?? 0)}-${n}`;
  }

  async upsertContent(kind: ContentKind, id: string, doc: unknown, who: string): Promise<void> {
    const json = JSON.stringify(doc);
    const existed = await this.one("SELECT 1 FROM content WHERE kind = $1 AND id = $2", [kind, id]);
    await this.q(
      `INSERT INTO content (kind, id, doc, updated_at) VALUES ($1,$2,$3,$4)
       ON CONFLICT (kind, id) DO UPDATE SET doc=excluded.doc, updated_at=excluded.updated_at`,
      [kind, id, json, Date.now()],
    );
    await this.bumpRev(kind);
    await this.audit(who, existed ? "update" : "create", kind, id, json);
  }

  async deleteContent(kind: ContentKind, id: string, who: string): Promise<void> {
    await this.q("DELETE FROM content WHERE kind = $1 AND id = $2", [kind, id]);
    await this.bumpRev(kind);
    await this.audit(who, "delete", kind, id, null);
  }

  async addSub(s: SubRow): Promise<void> {
    await this.q(
      `INSERT INTO subs (endpoint, p256dh, auth, lang, created_at) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (endpoint) DO UPDATE SET p256dh=excluded.p256dh, auth=excluded.auth, lang=excluded.lang`,
      [s.endpoint, s.p256dh, s.auth, s.lang, s.createdAt],
    );
  }

  async removeSub(endpoint: string): Promise<void> {
    await this.q("DELETE FROM subs WHERE endpoint = $1", [endpoint]);
  }

  async listSubs(): Promise<SubRow[]> {
    const rows = await this.q("SELECT * FROM subs");
    return rows.map((r) => ({
      endpoint: String(r.endpoint),
      p256dh: String(r.p256dh),
      auth: String(r.auth),
      lang: String(r.lang),
      createdAt: Number(r.created_at),
    }));
  }

  async wasSent(eventId: string, day: string): Promise<boolean> {
    const r = await this.one("SELECT 1 FROM sent WHERE event_id = $1 AND day = $2", [eventId, day]);
    return !!r;
  }

  /** `DO NOTHING` is the Postgres spelling of SQLite's INSERT OR IGNORE. */
  async markSent(eventId: string, day: string): Promise<void> {
    await this.q("INSERT INTO sent (event_id, day, at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [
      eventId, day, Date.now(),
    ]);
  }

  async noteMedia(who: string, action: "update" | "delete", key: string): Promise<void> {
    await this.audit(who, action, "image", key, null);
  }

  async listAudit(limit: number): Promise<AuditRow[]> {
    const rows = await this.q("SELECT * FROM audit ORDER BY at DESC LIMIT $1", [limit]);
    return rows.map((r) => ({
      id: Number(r.id),
      at: Number(r.at),
      who: String(r.who),
      action: String(r.action) as AuditRow["action"],
      entity: String(r.entity),
      entityId: String(r.entity_id),
      after: r.after == null ? null : String(r.after),
    }));
  }
}
