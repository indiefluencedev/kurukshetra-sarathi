/**
 * Everything the Worker needs from a database, and nothing about which one.
 *
 * D1 is the store today. It was chosen because it is free, it is SQLite so the
 * data is trivially exportable, and a district's calendar is a few dozen rows.
 * It may not be the store in a year — so every query lives behind this
 * interface and D1 appears in exactly one file (`store.d1.ts`). Swapping to
 * Postgres, KV or a hosted API means writing one more implementation of this,
 * not auditing the codebase for SQL.
 *
 * The interface is deliberately narrow. Anything expressible as "give me the
 * rows and I will filter in JS" is not worth a query method at this size, and
 * every method added here is a method the next implementation has to provide.
 */

/** One calendar entry, exactly as the app consumes it. */
export interface EventRow {
  id: string;
  kind: string;
  name: { en: string; hi: string };
  from: string;
  to: string;
  places: string[];
  visitFactor: number;
  travelFactor: number;
  blurb: { en: string; hi: string };
  notice: { en: string; hi: string };
  bias?: Record<string, number>;
  img?: string;
  window?: { from: string; to: string };
  corridor?: { lat: number; lng: number }[];
  advice?: "join" | "avoid";
}

/** A browser that asked to be told. */
export interface SubRow {
  /** the endpoint URL doubles as the primary key — it is unique per browser */
  endpoint: string;
  p256dh: string;
  auth: string;
  lang: string;
  createdAt: number;
}

/**
 * An edit, kept forever.
 *
 * Not optional at this size and not expensive: management is several people
 * sharing a login, and the first time a date changes and nobody remembers
 * changing it, "who and when" is the only question anyone will ask. Storing the
 * whole row after the edit means a mistake is recoverable by reading it back
 * out, which matters more than the bytes.
 */
export interface AuditRow {
  id: number;
  at: number;
  who: string;
  action: "create" | "update" | "delete";
  entity: string;
  entityId: string;
  after: string | null;
}

/**
 * The kinds of content the Board maintains besides the calendar.
 *
 * A closed list, checked at the edge of the Worker, because `kind` reaches SQL
 * and the endpoint that carries it is public: `/content/<anything>.json` must
 * not become a way to probe the database for what else is in there.
 */
// `startpoints` is the curated index of stations, bus stands, hotels and
// dharamshalas the planner offers as a start or an end. It is maintained the
// same way and for the same reason as the rest: a bus stand moves, a yatri
// niwas changes its phone number, and neither should need an app release.
export const CONTENT_KINDS = ["places", "startpoints", "hotels", "erickshaw"] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];

export const isContentKind = (s: string): s is ContentKind =>
  (CONTENT_KINDS as readonly string[]).includes(s);

export interface Store {
  /** Every item of a kind, as the app consumes it. */
  listContent(kind: ContentKind): Promise<unknown[]>;
  /** Opaque revision for a kind — changes whenever any item of it changes. */
  contentRev(kind: ContentKind): Promise<string>;
  upsertContent(kind: ContentKind, id: string, doc: unknown, who: string): Promise<void>;
  deleteContent(kind: ContentKind, id: string, who: string): Promise<void>;

  listEvents(): Promise<EventRow[]>;
  getEvent(id: string): Promise<EventRow | null>;
  upsertEvent(e: EventRow, who: string): Promise<void>;
  deleteEvent(id: string, who: string): Promise<void>;

  /** Opaque revision that changes whenever any event changes. */
  eventsRev(): Promise<string>;

  addSub(s: SubRow): Promise<void>;
  removeSub(endpoint: string): Promise<void>;
  listSubs(): Promise<SubRow[]>;

  /** Has this event already been pushed? Keeps the cron idempotent. */
  wasSent(eventId: string, day: string): Promise<boolean>;
  markSent(eventId: string, day: string): Promise<void>;

  listAudit(limit: number): Promise<AuditRow[]>;

  /**
   * Record a photograph being replaced or removed.
   *
   * Images live in R2 rather than in this store, so nothing else here would
   * ever show that one changed — and "who swapped the picture of Jyotisar, and
   * when" is exactly the question the audit log exists to answer. The bytes are
   * not kept; the key and the act are.
   */
  noteMedia(who: string, action: "update" | "delete", key: string): Promise<void>;
}
