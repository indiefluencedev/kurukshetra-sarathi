import { useEffect, type RefObject } from "react";

/**
 * Swipe, auto-advance and dots for a snap-scrolling rail.
 *
 * Lifted out of HeroRail when the event rail needed the same behaviour. Two
 * rails, one implementation — a second copy would be a second place for the
 * auto-advance to keep running after the visitor has taken hold of it, which
 * is the bug this interaction is actually about.
 *
 * The step is measured from the distance between the first two cards rather
 * than assumed from a width plus a hard-coded gap, so a rail can change its
 * card size or spacing in CSS without the dots quietly falling out of step.
 */
export function useRail(
  trackRef: RefObject<HTMLDivElement>,
  dotsRef: RefObject<HTMLDivElement>,
  everyMs = 5000,
) {
  useEffect(() => {
    const tr = trackRef.current;
    if (!tr) return;
    let hold = false;

    const step = () => {
      const a = tr.children[0] as HTMLElement | undefined;
      const b = tr.children[1] as HTMLElement | undefined;
      if (!a) return 0;
      return b ? b.offsetLeft - a.offsetLeft : a.getBoundingClientRect().width;
    };

    const sync = () => {
      const dt = dotsRef.current;
      const w = step();
      if (!dt || !w) return;
      const i = Math.min(dt.children.length - 1, Math.max(0, Math.round(tr.scrollLeft / w)));
      for (let n = 0; n < dt.children.length; n++) dt.children[n].classList.toggle("on", n === i);
    };

    // Once someone has touched the rail it is theirs — a card sliding out from
    // under a reading finger is the whole complaint about carousels.
    const onDown = () => (hold = true);

    tr.addEventListener("scroll", sync, { passive: true });
    tr.addEventListener("pointerdown", onDown, { passive: true });
    sync();

    /* everyMs of 0 means "dots and swipe, but never move on its own".
     *
     * Auto-advance is right for the home rails, which are ambient — nobody is
     * reading them, they are showing what is on. It is wrong for a detail
     * page's photographs: the reader chose that place and is looking at THAT
     * picture, and sliding the next one under them is the entire complaint
     * people have about carousels. */
    if (!everyMs) return () => {
      tr.removeEventListener("scroll", sync);
      tr.removeEventListener("pointerdown", onDown);
    };

    const id = setInterval(() => {
      if (hold) return;
      const w = step();
      if (!w) return;
      const next = Math.round(tr.scrollLeft / w) + 1;
      tr.scrollTo({ left: next >= tr.children.length ? 0 : next * w, behavior: "smooth" });
    }, everyMs);

    return () => {
      clearInterval(id);
      tr.removeEventListener("scroll", sync);
      tr.removeEventListener("pointerdown", onDown);
    };
  }, [trackRef, dotsRef, everyMs]);
}
