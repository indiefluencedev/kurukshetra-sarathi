import { useEffect, useState } from "react";
import { S } from "@/app/state";
import { go } from "@/app/nav";
import { t, nm, nStops } from "@/shared/i18n/i18n";
import { byId } from "@/shared/lib/geo";
import { CITIES, cityOf } from "@/data/cities";
import { toast } from "@/shared/ui/overlays";
import { Icon } from "@/shared/icons/Icon";
import { Pcard } from "@/shared/ui/PlaceCard";
import { store, bump, setCity } from "@/app/state";
import { listPlans, deletePlan, openPlan, type SavedPlan } from "@/features/planner/persist";
import { buildRoute, longDate, lastDay } from "@/features/planner/plan";

/**
 * Reopen a saved plan: every answer comes back — the day, the start point, the
 * people, the pace — and the route is rebuilt from them against today's opening
 * hours, rather than being restored from a stale copy.
 */
async function reopen(id: string) {
  const p = await openPlan(id);
  if (p) buildRoute(); // navigates to /route itself
}

/**
 * Open the saved answers in the planner instead of rebuilding from them.
 *
 * `openPlan` already restores every answer — the day, the start and end, the
 * themes, the pace, the company — it was just being handed straight to
 * `buildRoute()`, so a saved plan could only ever be re-run exactly as it was.
 * Changing one thing about a trip you had already described meant answering
 * all four steps again from scratch. Landing on step 1 with the answers in
 * place is the same call, one line apart.
 */
async function editPlan(id: string) {
  const p = await openPlan(id);
  if (!p) return;
  S.plan!.step = 0;
  S.plan!.res = null;
  bump();
  go("/plan");
}

function PlanRow({ r, onGone }: { r: SavedPlan; onGone: () => void }) {
  const ns = r.ids.map((i) => byId(i)).filter(Boolean).map((d) => nm(d!.name));
  const p = r.plan;
  const when = p.days > 1 ? longDate(p.date) + " → " + longDate(lastDay(p as any)) : longDate(p.date);
  const where = p.start?.label;
  return (
    <div className="card" style={{ padding: 13 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <span
          style={{
            width: 38, height: 38, borderRadius: 10, background: "var(--clay-wash)",
            color: "var(--clay)", display: "grid", placeItems: "center", flex: "0 0 auto",
          }}
        >
          <Icon name="route" />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <b className="display" style={{ fontSize: "calc(15px*var(--ts))" }}>
            {r.title}
          </b>
          {/* just the count. The saved-on date used to sit here as a raw
              toLocaleDateString — "3/8/2026" — directly above a chip spelling
              out "Monday, 3 August 2026". Two dates, one of them ambiguous
              between British and American order, and neither of them the one
              that matters. */}
          <div className="muted" style={{ fontSize: "calc(12.5px*var(--ts))" }}>
            {nStops(ns.length)}
          </div>
        </div>
        <button
          className="iconbtn"
          onClick={() => deletePlan(r.id).then(onGone)}
          aria-label={nm({ en: "Remove ", hi: "हटाएँ " }) + r.title}
        >
          <Icon name="close" />
        </button>
      </div>

      {/* the answers, so a saved plan is recognisable without opening it */}
      <div className="savemeta">
        <span>
          <Icon name="cal" />
          {when}
        </span>
        {where && (
          <span>
            <Icon name="pin" />
            {where}
          </span>
        )}
      </div>

      {/* The first three, then a count. Every stop numbered and run together
          into one paragraph was fifteen place names as a wall of prose — too
          much to read and too little to act on, and it made a saved plan taller
          than the screen. Three names say what KIND of day this was, which is
          the only thing a saved-plan card has to answer. */}
      <p className="sv-list">
        {ns.slice(0, 3).join(" · ")}
        {ns.length > 3 && (
          <span className="sv-more">
            {" "}
            {nm({ en: `+ ${ns.length - 3} more`, hi: `+ ${ns.length - 3} और` })}
          </span>
        )}
      </p>
      <div className="sv-acts">
        <button className="btn primary sm" onClick={() => reopen(r.id)}>
          <Icon name="route" />
          {nm({ en: "Open this plan", hi: "यह योजना खोलें" })}
        </button>
        <button className="btn ghost sm" onClick={() => editPlan(r.id)}>
          <Icon name="gear" />
          {nm({ en: "Edit", hi: "बदलें" })}
        </button>
      </div>
    </div>
  );
}

export function Saved() {
  const all = store.favs.map((i) => byId(i)).filter(Boolean) as NonNullable<ReturnType<typeof byId>>[];
  // Saving is per place, but reading is per town: a Pehowa tirtha sitting in a
  // list under a header that says Kurukshetra reads as a bug. So the section
  // holds this town, and the rest is one row that says how many and where —
  // nothing is hidden, and nothing is mixed.
  const favs = all.filter((d) => cityOf(d) === S.city);
  const elsewhere = CITIES.filter((c) => c.id !== S.city)
    .map((c) => ({ c, n: all.filter((d) => cityOf(d) === c.id).length }))
    .filter((x) => x.n > 0);
  const [rs, setRs] = useState<SavedPlan[] | null>(null);
  const refresh = () => listPlans().then(setRs, () => setRs([]));
  useEffect(() => {
    refresh();
  }, []);

  // IndexedDB answers a frame or two late. Returning null flashed a blank
  // screen; hold the title and two card-shaped placeholders instead, so the
  // layout that arrives is the layout that was already there.
  if (rs === null)
    return (
      <>
        <div className="phead">
          <h1 className="display" lang={S.lang}>
            {t("saved")}
          </h1>
        </div>
        <div className="plist" aria-hidden="true">
          <div className="card skel" style={{ height: 118 }} />
          <div className="card skel" style={{ height: 118 }} />
        </div>
      </>
    );

  if (!all.length && !rs.length)
    return (
      <>
        <div className="phead">
          <h1 className="display" lang={S.lang}>
            {t("saved")}
          </h1>
        </div>
        <div className="empty">
          <Icon name="saved" />
          <p className="t">{t("savedNone")}</p>
          <p>{t("savedNoneD")}</p>
          <button className="btn primary" style={{ maxWidth: 230, margin: "18px auto 0" }} onClick={() => go("/plan")}>
            {t("planVisit")}
          </button>
        </div>
      </>
    );

  const both = rs.length > 0 && favs.length > 0;

  return (
    <>
      <div className="phead">
        <h1 className="display" lang={S.lang}>
          {t("saved")}
        </h1>
      </div>
      {/* A heading only when there is something to tell apart.
          "Saved" over "Routes" over a list of routes is the same word twice in
          two sizes; the section title earns its line only when days and places
          are both on the screen and the reader has to know where one ends. */}
      {rs.length > 0 && (
        <div className="sec" style={{ marginTop: 2 }}>
          {both && (
            <div className="sec-head">
              <h2 style={{ fontSize: "calc(17px*var(--ts))" }}>{t("savedRoutes")}</h2>
            </div>
          )}
          <div className="plist stagger">
            {rs.map((r) => (
              <PlanRow key={r.id} r={r} onGone={() => { toast(t("removedT")); refresh(); }} />
            ))}
          </div>
        </div>
      )}
      {favs.length > 0 && (
        <div className="sec">
          {both && (
            <div className="sec-head">
              <h2 style={{ fontSize: "calc(17px*var(--ts))" }}>{t("savedPlaces")}</h2>
            </div>
          )}
          <div className="plist stagger">
            {favs.map((d) => (
              <Pcard key={d.id} d={d} />
            ))}
          </div>
        </div>
      )}
      {elsewhere.map(({ c, n }) => (
        <button key={c.id} className="menurow" onClick={() => setCity(c.id)}>
          <Icon name="pin" />
          <span className="menutext">
            <b lang={S.lang}>{t("savedElsewhere").replace("{n}", String(n))}</b>
            <small>{nm(c)}</small>
          </span>
          <Icon name="chev" />
        </button>
      ))}
    </>
  );
}
