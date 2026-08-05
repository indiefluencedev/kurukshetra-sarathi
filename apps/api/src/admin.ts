/**
 * The dashboard, as one self-contained HTML string.
 *
 * No build step, no framework, no bundle — it is served straight from the
 * Worker. That is a deliberate limit: this page is used a few times a month by
 * a handful of people on an office desktop, and giving it its own toolchain
 * would mean a second thing to build, deploy and keep in step with the Worker
 * it talks to.
 *
 * Written for people who do not write software. Every field says what it is
 * for in words, the two factors have plain-language explanations rather than
 * "1.0–3.0", and the form refuses to submit rather than saving something the
 * app cannot render — the server validates again regardless, using the same
 * rules as the build-time check.
 */
import { FORMS_CSS, FORMS_HTML, FORMS_JS } from "./admin-forms";

export const ADMIN_HTML = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Kurukshetra Saarthi — dashboard</title>
<style>
 :root{--ink:#1C1815;--muted:#6B6252;--line:#DDD3BC;--paper:#FDFBF4;--bg:#F2ECDD;
       --accent:#D2600A;--accent-d:#A34A05;--bad:#9A3B1E;--ok:#4F5B2E}
 *{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--ink);
   font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
 header{background:var(--paper);border-bottom:1px solid var(--line);padding:14px 20px;
   display:flex;align-items:center;gap:14px;position:sticky;top:0;z-index:5}
 header h1{font-size:18px;margin:0;flex:1} header .you{color:var(--muted);font-size:13px}
 main{max-width:1020px;margin:0 auto;padding:20px;display:grid;gap:20px;grid-template-columns:1fr 1fr}
 @media(max-width:860px){main{grid-template-columns:1fr}}
 section{background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:16px}
 h2{font-size:15px;margin:0 0 12px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
 label{display:block;margin:11px 0 0;font-size:13px;font-weight:700}
 label .hint{display:block;font-weight:400;color:var(--muted);font-size:12px;margin-top:2px}
 input,select,textarea{width:100%;padding:9px 10px;border:1px solid var(--line);border-radius:8px;
   font:inherit;font-size:14px;background:#fff;margin-top:4px}
 textarea{min-height:60px;resize:vertical}
 .row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
 button{font:inherit;font-weight:700;border:0;border-radius:8px;padding:10px 16px;cursor:pointer}
 .primary{background:var(--accent);color:#fff} .primary:hover{background:var(--accent-d)}
 .ghost{background:#fff;border:1px solid var(--line);color:var(--ink)}
 .danger{background:#fff;border:1px solid var(--bad);color:var(--bad)}
 .bar{display:flex;gap:8px;margin-top:16px;flex-wrap:wrap}
 ul{list-style:none;margin:0;padding:0} li{border-bottom:1px solid var(--line);padding:10px 0}
 li:last-child{border-bottom:0} li b{display:block} li span{color:var(--muted);font-size:13px}
 li .acts{margin-top:6px;display:flex;gap:6px}
 li button{padding:5px 10px;font-size:13px}
 .msg{margin-top:12px;padding:10px 12px;border-radius:8px;font-size:14px;white-space:pre-wrap}
 .msg.bad{background:#F9EAE3;color:var(--bad)} .msg.good{background:#EFF1DF;color:var(--ok)}
 .pill{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;
   background:#EFF1DF;color:var(--ok);border-radius:99px;padding:2px 8px;margin-left:6px}
 .pill.ov{background:#F9EAE3;color:var(--bad)}
 .aud{font-size:12px;color:var(--muted);max-height:220px;overflow:auto}
 /* Must come before anything that sets a display value. The gate is
    display:grid, and an AUTHOR rule beats the user-agent's
    [hidden]{display:none} — so setting .hidden on the gate set the attribute
    and changed nothing on screen. The
    dashboard was rendering underneath, covered by a full-screen overlay still
    reading "Signing in…", with no error anywhere because nothing had failed.
    Every "nothing happens when I sign in" report was this one line. */
 [hidden]{display:none!important}
 .gate{position:fixed;inset:0;background:var(--bg);display:grid;place-items:center;padding:20px;z-index:20}
 .gbox{background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:22px;width:100%;max-width:360px}
 .gbox h1{font-size:19px;margin:0 0 4px}
 .gbox p{margin:0 0 14px;color:var(--muted);font-size:14px}
 .gbox label{font-size:13px;font-weight:700}
 .gbox button{width:100%;margin-top:16px}
 header .ghost{margin-left:8px}
 /* The top-level switch: which of the three surfaces is on screen. Distinct
    from nav.tabs inside the content surface, which chooses a KIND. */
 .top{display:flex;gap:4px;margin-left:8px}
 .top button{background:transparent;border:1px solid transparent;color:var(--muted);padding:8px 13px;border-radius:8px}
 .top button.on{background:var(--bg);border-color:var(--line);color:var(--ink)}
${FORMS_CSS}
</style></head><body>
<div id="gate" class="gate">
  <form class="gbox" id="gform">
    <h1>Kurukshetra Saarthi</h1>
    <p>Sign in to manage the calendar and places.</p>
    <!-- Removed by the script the moment it runs. If it is still on screen,
         the page's JavaScript did not execute at all — which otherwise looks
         identical to "the button does nothing", because a form whose submit
         handler never attached just submits natively, reloads the page,
         clears the password and wipes the console on the way. -->
    <div class="msg bad" id="nojs">This page&rsquo;s JavaScript did not run, so signing in cannot work. Try a hard reload (Cmd-Shift-R).</div>
    <label>Email<input id="gu" type="email" autocomplete="username" required></label>
    <label>Password<input id="gp" type="password" autocomplete="current-password" required></label>
    <div class="msg bad" id="gm" hidden></div>
    <button class="primary" type="submit">Sign in</button>
  </form>
</div>
<div id="app" hidden>
<header><h1>Saarthi</h1>
  <nav class="top" id="topnav">
    <button data-top="content" class="on">Content</button>
    <button data-top="events">Events</button>
    <button data-top="media">Photographs</button>
  </nav>
  <span class="you" id="you"></span>
  <button class="ghost" id="signout">Sign out</button>
  <button class="ghost" id="testpush">Test notification</button></header>
${FORMS_HTML}
<div id="tab-events" hidden>
<main>
 <section>
  <h2>Add or change an event</h2>
  <form id="f" onsubmit="save(event)">
   <label>Id <span class="hint">Lower-case, with hyphens. Include the year, e.g. gita-mahotsav-2027. Reusing an id edits that event.</span>
     <input name="id" required pattern="[a-z0-9-]+"></label>
   <label>Kind <span class="hint">A yatra or closure is a procession or a road shut for a few hours — those need a time and a route below.</span>
     <select name="kind" onchange="toggleOverlay()">
       <option value="festival">festival</option><option value="snan">snan</option>
       <option value="show">show</option><option value="mela">mela</option>
       <option value="yatra">yatra</option><option value="closure">closure</option>
     </select></label>
   <div class="row">
     <label>Name (English)<input name="name_en" required></label>
     <label>Name (Hindi)<input name="name_hi" required></label>
   </div>
   <div class="row">
     <label>First day<input type="date" name="from" required></label>
     <label>Last day <span class="hint">Same as the first for a one-day event.</span><input type="date" name="to" required></label>
   </div>
   <label>Places <span class="hint">Ids from the app, comma separated — e.g. brahma-sarovar, jyotisar</span>
     <input name="places" required></label>
   <div class="row">
     <label>How much longer a visit takes <span class="hint">1.0 = normal. 1.5 = half as long again because of the crowd.</span>
       <input name="visitFactor" type="number" step="0.1" min="1" max="3" value="1.5" required></label>
     <label>How much slower the roads are <span class="hint">1.0 = normal. 1.3 = a third slower.</span>
       <input name="travelFactor" type="number" step="0.1" min="1" max="3" value="1.3" required></label>
   </div>
   <div class="row">
     <label>Short line (English) <span class="hint">One sentence, shown on the banner.</span><textarea name="blurb_en" required></textarea></label>
     <label>Short line (Hindi)<textarea name="blurb_hi" required></textarea></label>
   </div>
   <div class="row">
     <label>Warning (English) <span class="hint">What a visitor should do differently.</span><textarea name="notice_en" required></textarea></label>
     <label>Warning (Hindi)<textarea name="notice_hi" required></textarea></label>
   </div>
   <div id="ov" hidden>
     <div class="row">
       <label>Starts at<input type="time" name="win_from"></label>
       <label>Ends at<input type="time" name="win_to"></label>
     </div>
     <label>Advice<select name="advice"><option value="avoid">avoid — keep away from this road</option>
       <option value="join">join — worth going to</option></select></label>
     <label>Route <span class="hint">The road it runs along. One "lat, lng" per line, in order — at least two. Right-click a point on openstreetmap.org and choose "show address" to read them off.</span>
       <textarea name="corridor" rows="4" placeholder="29.9695, 76.8181&#10;29.9662, 76.8265"></textarea></label>
   </div>
   <div class="bar">
     <button class="primary" type="submit">Save</button>
     <button class="ghost" type="button" onclick="f.reset();toggleOverlay();msg('')">Clear</button>
   </div>
   <div id="m"></div>
  </form>
 </section>
 <section>
  <h2>The calendar</h2>
  <ul id="list"></ul>
  <h2 style="margin-top:20px">Recent changes</h2>
  <div class="aud" id="audit"></div>
 </section>
</main>
</div>
</div>
<script>
${FORMS_JS}
const $ = (s) => document.querySelector(s);

/* Proof of life, first statement in the file. Everything below is useless if
   this line never runs, and until now there was no way to tell that apart
   from a login that silently failed. */
(function () { const n = document.getElementById("nojs"); if (n) n.remove(); })();

/* ---- session -------------------------------------------------------------
   The dashboard is served by the same Worker it talks to, so these fetches are
   same-origin — but the session is a bearer token, not a cookie (see docs/14),
   so nothing is attached automatically. Every call must carry the header
   itself. Before this, the page loaded and then 403'd on its own first
   request, which made the admin area unreachable rather than merely locked. */
const TOK = "kuk_admin_token";
const tok = () => { try { return localStorage.getItem(TOK) || ""; } catch (e) { return ""; } };
const setTok = (v) => { try { v ? localStorage.setItem(TOK, v) : localStorage.removeItem(TOK); } catch (e) {} };

/** fetch + Authorization, and one place that notices the session has died. */
async function api(path, opts) {
  opts = opts || {};
  opts.headers = Object.assign({}, opts.headers, tok() ? { Authorization: "Bearer " + tok() } : {});
  const r = await fetch(path, opts);
  // 403 here means signed out, or signed in as someone who is not an admin.
  // Either way the only useful thing is the sign-in form, not a broken page.
  if (r.status === 403) {
    // Signed in fine, but not on the ADMIN_EMAILS list.
    showGate(tok() ? "That account is signed in but is not an administrator." : "Sign in to continue.");
    throw new Error("forbidden");
  }
  if (r.status === 401) { setTok(""); showGate("Your session has expired. Sign in again."); throw new Error("unauthorised"); }
  return r;
}

function showGate(m) {
  $("#gate").hidden = false;
  $("#app").hidden = true;
  if (m) { $("#gm").hidden = false; $("#gm").className = "msg bad"; $("#gm").textContent = m; }
}

/**
 * Sign in, and SAY what went wrong.
 *
 * Every failure used to collapse into "Wrong email or password", including
 * the ones that were nothing of the kind — no session token returned,
 * localStorage refused, the account being fine but not an administrator. The
 * result was a form that appeared to do nothing when clicked, which is the
 * hardest possible thing to debug from the other side of a screenshot.
 */
async function signIn(ev) {
  ev.preventDefault();
  $("#gm").hidden = true;

  const email = $("#gu").value.trim();
  const password = $("#gp").value;
  if (!email || !password) return showGate("Enter both your email and your password.");

  // Visible before the first await, so a click that is received always changes
  // something on screen even if the network takes a while.
  $("#gm").hidden = false;
  $("#gm").className = "msg";
  $("#gm").textContent = "Signing in\u2026";

  let r;
  try {
    // A request that never settles is indistinguishable from a frozen page.
    r = await fetch("/api/auth/sign-in/email", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: email, password: password }),
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    return showGate(e && e.name === "TimeoutError"
      ? "The server did not answer within 20 seconds."
      : "Could not reach the server. Check your connection.");
  }

  if (r.status === 429) return showGate("Too many attempts. Wait five minutes and try again.");
  if (r.status === 401 || r.status === 400) return showGate("Wrong email or password.");
  if (!r.ok) return showGate("Sign-in failed (" + r.status + "). Tell whoever maintains this.");

  const token = r.headers.get("set-auth-token");
  // Succeeded, but with nothing to keep. Silently returning to the form here
  // is exactly the "nothing happens" symptom.
  if (!token) return showGate("Signed in, but no session was issued. This is a server problem, not your password.");

  setTok(token);
  if (!tok()) return showGate("Your browser is blocking storage for this site, so the session cannot be kept.");

  $("#gp").value = "";
  boot();
}

function signOut() {
  const had = tok();
  setTok("");
  showGate("");
  $("#gm").hidden = true;
  if (had) fetch("/api/auth/sign-out", { method: "POST", headers: { Authorization: "Bearer " + had } }).catch(() => {});
}

/**
 * Show the dashboard only once a request has actually been allowed.
 *
 * The catch used to be empty, on the assumption that api() had already shown
 * the gate. That is true for 401 and 403 and false for everything else — so a
 * TypeError while rendering the list, or a body that would not parse as JSON,
 * left "Signing in…" on screen for ever with nothing said and nothing logged.
 * Sign-in had SUCCEEDED; only the first load after it failed, which is the
 * least obvious place to look.
 *
 * Now only the two errors api() raises deliberately stay quiet. Anything else
 * names itself, on screen and in the console.
 */
async function boot() {
  if (!tok()) return showGate("");
  try {
    await load();
    $("#gate").hidden = true;
    $("#app").hidden = false;
    // Only now that the shell is on screen — showTop fetches, and a fetch that
    // fails must land on the gate through api(), not against a hidden page.
    showTop("content");
  } catch (e) {
    const m = (e && e.message) || String(e);
    if (m === "forbidden" || m === "unauthorised") return; // api() has already shown the gate
    console.error("[admin] dashboard failed to load:", e);
    showGate("Signed in, but the dashboard could not load: " + m);
  }
}
const f = $("#f");
const msg = (t, bad) => { $("#m").className = t ? "msg " + (bad ? "bad" : "good") : ""; $("#m").textContent = t; };
const toggleOverlay = () => { $("#ov").hidden = !["yatra","closure"].includes(f.kind.value); };

async function load() {
  const r = await api("/admin/events").then(r => r.json());
  $("#you").textContent = r.you || "";
  $("#list").innerHTML = (r.items || []).map(e => {
    const ov = ["yatra","closure"].includes(e.kind);
    return '<li><b>' + esc(e.name.en) + '<span class="pill' + (ov ? ' ov' : '') + '">' + e.kind + '</span></b>' +
      '<span>' + e.from + (e.to !== e.from ? " → " + e.to : "") +
      (e.window ? " · " + e.window.from + "–" + e.window.to : "") + " · " + e.places.join(", ") + '</span>' +
      '<span class="acts"><button class="ghost" onclick=\\'edit(' + esc(JSON.stringify(JSON.stringify(e))) + ')\\'>Edit</button>' +
      '<button class="danger" onclick="del(\\'' + e.id + '\\')">Delete</button></span></li>';
  }).join("") || "<li><span>Nothing yet.</span></li>";
  const a = await api("/admin/audit").then(r => r.json());
  $("#audit").innerHTML = (a.items || []).map(x =>
    new Date(x.at).toLocaleString() + " — " + esc(x.who) + " " + x.action + "d " + esc(x.entityId)).join("<br>") || "No changes yet.";
}
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function edit(js) {
  const e = JSON.parse(js);
  f.id.value = e.id; f.kind.value = e.kind;
  f.name_en.value = e.name.en; f.name_hi.value = e.name.hi;
  f.from.value = e.from; f.to.value = e.to; f.places.value = e.places.join(", ");
  f.visitFactor.value = e.visitFactor; f.travelFactor.value = e.travelFactor;
  f.blurb_en.value = e.blurb.en; f.blurb_hi.value = e.blurb.hi;
  f.notice_en.value = e.notice.en; f.notice_hi.value = e.notice.hi;
  f.win_from.value = e.window ? e.window.from : ""; f.win_to.value = e.window ? e.window.to : "";
  f.advice.value = e.advice || "avoid";
  f.corridor.value = (e.corridor || []).map(c => c.lat + ", " + c.lng).join("\\n");
  toggleOverlay(); scrollTo(0, 0); msg("");
}

async function save(ev) {
  ev.preventDefault();
  const d = Object.fromEntries(new FormData(f));
  const body = {
    id: d.id.trim(), kind: d.kind,
    name: { en: d.name_en.trim(), hi: d.name_hi.trim() },
    from: d.from, to: d.to,
    places: d.places.split(",").map(s => s.trim()).filter(Boolean),
    visitFactor: +d.visitFactor, travelFactor: +d.travelFactor,
    blurb: { en: d.blurb_en.trim(), hi: d.blurb_hi.trim() },
    notice: { en: d.notice_en.trim(), hi: d.notice_hi.trim() },
  };
  if (["yatra","closure"].includes(d.kind)) {
    body.window = { from: d.win_from, to: d.win_to };
    body.advice = d.advice;
    body.corridor = d.corridor.split("\\n").map(l => l.trim()).filter(Boolean).map(l => {
      const [lat, lng] = l.split(",").map(x => parseFloat(x.trim()));
      return { lat, lng };
    });
  }
  const r = await api("/admin/events", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) return msg((j.problems || [j.error]).join("\\n"), true);
  msg("Saved. It reaches phones within five minutes."); f.reset(); toggleOverlay(); load();
}

async function del(id) {
  if (!confirm("Delete " + id + "? Past events stop showing on their own — you only need this for a mistake.")) return;
  await api("/admin/events", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
  load();
}
async function testPush() {
  const r = await api("/admin/test-push", { method: "POST" }).then(r => r.json());
  alert("Sent to " + r.sent + " device(s).");
}
/* Handlers attached in code rather than as onsubmit="" / onclick="" attributes.
   An inline handler that fails to run — a Content-Security-Policy, an extension,
   a stale cached copy of this page — does not error visibly: the form falls
   back to a native submit, the page reloads, the password box empties and the
   console clears. That is indistinguishable from "the button does nothing",
   and it is what sent us looking in the wrong place. addEventListener either
   attaches or the script did not run, and #nojs above says which. */
document.getElementById("gform").addEventListener("submit", signIn);
document.getElementById("signout").addEventListener("click", signOut);
document.getElementById("testpush").addEventListener("click", testPush);

/**
 * Which of the three surfaces is on screen.
 *
 * Content first, and Events second, which is a reversal: this page was the
 * events page and nothing else. But the calendar is a handful of rows edited a
 * few times a year, while places, stays and start points are the catalogue the
 * whole app is made of — and until now the only way to change one was to edit
 * JSON in the repository and cut a release.
 *
 * Each surface loads the first time it is opened rather than at boot. The
 * photograph library is a hundred thumbnails; fetching it to show a calendar
 * would make every visit to this page slower for no one's benefit.
 */
const loaded = {};
function showTop(which) {
  ["content", "events", "media"].forEach(n => { $("#tab-" + n).hidden = n !== which; });
  document.querySelectorAll("[data-top]").forEach(b => b.classList.toggle("on", b.getAttribute("data-top") === which));
  if (loaded[which]) return;
  loaded[which] = true;
  if (which === "content") cLoad("places");
  if (which === "media") paintLibrary();
}
$("#topnav").addEventListener("click", (e) => {
  const b = e.target.closest("[data-top]");
  if (b) showTop(b.getAttribute("data-top"));
});
wireForms();

// boot(), not load(): the page must decide whether to show the dashboard or
// the sign-in form, and it decides by whether a real request succeeds.
boot();
</script></body></html>`;
