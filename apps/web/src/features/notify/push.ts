import { S, bump } from "@/app/state";

/**
 * Asking to be told about events, and telling the Worker where to send it.
 *
 * ── Why there is a card before the browser prompt ──────────────────────────
 *
 * `Notification.requestPermission()` can be answered once. "Block" is
 * permanent from the page's side — there is no second chance and no way to ask
 * again, only a settings screen most people will never find. So firing it the
 * instant the app opens, before anyone knows what the app is, spends the one
 * question on a stranger.
 *
 * The card explains what the notifications are (a procession is starting, a
 * temple closed today) and only then hands over to the browser. Someone who
 * taps "Not now" can be asked again later; someone who taps "Block" cannot.
 */

const BASE = (import.meta.env?.VITE_CONTENT_URL || "").replace(/\/$/, "");
const ASKED = "k_push_asked";

export type PushState = "unsupported" | "default" | "granted" | "denied";

export function pushState(): PushState {
  if (typeof Notification === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window))
    return "unsupported";
  return Notification.permission as PushState;
}

/** Have we already put the card in front of them? */
export const alreadyAsked = (): boolean => {
  try {
    return localStorage.getItem(ASKED) === "1";
  } catch {
    return true; // private mode: never nag
  }
};

export function markAsked() {
  try {
    localStorage.setItem(ASKED, "1");
  } catch {
    /* nothing to remember it with; the card simply shows again */
  }
}

/**
 * Should the card be offered right now?
 *
 * Not on the very first screen — `S.lang` is only set once onboarding has been
 * answered, so this stays false until the visitor has at least chosen a
 * language and seen what the app is.
 */
export const shouldOffer = (): boolean => !!S.lang && !alreadyAsked() && pushState() === "default";

/**
 * VAPID keys travel as base64url; PushManager wants raw bytes.
 *
 * Returns an ArrayBuffer rather than a Uint8Array: `applicationServerKey` is
 * typed `BufferSource`, and a Uint8Array over a generic ArrayBufferLike no
 * longer satisfies that in current TypeScript lib types.
 */
function urlBase64ToBytes(base64: string): ArrayBuffer {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Ask, subscribe, and register with the Worker.
 *
 * Returns true only when the Worker has actually accepted the subscription —
 * permission alone means nothing if the endpoint never reached the server, and
 * telling someone they are subscribed when they are not is the worst outcome
 * here.
 */
export async function enablePush(): Promise<boolean> {
  markAsked();
  if (pushState() === "unsupported" || !BASE) return false;

  try {
    const permission = await Notification.requestPermission();
    bump(); // the card reflects the answer either way
    if (permission !== "granted") return false;

    // The key comes from the server because it is a Worker secret; the app
    // cannot have it baked in, and a wrong key produces a subscription the
    // server can never encrypt for.
    const cfg = await fetch(`${BASE}/config`).then((r) => (r.ok ? r.json() : null));
    const key = cfg?.vapidPublic;
    if (!key) return false;

    const reg = await navigator.serviceWorker.ready;
    // An existing subscription is reused rather than replaced. Re-subscribing
    // mints a new endpoint and leaves the old row in `subs` being pushed to
    // forever.
    const sub =
      (await reg.pushManager.getSubscription()) ||
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToBytes(key),
      }));

    const body = sub.toJSON() as { endpoint?: string; keys?: Record<string, string> };
    const res = await fetch(`${BASE}/subscribe`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // The language is stored with the subscription because the push is
      // composed on the server, hours later, with no session to ask.
      body: JSON.stringify({ ...body, lang: S.lang === "hi" ? "hi" : "en" }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Stop the notifications, on this device, and forget the endpoint server-side. */
export async function disablePush(): Promise<void> {
  if (pushState() === "unsupported" || !BASE) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    await fetch(`${BASE}/subscribe`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ endpoint }),
    });
  } catch {
    /* unsubscribed locally at worst; the Worker prunes dead endpoints on 404/410 */
  }
  bump();
}

/** Is this device actually subscribed? Used by Settings, which must not lie. */
export async function isSubscribed(): Promise<boolean> {
  if (pushState() !== "granted") return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    return !!(await reg.pushManager.getSubscription());
  } catch {
    return false;
  }
}
