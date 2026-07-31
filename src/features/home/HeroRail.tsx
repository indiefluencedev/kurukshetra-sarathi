import { useEffect, useRef } from "react";
import { S } from "@/app/state";
import { go } from "@/app/nav";
import { t, nm } from "@/shared/i18n/i18n";
import { HERO } from "@/data/reels-hero";
import { imgUrl } from "@/data/images";
import { byId } from "@/shared/lib/geo";
import { Icon } from "@/shared/icons/Icon";

/** Must-see carousel: swipe, auto-advance every 5s (stops once touched), dots. */
export function HeroRail() {
  const trackRef = useRef<HTMLDivElement>(null);
  const dotsRef = useRef<HTMLDivElement>(null);
  const hold = useRef(false);

  useEffect(() => {
    const tr = trackRef.current;
    if (!tr) return;
    const step = () => (tr.children[0]?.getBoundingClientRect().width || 0) + 11;
    const sync = () => {
      const dt = dotsRef.current;
      const w = step();
      if (!dt || !w) return;
      const i = Math.min(dt.children.length - 1, Math.max(0, Math.round(tr.scrollLeft / w)));
      for (let n = 0; n < dt.children.length; n++) dt.children[n].classList.toggle("on", n === i);
    };
    const onDown = () => (hold.current = true);
    tr.addEventListener("scroll", sync, { passive: true });
    tr.addEventListener("pointerdown", onDown, { passive: true });
    const id = setInterval(() => {
      if (hold.current) return;
      const w = step();
      if (!w) return;
      const next = Math.round(tr.scrollLeft / w) + 1;
      tr.scrollTo({ left: next >= tr.children.length ? 0 : next * w, behavior: "smooth" });
    }, 5000);
    return () => {
      clearInterval(id);
      tr.removeEventListener("scroll", sync);
      tr.removeEventListener("pointerdown", onDown);
    };
  }, []);

  return (
    <div className="hero-c">
      <div className="hero-track" ref={trackRef}>
        {HERO.map((h, i) => {
          const d = byId(h.id);
          if (!d) return null;
          return (
            <button
              key={h.id}
              className="hero-slide"
              onClick={() => go("/place/" + h.id)}
              aria-label={nm(d.name)}
            >
              <span className="hs-img">
                <img
                  src={imgUrl(h.img)}
                  alt=""
                  loading={i < 2 ? undefined : "lazy"}
                  onLoad={(e) => e.currentTarget.classList.add("in")}
                />
              </span>
              <span className="hs-scrim" />
              <span className="hs-body">
                <span className="hs-kick">
                  {t("mustSee")} · {i + 1}/{HERO.length}
                </span>
                <span className="hs-name" lang={S.lang}>
                  {nm(d.name)}
                </span>
                <span className="hs-alt" lang={S.lang === "hi" ? "en" : "hi"}>
                  {S.lang === "hi" ? d.name.en : d.name.hi}
                </span>
                <span className="hs-fact">
                  <Icon name="tara" />
                  <span>{nm(h.fact)}</span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="hero-dots" ref={dotsRef}>
        {HERO.map((_, i) => (
          <i key={i} className={i ? "" : "on"} />
        ))}
      </div>
    </div>
  );
}
