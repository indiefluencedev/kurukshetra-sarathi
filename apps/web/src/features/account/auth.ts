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
export const isAdmin = () => user?.role === "admin";
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
    if (!res.ok) {
      const e = (await res.json().catch(() => null)) as { message?: string } | null;
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

/** Where Google sign-in sends the browser. Empty when it is not configured. */
export const googleUrl = (): string =>
  BASE ? `${BASE}/api/auth/sign-in/social?provider=google&callbackURL=${encodeURIComponent(location.href)}` : "";
