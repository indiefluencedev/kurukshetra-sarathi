import { betterAuth } from "better-auth";
import { bearer, emailOTP } from "better-auth/plugins";
import { PostgresDialect, type PostgresPool } from "kysely";
import { Pool } from "@neondatabase/serverless";
import { appUrl, sendOtpEmail, sendResetEmail, sendVerificationEmail } from "./email";
import type { Env } from "./index";

/**
 * Accounts, for visitors and for the Board.
 *
 * Better Auth rather than a hosted identity service, so the client owns this
 * the way they own everything else here — the user table is a table in their
 * own database, exportable with the rest of it, with no per-user bill and
 * nobody to ask for the data back. See docs/14.
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
 * Secrets only exist inside a request. There is no module-level `auth` to
 * construct at import time; `env` arrives with the fetch event, so the
 * instance is built per request like the store already is.
 *
 * ── Why a Pool here and the HTTP driver in the store ───────────────────────
 *
 * `@neondatabase/serverless` offers two ways in. The store uses `neon()`, the
 * HTTP one: one round trip per query, no socket, ideal for a Worker. Better
 * Auth cannot use it, because it runs sign-up and sign-in inside interactive
 * transactions — BEGIN, then decide what to write, then COMMIT — and the HTTP
 * endpoint only accepts a transaction whose statements are all known upfront.
 * `Pool` speaks the real Postgres protocol over a WebSocket and can hold one
 * open, so that is what auth gets. Two drivers, one dependency, each on the
 * side of the line where it is correct.
 */
export function makeAuth(env: Env) {
  return betterAuth({
    database: {
      // The cast is structural, not a papering-over. Kysely's `PostgresPool`
      // is written against node-postgres, whose `client.connect()` resolves to
      // the client; Neon's resolves to void. Kysely never uses that return
      // value — it awaits connect() and then uses the client it already holds
      // — so the two agree on everything Kysely actually calls. Verified by
      // signing up, signing in and reading a session against Neon.
      dialect: new PostgresDialect({
        pool: new Pool({ connectionString: env.NEON_DB_URL }) as unknown as PostgresPool,
      }),
      type: "postgres",
    },

    // A real secret is required — Better Auth signs tokens with it. There is
    // no safe default, so a missing one must be loud rather than silently
    // falling back to something guessable.
    secret: env.AUTH_SECRET,
    baseURL: env.API_URL,
    basePath: "/api/auth",

    // The app's origin must be listed or Better Auth rejects its requests.
    //
    // Comma-separated, because development serves the app from two addresses
    // that are both legitimate — localhost, which is what you type, and the
    // laptop's LAN address, which is what a phone has to use (see dev.mjs).
    // Listing one of them means sign-in works on the desktop and fails on the
    // phone with a CORS error that says nothing about origins.
    // Production sets a single value and splits to a list of one.
    trustedOrigins: [
      ...env.APP_URL.split(",")
        .map((o) => o.trim().replace(/\/$/, ""))
        .filter(Boolean),
      env.API_URL.replace(/\/$/, ""),
      "http://localhost:8787"
    ],

    emailAndPassword: {
      enabled: true,
      /**
       * An address has to be proved before it can be signed in with.
       *
       * This was `false` for as long as there was no sender: turning it on
       * without one is not "more secure", it is an app nobody can log into.
       * With Cloudflare Email Sending configured (src/email.ts) the trade is
       * the right way round — an unverified address means anyone can register
       * as anyone, and the account is about to be worth something (saved
       * plans, and the Board's dashboard behind the same login).
       *
       * The two accounts that predate this were marked verified by migration
       * 0005 rather than being locked out of their own dashboard. See the
       * header of that file for why that is not a shortcut.
       */
      requireEmailVerification: true,
      minPasswordLength: 8,

      /**
       * The reset link points at the APP, not at this Worker.
       *
       * Better Auth would happily hand out a link to its own endpoint, but the
       * person clicking it needs a form to type a new password into, and that
       * form is a screen in the app. The token rides in the query string and
       * `Account.tsx` posts it back to /reset-password.
       */
      sendResetPassword: async ({ user, token }) => {
        await sendResetEmail(env, user.email, user.name, `${appUrl(env)}/account?reset=${token}`);
      },
      // One hour. Long enough to find the email on a slow phone, short enough
      // that a forwarded or screenshotted link is not a standing key.
      resetPasswordTokenExpiresIn: 60 * 60,
    },

    /**
     * The link flow is still here, and is still what a "resend the link"
     * button would use. It is no longer what sign-up sends — see the emailOTP
     * plugin below, which overrides it with a six-digit code.
     */
    emailVerification: {
      sendOnSignUp: false,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60,
      sendVerificationEmail: async ({ user, token }) => {
        const back = encodeURIComponent(`${appUrl(env)}/account?verified=1`);
        await sendVerificationEmail(
          env,
          user.email,
          user.name,
          `${env.API_URL.replace(/\/$/, "")}/api/auth/verify-email?token=${token}&callbackURL=${back}`,
        );
      },
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
         * in practice one UPDATE, which is the right amount of friction for a
         * handful of Board members.
         */
        role: { type: "string", required: false, defaultValue: "visitor", input: false },
      },
    },

    /**
     * Throttling, stored in the database rather than memory.
     *
     * Better Auth's default rate limiter keeps counters in the instance's
     * memory. On Workers that is worthless: every request may land on a fresh
     * isolate in a different city, so an attacker gets a clean allowance each
     * time and the limit never bites. Putting the counters in the database is
     * what makes the number mean something.
     *
     * The custom rules matter more than the global one. Ten requests a minute
     * is generous for reading a session and far too generous for guessing a
     * password.
     */
    /**
     * Where the client's IP comes from.
     *
     * Without this Better Auth finds no trusted IP header and files every
     * request under one key — `no-trusted-ip|/sign-in/email`. The rate limit
     * then applies to *everyone at once*, so one person guessing passwords
     * locks the whole district out of signing in. Caught exactly that way in
     * testing.
     *
     * `cf-connecting-ip` is set by Cloudflare itself on every request and
     * cannot be spoofed by the client — an inbound copy is overwritten at the
     * edge. Trusting `x-forwarded-for` here instead would let an attacker
     * change one header per request and never be limited at all.
     */
    advanced: {
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
    },

    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 30,
      customRules: {
        "/sign-in/email": { window: 300, max: 8 },
        "/sign-up/email": { window: 3600, max: 5 },
        "/change-password": { window: 300, max: 5 },
      },
    },

    session: {
      // A visitor plans a trip over weeks, not minutes, and being logged out
      // between the planning and the going is the whole value gone.
      expiresIn: 60 * 60 * 24 * 90,
      updateAge: 60 * 60 * 24,
    },

    plugins: [
      bearer(),

      /**
       * Six digits instead of a link, for confirming an address.
       *
       * Two reasons, and the second is the one that decided it.
       *
       * A code suits the readers: it can be read out over a phone call to
       * someone who cannot find the email app, and it is typed on the screen
       * they are already looking at rather than bouncing them through a
       * browser that may open the wrong app.
       *
       * And it can be tested without a working mailbox. The OTP is a row in
       * `verification` — identifier `email-verification-otp-<address>` — so
       * while the sending domain is still not onboarded, the code can be read
       * straight out of Neon and typed in. A link cannot be tested that way
       * without reading the Worker's log. `npm run otp <email>` prints it.
       *
       * `sendVerificationOnSignUp` is the plugin's own hook, and it is what
       * sends the code. It is deliberately NOT paired with
       * `overrideDefaultEmailVerification` — the two are mutually exclusive,
       * and setting both is how this shipped broken for twenty minutes: the
       * plugin's hook reads
       *
       *     sendVerificationOnSignUp && !opts.overrideDefaultEmailVerification
       *
       * so with both true nothing fires at all. Sign-up returned 200, no
       * email was attempted, and `verification` stayed empty. Nothing warns.
       *
       * With the override off, the core link flow above stays a separate,
       * working path — `sendOnSignUp: false` keeps it quiet, and it is there
       * for an "email me a link instead" the day anyone wants one.
       */
      emailOTP({
        otpLength: 6,
        expiresIn: 60 * 10,
        // Three wrong guesses and the code is dead. Six digits is a million
        // combinations, but a code that never gives up is a code an attacker
        // can grind at leisure while the person who asked for it is asleep.
        allowedAttempts: 3,
        sendVerificationOnSignUp: true,
        // Stored as written, not hashed, so it can be read out of the
        // `verification` table while there is no working mailbox — which is
        // the reason a code exists here at all today. `npm run otp` prints it.
        // Turn this to "hashed" once mail is actually being delivered: a plain
        // OTP is a live credential sitting in a row anyone with database
        // access can read.
        storeOTP: "plain",
        sendVerificationOTP: async ({ email, otp }) => {
          await sendOtpEmail(env, email, otp);
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof makeAuth>;

/**
 * A module-level instance for the Better Auth CLI only.
 *
 * `npx @better-auth/cli generate --config src/auth.ts` imports this file to
 * learn the schema, introspecting the database first so it emits only the
 * tables that are missing.
 *
 * Under D1 this was pointed at a hand-written stub that answered "no tables",
 * because there was no way to reach a database from a Node CLI without a
 * binding. Postgres has a URL, so it is pointed at the real one: the schema
 * the CLI generates is then the schema this database actually needs, which is
 * the whole point of introspecting. `Pool` does not connect until something
 * queries it, so importing this file in the Worker — where NEON_DB_URL is not
 * in `process.env` — costs nothing and connects to nothing.
 *
 * Never used to serve a request.
 */
// This file's tsconfig types the Worker runtime, which has no `process` — and
// deliberately so, to stop Worker code reaching for environment variables that
// will not exist at runtime. The line below is the one place in this file that
// runs under Node instead.
declare const process: { env: Record<string, string | undefined> };

export const auth = makeAuth({
  NEON_DB_URL: process.env.NEON_DB_URL ?? "",
  AUTH_SECRET: "cli-only-not-a-real-secret",
  API_URL: "http://localhost:8787",
  APP_URL: "http://localhost:5173",
} as Env);
