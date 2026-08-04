import { D1Store } from "./store.d1";
import { isContentKind, type Store, type EventRow } from "./store";
import { makeAuth } from "./auth";
import { validateEvent, validateEventSet } from "@kuk/shared/event-rules.mjs";
import { sendPush } from "./push";
import { ADMIN_HTML } from "./admin";

export interface Env {
  DB: D1Database;
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

    /* ---- what the app reads ---- */
    const feed = url.pathname.match(/^\/content\/([a-z]+)\.json$/);
    if (feed && req.method === "GET") {
      const kind = feed[1];
      let items: unknown[], rev: string;

      if (kind === "events") [items, rev] = await Promise.all([store.listEvents(), store.eventsRev()]);
      else if (isContentKind(kind))
        [items, rev] = await Promise.all([store.listContent(kind), store.contentRev(kind)]);
      else return json({ error: "not found" }, 404);

      // Conditional GET, and it is not a micro-optimisation here. The calendar
      // is 5 KB but the places feed is ~160 KB, and this is a district app used
      // on rural mobile data — without it every launch re-downloads the whole
      // catalogue to discover nothing changed. `rev` is already an exact
      // content revision, so it makes an honest ETag and the browser does the
      // rest. See docs/13.
      const etag = `"${kind}-${rev}"`;
      const headers = { "cache-control": "public, max-age=300", etag };
      if (req.headers.get("if-none-match") === etag)
        return new Response(null, { status: 304, headers: { ...headers, "access-control-allow-origin": "*" } });

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
        return new Response(ADMIN_HTML, { headers: { "content-type": "text/html; charset=utf-8" } });

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
