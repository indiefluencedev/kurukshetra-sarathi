import type { Env } from "./index";
import type { SubRow } from "./store";

/**
 * Web Push, on Web Crypto.
 *
 * The usual `web-push` npm package is Node-only — it wants `crypto.createECDH`
 * and Buffer — so none of it runs on a Worker. This is RFC 8291 (message
 * encryption) over RFC 8188 (aes128gcm) with an RFC 8292 VAPID token, written
 * against the Web Crypto API that Workers do have.
 *
 * `encrypt` takes the salt and the ephemeral key as arguments rather than
 * generating them internally. That is not for flexibility — it is so the
 * implementation can be run against RFC 8291's published test vector, which
 * fixes both. Crypto that has never been checked against a known answer is
 * crypto that silently produces garbage the far end discards, and a push that
 * is never delivered looks exactly like a push nobody sent.
 */

const b64urlToBytes = (s: string): Uint8Array => {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const bytesToB64url = (b: Uint8Array): string => {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const cat = (...parts: Uint8Array[]): Uint8Array => {
  const n = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(n);
  let i = 0;
  for (const p of parts) {
    out.set(p, i);
    i += p.length;
  }
  return out;
};

const utf8 = (s: string) => new TextEncoder().encode(s);

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, len * 8);
  return new Uint8Array(bits);
}

/** Import an uncompressed P-256 public key (0x04 || X || Y). */
const importPub = (raw: Uint8Array) =>
  crypto.subtle.importKey("raw", raw, { name: "ECDH", namedCurve: "P-256" }, true, []);

/**
 * Encrypt `plaintext` for one subscriber. Returns the aes128gcm body.
 *
 * Exported for the test vector; `sendPush` is what the Worker calls.
 */
export async function encrypt(
  plaintext: Uint8Array,
  uaPublicRaw: Uint8Array,
  authSecret: Uint8Array,
  salt: Uint8Array,
  asPrivate: CryptoKey,
  asPublicRaw: Uint8Array,
): Promise<Uint8Array> {
  const uaPub = await importPub(uaPublicRaw);
  const sharedBits = await crypto.subtle.deriveBits({ name: "ECDH", public: uaPub }, asPrivate, 256);
  const shared = new Uint8Array(sharedBits);

  // RFC 8291 §3.3 — the key-combining step that binds the message to this
  // subscription. The info string carries both public keys, which is what stops
  // a message encrypted for one browser being replayable at another.
  const prk = await hkdf(authSecret, shared, cat(utf8("WebPush: info\0"), uaPublicRaw, asPublicRaw), 32);
  const cek = await hkdf(salt, prk, utf8("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, prk, utf8("Content-Encoding: nonce\0"), 12);

  // RFC 8188 padding delimiter: 0x02 marks the last (and here only) record.
  const padded = cat(plaintext, new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, aesKey, padded),
  );

  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return cat(salt, rs, new Uint8Array([asPublicRaw.length]), asPublicRaw, ct);
}

/** ES256 JWT for the VAPID Authorization header (RFC 8292). */
async function vapidToken(env: Env, audience: string): Promise<string> {
  const header = bytesToB64url(utf8(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = bytesToB64url(
    utf8(
      JSON.stringify({
        aud: audience,
        exp: Math.floor(Date.now() / 1000) + 12 * 3600,
        sub: env.VAPID_SUBJECT,
      }),
    ),
  );
  const signingInput = `${header}.${claims}`;

  // The private key is the raw 32-byte scalar, base64url — what web-push's
  // keygen prints. Web Crypto wants a JWK, so it is assembled from the scalar
  // plus the public point.
  const d = b64urlToBytes(env.VAPID_PRIVATE);
  const pub = b64urlToBytes(env.VAPID_PUBLIC);
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    d: bytesToB64url(d),
    x: bytesToB64url(pub.slice(1, 33)),
    y: bytesToB64url(pub.slice(33, 65)),
    ext: true,
  };
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, utf8(signingInput)),
  );
  return `${signingInput}.${bytesToB64url(sig)}`;
}

export type PushResult = "sent" | "gone" | "failed";

/** Encrypt and POST one notification. Never throws — the cron must survive. */
export async function sendPush(env: Env, sub: SubRow, payload: unknown): Promise<PushResult> {
  try {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const pair = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
      "deriveBits",
    ])) as CryptoKeyPair;
    const asPublicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));

    const body = await encrypt(
      utf8(JSON.stringify(payload)),
      b64urlToBytes(sub.p256dh),
      b64urlToBytes(sub.auth),
      salt,
      pair.privateKey,
      asPublicRaw,
    );

    const u = new URL(sub.endpoint);
    const res = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        Authorization: `vapid t=${await vapidToken(env, u.origin)}, k=${env.VAPID_PUBLIC}`,
        "content-encoding": "aes128gcm",
        "content-type": "application/octet-stream",
        TTL: "1800", // an event that started half an hour ago is not news
      },
      body,
    });
    if (res.status === 404 || res.status === 410) return "gone";
    return res.ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}
