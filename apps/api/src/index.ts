import { D1Store } from "./store.d1";
import { isContentKind, type Store, type EventRow, type ContentKind } from "./store";
import { makeAuth } from "./auth";
import { validateEvent, validateEventSet } from "@kuk/shared/event-rules.mjs";
import { sendPush } from "./push";
import { ADMIN_HTML } from "./admin";

export interface Env {
  DB: D1Database;
  /** every photograph the app shows — see the /img/ route */
  MEDIA: R2Bucket;
  VAPID_PUBLIC: string;
  VAPID_PRIVATE: string;
  /** mailto: address Web Push requires as the JWT subject */
  VAPID_SUBJECT: string;
  /** where the app is served from, for the notification's click-through */
  APP_URL: string;
  /** this Worker's own public URL — Better Auth builds callback URLs from it */
  API_URL: string;
  /** secret Better Auth signs sessions with. No default; see auth.ts */
  AUTH_SECRET: string;
  /**
   * Comma-separated emails allowed into /admin. THE authority on who is an
   * administrator — see admin() below. Empty means nobody.
   */
  ADMIN_EMAILS: string;
  /** optional: absent until the client creates OAuth credentials */
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // Same-origin is the intended deployment (app on Pages, this Worker on a
      // route of the same domain) and then this header is redundant. It is here
      // for the case it is not, because the failure without it is silent: the
      // app simply keeps showing its bundled calendar and nothing says why.
      "access-control-allow-origin": "*",
      ...extra,
    },
  });

/**
 * Who is making this request, and may they edit?
 *
 * Was a Cloudflare Access header; is now a Better Auth session, so the Board
 * signs in through the same system as visitors and the admin area is a
 * restricted path rather than a separate product. See docs/14.
 *
 * Returns the email only for a user whose role is "admin". Every caller treats
 * an empty string as "refuse", so a signed-in visitor poking at /admin is
 * indistinguishable from an anonymous one — which is the point. `role` cannot
 * be set at sign-up (see auth.ts), so becoming an admin is a deliberate act
 * against the database, not something a registration form can grant.
 */
export const adminEmails = (env: Env): string[] =>
  (env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

async function admin(req: Request, env: Env): Promise<string> {
  try {
    const session = await makeAuth(env).api.getSession({ headers: req.headers });
    const email = session?.user?.email?.toLowerCase();
    if (!email) return "";

    // The allow-list is the authority, and the database is not consulted.
    //
    // A `role` column alone means anyone who can write one row can grant
    // themselves the dashboard — a SQL injection, a leaked D1 token, a
    // mis-scoped script, a restored backup. ADMIN_EMAILS is a Worker variable:
    // changing it takes a deploy by someone with account access, which is a
    // far higher bar than an UPDATE.
    //
    // It also removes the step that made this unusable: nobody has to run SQL
    // to create an admin, and no password has to be handed to anyone. Put the
    // address in the variable, sign up with it, done.
    //
    // Empty list = nobody is an admin. Deliberately NOT "fall back to the role
    // column": a missing variable is a misconfiguration, and the safe reading
    // of a misconfiguration is to refuse rather than to open up.
    return adminEmails(env).includes(email) ? session.user.email : "";
  } catch {
    // A failure to read a session is not permission to proceed.
    return "";
  }
}

const IST = 5.5 * 60; // the district is in one timezone; the Worker is in none

/** Today's date and minute-of-day in IST, whatever UTC the Worker woke in. */
function istNow(now = Date.now()) {
  const d = new Date(now + IST * 60_000);
  const iso = d.toISOString().slice(0, 10);
  return { iso, minute: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

const hm = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));

/**
 * A day, and revalidate in the background after that.
 *
 * Deliberately not `immutable`. The keys are stable ids rather than content
 * hashes — which is what let the whole catalogue move to R2 without rewriting a
 * single `img` value — so replacing a photograph reuses its key. Immutable
 * caching would mean the new picture never arriving on a device that had seen
 * the old one. A day, plus an ETag so the revalidation is free, is the trade.
 */
const IMG_CACHE = "public, max-age=86400, stale-while-revalidate=604800";

const TYPES: Record<string, string> = {
  webp: "image/webp", jpg: "image/jpeg", jpeg: "image/jpeg",
  png: "image/png", avif: "image/avif", svg: "image/svg+xml",
};
/** Only used when R2 has no stored content type — uploads always set one. */
const guessType = (key: string) => TYPES[key.split(".").pop()?.toLowerCase() || ""] || "application/octet-stream";

/** What may be uploaded. A closed list: this endpoint writes to a public bucket. */
const UPLOAD_TYPES = new Set(["image/webp", "image/jpeg", "image/png", "image/avif"]);
const MAX_UPLOAD = 6 * 1024 * 1024;
const IMG_EXT = ["webp", "jpg", "jpeg", "png", "avif"];

/**
 * The same photograph under a different extension.
 *
 * Everything that asks for a picture builds the URL the same way: the id from
 * the document, plus ".webp" — apps/web/src/data/images.ts does it, and so does
 * the dashboard. But an upload keeps the extension of the file it came from,
 * because that is what its bytes actually are and this Worker cannot transcode.
 * So a photograph taken on a phone lands as brahma-sarovar.jpg, every caller
 * asks for brahma-sarovar.webp, and the picture 404s while plainly sitting in
 * the bucket. Nothing reports it: the record is right, the file is right, and
 * the app shows an empty frame.
 *
 * Rather than teach three callers about extensions, the one route they all go
 * through looks for the other spellings. Only ever reached on a miss, so a real
 * .webp — which is nearly all of them — costs exactly one lookup as before.
 */
async function sameStem(media: R2Bucket, key: string): Promise<R2ObjectBody | null> {
  const stem = key.replace(/\.[a-z0-9]+$/i, "");
  for (const ext of IMG_EXT) {
    const alt = stem + "." + ext;
    if (alt === key) continue;
    const o = await media.get(alt);
    if (o) return o;
  }
  return null;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const store: Store = new D1Store(env.DB);

    if (req.method === "OPTIONS")
      return new Response(null, {
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
          // `authorization` because the session travels as a bearer token, and
          // `set-auth-token` must be *exposed* or the app cannot read the
          // token it was just issued — a cross-origin response hides every
          // header not on this list, and sign-in appears to succeed while
          // leaving the app logged out.
          "access-control-allow-headers": "content-type, authorization",
          "access-control-expose-headers": "set-auth-token",
        },
      });

    /* ---- accounts ---- */
    if (url.pathname.startsWith("/api/auth/")) {
      const res = await makeAuth(env).handler(req);
      // Better Auth builds its own responses, so the CORS headers the `json`
      // helper adds never touch them.
      const h = new Headers(res.headers);
      h.set("access-control-allow-origin", "*");
      h.set("access-control-expose-headers", "set-auth-token");
      return new Response(res.body, { status: res.status, headers: h });
    }

    /**
     * What this deployment can actually do.
     *
     * The app cannot know from its own bundle whether Google credentials or
     * push keys were ever set — those are Worker secrets. Without this it has
     * to guess, and guessing wrong means offering a sign-in button that dies
     * at Google, or asking for notification permission the server cannot honour.
     * Permission refused once is refused for good, so guessing is expensive.
     */
    if (url.pathname === "/config" && req.method === "GET") {
      return json(
        {
          google: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
          // So the app can show "Manage content" to the right people without
          // depending on a role column that is no longer the authority.
          admins: adminEmails(env),
          // The public half is public by definition — the browser needs it to
          // build a subscription at all.
          vapidPublic: env.VAPID_PUBLIC || "",
        },
        200,
        { "cache-control": "public, max-age=300" },
      );
    }

    /* ---- photographs ----
     *
     * Public, unauthenticated, and the only way an image reaches the app. The
     * bucket itself is not public: serving through the Worker is what lets a
     * response carry a content type, a cache lifetime and an ETag, and it
     * keeps every URL on one origin so nothing needs a second DNS name.
     *
     * The key is the id the content already uses. `img: "brahma-sarovar"` in a
     * place document becomes /img/brahma-sarovar.webp — which is why moving off
     * the bundle required no edit to any row.
     */
    const img = url.pathname.match(/^\/img\/([A-Za-z0-9._-]+)$/);
    if (img && (req.method === "GET" || req.method === "HEAD")) {
      const key = img[1];
      /*
       * Fetch, then compare the ETag here. This was written as an R2 conditional
       * read — `get(key, { onlyIf: { etagDoesNotMatch: … } })` — to avoid moving
       * a body that was not going to be sent. It did not survive contact with
       * production: with no If-None-Match the condition became `undefined` and
       * the read came back empty for objects that plainly existed (four of the
       * ninety-nine 404'd while `r2 object get` returned them in full), and a
       * malformed ETag threw a 500 rather than being ignored.
       *
       * A photograph is 20-50 KB. Saving a fraction of that on a revalidation
       * was never worth an endpoint whose failures depend on which header the
       * caller happened to send. `get` either finds the object or does not, and
       * the comparison below is a string equality nobody has to reason about.
       */
      const obj = (await env.MEDIA.get(key)) ?? (await sameStem(env.MEDIA, key));
      if (!obj) return json({ error: "no such image" }, 404);

      const headers = {
        "content-type": obj.httpMetadata?.contentType || guessType(key),
        "cache-control": IMG_CACHE,
        etag: obj.httpEtag,
        "access-control-allow-origin": "*",
      };
      // The body is a stream; returning 304 without reading it moves nothing.
      if (req.headers.get("if-none-match") === obj.httpEtag)
        return new Response(null, { status: 304, headers });
      return new Response(req.method === "HEAD" ? null : obj.body, { headers });
    }

    /* ---- what the app reads ---- */
    const feed = url.pathname.match(/^\/content\/([a-z]+)\.json$/);
    if (feed && req.method === "GET") {
      const kind = feed[1];
      const isEvents = kind === "events";
      if (!isEvents && !isContentKind(kind)) return json({ error: "not found" }, 404);

      /*
       * Conditional GET, and it is not a micro-optimisation here. The calendar
       * is 5 KB but the places feed is ~160 KB, and this is a district app used
       * on rural mobile data — without it every launch re-downloads the whole
       * catalogue to discover nothing changed. `rev` is already an exact
       * content revision, so it makes an honest ETag and the browser does the
       * rest. See docs/13.
       *
       * THE ORDER BELOW IS THE POINT. This used to fetch the rows and the
       * revision together in a Promise.all and only then compare the ETag — so
       * a 304 cost exactly what a 200 cost. The response saved 160 KB of
       * bandwidth and not one row of database read: every launch, every
       * visitor, read all 58 places to answer "no, nothing has changed".
       *
       * The revision is asked for first, alone. The documents are only fetched
       * once we know they are going to be sent.
       */
      const cond = req.headers.get("if-none-match");
      const revP = isEvents ? store.eventsRev() : store.contentRev(kind as ContentKind);
      // A client with no copy is always getting the documents, so there is
      // nothing to gain by waiting to find out — that request keeps both
      // queries in flight at once, as the whole endpoint used to.
      const itemsP = cond ? null : (isEvents ? store.listEvents() : store.listContent(kind as ContentKind));

      const rev = await revP;
      const etag = `"${kind}-${rev}"`;
      const headers = { "cache-control": "public, max-age=300", etag };
      if (cond === etag)
        return new Response(null, { status: 304, headers: { ...headers, "access-control-allow-origin": "*" } });

      const items = await (itemsP ?? (isEvents ? store.listEvents() : store.listContent(kind as ContentKind)));
      return json({ rev, items }, 200, headers);
    }

    /* ---- push subscriptions ---- */
    if (url.pathname === "/subscribe" && req.method === "POST") {
      const b = (await req.json().catch(() => null)) as any;
      if (!b?.endpoint || !b?.keys?.p256dh || !b?.keys?.auth) return json({ error: "bad subscription" }, 400);
      await store.addSub({
        endpoint: b.endpoint,
        p256dh: b.keys.p256dh,
        auth: b.keys.auth,
        lang: b.lang === "hi" ? "hi" : "en",
        createdAt: Date.now(),
      });
      return json({ ok: true });
    }
    if (url.pathname === "/subscribe" && req.method === "DELETE") {
      const b = (await req.json().catch(() => null)) as any;
      if (b?.endpoint) await store.removeSub(b.endpoint);
      return json({ ok: true });
    }
    if (url.pathname === "/vapid" && req.method === "GET") {
      return json({ key: env.VAPID_PUBLIC });
    }

    /* ---- the dashboard, behind Cloudflare Access ---- */
    if (url.pathname.startsWith("/admin")) {
      const email = await admin(req, env);

      // The dashboard page itself is served unauthenticated on purpose: it is
      // a sign-in form plus an empty shell, and every route it then calls is
      // guarded. Serving a 403 here instead would leave the Board with a login
      // screen they cannot reach without already being logged in.
      if (url.pathname === "/admin" || url.pathname === "/admin/")
        return new Response(ADMIN_HTML, {
          headers: {
            "content-type": "text/html; charset=utf-8",
            // With no cache header at all, browsers cache HTML heuristically —
            // so a deploy that fixes the dashboard can leave the person using
            // it on the broken copy, with no way to tell. A dashboard is never
            // worth caching.
            "cache-control": "no-store",
          },
        });

      if (!email)
        return json({ error: "Sign in as an administrator to edit." }, 403);

      if (url.pathname === "/admin/events" && req.method === "GET")
        return json({ items: await store.listEvents(), you: email });

      if (url.pathname === "/admin/events" && req.method === "PUT") {
        const e = (await req.json().catch(() => null)) as EventRow | null;
        if (!e) return json({ error: "not JSON" }, 400);
        // The same rules the build-time check uses — see shared/event-rules.mjs.
        // Place ids are not resolvable here without shipping the catalogue, so
        // that one rule is left to the app's own check.
        const problems = validateEvent(e);
        const others = (await store.listEvents()).filter((x) => x.id !== e.id);
        problems.push(...validateEventSet([...others, e]).filter((p) => p.startsWith(e.id + ":")));
        if (problems.length) return json({ error: "invalid", problems }, 422);
        await store.upsertEvent(e, email);
        return json({ ok: true });
      }

      if (url.pathname === "/admin/events" && req.method === "DELETE") {
        const b = (await req.json().catch(() => null)) as { id?: string } | null;
        if (!b?.id) return json({ error: "no id" }, 400);
        await store.deleteEvent(b.id, email);
        return json({ ok: true });
      }

      // Places, hotels and e-rickshaw. Unlike events these have no server-side
      // rule set — the app is the schema — so the only thing checked is that
      // the item has an id to key on. Validation that matters (a place needs a
      // lat/lng the planner can use) belongs in the same shared rules file the
      // calendar uses, and is not written yet; until it is, a bad row shows up
      // as a place that will not plan rather than a corrupt feed.
      const adminFeed = url.pathname.match(/^\/admin\/content\/([a-z]+)$/);
      if (adminFeed) {
        const kind = adminFeed[1];
        if (!isContentKind(kind)) return json({ error: "unknown kind" }, 404);

        if (req.method === "GET") return json({ items: await store.listContent(kind), you: email });

        if (req.method === "PUT") {
          const doc = (await req.json().catch(() => null)) as { id?: string } | null;
          if (!doc?.id) return json({ error: "no id" }, 400);
          await store.upsertContent(kind, doc.id, doc, email);
          return json({ ok: true });
        }

        if (req.method === "DELETE") {
          const b = (await req.json().catch(() => null)) as { id?: string } | null;
          if (!b?.id) return json({ error: "no id" }, 400);
          await store.deleteContent(kind, b.id, email);
          return json({ ok: true });
        }
      }

      /* ---- photographs ----
       *
       * The dashboard's image library. Upload replaces by key on purpose: a
       * place's photograph is "the picture of Brahma Sarovar", so correcting it
       * should not leave the old one orphaned in the bucket and the id pointing
       * at whichever the editor remembered to re-select.
       */
      if (url.pathname === "/admin/media") {
        if (req.method === "GET") {
          // R2 lists 1000 at a time; the catalogue is ~100 objects, so one page
          // is the whole library and pagination would be machinery for nobody.
          const list = await env.MEDIA.list({ limit: 1000 });
          return json({
            items: list.objects
              .map((o) => ({ key: o.key, size: o.size, at: o.uploaded }))
              .sort((a, b) => a.key.localeCompare(b.key)),
            truncated: list.truncated,
          });
        }

        if (req.method === "PUT") {
          const type = req.headers.get("content-type") || "";
          const key = (url.searchParams.get("key") || "").trim();
          // The key becomes a public URL and an R2 object name. Anything outside
          // this alphabet is refused rather than sanitised: silently renaming an
          // editor's file is how an `img` value and its object stop matching.
          if (!/^[a-z0-9][a-z0-9-]*\.(webp|jpg|jpeg|png|avif)$/.test(key))
            return json({ error: "key must be lower-case letters, digits and hyphens, with an image extension" }, 400);
          if (!UPLOAD_TYPES.has(type)) return json({ error: "unsupported image type: " + type }, 415);

          const body = await req.arrayBuffer();
          if (!body.byteLength) return json({ error: "empty upload" }, 400);
          if (body.byteLength > MAX_UPLOAD)
            return json({ error: `too large: ${Math.round(body.byteLength / 1024)} KB, limit ${MAX_UPLOAD / 1024 / 1024} MB` }, 413);

          await env.MEDIA.put(key, body, { httpMetadata: { contentType: type } });
          await store.noteMedia(email, "update", key);
          return json({ ok: true, key, size: body.byteLength });
        }

        if (req.method === "DELETE") {
          const key = (url.searchParams.get("key") || "").trim();
          if (!key) return json({ error: "no key" }, 400);
          await env.MEDIA.delete(key);
          await store.noteMedia(email, "delete", key);
          return json({ ok: true });
        }
      }

      if (url.pathname === "/admin/audit" && req.method === "GET")
        return json({ items: await store.listAudit(100) });

      if (url.pathname === "/admin/test-push" && req.method === "POST") {
        const n = await notify(env, store, "test");
        return json({ ok: true, sent: n });
      }
    }

    return json({ error: "not found" }, 404);
  },

  /** Cron. Set to every 15 minutes in wrangler.toml. */
  async scheduled(_c: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(notify(env, new D1Store(env.DB)));
  },
};

/**
 * Tell people about anything starting in the next half hour or so.
 *
 * The lead time is a window, not a threshold: the cron runs every 15 minutes,
 * so "starts within 30 minutes" is checked at most twice before the event
 * begins, and `sent` makes the second one a no-op. A missed run is therefore
 * survivable and a double run is harmless — which is the only way a scheduler
 * you do not watch can be trusted.
 */
async function notify(env: Env, store: Store, mode: "cron" | "test" = "cron"): Promise<number> {
  const { iso, minute } = istNow();
  const events = await store.listEvents();

  const due = events.filter((e) => {
    if (iso < e.from || iso > e.to) return false;
    if (!e.window) return false; // an all-day festival is not news at a moment
    const start = hm(e.window.from);
    return start > minute && start - minute <= 45;
  });
  const picked = mode === "test" ? events.slice(0, 1) : due;
  if (!picked.length) return 0;

  const subs = await store.listSubs();
  let sent = 0;

  for (const e of picked) {
    if (mode === "cron" && (await store.wasSent(e.id, iso))) continue;
    for (const s of subs) {
      const body = {
        title: s.lang === "hi" ? e.name.hi : e.name.en,
        body: s.lang === "hi" ? e.notice.hi : e.notice.en,
        url: `${env.APP_URL}#/home`,
        tag: e.id,
      };
      const ok = await sendPush(env, s, body);
      // A 404 or 410 means the browser threw the subscription away. Keeping it
      // would mean retrying a dead endpoint every quarter hour forever.
      if (ok === "gone") await store.removeSub(s.endpoint);
      else if (ok === "sent") sent++;
    }
    if (mode === "cron") await store.markSent(e.id, iso);
  }
  return sent;
}
