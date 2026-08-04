import { useEffect, useRef, useState } from "react";
import { S } from "@/app/state";
import { t, nm, nPlaces } from "@/shared/i18n/i18n";
import { D } from "@/data/destinations";
import { isOpen } from "@/shared/lib/geo";
import { Icon } from "@/shared/icons/Icon";
import { Pcard } from "@/shared/ui/PlaceCard";

type Filters = { open?: boolean; free?: boolean; indoor?: boolean; short?: boolean };

/** Search over all places, with open/free/indoor/short filters. */
export function Search() {
  const [q, setQ] = useState(S.sq);
  const [sf, setSf] = useState<Filters>(S.sf);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const i = inputRef.current;
    if (i) {
      i.focus();
      i.setSelectionRange(i.value.length, i.value.length);
    }
  }, []);
  // keep the global copies in sync (so returning to search restores state)
  useEffect(() => {
    S.sq = q;
    S.sf = sf;
  }, [q, sf]);

  const query = q.trim().toLowerCase();
  const res = D.filter((d) => {
    if (query) {
      const hay = (d.name.en + " " + d.name.hi + " " + nm(d.short) + " " + d.themes.join(" ")).toLowerCase();
      if (hay.indexOf(query) < 0) return false;
    }
    if (sf.open && !isOpen(d)) return false;
    if (sf.free && !d.free) return false;
    if (sf.indoor && !d.indoor) return false;
    if (sf.short && d.visit.rec > 40) return false;
    return true;
  }).sort((a, b) => (b.rank || 0) - (a.rank || 0));

  const anyFilter = Object.values(sf).some(Boolean);
  const toggle = (k: keyof Filters) => setSf((p) => ({ ...p, [k]: !p[k] }));
  const chip = (k: keyof Filters, lb: string) => (
    <button className={"chip" + (sf[k] ? " on" : "")} aria-pressed={!!sf[k]} onClick={() => toggle(k)}>
      {lb}
    </button>
  );

  return (
    <>
      <div className="phead">
        <button className="back" onClick={() => history.back()} aria-label={t("back")}>
          <Icon name="back" />
        </button>
        <h1 className="display" style={{ fontSize: "calc(19px*var(--ts))" }} lang={S.lang}>
          {t("searchPh")}
        </h1>
      </div>
      <div className="search">
        <Icon name="search" />
        <input
          ref={inputRef}
          type="search"
          placeholder={t("searchPh")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {q && (
          <button className="iconbtn" style={{ width: 32, minWidth: 32 }} onClick={() => setQ("")}>
            <Icon name="close" />
          </button>
        )}
      </div>
      <div className="hscroll" style={{ marginTop: 11 }}>
        {chip("open", t("fOpen"))}
        {chip("free", t("fFree"))}
        {chip("indoor", t("fIndoor"))}
        {chip("short", t("fShort"))}
      </div>
      <p className="srescount" role="status" aria-live="polite" lang={S.lang}>
        {res.length ? nPlaces(res.length) : ""}
      </p>
      {/* no .stagger on these results: they change on every keystroke, and an
          entrance animation on a live filter is a flicker, not a flourish */}
      {res.length ? (
        <div className="plist">
          {res.map((d) => (
            <Pcard key={d.id} d={d} />
          ))}
        </div>
      ) : (
        <div className="empty">
          <Icon name="search" />
          <p className="t">{t("nothing")}</p>
          <p>{t("nothingD")}</p>
          {/* when a filter is what emptied the list, clearing it is the likely
              fix — offer it rather than making them find which chip did it */}
          {anyFilter && (
            <button
              className="btn ghost"
              style={{ maxWidth: 230, margin: "16px auto 0" }}
              onClick={() => setSf({})}
            >
              {nm({ en: "Clear filters", hi: "फ़िल्टर हटाएँ" })}
            </button>
          )}
        </div>
      )}
    </>
  );
}
