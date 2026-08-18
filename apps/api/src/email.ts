import type { Env } from "./index";

/**
 * The emails this app sends, and the only place it sends any.
 *
 * ── Changing where mail comes from, and who sends it ───────────────────────
 *
 * Both are environment variables. Nothing about a provider is compiled in:
 *
 *   EMAIL_FROM      noreply@brainybeans.space          the From address
 *   EMAIL_NAME      Kurukshetra Saarthi                 the display name
 *   EMAIL_PROVIDER  cloudflare | resend | log           who carries it
 *   RESEND_API_KEY  secret, only read when provider=resend
 *
 * `cloudflare` uses the `EMAIL` binding — same account as the Worker, no API
 * key, nothing to rotate, but the domain must be onboarded once with
 * `wrangler email sending enable <domain>`.
 *
 * `resend` is one `fetch`. Switching to it is setting two variables and a
 * secret; no code changes and no deploy of anything but config. That is
 * deliberate — Resend is where this is going, and a provider swap should not
 * be a rewrite.
 *
 * `log` sends nothing and prints the body. It is what a machine with no
 * credentials should do, and it is the honest default for someone running this
 * for the first time.
 *
 * The templates below know none of this. `deliver()` is the only function that
 * has heard of a provider.
 *
 * ── Both languages in one email ────────────────────────────────────────────
 *
 * The app knows whether you are reading it in English or Hindi. Better Auth
 * does not — it hands us a user row, and there is no language on it. Rather
 * than add a column, guess from a header we do not have, or default everyone
 * to English, each email carries both: English first, Hindi under it. It costs
 * a few hundred bytes and it is correct for every reader, which is the trade
 * this audience deserves. Put a `lang` on the user and split these if the
 * doubled length ever becomes the complaint.
 *
 * ── Why plain HTML and no template engine ──────────────────────────────────
 *
 * Two emails. A template engine would be more code than the templates.
 */

/**
 * Who the mail is from.
 *
 * Under the Cloudflare provider this must match `allowed_sender_addresses` in
 * wrangler.toml, and its domain must be onboarded to Email Sending. Under
 * Resend the domain must be verified there instead. Either way it is one
 * variable, changed without touching this file.
 */
const from = (env: Env) => ({
  email: (env.EMAIL_FROM || "noreply@brainybeans.space").trim(),
  name: (env.EMAIL_NAME || "Kurukshetra Saarthi").trim(),
});

/**
 * The app's canonical origin.
 *
 * `APP_URL` is a comma-separated list, because development serves the app from
 * both localhost and a LAN address (see auth.ts). A link in an email has to be
 * one URL, so it is the first — production sets exactly one, and in
 * development the first is whichever address `npm run dev` started with, which
 * is the one you are looking at.
 */
export const appUrl = (env: Env): string =>
  (env.APP_URL.split(",")[0] ?? "").trim().replace(/\/$/, "");

/**
 * HTML-escape. Everything interpolated below is a name or a URL that came from
 * a user or a token, and an email body is markup like any other.
 */
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** One button, one paragraph each language, and the raw link underneath. */
function layout(o: {
  heading: string;
  headingHi: string;
  body: string;
  bodyHi: string;
  action: string;
  actionHi: string;
  url: string;
  footer: string;
  footerHi: string;
}) {
  const url = esc(o.url);
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#F2ECDD;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#1C1815">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="100%" style="max-width:520px;background:#FDFBF4;border:1px solid #DDD3BC;border-radius:12px" cellpadding="0" cellspacing="0">
      <tr><td style="padding:28px 28px 8px">
        <div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#6B6252">Kurukshetra Saarthi</div>
        <h1 style="margin:10px 0 0;font-size:21px;line-height:1.3">${esc(o.heading)}</h1>
        <div style="margin:4px 0 0;font-size:17px;line-height:1.5;color:#40382E">${esc(o.headingHi)}</div>
      </td></tr>
      <tr><td style="padding:12px 28px 0;font-size:15px;line-height:1.6;color:#40382E">
        <p style="margin:0 0 6px">${esc(o.body)}</p>
        <p style="margin:0">${esc(o.bodyHi)}</p>
      </td></tr>
      <tr><td style="padding:22px 28px 6px">
        <a href="${url}" style="display:inline-block;padding:13px 22px;background:#D2600A;color:#fff;text-decoration:none;border-radius:8px;font-size:16px;font-weight:600">${esc(o.action)} · ${esc(o.actionHi)}</a>
      </td></tr>
      <tr><td style="padding:14px 28px 0;font-size:12px;line-height:1.6;color:#6B6252;word-break:break-all">
        If the button does not work, copy this link into your browser:<br><a href="${url}" style="color:#A34A05">${url}</a>
      </td></tr>
      <tr><td style="padding:18px 28px 28px;font-size:12px;line-height:1.6;color:#6B6252;border-top:1px solid #DDD3BC;margin-top:12px">
        ${esc(o.footer)}<br>${esc(o.footerHi)}
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

/**
 * Send, and never let a failure take the request down with it.
 *
 * Every caller is a Better Auth hook running inside sign-up or a reset
 * request. If this throws, Better Auth fails the whole operation — so a user
 * whose mail provider is having a bad afternoon cannot create an account at
 * all. The account is worth more than the email, so the error is logged and
 * swallowed, and the person can ask for another link.
 *
 * The one thing that must not be swallowed silently is a misconfiguration, so
 * the log line names the code — `E_SENDER_NOT_VERIFIED` means the domain was
 * never onboarded, and it will be every send, not one.
 */
async function send(env: Env, to: string, subject: string, html: string, text: string) {
  try {
    await deliver(env, to, subject, html, text);
  } catch (e) {
    const err = e as { code?: string; message?: string };
    console.error(`email to ${to} failed: ${err.code ?? "?"} ${err.message ?? String(e)}`);
  }
}

/**
 * The one function that knows who carries the mail.
 *
 * Throws on failure; `send()` above is what decides that a failure is not
 * fatal. Keeping those separate means a future caller that *does* need to know
 * whether an email went out can use this directly.
 */
async function deliver(env: Env, to: string, subject: string, html: string, text: string) {
  const f = from(env);
  const provider = (env.EMAIL_PROVIDER || "cloudflare").trim().toLowerCase();

  if (provider === "log") {
    console.log(`[email:log] to=${to} from=${f.email} subject=${subject}\n${text}`);
    return;
  }

  if (provider === "resend") {
    if (!env.RESEND_API_KEY) throw new Error("EMAIL_PROVIDER=resend but RESEND_API_KEY is not set");
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: `${f.name} <${f.email}>`, to: [to], subject, html, text }),
    });
    // Resend answers 4xx with a JSON body naming the problem — usually an
    // unverified domain. Surfacing it beats "request failed".
    if (!res.ok) throw new Error(`resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return;
  }

  if (provider !== "cloudflare") throw new Error(`unknown EMAIL_PROVIDER: ${provider}`);
  await env.EMAIL.send({ to, from: f, subject, html, text });
}

export async function sendVerificationEmail(env: Env, to: string, name: string, url: string) {
  const who = name?.trim() ? `${name.trim()}, ` : "";
  await send(
    env,
    to,
    "Confirm your email · अपना ईमेल पक्का करें",
    layout({
      heading: "Confirm your email address",
      headingHi: "अपना ईमेल पता पक्का करें",
      body: `${who}someone signed up for Kurukshetra Saarthi with this address. Tap below to confirm it is you. The link works once, and expires in an hour.`,
      bodyHi:
        "किसी ने इस पते से कुरुक्षेत्र सारथी पर खाता बनाया है। पक्का करने के लिए नीचे दबाएँ। यह लिंक एक बार चलेगा और एक घंटे में खत्म हो जाएगा।",
      action: "Confirm email",
      actionHi: "पक्का करें",
      url,
      footer: "If you did not sign up, ignore this email — no account is created until the link is used.",
      footerHi: "अगर आपने खाता नहीं बनाया, तो इस ईमेल को छोड़ दें।",
    }),
    `Confirm your email for Kurukshetra Saarthi:\n${url}\n\nThe link works once and expires in an hour. If you did not sign up, ignore this email.\n\nकुरुक्षेत्र सारथी के लिए अपना ईमेल पक्का करें — ऊपर दिया लिंक खोलें।`,
  );
}

/**
 * The six digits, for confirming an address.
 *
 * A code rather than a link, because a code can be read out, typed on the
 * phone that is already open at the sign-in screen, and — the reason it exists
 * today — looked up straight out of the `verification` table while the sending
 * domain is still not onboarded. A link cannot be tested without a mailbox.
 *
 * The code is the whole message, so it is set large and spaced. Everything
 * else on the screen of someone reading this is noise.
 */
export async function sendOtpEmail(env: Env, to: string, otp: string) {
  const digits = esc(otp);
  await send(
    env,
    to,
    `${otp} — confirm your email · अपना ईमेल पक्का करें`,
    `<!doctype html>
<html><body style="margin:0;padding:24px;background:#F2ECDD;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#1C1815">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="100%" style="max-width:520px;background:#FDFBF4;border:1px solid #DDD3BC;border-radius:12px" cellpadding="0" cellspacing="0">
      <tr><td style="padding:28px 28px 4px">
        <div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#6B6252">Kurukshetra Saarthi</div>
        <h1 style="margin:10px 0 0;font-size:21px;line-height:1.3">Your confirmation code</h1>
        <div style="margin:4px 0 0;font-size:17px;line-height:1.5;color:#40382E">आपका पुष्टि कोड</div>
      </td></tr>
      <tr><td align="center" style="padding:22px 28px 6px">
        <div style="display:inline-block;padding:14px 24px;background:#F7F1E3;border:1px solid #DDD3BC;border-radius:10px;font-size:34px;letter-spacing:.28em;font-weight:700;font-family:ui-monospace,SFMono-Regular,Menlo,monospace">${digits}</div>
      </td></tr>
      <tr><td style="padding:8px 28px 0;font-size:15px;line-height:1.6;color:#40382E">
        <p style="margin:0 0 6px">Type this on the sign-in screen to confirm your address. It expires in ten minutes and works once.</p>
        <p style="margin:0">साइन इन स्क्रीन पर यह कोड डालें। दस मिनट में खत्म हो जाएगा और एक बार चलेगा।</p>
      </td></tr>
      <tr><td style="padding:18px 28px 28px;font-size:12px;line-height:1.6;color:#6B6252">
        If you did not sign up, ignore this email — nobody can use this code but you.<br>अगर आपने खाता नहीं बनाया, तो इस ईमेल को छोड़ दें।
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`,
    `Your Kurukshetra Saarthi confirmation code is ${otp}\n\nType it on the sign-in screen. It expires in ten minutes and works once. If you did not sign up, ignore this email.\n\nआपका पुष्टि कोड: ${otp}`,
  );
}

export async function sendResetEmail(env: Env, to: string, name: string, url: string) {
  const who = name?.trim() ? `${name.trim()}, ` : "";
  await send(
    env,
    to,
    "Reset your password · पासवर्ड बदलें",
    layout({
      heading: "Reset your password",
      headingHi: "अपना पासवर्ड बदलें",
      body: `${who}we were asked to reset the password for this account. Tap below to choose a new one. The link works once, and expires in an hour.`,
      bodyHi:
        "इस खाते का पासवर्ड बदलने के लिए कहा गया है। नया पासवर्ड चुनने के लिए नीचे दबाएँ। यह लिंक एक बार चलेगा और एक घंटे में खत्म हो जाएगा।",
      action: "Choose a new password",
      actionHi: "नया पासवर्ड चुनें",
      url,
      footer:
        "If you did not ask for this, ignore this email. Your password has not changed and nobody can change it without this link.",
      footerHi: "अगर आपने यह नहीं माँगा, तो इस ईमेल को छोड़ दें। आपका पासवर्ड नहीं बदला है।",
    }),
    `Reset your Kurukshetra Saarthi password:\n${url}\n\nThe link works once and expires in an hour. If you did not ask for this, ignore this email — your password has not changed.\n\nअपना पासवर्ड बदलने के लिए ऊपर दिया लिंक खोलें।`,
  );
}
