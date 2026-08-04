import { D1Store } from "./store.d1";
import type { Store, EventRow } from "./store";
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
 * Who is making this request.
 *
 * Cloudflare Access sits in front of /admin and will not pass a request
 * through without a verified identity, so by the time we see it the header is
 * trustworthy. Deliberately no auth code of our own: hand-rolled admin auth is
 * the single most likely thing here to be got wrong, and Access is free at
 * this size.
 *
 * The route MUST be protected in the Access dashboard. Unprotected, this
 * returns "unknown" and the guard below refuses the write rather than
 * accepting an anonymous edit.
 */
const who = (req: Request): string =>
  req.headers.get("cf-access-authenticated-user-email") || "";

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
          "access-control-allow-headers": "content-type",
        },
      });

    /* ---- what the app reads ---- */
    if (url.pathname === "/content/events.json" && req.method === "GET") {
      const [items, rev] = await Promise.all([store.listEvents(), store.eventsRev()]);
      return json({ rev, items }, 200, {
        // Short, because a corrected festival date should reach people the same
        // day; the app's own IndexedDB cache is what makes this cheap to poll.
        "cache-control": "public, max-age=300",
      });
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
      const email = who(req);
      if (!email)
        return json(
          { error: "This route must be protected by Cloudflare Access. Refusing to accept an anonymous edit." },
          403,
        );

      if (url.pathname === "/admin" || url.pathname === "/admin/")
        return new Response(ADMIN_HTML, { headers: { "content-type": "text/html; charset=utf-8" } });

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
