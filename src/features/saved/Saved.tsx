import { useEffect, useState } from "react";
import { S } from "@/app/state";
import { go } from "@/app/nav";
import { t, nm } from "@/shared/i18n/i18n";
import { byId } from "@/shared/lib/geo";
import { toast } from "@/shared/ui/overlays";
import { Icon } from "@/shared/icons/Icon";
import { Pcard } from "@/shared/ui/PlaceCard";
import { store } from "@/app/state";
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
          <div className="muted" style={{ fontSize: "calc(13px*var(--ts))" }}>
            {ns.length} {t("stops")} ·{" "}
            {new Date(r.at).toLocaleDateString(S.lang === "hi" ? "hi-IN" : "en-IN")}
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

      <div className="muted" style={{ fontSize: "calc(13px*var(--ts))", marginTop: 9, lineHeight: 1.65 }}>
        {ns.map((n, i) => i + 1 + ". " + n).join(" · ")}
      </div>
      <button className="btn ghost sm" style={{ marginTop: 11 }} onClick={() => reopen(r.id)}>
        <Icon name="route" />
        {nm({ en: "Open this plan", hi: "यह योजना खोलें" })}
      </button>
    </div>
  );
}

export function Saved() {
  const favs = store.favs.map((i) => byId(i)).filter(Boolean) as NonNullable<ReturnType<typeof byId>>[];
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

  if (!favs.length && !rs.length)
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

  return (
    <>
      <div className="phead">
        <h1 className="display" lang={S.lang}>
          {t("saved")}
        </h1>
      </div>
      {rs.length > 0 && (
        <div className="sec" style={{ marginTop: 2 }}>
          <div className="sec-head">
            <h2 style={{ fontSize: "calc(17px*var(--ts))" }}>{t("savedRoutes")}</h2>
          </div>
          <div className="plist stagger">
            {rs.map((r) => (
              <PlanRow key={r.id} r={r} onGone={() => { toast(t("removedT")); refresh(); }} />
            ))}
          </div>
        </div>
      )}
      {favs.length > 0 && (
        <div className="sec">
          <div className="sec-head">
            <h2 style={{ fontSize: "calc(17px*var(--ts))" }}>{t("savedPlaces")}</h2>
          </div>
          <div className="plist stagger">
            {favs.map((d) => (
              <Pcard key={d.id} d={d} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
