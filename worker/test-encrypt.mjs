/**
 * Check the aes128gcm encryption against RFC 8291's worked example.
 *
 * §5 of the RFC fixes every input — the plaintext, both key pairs, the auth
 * secret and the salt — and prints the exact body a correct implementation
 * produces. That makes this the one part of the push path that can be proven
 * right without a browser, a subscription or a network.
 *
 * Run: node worker/test-encrypt.mjs
 */
import assert from "node:assert/strict";
// node 20+ already exposes a global Web Crypto; the Worker has the same API
const webcrypto = globalThis.crypto;

const b64 = (s) => {
  const t = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return new Uint8Array(Buffer.from(t, "base64"));
};
const b64url = (b) => Buffer.from(b).toString("base64url");

/* ---- RFC 8291 §5 ---- */
const PLAINTEXT = "When I grow up, I want to be a watermelon";
const UA_PUBLIC = "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4";
const AUTH_SECRET = "BTBZMqHH6r4Tts7J_aSIgg";
const AS_PUBLIC = "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8";
const AS_PRIVATE = "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw";
const SALT = "DGv6ra1nlYgDCS1FRnbzlw";
const EXPECTED =
  "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml" +
  "mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT" +
  "pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN";

const { encrypt } = await import("./src/push.ts");

// the ephemeral private key, as a JWK built from the RFC's scalar + point
const pub = b64(AS_PUBLIC);
const key = await webcrypto.subtle.importKey(
  "jwk",
  {
    kty: "EC",
    crv: "P-256",
    d: b64url(b64(AS_PRIVATE)),
    x: b64url(pub.slice(1, 33)),
    y: b64url(pub.slice(33, 65)),
    ext: true,
  },
  { name: "ECDH", namedCurve: "P-256" },
  false,
  ["deriveBits"],
);

const out = await encrypt(
  new TextEncoder().encode(PLAINTEXT),
  b64(UA_PUBLIC),
  b64(AUTH_SECRET),
  b64(SALT),
  key,
  pub,
);

const got = Buffer.from(out).toString("base64url");
assert.equal(got, EXPECTED, `\n  expected ${EXPECTED}\n  got      ${got}`);
console.log("push encryption matches RFC 8291 §5 test vector");
