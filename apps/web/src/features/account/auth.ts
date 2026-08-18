import { bump } from "@/app/state";

/**
 * The account, client side.
 *
 * Hand-written against Better Auth's HTTP endpoints rather than its React
 * client. The library ships its own store and hooks, and this app already has
 * a state model — module state plus `bump()` — that every other feature uses.
 * Adding a second one to save forty lines would leave two ideas of "current
 * state" in an app that deliberately has one. The endpoints are plain JSON.
 *
 * ── The token ──────────────────────────────────────────────────────────────
 *
 * The session is a bearer token in localStorage, not a cookie, because the app
 * and the Worker are on different *sites* and Safari blocks third-party
 * cookies outright. See apps/api/src/auth.ts for the full reasoning.
 *
 * localStorage is readable by any script on the origin, so this is only
 * acceptable while the app ships no third-party scripts and the token unlocks
 * nothing but saved itineraries. Both remain true; if either stops being true
 * this needs revisiting — which is why it is written down here.
 */

const BASE = (import.meta.env?.VITE_CONTENT_URL || "").replace(/\/$/, "");
const TOKEN_KEY = "k_auth";

export interface User {
  id: string;
  email: string;
  name: string;
  role?: string;
}

/** null = signed out. undefined = not asked yet, so the UI can stay quiet. */
let user: User | null | undefined = undefined;

export const currentUser = () => user;
/**
 * Admin, according to the server's allow-list — not the `role` column, which
 * is no longer the authority (docs/15). This only decides whether to SHOW the
 * "Manage content" link; the Worker checks the same list on every request, so
 * faking it here buys nothing but a link that 403s.
 */
export const isAdmin = () => !!user && admins.includes(user.email.toLowerCase());
/** True once we know one way or the other — before that, render nothing. */
export const sessionKnown = () => user !== undefined;

const token = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY) || "";
    } catch {
      return ""; // private mode
    }
  },
  set: (v: string) => {
    try {
      v ? localStorage.setItem(TOKEN_KEY, v) : localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* private mode: the session lasts this tab and no longer */
    }
  },
};

/** The Authorization header, or nothing. Exported for the plan sync to reuse. */
export function authHeaders(): Record<string, string> {
  const t = token.get();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export const signedIn = () => !!token.get();

async function call(path: string, body?: unknown): Promise<Response> {
  return fetch(`${BASE}/api/auth/${path}`, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json", ...authHeaders() },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

/** Better Auth returns the new token in a header on sign-in and sign-up. */
function keepToken(res: Response) {
  const t = res.headers.get("set-auth-token");
  if (t) token.set(t);
}

/**
 * What the server says the session is. Called once at boot.
 *
 * A network failure leaves the app signed OUT rather than guessing from the
 * presence of a token: showing someone their name and an empty saved list
 * because the server could not be reached is worse than showing a sign-in
 * button. Offline is the normal case here, so this must not throw.
 */
export async function loadSession(): Promise<void> {
  if (!BASE || !token.get()) {
    user = null;
    bump();
    return;
  }
  try {
    const res = await call("get-session");
    const data = res.ok ? ((await res.json()) as { user?: User } | null) : null;
    user = data?.user ?? null;
    // A token the server no longer honours is dead weight that would make
    // every later request 401. Drop it.
    if (!user) token.set("");
  } catch {
    user = null;
  }
  bump();
}

/** Returns an error message for the UI, or null on success. */
async function submit(path: string, body: unknown): Promise<string | null> {
  if (!BASE) return "This build has no server configured.";
  try {
    const res = await call(path, body);
    // Throttled. Distinguished from a wrong password because the reader needs
    // to know that waiting helps and trying harder does not.
    if (res.status === 429) return "rate";
    if (!res.ok) {
      const e = (await res.json().catch(() => null)) as { message?: string; code?: string } | null;
      // Signalled rather than shown. "Email not verified" is a true sentence
      // and a useless one — what the reader needs is the box the code goes in,
      // so the caller routes them there instead of printing this.
      if (e?.code === "EMAIL_NOT_VERIFIED") return "unverified";
      return e?.message || "That did not work. Please check and try again.";
    }
    keepToken(res);
    const data = (await res.json()) as { user?: User };
    user = data.user ?? null;
    bump();
    return null;
  } catch {
    // Distinguished from a rejected password on purpose: "wrong password" and
    // "you are in a tunnel" need different reactions from the person reading it.
    return "No connection. Try again when you are back online.";
  }
}

export const signUp = (email: string, password: string, name: string) =>
  submit("sign-up/email", { email, password, name });

export const signIn = (email: string, password: string) => submit("sign-in/email", { email, password });

/**
 * Sign out locally even if the server cannot be told.
 *
 * Someone tapping "sign out" on a shared or borrowed phone must end up signed
 * out. Making that depend on a request succeeding would mean a dead signal
 * leaves them logged in — the one failure mode this button exists to prevent.
 */
export async function signOut(): Promise<void> {
  const had = token.get();
  token.set("");
  user = null;
  bump();
  if (had && BASE) {
    try {
      await fetch(`${BASE}/api/auth/sign-out`, {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${had}` },
      });
    } catch {
      /* already signed out here; the session expires on its own */
    }
  }
}

/* ---- what this deployment can do ---------------------------------------- */

/**
 * Whether Google sign-in is actually usable.
 *
 * This has to come from the server. The credentials are Worker secrets, so the
 * bundle cannot know, and the first version of this file guessed "yes,
 * whenever a server exists" — which rendered a Google button on a deployment
 * with no Google credentials. It looked correct and failed at Google.
 *
 * undefined = not asked yet, and the button stays hidden until we know.
 */
let googleReady: boolean | undefined = undefined;
let admins: string[] = [];
export const canUseGoogle = () => googleReady === true;

export async function loadConfig(): Promise<void> {
  if (!BASE) {
    googleReady = false;
    return;
  }
  try {
    const r = await fetch(`${BASE}/config`);
    const c = r.ok ? ((await r.json()) as { google?: boolean; admins?: string[] }) : null;
    googleReady = !!c?.google;
    admins = (c?.admins || []).map((e) => e.toLowerCase());
  } catch {
    googleReady = false; // offline: hide it rather than offer a dead button
  }
  bump();
}

/**
 * Where Google sign-in sends the browser.
 *
 * `callbackURL` is where Better Auth returns to after Google. It must be an
 * origin the Worker trusts (APP_URL), which is why it is not `location.href` —
 * on a preview deployment that would be an untrusted origin and the callback
 * would be rejected after the user had already signed in at Google.
 */
export const googleUrl = (): string =>
  BASE ? `${BASE}/api/auth/sign-in/social?provider=google&callbackURL=${encodeURIComponent(location.origin + location.pathname + "#/account")}` : "";

/* ---- confirming an address ----------------------------------------------- */

/**
 * Ask for a fresh six-digit code.
 *
 * Sign-up sends one on its own; this is the "I never got it" button, which is
 * the single most-needed control in any flow that depends on someone else's
 * mail server.
 */
export async function sendVerificationOtp(email: string): Promise<string | null> {
  if (!BASE) return "This build has no server configured.";
  try {
    const res = await fetch(`${BASE}/api/auth/email-otp/send-verification-otp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, type: "email-verification" }),
    });
    if (res.status === 429) return "rate";
    if (!res.ok) return "That did not work. Please check and try again.";
    return null;
  } catch {
    return "No connection. Try again when you are back online.";
  }
}

/**
 * Hand the code back. Three wrong guesses and the code is dead, not the
 * account — the person asks for another one.
 *
 * Better Auth signs the session in on success, so a token may come back; if it
 * does it is kept and the caller can go straight to the app.
 */
export async function verifyEmailOtp(email: string, otp: string): Promise<string | null> {
  if (!BASE) return "This build has no server configured.";
  try {
    const res = await fetch(`${BASE}/api/auth/email-otp/verify-email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, otp }),
    });
    if (res.status === 429) return "rate";
    if (!res.ok) {
      const e = (await res.json().catch(() => null)) as { message?: string } | null;
      return e?.message || "That code is wrong or has expired. Ask for a new one.";
    }
    keepToken(res);
    const data = (await res.json().catch(() => ({}))) as { user?: User };
    if (data.user) {
      user = data.user;
      bump();
    }
    return null;
  } catch {
    return "No connection. Try again when you are back online.";
  }
}

/* ---- forgetting a password ---------------------------------------------- */

/**
 * Ask for a reset link. Answers the same way whether or not the address exists.
 *
 * That sameness is the security property, and it is worth stating because it
 * reads like sloppiness: replying "no such account" to an unknown address
 * turns this form into a way of asking whether someone has an account here.
 * The server behaves the same way; this only has to avoid undoing it by
 * reporting a difference the server took care not to reveal.
 */
export async function requestPasswordReset(email: string): Promise<string | null> {
  if (!BASE) return "This build has no server configured.";
  try {
    const res = await fetch(`${BASE}/api/auth/request-password-reset`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (res.status === 429) return "rate";
    // Anything else — including "unknown address" — is reported as sent.
    return null;
  } catch {
    return "No connection. Try again when you are back online.";
  }
}

/**
 * Finish the reset, with the token out of the emailed link.
 *
 * Deliberately does NOT sign the person in afterwards. They have just proved
 * they can read the mailbox, not that they are at their own phone — the link
 * may have been opened on a borrowed laptop. They type the new password once
 * more on the sign-in screen, which is one step and closes that gap.
 */
export async function resetPassword(token: string, newPassword: string): Promise<string | null> {
  if (!BASE) return "This build has no server configured.";
  try {
    const res = await fetch(`${BASE}/api/auth/reset-password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, newPassword }),
    });
    if (res.status === 429) return "rate";
    if (!res.ok) {
      const e = (await res.json().catch(() => null)) as { message?: string } | null;
      // The common failure is a link that was used already or has expired, and
      // "invalid token" tells a reader nothing about what to do next.
      return e?.message || "That link has expired or has already been used. Ask for a new one.";
    }
    return null;
  } catch {
    return "No connection. Try again when you are back online.";
  }
}

/* ---- changing a password ------------------------------------------------ */

/**
 * Requires the current password, deliberately.
 *
 * A signed-in session on an unattended phone should not be enough to lock the
 * real owner out of their own account.
 */
export async function changePassword(currentPassword: string, newPassword: string): Promise<string | null> {
  if (!BASE) return "This build has no server configured.";
  try {
    const res = await fetch(`${BASE}/api/auth/change-password`, {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify({ currentPassword, newPassword, revokeOtherSessions: true }),
    });
    if (res.status === 429) return "rate";
    if (!res.ok) {
      const e = (await res.json().catch(() => null)) as { message?: string } | null;
      return e?.message || "That did not work. Please check and try again.";
    }
    // revokeOtherSessions invalidates every other device, which is the point of
    // changing a password. This device gets a fresh token to stay signed in.
    keepToken(res);
    return null;
  } catch {
    return "No connection. Try again when you are back online.";
  }
}
