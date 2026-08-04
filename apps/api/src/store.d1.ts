import type { Store, EventRow, SubRow, AuditRow, ContentKind } from "./store";

/**
 * The D1 implementation — the ONLY file in the Worker that knows any SQL.
 *
 * Events are stored as one row per event with the variable-shaped parts
 * (`places`, `bias`, `corridor`, `window`) as JSON text. That is a deliberate
 * choice over normalising them into child tables: they are always read and
 * written as a whole event, never queried across, and a district calendar is
 * tens of rows. Normalising would buy joins nobody performs and cost a
 * migration every time the shape gains a field.
 */
export class D1Store implements Store {
  constructor(private db: D1Database) {}

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
    const { results } = await this.db.prepare("SELECT * FROM events ORDER BY date_from").all();
    return (results as Record<string, unknown>[]).map(D1Store.toEvent);
  }

  async getEvent(id: string): Promise<EventRow | null> {
    const r = await this.db.prepare("SELECT * FROM events WHERE id = ?").bind(id).first();
    return r ? D1Store.toEvent(r as Record<string, unknown>) : null;
  }

  async upsertEvent(e: EventRow, who: string): Promise<void> {
    const existed = await this.getEvent(e.id);
    await this.db
      .prepare(
        `INSERT INTO events (id, kind, name_en, name_hi, date_from, date_to, places,
           visit_factor, travel_factor, blurb_en, blurb_hi, notice_en, notice_hi,
           bias, img, win_from, win_to, corridor, advice, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET
           kind=excluded.kind, name_en=excluded.name_en, name_hi=excluded.name_hi,
           date_from=excluded.date_from, date_to=excluded.date_to, places=excluded.places,
           visit_factor=excluded.visit_factor, travel_factor=excluded.travel_factor,
           blurb_en=excluded.blurb_en, blurb_hi=excluded.blurb_hi,
           notice_en=excluded.notice_en, notice_hi=excluded.notice_hi,
           bias=excluded.bias, img=excluded.img, win_from=excluded.win_from,
           win_to=excluded.win_to, corridor=excluded.corridor, advice=excluded.advice,
           updated_at=excluded.updated_at`,
      )
      .bind(
        e.id, e.kind, e.name.en, e.name.hi, e.from, e.to, JSON.stringify(e.places),
        e.visitFactor, e.travelFactor, e.blurb.en, e.blurb.hi, e.notice.en, e.notice.hi,
        e.bias ? JSON.stringify(e.bias) : null,
        e.img ?? null,
        e.window?.from ?? null, e.window?.to ?? null,
        e.corridor ? JSON.stringify(e.corridor) : null,
        e.advice ?? null,
        Date.now(),
      )
      .run();
    await this.audit(who, existed ? "update" : "create", "event", e.id, JSON.stringify(e));
  }

  async deleteEvent(id: string, who: string): Promise<void> {
    await this.db.prepare("DELETE FROM events WHERE id = ?").bind(id).run();
    await this.audit(who, "delete", "event", id, null);
  }

  private async audit(who: string, action: string, entity: string, entityId: string, after: string | null) {
    await this.db
      .prepare("INSERT INTO audit (at, who, action, entity, entity_id, after) VALUES (?,?,?,?,?,?)")
      .bind(Date.now(), who, action, entity, entityId, after)
      .run();
  }

  /**
   * The revision the app compares against. MAX(updated_at) plus the row count:
   * the timestamp alone would not move when the only change was a deletion, and
   * a stale calendar that will not refresh is the worst failure this can have.
   */
  async eventsRev(): Promise<string> {
    const r = (await this.db
      .prepare("SELECT COALESCE(MAX(updated_at),0) AS m, COUNT(*) AS n FROM events")
      .first()) as { m: number; n: number } | null;
    return `${r?.m ?? 0}-${r?.n ?? 0}`;
  }

  /* ---- content: places, hotels, e-rickshaw ---- */

  async listContent(kind: ContentKind): Promise<unknown[]> {
    const { results } = await this.db.prepare("SELECT doc FROM content WHERE kind = ? ORDER BY id").bind(kind).all();
    // A row that will not parse is skipped rather than thrown: one malformed
    // doc must not blank a feed of 36 good ones, and the app's bundled copy is
    // no help once a 200 with a short list has already been applied.
    const out: unknown[] = [];
    for (const r of results as { doc: string }[]) {
      try {
        out.push(JSON.parse(r.doc));
      } catch {
        /* skip */
      }
    }
    return out;
  }

  /** Same shape as eventsRev, and for the same reason — see above. */
  async contentRev(kind: ContentKind): Promise<string> {
    const r = (await this.db
      .prepare("SELECT COALESCE(MAX(updated_at),0) AS m, COUNT(*) AS n FROM content WHERE kind = ?")
      .bind(kind)
      .first()) as { m: number; n: number } | null;
    return `${r?.m ?? 0}-${r?.n ?? 0}`;
  }

  async upsertContent(kind: ContentKind, id: string, doc: unknown, who: string): Promise<void> {
    const json = JSON.stringify(doc);
    const existed = await this.db
      .prepare("SELECT 1 FROM content WHERE kind = ? AND id = ?")
      .bind(kind, id)
      .first();
    await this.db
      .prepare(
        `INSERT INTO content (kind, id, doc, updated_at) VALUES (?,?,?,?)
         ON CONFLICT(kind, id) DO UPDATE SET doc=excluded.doc, updated_at=excluded.updated_at`,
      )
      .bind(kind, id, json, Date.now())
      .run();
    await this.audit(who, existed ? "update" : "create", kind, id, json);
  }

  async deleteContent(kind: ContentKind, id: string, who: string): Promise<void> {
    await this.db.prepare("DELETE FROM content WHERE kind = ? AND id = ?").bind(kind, id).run();
    await this.audit(who, "delete", kind, id, null);
  }

  async addSub(s: SubRow): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO subs (endpoint, p256dh, auth, lang, created_at) VALUES (?,?,?,?,?)
         ON CONFLICT(endpoint) DO UPDATE SET p256dh=excluded.p256dh, auth=excluded.auth, lang=excluded.lang`,
      )
      .bind(s.endpoint, s.p256dh, s.auth, s.lang, s.createdAt)
      .run();
  }

  async removeSub(endpoint: string): Promise<void> {
    await this.db.prepare("DELETE FROM subs WHERE endpoint = ?").bind(endpoint).run();
  }

  async listSubs(): Promise<SubRow[]> {
    const { results } = await this.db.prepare("SELECT * FROM subs").all();
    return (results as Record<string, unknown>[]).map((r) => ({
      endpoint: String(r.endpoint),
      p256dh: String(r.p256dh),
      auth: String(r.auth),
      lang: String(r.lang),
      createdAt: Number(r.created_at),
    }));
  }

  async wasSent(eventId: string, day: string): Promise<boolean> {
    const r = await this.db.prepare("SELECT 1 FROM sent WHERE event_id = ? AND day = ?").bind(eventId, day).first();
    return !!r;
  }

  async markSent(eventId: string, day: string): Promise<void> {
    await this.db
      .prepare("INSERT OR IGNORE INTO sent (event_id, day, at) VALUES (?,?,?)")
      .bind(eventId, day, Date.now())
      .run();
  }

  async listAudit(limit: number): Promise<AuditRow[]> {
    const { results } = await this.db.prepare("SELECT * FROM audit ORDER BY at DESC LIMIT ?").bind(limit).all();
    return (results as Record<string, unknown>[]).map((r) => ({
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
