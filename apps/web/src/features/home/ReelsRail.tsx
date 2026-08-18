import { useEffect, useRef } from "react";
import { S } from "@/app/state";
import { track } from "@/app/nav";
import { t, nm } from "@/shared/i18n/i18n";
import { REELS, reelsFor } from "@/data/reels-hero";
import { imgUrl } from "@/data/images";
import { byId } from "@/shared/lib/geo";
import { Icon } from "@/shared/icons/Icon";

/** frames behind a reel preview: the place's own photo + gallery, up to 3. */
function reelFrames(pid: string): string[] {
  const d = byId(pid);
  if (!d) return [];
  return [d.img, ...(d.gallery || [])].filter((k): k is string => !!k && !!imgUrl(k)).slice(0, 3);
}

function openReel(id: string) {
  const r = REELS.find((x) => x.id === id);
  if (!r) return;
  track("reel_open", id);
  window.open(r.url, "_blank", "noopener");
}

/**
 * Visitor reels rail. Auto-scrolls, pauses the moment a finger lands on it.
 * `pid` limits to one place's reels (used on the place page); null shows all.
 */
export function ReelsRail({ pid }: { pid?: string | null }) {
  // On a place page, that place's reels. On Home, the town's — a reel filmed at
  // Brahma Sarovar under a Pehowa header is the same mismatch as the hero.
  const list = pid ? REELS.filter((r) => r.place === pid) : reelsFor();
  const trackRef = useRef<HTMLDivElement>(null);
  const hold = useRef(false);

  useEffect(() => {
    const tr = trackRef.current;
    if (!tr || !list.length) return;
    const onDown = () => (hold.current = true);
    tr.addEventListener("pointerdown", onDown, { passive: true });
    const id = setInterval(() => {
      if (hold.current) return;
      const card = tr.children[0] as HTMLElement | undefined;
      if (!card) return;
      const step = card.getBoundingClientRect().width + 11;
      const nextL = tr.scrollLeft + step;
      tr.scrollTo({
        left: nextL >= tr.scrollWidth - tr.clientWidth - 4 ? 0 : nextL,
        behavior: "smooth",
      });
    }, 4200);
    return () => {
      clearInterval(id);
      tr.removeEventListener("pointerdown", onDown);
    };
  }, [list.length]);

  if (!list.length) return null;

  return (
    <div className="sec reels">
      <div className="sec-head">
        <h2 lang={S.lang}>
          <Icon name="reel" />
          {pid ? t("reelsHere") : t("reels")}
        </h2>
        <span className="ig">{t("reelsBy")}</span>
      </div>
      <div className="reel-track" ref={trackRef}>
        {list.map((r) => {
          const d = byId(r.place);
          if (!d) return null;
          const frames = reelFrames(r.place);
          return (
            <button
              key={r.id}
              className="reel"
              onClick={() => openReel(r.id)}
              aria-label={nm(r.cap) + " — " + nm(d.name)}
            >
              <span className="rfilm">
                {frames.map((k, i) => (
                  <img
                    key={k}
                    src={imgUrl(k)}
                    alt=""
                    decoding="async"
                    loading="lazy"
                    className={i ? "" : "on"}
                    style={{ animationDelay: i * 2.6 + "s" }}
                  />
                ))}
                <span className="rveil" />
                <span className="rplay">
                  <Icon name="play" />
                </span>
                <span className="rlive">{nm({ en: "REEL", hi: "रील" })}</span>
              </span>
              <span className="rmeta">
                <b lang={S.lang}>{nm(d.name)}</b>
                <i>{nm(r.cap)}</i>
                <u>{r.by}</u>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
