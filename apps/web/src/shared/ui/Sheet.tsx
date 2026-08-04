import { useEffect, useRef } from "react";
import { useApp } from "@/app/state";
import { getSheet, closeSheet } from "./overlays";

const FOCUSABLE = 'button,[href],input,select,textarea,summary,[tabindex]:not([tabindex="-1"])';

/**
 * Bottom sheet + scrim.
 *
 * It is a modal, so it behaves like one: focus moves in on open, cannot leave
 * while it is up, and returns to whatever opened it on close. Escape closes it,
 * and so does dragging it down by the grab handle — the handle had been
 * promising a drag it did not do, and an affordance that does nothing teaches
 * distrust of every other control on the screen.
 *
 * The sheet stays mounted when closed (that is what the slide transition
 * animates), but it holds no content and therefore nothing focusable, so it
 * needs no inert treatment.
 */
export function Sheet() {
  useApp();
  const content = getSheet();
  const on = content != null;
  const ref = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const drag = useRef<{ y0: number; dy: number } | null>(null);

  // focus in on open, back to the trigger on close
  useEffect(() => {
    const el = ref.current;
    if (!on || !el) return;
    opener.current = document.activeElement as HTMLElement | null;
    (el.querySelector<HTMLElement>(FOCUSABLE) || el).focus();
    return () => opener.current?.focus?.();
  }, [on]);

  // Escape closes; Tab cycles inside instead of escaping to the page behind
  useEffect(() => {
    if (!on) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return closeSheet();
      if (e.key !== "Tab") return;
      const f = Array.from(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) || []);
      if (!f.length) return;
      const first = f[0],
        last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [on]);

  /* Drag down to dismiss. Past a third of the sheet's height it goes; anything
     less springs back, so a hesitant thumb costs nothing. */
  const start = (e: React.PointerEvent<HTMLDivElement>) => {
    drag.current = { y0: e.clientY, dy: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current,
      el = ref.current;
    if (!d || !el) return;
    d.dy = Math.max(0, e.clientY - d.y0);
    el.style.transition = "none";
    el.style.transform = "translateY(" + d.dy + "px)";
  };
  const end = () => {
    const d = drag.current,
      el = ref.current;
    drag.current = null;
    if (!d || !el) return;
    el.style.transition = "";
    el.style.transform = "";
    if (d.dy > el.offsetHeight / 3) closeSheet();
  };

  return (
    <>
      <div className={"scrim" + (on ? " on" : "")} onClick={closeSheet} />
      <div
        ref={ref}
        className={"sheet" + (on ? " on" : "")}
        role="dialog"
        aria-modal="true"
        aria-label="Options"
        tabIndex={-1}
      >
        {on && (
          <div
            className="grab"
            role="button"
            tabIndex={0}
            aria-label="Close"
            onClick={closeSheet}
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
          />
        )}
        {content}
      </div>
    </>
  );
}
