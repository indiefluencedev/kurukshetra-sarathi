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
export const ADMIN_HTML = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Kurukshetra Saarthi — events</title>
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
</style></head><body>
<header><h1>Events</h1><span class="you" id="you"></span>
  <button class="ghost" onclick="testPush()">Send a test notification</button></header>
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
<script>
const $ = (s) => document.querySelector(s);
const f = $("#f");
const msg = (t, bad) => { $("#m").className = t ? "msg " + (bad ? "bad" : "good") : ""; $("#m").textContent = t; };
const toggleOverlay = () => { $("#ov").hidden = !["yatra","closure"].includes(f.kind.value); };

async function load() {
  const r = await fetch("/admin/events").then(r => r.json());
  $("#you").textContent = r.you || "";
  $("#list").innerHTML = (r.items || []).map(e => {
    const ov = ["yatra","closure"].includes(e.kind);
    return '<li><b>' + esc(e.name.en) + '<span class="pill' + (ov ? ' ov' : '') + '">' + e.kind + '</span></b>' +
      '<span>' + e.from + (e.to !== e.from ? " → " + e.to : "") +
      (e.window ? " · " + e.window.from + "–" + e.window.to : "") + " · " + e.places.join(", ") + '</span>' +
      '<span class="acts"><button class="ghost" onclick=\\'edit(' + esc(JSON.stringify(JSON.stringify(e))) + ')\\'>Edit</button>' +
      '<button class="danger" onclick="del(\\'' + e.id + '\\')">Delete</button></span></li>';
  }).join("") || "<li><span>Nothing yet.</span></li>";
  const a = await fetch("/admin/audit").then(r => r.json());
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
  const r = await fetch("/admin/events", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) return msg((j.problems || [j.error]).join("\\n"), true);
  msg("Saved. It reaches phones within five minutes."); f.reset(); toggleOverlay(); load();
}

async function del(id) {
  if (!confirm("Delete " + id + "? Past events stop showing on their own — you only need this for a mistake.")) return;
  await fetch("/admin/events", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
  load();
}
async function testPush() {
  const r = await fetch("/admin/test-push", { method: "POST" }).then(r => r.json());
  alert("Sent to " + r.sent + " device(s).");
}
load();
</script></body></html>`;
