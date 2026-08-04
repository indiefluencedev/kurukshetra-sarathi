import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins";
import { Kysely } from "kysely";
import { D1Dialect } from "kysely-d1";
import type { Env } from "./index";

/**
 * Accounts, for visitors and for the Board.
 *
 * Better Auth rather than a hosted identity service, so the client owns this
 * the way they own everything else here — the user table is a table in their
 * own D1, exportable with the rest of it, with no per-user bill and nobody to
 * ask for the data back. See docs/14.
 *
 * ── Why bearer tokens and not cookies ──────────────────────────────────────
 *
 * The app is served from kuk-saarthi.pages.dev and this Worker answers on
 * kuk-saarthi-api.…workers.dev. Those are different *sites*, not just
 * different origins, so a session cookie set by the Worker is a third-party
 * cookie in the browser's eyes. Safari blocks those outright and Chrome is
 * removing them, which would mean login silently failing on exactly the
 * iPhones this app is used on.
 *
 * So the session travels as an Authorization header the app keeps itself.
 * Cookies are not "more secure" here — they would simply not arrive.
 *
 * The proper fix is one origin: put this Worker on a route of the same custom
 * domain as the app (kurukshetra.example.org/api/*) and cookies become
 * first-party. That needs a domain the client has not given us yet, and the
 * bearer plugin keeps working either way, so it is not blocking.
 *
 * ── Why this is a factory ──────────────────────────────────────────────────
 *
 * A D1 binding only exists inside a request. There is no module-level `auth`
 * to construct at import time; `env` arrives with the fetch event, so the
 * instance is built per request like the store already is.
 */
export function makeAuth(env: Env) {
  return betterAuth({
    database: { dialect: new D1Dialect({ database: env.DB }), type: "sqlite" },

    // A real secret is required — Better Auth signs tokens with it. There is
    // no safe default, so a missing one must be loud rather than silently
    // falling back to something guessable.
    secret: env.AUTH_SECRET,
    baseURL: env.API_URL,
    basePath: "/api/auth",

    // The app's origin must be listed or Better Auth rejects its requests.
    trustedOrigins: [env.APP_URL.replace(/\/$/, "")],

    emailAndPassword: {
      enabled: true,
      // Nothing is emailed yet — there is no sender configured (docs/14), and
      // an unverified email costs nothing here: an account holds saved
      // itineraries, not money or personal records. Turn this on together
      // with a sender, not before.
      requireEmailVerification: false,
      minPasswordLength: 8,
    },

    // Only registered when the client has actually created OAuth credentials.
    // Passing an empty id/secret does not disable a provider, it produces a
    // sign-in button that fails at Google with an unhelpful error.
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          socialProviders: {
            google: {
              clientId: env.GOOGLE_CLIENT_ID,
              clientSecret: env.GOOGLE_CLIENT_SECRET,
            },
          },
        }
      : {}),

    user: {
      additionalFields: {
        /**
         * "visitor" | "admin". Checked by the /admin routes.
         *
         * `input: false` is the important half: without it the role is an
         * ordinary profile field and anyone could sign up posting
         * {"role":"admin"} in the body. It is settable only from the server —
         * in practice one UPDATE against D1, which is the right amount of
         * friction for a handful of Board members.
         */
        role: { type: "string", required: false, defaultValue: "visitor", input: false },
      },
    },

    session: {
      // A visitor plans a trip over weeks, not minutes, and being logged out
      // between the planning and the going is the whole value gone.
      expiresIn: 60 * 60 * 24 * 90,
      updateAge: 60 * 60 * 24,
    },

    plugins: [bearer()],
  });
}

export type Auth = ReturnType<typeof makeAuth>;

/**
 * A module-level instance for the Better Auth CLI only.
 *
 * `npx @better-auth/cli generate` imports this file to learn the schema. It
 * introspects the database first — to emit only the missing tables — so an
 * empty object is not enough: it calls `.prepare()` and crashes.
 *
 * This stub answers introspection with "no tables", which is what we want the
 * generator to assume. The alternative is pointing the CLI at a live D1, which
 * would mean the schema we generate depends on which database happened to be
 * connected. Never used to serve a request.
 */
const introspectionStub = {
  prepare: () => ({
    bind() {
      return this;
    },
    // kysely-d1 reads meta.changes and meta.last_row_id off every result, so
    // the stub has to be a whole D1 result, not just an empty row set.
    all: async () => ({ results: [], success: true, meta: { changes: 0, last_row_id: 0 } }),
    first: async () => null,
    run: async () => ({ success: true, meta: { changes: 0, last_row_id: 0 } }),
  }),
} as unknown as D1Database;

export const auth = makeAuth({
  DB: introspectionStub,
  AUTH_SECRET: "cli-only-not-a-real-secret",
  API_URL: "http://localhost:8787",
  APP_URL: "http://localhost:5173",
} as Env);
