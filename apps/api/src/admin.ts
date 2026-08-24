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
import { FORMS_CSS, FORMS_HTML, FORMS_JS, EDITOR_HTML } from "./admin-forms";

export const ADMIN_HTML = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Kurukshetra Saarthi — dashboard</title>
<!-- Leaflet, for the coordinate and route fields. From a CDN rather than
     bundled because this page deliberately has no build step, and pinned to an
     exact version so a dashboard nobody is watching cannot change under itself.
     Not deferred: every map is built from a click, long after this has landed.
     If it never lands, window.L is undefined and every map field falls back to
     the latitude and longitude boxes — see initGeo. -->
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
 :root{--ink:#1C1815;--muted:#6B6252;--line:#DDD3BC;--paper:#FDFBF4;--bg:#F2ECDD;
       --accent:#D2600A;--accent-d:#A34A05;--bad:#9A3B1E;--ok:#4F5B2E}
 *{box-sizing:border-box} html{scroll-behavior:smooth} body{margin:0;background:var(--bg);color:var(--ink);
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
  /* Scoped Premium styles for edit drawer buttons to prevent impacting sidebar */
  #editor button.primary, #editor button.ghost, #editor button.danger {
    font-size: 13.5px;
    font-weight: 500;
    letter-spacing: 0.02em;
    padding: 7px 16px;
    height: 36px;
    border-radius: 6px;
    transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    box-shadow: none;
  }
  #editor button.primary:hover:not(:disabled), #editor button.ghost:hover:not(:disabled), #editor button.danger:hover:not(:disabled) {
    transform: translateY(-1px);
  }
  #editor button.primary:active:not(:disabled), #editor button.ghost:active:not(:disabled), #editor button.danger:active:not(:disabled) {
    transform: translateY(0);
  }
  #editor button.primary {
    background: var(--accent);
    color: #fff;
    border: 1px solid var(--accent);
    box-shadow: 0 2px 4px rgba(210, 96, 10, 0.12);
  }
  #editor button.primary:hover:not(:disabled) {
    background: var(--accent-d);
    border-color: var(--accent-d);
    box-shadow: 0 4px 10px rgba(210, 96, 10, 0.22);
  }
  #editor button.ghost {
    background: #fff;
    border: 1px solid #DCD5C5;
    color: var(--ink);
  }
  #editor button.ghost:hover:not(:disabled) {
    border-color: var(--accent);
    color: var(--accent-d);
    background: #FFFDF9;
    box-shadow: 0 4px 10px rgba(210, 96, 10, 0.06);
  }
  #editor button.danger {
    background: #fff;
    border: 1px solid #F0C4B8;
    color: var(--bad);
  }
  #editor button.danger:hover:not(:disabled) {
    border-color: var(--bad);
    background: #FFF9F6;
    box-shadow: 0 4px 10px rgba(154, 59, 30, 0.06);
  }

  /* Scoped Premium style for the '+ Add new' button to make it highlighted and sleek */
  #cadd {
    font-size: 12.5px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    padding: 0 16px;
    height: 34px;
    border-radius: 6px;
    background: linear-gradient(135deg, #e06c15 0%, #ba5508 100%);
    color: #fff;
    border: 1px solid #c85f10;
    box-shadow: 0 2px 6px rgba(210, 96, 10, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.15);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }
  #cadd:hover:not(:disabled) {
    transform: translateY(-1.5px);
    background: linear-gradient(135deg, #ec7821 0%, #c85f10 100%);
    box-shadow: 0 5px 12px rgba(210, 96, 10, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.2);
  }
  #cadd:active:not(:disabled) {
    transform: translateY(0);
    box-shadow: 0 2px 4px rgba(210, 96, 10, 0.15);
  }
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
<div class="shell">
 <aside class="side">
  <div class="sbrand">Saarthi</div>
  <nav id="sidenav">
   <span class="sgrp">Catalogue</span>
   <button data-nav="places" data-kind="places">Places</button>
   <button data-nav="hotels" data-kind="hotels">Stays</button>
   <button data-nav="startpoints" data-kind="startpoints">Start points</button>
   <button data-nav="erickshaw" data-kind="erickshaw">E-rickshaw</button>
   <span class="sgrp">Calendar</span>
   <button data-nav="events">Events</button>
   <span class="sgrp">Home screen</span>
   <button data-nav="hero" data-kind="hero">Opening photographs</button>
  </nav>
  <div class="sfoot">
   <span class="you" id="you"></span>
   <button class="ghost" id="testpush">Test notification</button>
   <button class="ghost" id="signout">Sign out</button>
  </div>
 </aside>
 <div class="work">
  <div class="topbar"><h1 id="ptitle">Places</h1></div>
${FORMS_HTML}
<div id="pane-events" class="pane" hidden>
 <section>
  <h2>Recent changes</h2>
  <div class="aud" id="audit"></div>
 </section>
</div>
 </div>
</div>
${EDITOR_HTML}
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
    show("places");
  } catch (e) {
    const m = (e && e.message) || String(e);
    if (m === "forbidden" || m === "unauthorised") return; // api() has already shown the gate
    console.error("[admin] dashboard failed to load:", e);
    showGate("Signed in, but the dashboard could not load: " + m);
  }
}
/**
 * What the shell needs before anything is on screen: who you are, and the log.
 *
 * This used to fetch and render the calendar too, because the calendar was the
 * only thing here. Events are now one pane of six and load like the rest of
 * them, through the same form engine.
 */
async function load() {
  const r = await api("/admin/events").then(r => r.json());
  $("#you").textContent = r.you || "";
  const a = await api("/admin/audit").then(r => r.json());
  $("#audit").innerHTML = (a.items || []).map(x =>
    new Date(x.at).toLocaleString() + " \u2014 " + esc(x.who) + " " + x.action + "d " + esc(x.entityId)).join("<br>") || "No changes yet.";
}
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));



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
 * The sidebar, and what each entry puts on screen.
 *
 * One flat list of destinations. It used to be two levels — a top bar choosing
 * the area and, underneath it and somewhere else on the page, a strip of pills
 * choosing which KIND of content — so reaching Stays meant two clicks in two
 * different navigation bars, and neither told you where you were. Four kinds
 * and a calendar are five destinations; five things belong in one list.
 *
 * The four content kinds share one pane, because they are one screen with a
 * different table in it. Events keeps its own, for the audit log.
 *
 * There is no photograph pane any more. A photograph belongs to a record — a
 * place, a stay, an event — and the library was a second place to stand: you
 * went there to upload, came back to the record to attach, and the wall of
 * folders fetched sixty cover photographs to help you choose between names you
 * already knew. Uploading, attaching, ordering and deleting all happen in the
 * record now, and the library survives as a view inside the picker, which is
 * the moment anybody actually wants to look through it. See pickImage.
 */
function show(nav) {
  $("#pane-content").hidden = false;
  $("#pane-events").hidden = nav !== "events";
  document.querySelectorAll("[data-nav]").forEach(b =>
    b.classList.toggle("on", b.getAttribute("data-nav") === nav));
  $("#ptitle").textContent =
    [...document.querySelectorAll("[data-nav]")].filter(b => b.getAttribute("data-nav") === nav)
      .map(b => b.textContent)[0] || "";
  cLoad(nav);
}

$("#sidenav").addEventListener("click", (e) => {
  const b = e.target.closest("[data-nav]");
  if (b) show(b.getAttribute("data-nav"));
});
wireForms();

// boot(), not load(): the page must decide whether to show the dashboard or
// the sign-in form, and it decides by whether a real request succeeds.
boot();
</script></body></html>`;
