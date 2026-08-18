import { useRef } from "react";
import { imgUrl, photoAlt } from "@/data/images";
import { nm } from "@/shared/i18n/i18n";
import { useRail } from "@/features/home/useRail";
import { Photo } from "@/shared/ui/Photo";
import type { Destination } from "@/shared/types";

/**
 * The photographs of one place, swiped rather than stacked.
 *
 * Half the catalogue carries more than one picture — a gate and an inner
 * courtyard, a tank in summer and the same tank at a snan — and until now the
 * page showed the first and silently dropped the rest. They were in the
 * database, editable in the dashboard, and invisible in the app.
 *
 * ── Why it is the hero and not a strip lower down ──────────────────────────
 *
 * A row of thumbnails under the facts is the usual answer and it is the wrong
 * one here. These photographs are how somebody decides whether a place is
 * worth an hour of a short day — that is the same job the hero already does,
 * so the extra pictures belong in it rather than in a gallery nobody scrolls
 * to. One place, one photographic moment.
 *
 * ── No auto-advance ────────────────────────────────────────────────────────
 *
 * The home rails move on their own because they are ambient. This does not:
 * the reader chose this place and is looking at this picture. See useRail.
 */
export function HeroGallery({ d }: { d: Destination }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dotsRef = useRef<HTMLDivElement>(null);
  useRail(trackRef, dotsRef, 0);

  /* The main photograph first, then the gallery, with duplicates dropped — a
     gallery that repeats `img` is a common and harmless authoring habit, and
     it must not produce two identical slides and a dot that goes nowhere. */
  const shots = [d.img, ...(d.gallery || [])].filter((x, i, a) => !!x && a.indexOf(x) === i) as string[];

  // One picture, or none: the plain hero, which also carries the themed
  // fallback plate for a place that has no photograph at all.
  if (shots.length < 2) return <Photo d={d} />;

  return (
    <>
      <div className="hg-track" ref={trackRef}>
        {shots.map((k, i) => (
          <span className="hg-shot" key={k}>
            <img
              src={imgUrl(k)}
              /* Described if the Board has described it, and only the first
                 one falls back to the place's name — three slides all
                 announced "Brahma Sarovar" is noise, not a description. */
              alt={photoAlt(d, k, i === 0 ? nm(d.name) : "")}
              /* The first one is what the page opens on, so it is not lazy —
                 a lazy hero is a grey rectangle for the first moment of every
                 visit. The rest are, because most are never swiped to. */
              loading={i === 0 ? "eager" : "lazy"}
              decoding="async"
              fetchPriority={i === 0 ? "high" : "auto"}
              onLoad={(e) => e.currentTarget.classList.add("in")}
            />
          </span>
        ))}
      </div>
      {/* Count as well as position: "1 / 3" says there are more without
          asking anyone to count dots, and the dots say where you are. */}
      <div className="hg-dots" ref={dotsRef} aria-hidden="true">
        {shots.map((k) => (
          <i key={k} />
        ))}
      </div>
      <span className="hg-n">{shots.length}</span>
    </>
  );
}
