import { useEffect, useMemo, useState } from "react";
import { S } from "@/app/state";
import { nm } from "@/shared/i18n/i18n";
import { CONFIG } from "@/data/config";
import { Icon } from "@/shared/icons/Icon";
import { openSheet, closeSheet } from "@/shared/ui/overlays";
import { PLACES_INDEX, type PlaceKind } from "@/data/places-index";
import { openStays } from "@/data/stays";
import { cityOf } from "@/data/cities";
import { searchNearby, type FoundPlace } from "./places-search";
import { haystack, rank, KIND_WORD } from "./pick-search";
import type { GeoPoint, Loc } from "@/shared/types";

export const ICON_FOR: Record<string, string> = {
  busstand: "bus", station: "mapi",
  hotel: "home", dharamshala: "home", guesthouse: "home", homestay: "home",
};

/** A row the picker can offer — a terminal from the index, or a stay. */
export interface PickRow {
  id: string;
  kind: string;
  city?: string;
  name: Loc;
  area?: Loc;
  lat: number;
  lng: number;
  code?: string;
  phone?: string;
}

/**
 * The curated list behind whichever option was chosen.
 *
 * Two catalogues, because they are two different things maintained for two
 * different reasons: stations and bus stands are how a visitor ARRIVES in the
 * district, and stays are where they sleep. Asking for a stay hands back the
 * whole stays catalogue rather than filtering it by kind — someone who taps
 * "hotel or dharamshala" wants every bed in the district, not the subset whose
 * signboard uses the word they happened to tap.
 */
export const poolFor = (kinds: PlaceKind[]): PickRow[] =>
  !kinds.length
    ? []
    : kinds.includes("hotel") || kinds.includes("dharamshala")
      ? openStays()
      : PLACES_INDEX.filter((p) => (kinds as string[]).includes(p.kind));

/** the station code or what kind of stay it is, then the locality */
export const detailOf = (p: PickRow): string | undefined =>
  [p.code || (KIND_WORD[p.kind] && nm(KIND_WORD[p.kind])), p.area && nm(p.area)]
    .filter(Boolean)
    .join(" · ") || undefined;

export const rowById = (kinds: PlaceKind[], id?: string): PickRow | undefined =>
  id ? poolFor(kinds).find((p) => p.id === id) : undefined;

/* ============================== the sheet ============================== */

/**
 * A searchable list, in a sheet rather than in the step.
 *
 * Twelve stays rendered inline pushed the map, the hint and Continue off the
 * screen, and the answer to "show 9 more" was a page of scrolling inside a
 * question that had already been asked. A sheet is the same list with the step
 * kept intact underneath it: one thing to read, one thing to answer, and the
 * layout behind it never moves.
 */
function PlaceSheet({
  title,
  kinds,
  chosen,
  onPick,
}: {
  title: string;
  kinds: PlaceKind[];
  chosen?: string;
  onPick: (g: GeoPoint) => void;
}) {
  const [q, setQ] = useState("");
  const [live, setLive] = useState<FoundPlace[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const key = kinds.join(",");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pool = useMemo(() => poolFor(kinds).map((p) => ({ p, hay: haystack(p) })), [key]);

  const needle = q.trim().toLowerCase();
  const rows = useMemo(
    () => rank(pool, needle, (p) => cityOf(p) === S.city),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pool, needle],
  );

  /* OpenStreetMap is the long tail, and only once something has been typed —
     it fills in the lodge nobody has added to the catalogue yet. Debounced and
     aborted per keystroke, because these are community-run and rate-limited;
     the list above has already answered by then. */
  useEffect(() => {
    if (!CONFIG.places.useOSM || needle.length < 3) {
      setLive([]);
      setBusy(false);
      return;
    }
    const ac = new AbortController();
    setBusy(true);
    setFailed(false);
    const timer = setTimeout(() => {
      searchNearby(needle, ac.signal, kinds[0] || "hotel")
        .then(setLive)
        .catch((e) => {
          if (e.name !== "AbortError") setFailed(true);
        })
        .finally(() => setBusy(false));
    }, 400);
    return () => {
      clearTimeout(timer);
      ac.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needle, key]);

  // Never show the same place twice because it is both curated and in OSM.
  const names = new Set(rows.flatMap((p) => [p.name.en.toLowerCase(), p.name.hi.toLowerCase()]));
  const extra = live.filter((p) => !names.has(p.name.toLowerCase())).slice(0, 8);

  const take = (g: GeoPoint) => {
    onPick(g);
    closeSheet();
  };

  const row = (key: string, kind: string, label: string, sub: string | undefined, on: boolean, go: () => void) => (
    <button key={key} className={"opt" + (on ? " on" : "")} onClick={go}>
      <span className="oi">
        <Icon name={ICON_FOR[kind] || "pin"} />
      </span>
      <span style={{ minWidth: 0 }}>
        <b lang={S.lang}>{label}</b>
        {sub ? <small>{sub}</small> : null}
      </span>
      <span className="chk" />
    </button>
  );

  // Only after something has been typed. An OSM-only picker starts empty by
  // design, and "nothing by that name" before a name is given is a lie.
  const nothing = !!needle && !rows.length && !extra.length && !busy;

  return (
    <div className="picksheet">
      <div className="picksheet-top">
        <h2 className="display" style={{ fontSize: "calc(19px*var(--ts))" }} lang={S.lang}>
          {title}
        </h2>
        <div className="search" style={{ margin: "10px 0 2px" }}>
          <Icon name="search" />
          <input
            type="search"
            enterKeyHint="search"
            placeholder={nm({ en: "Type a name…", hi: "नाम लिखें…" })}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {q && (
            <button className="iconbtn" aria-label="Clear" onClick={() => setQ("")}>
              <Icon name="close" />
            </button>
          )}
        </div>
        {/* the count is what says the whole catalogue is here and searchable —
            and with no catalogue behind it (a street, a landmark) there is
            nothing to count, so it says what to type instead */}
        <p className="pickhint" style={{ paddingBottom: 0 }}>
          {!pool.length
            ? nm({ en: "Type a street, a landmark or a shop", hi: "सड़क, कोई निशानी या दुकान लिखें" })
            : needle
              ? nm({ en: rows.length + " of " + pool.length + " match", hi: pool.length + " में से " + rows.length + " मिले" })
              : nm({ en: pool.length + " to choose from", hi: pool.length + " में से चुनें" })}
        </p>
      </div>

      <div className="picksheet-list opts">
        {rows.map((p) => row(p.id, p.kind, nm(p.name), detailOf(p), chosen === p.id, () =>
          take({ lat: p.lat, lng: p.lng, label: nm(p.name), ref: p.id }),
        ))}

        {extra.length > 0 && (
          <div className="srcnote">
            <Icon name="mapi" />
            {nm({ en: "From OpenStreetMap", hi: "OpenStreetMap से" })}
          </div>
        )}
        {extra.map((p) =>
          row(p.id, p.kind, p.name, p.detail, false, () => take({ lat: p.lat, lng: p.lng, label: p.name })),
        )}

        {busy && <p className="pickhint">{nm({ en: "Looking further afield…", hi: "और दूर तक खोज रहे हैं…" })}</p>}

        {nothing && (
          <p className="pickhint">
            {failed
              ? nm({
                  en: "Nothing by that name here, and the wider search is offline. Close this and choose “Somewhere else” to pin it on the map.",
                  hi: "इस नाम से कुछ नहीं मिला, और व्यापक खोज उपलब्ध नहीं। इसे बंद कर “कोई और जगह” चुनकर नक्शे पर पिन लगाएँ।",
                })
              : nm({
                  en: "Nothing by that name. Try a shorter word, or close this and choose “Somewhere else” to pin it on the map.",
                  hi: "इस नाम से कुछ नहीं मिला। छोटा शब्द आज़माएँ, या इसे बंद कर “कोई और जगह” चुनकर नक्शे पर पिन लगाएँ।",
                })}
          </p>
        )}
      </div>
    </div>
  );
}

/** Open the picker. `kinds` empty means OpenStreetMap only — a street or a landmark. */
export function openPlaceSheet(o: {
  title: string;
  kinds: PlaceKind[];
  chosen?: string;
  onPick: (g: GeoPoint) => void;
}) {
  openSheet(<PlaceSheet {...o} />);
}
