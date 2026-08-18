// Is the sending domain verified yet, and if not, what is missing?
//
//   npm run email:status              show the domain and its DNS records
//   npm run email:status -- --verify  ask Resend to re-check DNS now
//   npm run email:status -- you@example.org   send a real test email
//
// Exists because "the email did not arrive" has four possible causes — wrong
// key, unverified domain, a DNS record that has not propagated, a suppressed
// recipient — and the Resend dashboard is one more tab to have open. This
// prints the answer next to the records that produce it.
//
// It lives here rather than in the Worker on purpose: nothing about sending
// mail should require a deploy to diagnose.
const key = process.env.RESEND_API_KEY;
if (!key) {
  console.error("RESEND_API_KEY is not set. It lives in apps/api/.env — see docs/15.");
  process.exit(1);
}

const api = async (path, init) => {
  const res = await fetch("https://api.resend.com" + path, {
    ...init,
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`resend ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  return body;
};

const arg = process.argv[2]?.trim();

const { data: domains } = await api("/domains");
if (!domains?.length) {
  console.error("No domains on this Resend account. Add one at resend.com/domains first.");
  process.exit(1);
}

// One domain today. If that ever stops being true, the one that matters is
// whichever EMAIL_FROM points at.
const wanted = (process.env.EMAIL_FROM || "").split("@")[1];
const domain = domains.find((d) => d.name === wanted) ?? domains[0];

if (arg === "--verify") {
  await api(`/domains/${domain.id}/verify`, { method: "POST" });
  console.log(`Asked Resend to re-check ${domain.name}. Run again in a minute.\n`);
}

const full = await api(`/domains/${domain.id}`);
const ok = full.status === "verified";

console.log(`${domain.name}   ${full.status.toUpperCase()}   (${full.region})`);
if (wanted && wanted !== domain.name)
  console.log(`  ⚠ EMAIL_FROM is @${wanted}, which is not this domain — mail will be refused.`);
console.log();

for (const r of full.records) {
  const mark = r.status === "verified" ? "✓" : "·";
  console.log(`${mark} ${r.type.padEnd(4)} ${r.name}`);
  console.log(`     ${r.value}${r.priority ? `   (priority ${r.priority})` : ""}`);
}

if (!ok) {
  console.log(`\nNot verified yet. Add the records above at whoever hosts the DNS,`);
  console.log(`then: npm run email:status -- --verify`);
  process.exit(1);
}

// Verified — offer the only check that actually proves it end to end.
if (arg && arg !== "--verify") {
  const from = process.env.EMAIL_FROM || `noreply@${domain.name}`;
  const name = process.env.EMAIL_NAME || "Kurukshetra Saarthi";
  const sent = await api("/emails", {
    method: "POST",
    body: JSON.stringify({
      from: `${name} <${from}>`,
      to: [arg],
      subject: "Test from Kurukshetra Saarthi",
      text: "If you are reading this, the sending domain works and the app can send email.",
    }),
  });
  console.log(`\nSent to ${arg}. id ${sent.id}`);
} else {
  console.log(`\nVerified. Send a real one:  npm run email:status -- you@example.org`);
}
