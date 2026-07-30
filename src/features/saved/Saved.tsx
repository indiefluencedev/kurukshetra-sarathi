import { S, store, newPlan } from "@/app/state";
import { go, planWeekday } from "@/app/nav";
import { t, nm } from "@/shared/i18n/i18n";
import { nowM } from "@/shared/lib/datetime";
import { byId } from "@/shared/lib/geo";
import { toast } from "@/shared/ui/overlays";
import { Icon } from "@/shared/icons/Icon";
import { Pcard } from "@/shared/ui/PlaceCard";
import { Engine } from "@/features/planner/engine";
import { bump } from "@/app/state";

interface SavedRoute {
  id: string;
  title: string;
  at: number;
  ids: string[];
  mode?: string;
  pace?: string;
  themes?: string[];
  mins?: number;
}

const delRoute = (id: string) => {
  store.routes = store.routes.filter((r: SavedRoute) => r.id !== id);
  toast(t("removedT"));
  bump();
};

function loadRoute(id: string) {
  const r = store.routes.find((x: SavedRoute) => x.id === id);
  if (!r) return;
  S.plan = newPlan();
  S.plan.mins = r.mins || 240;
  S.plan.label = r.title;
  S.plan.mode = r.mode || "car";
  S.plan.pace = r.pace || "balanced";
  S.plan.themes = r.themes || [];
  S.plan.startClock = nowM();
  S.plan.res = Engine.build({
    budgetMin: S.plan.mins,
    start: S.plan.start,
    end: S.plan.end,
    interests: [],
    mode: S.plan.mode,
    pace: S.plan.pace,
    startClock: S.plan.startClock,
    weekday: planWeekday(),
    filters: { meal: true },
    onlyIds: r.ids,
  });
  S.plan.alts = [];
  go("/route");
}

function RouteRow({ r }: { r: SavedRoute }) {
  const ns = r.ids.map((i) => byId(i)).filter(Boolean).map((d) => nm(d!.name));
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
          <div className="muted" style={{ fontSize: "calc(12px*var(--ts))" }}>
            {ns.length} {t("stops")} ·{" "}
            {new Date(r.at).toLocaleDateString(S.lang === "hi" ? "hi-IN" : "en-IN")}
          </div>
        </div>
        <button className="iconbtn" onClick={() => delRoute(r.id)} aria-label={t("removedT")}>
          <Icon name="close" />
        </button>
      </div>
      <div className="muted" style={{ fontSize: "calc(12.5px*var(--ts))", marginTop: 9, lineHeight: 1.65 }}>
        {ns.map((n, i) => i + 1 + ". " + n).join(" · ")}
      </div>
      <button className="btn ghost sm" style={{ marginTop: 11 }} onClick={() => loadRoute(r.id)}>
        <Icon name="play" />
        {t("startTour")}
      </button>
    </div>
  );
}

export function Saved() {
  const favs = store.favs.map((i) => byId(i)).filter(Boolean) as NonNullable<ReturnType<typeof byId>>[];
  const rs = store.routes as SavedRoute[];

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
              <RouteRow key={r.id} r={r} />
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
