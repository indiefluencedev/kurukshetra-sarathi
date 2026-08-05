import { useEffect, useState } from "react";
import { S, bump, city } from "@/app/state";
import { t, nm, nStops } from "@/shared/i18n/i18n";
import { isoToday } from "@/shared/lib/datetime";
import { openSheet, closeSheet, toast } from "@/shared/ui/overlays";
import { Icon } from "@/shared/icons/Icon";
import { locate } from "@/features/location/location";
import { listPlans, openPlan, savePlan, type SavedPlan } from "@/features/planner/persist";
import { longDate } from "@/features/planner/plan";
import { dropFrom, emptyRes, inPlan, pushStop, retime, startDayWith } from "./place-actions";
import { byId } from "@/shared/lib/geo";
import type { Destination, GeoPoint, Plan } from "@/shared/types";

/**
 * "Add this place to…" — the sheet the plus on a card opens.
 *
 * It exists because the plus used to answer two questions on the visitor's
 * behalf and tell them about neither: WHICH day the place was going into, and
 * WHERE that day starts. See the note on `addTo`.
 *
 * Two shapes, decided by what the visitor already has:
 *   • nothing planned  → ask the two things a stop cannot be timed without,
 *                        the day and the starting point, and nothing else.
 *   • one or more days → ask which one. Starting a new day is still offered,
 *                        and drops through to the first shape.
 */
export const openAddSheet = (d: Destination) => openSheet(<AddSheet d={d} />);

/**
 * The plus on a card. Every list in the app calls this.
 *
 * Two jobs, and only the second is interesting. Tapping a place already in the
 * day takes it back out — the plus is the only control on the card, so it has
 * to be the undo as well.
 *
 * Adding is what changed. It used to silently invent a plan: a four-hour day
 * starting *now*, from the visitor's last known position if there happened to
 * be one and from the centre of town if there was not, and it said none of
 * this. Both guesses are load-bearing — the start point decides the shape of
 * the whole route, the date decides which places are shut — and neither was
 * ever asked about. Worse, with a day already saved there was no way to say
 * which one you meant: the place went into whatever was on screen.
 */
export function addTo(id: string) {
  const d = byId(id);
  if (!d) return;
  if (inPlan(id)) {
    dropFrom(id);
    return;
  }
  openAddSheet(d);
}

function AddSheet({ d }: { d: Destination }) {
  // null = still reading IndexedDB. The two shapes look nothing alike, so
  // guessing before the answer arrives means the sheet visibly changes shape
  // under the visitor's thumb.
  const [saved, setSaved] = useState<SavedPlan[] | null>(null);
  const [fresh, setFresh] = useState(false);

  useEffect(() => {
    listPlans().then(
      // The day on screen is listed separately below, and buildRoute() saves
      // every plan it builds — so without this it appears twice, once as
      // "the day you're building" and once under its own title.
      (rows) => setSaved(rows.filter((r) => r.id !== S.plan?.savedId)),
      () => setSaved([]),
    );
  }, []);

  const open = S.plan?.res?.stops?.length ? S.plan : null;

  if (saved === null)
    return (
      <>
        <Head d={d} />
        <div className="card skel" style={{ height: 64, marginTop: 12 }} />
        <div className="card skel" style={{ height: 64, marginTop: 9 }} />
      </>
    );

  if (fresh || (!open && !saved.length)) return <NewDay d={d} />;

  return <PickDay d={d} open={open} saved={saved} onNew={() => setFresh(true)} />;
}

function Head({ d }: { d: Destination }) {
  return (
    <>
      <h2 className="display" style={{ fontSize: "calc(20px*var(--ts))" }} lang={S.lang}>
        {nm({ en: "Add to your day", hi: "अपने दिन में जोड़ें" })}
      </h2>
      <p className="muted" style={{ margin: "6px 0 0", fontSize: "calc(13.5px*var(--ts))", lineHeight: 1.55 }} lang={S.lang}>
        {nm(d.name)}
      </p>
    </>
  );
}

/* ---------------- shape 2: which day? ---------------- */

function PickDay({
  d,
  open,
  saved,
  onNew,
}: {
  d: Destination;
  open: Plan | null;
  saved: SavedPlan[];
  onNew: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const intoOpen = () => {
    pushStop(S.plan!, d);
    // Keep the stored copy in step — the plan was already saved by buildRoute,
    // so leaving it alone would mean Saved lists a day missing the stop the
    // visitor just watched themselves add.
    savePlan(S.plan!).catch(() => {});
    done();
  };

  /**
   * Add to a day that is not the one on screen.
   *
   * `openPlan` restores the ANSWERS and leaves `res` null, because normally a
   * saved plan is handed straight to buildRoute() to be regenerated. That is
   * the wrong move here: regenerating runs the engine, which picks stops from
   * themes and a time budget, and would quietly rewrite the day the visitor is
   * adding to. So the stops are rebuilt from the ids that were saved with it,
   * in their saved order, and the new place goes on the end.
   */
  const intoSaved = async (r: SavedPlan) => {
    setBusy(true);
    try {
      const p = await openPlan(r.id);
      if (!p) return;
      emptyRes(p);
      const dests = r.ids.map((i) => byId(i)).filter(Boolean) as Destination[];
      retime(p, dests.concat(dests.some((x) => x.id === d.id) ? [] : [d]));
      await savePlan(p).catch(() => {});
      done();
    } finally {
      setBusy(false);
    }
  };

  const done = () => {
    closeSheet();
    toast(t("addedT"));
    bump();
  };

  const row = (key: string, title: string, sub: string, onClick: () => void) => (
    <button key={key} className="opt" onClick={onClick} disabled={busy}>
      <span className="oi">
        <Icon name="route" />
      </span>
      <span style={{ minWidth: 0 }}>
        <b lang={S.lang}>{title}</b>
        <small>{sub}</small>
      </span>
      <span className="chk" />
    </button>
  );

  return (
    <>
      <Head d={d} />
      <p className="muted" style={{ margin: "12px 0 10px", fontSize: "calc(13.5px*var(--ts))" }} lang={S.lang}>
        {nm({ en: "Which day should it go in?", hi: "इसे किस दिन में जोड़ें?" })}
      </p>

      <div className="opts">
        {open &&
          row(
            "open",
            nm({ en: "The day you're building", hi: "जो दिन आप बना रहे हैं" }),
            nStops(open.res!.stops.length) + " · " + longDate(open.date),
            intoOpen,
          )}
        {/* Named by what is IN it, not by `r.title`. A day started from this
            very sheet is titled by its length — "4h" — because that is what
            savePlan falls back to, so two such days list as "4h" and "4h" and
            the visitor is asked to choose between two identical rows. The
            first couple of stops is what actually tells them apart. */}
        {saved.map((r) => {
          const ns = r.ids.map((i) => byId(i)).filter(Boolean).map((x) => nm(x!.name));
          return row(
            r.id,
            ns.slice(0, 2).join(" · ") || r.title,
            nStops(r.ids.length) + " · " + longDate(r.plan.date),
            () => intoSaved(r),
          );
        })}
      </div>

      <button className="btn ghost" style={{ marginTop: 12 }} onClick={onNew} disabled={busy}>
        <Icon name="plus" />
        {nm({ en: "Start a new day", hi: "नया दिन शुरू करें" })}
      </button>
    </>
  );
}

/* ---------------- shape 1: a new day ---------------- */

const TOWN = (): GeoPoint => ({
  lat: city().centre.lat,
  lng: city().centre.lng,
  label: nm({ en: "Town centre", hi: "नगर केंद्र" }),
});

function NewDay({ d }: { d: Destination }) {
  const [date, setDate] = useState(isoToday());
  // "" while the device is still being asked. The answer decides which of the
  // two start options is pre-selected, so it is worth the half-second wait.
  const [useMe, setUseMe] = useState(true);
  const [fix, setFix] = useState<{ lat: number; lng: number } | null>(S.userLoc);
  const [asking, setAsking] = useState(!S.userLoc);

  // Auto-pick the current location, as the default, without being asked to.
  // A start point is the one answer this sheet cannot sensibly guess, and it
  // is also the one the device can simply supply.
  useEffect(() => {
    if (S.userLoc) return;
    let dead = false;
    locate().then((p) => {
      if (dead) return;
      setFix(p);
      // No fix, no permission, no signal — fall back to the town centre and
      // say so, rather than pre-selecting an option we cannot honour.
      if (!p) setUseMe(false);
      setAsking(false);
    });
    return () => {
      dead = true;
    };
  }, []);

  const start = (): GeoPoint =>
    useMe && fix
      ? { lat: fix.lat, lng: fix.lng, label: nm({ en: "My location", hi: "मेरा स्थान" }) }
      : TOWN();

  const add = () => {
    const p = startDayWith(d, date, start(), useMe && fix ? "useLoc" : "other");
    savePlan(p).catch(() => {
      /* private mode — the day still works, it just won't come back */
    });
    closeSheet();
    toast(t("addedT"));
    bump();
  };

  const opt = (on: boolean, icon: string, title: string, sub: string, onClick: () => void) => (
    <button className={"opt" + (on ? " on" : "")} onClick={onClick}>
      <span className="oi">
        <Icon name={icon} />
      </span>
      <span style={{ minWidth: 0 }}>
        <b lang={S.lang}>{title}</b>
        <small>{sub}</small>
      </span>
      <span className="chk" />
    </button>
  );

  return (
    <>
      <Head d={d} />
      <p className="muted" style={{ margin: "12px 0 10px", fontSize: "calc(13.5px*var(--ts))", lineHeight: 1.55 }} lang={S.lang}>
        {nm({
          en: "Two things, and the day is started. You can change everything else on the Plan screen.",
          hi: "दो बातें, और दिन शुरू। बाकी सब ‘योजना’ पर बदल सकते हैं।",
        })}
      </p>

      {/* A native date input, not the app's calendar sheet: that sheet reads
          and writes S.plan, which does not exist yet here, and opening a sheet
          from inside a sheet would replace this one. */}
      <div className="field">
        <label htmlFor="add-date" lang={S.lang}>
          {nm({ en: "Which day?", hi: "कौन सा दिन?" })}
        </label>
        <input
          id="add-date"
          type="date"
          value={date}
          min={isoToday()}
          onChange={(e) => setDate(e.target.value || isoToday())}
        />
      </div>

      <p className="muted" style={{ margin: "14px 0 8px", fontSize: "calc(13.5px*var(--ts))" }} lang={S.lang}>
        {nm({ en: "Where are you starting from?", hi: "कहाँ से शुरू कर रहे हैं?" })}
      </p>
      <div className="opts">
        {opt(
          useMe && !!fix,
          "pin",
          nm({ en: "My location", hi: "मेरा स्थान" }),
          asking
            ? nm({ en: "Finding you…", hi: "खोज रहे हैं…" })
            : fix
              ? nm({ en: "Where you are standing now", hi: "जहाँ आप अभी हैं" })
              : nm({ en: "Not available — location is off", hi: "उपलब्ध नहीं — स्थान बंद है" }),
          () => {
            if (fix) {
              setUseMe(true);
              return;
            }
            // Denied first time round, or the fix timed out. Tapping the row
            // again is a second ask, which is the only way back from a
            // mis-tapped "block" without going into browser settings.
            setAsking(true);
            locate().then((p) => {
              setFix(p);
              setUseMe(!!p);
              setAsking(false);
            });
          },
        )}
        {opt(!useMe || !fix, "mapi", nm({ en: "Town centre", hi: "नगर केंद्र" }), nm(city()), () => setUseMe(false))}
      </div>

      <button className="btn primary" style={{ marginTop: 14 }} onClick={add} disabled={asking}>
        <Icon name="plus" />
        {nm({ en: "Add and start the day", hi: "जोड़ें और दिन शुरू करें" })}
      </button>
    </>
  );
}
