// The day, written out in sentences. The timeline below it is dense — times,
// distances, opening pills — and dense is exactly what an eighty-year-old
// pilgrim with a paper map and reading glasses cannot use. This is the same
// route said plainly: one short sentence per thing that happens, in order.
import { S } from "@/app/state";
import { nm } from "@/shared/i18n/i18n";
import { dur } from "@/shared/lib/format";
import { leaveVehicle } from "./mode-words";
import { clock } from "@/shared/lib/datetime";
import type { Itinerary, Plan } from "@/shared/types";

export interface Line {
  ic: string;
  time?: string;
  text: string;
}

const MODE_VERB: Record<string, { en: string; hi: string }> = {
  walking: { en: "Walk", hi: "पैदल चलें" },
  public: { en: "Take the bus", hi: "बस लें" },
  twowheeler: { en: "Ride", hi: "चलें" },
  erickshaw: { en: "Take an e-rickshaw", hi: "ई-रिक्शा लें" },
  taxi: { en: "Take a taxi", hi: "टैक्सी लें" },
  car: { en: "Drive", hi: "गाड़ी से चलें" },
};

export function explain(it: Itinerary, p: Plan): Line[] {
  const stops = it.stops as any[];
  const breaks = ((it as any).breaks || []) as any[];
  const T = it.totals as any;
  const verb = MODE_VERB[p.mode] || MODE_VERB.car;
  const out: Line[] = [];
  if (!stops.length) return out;

  out.push({
    ic: "pin",
    time: clock(stops[0].arrive - stops[0].travel - stops[0].wait),
    text: nm({
      en: `Set off from ${p.start.label || "your starting point"}.`,
      hi: `${p.start.label || "अपने आरंभ स्थान"} से निकलें।`,
    }),
  });

  stops.forEach((s, i) => {
    const name = nm(s.d.name);
    const move = nm({ en: verb.en, hi: verb.hi });
    // A stop reached on foot is the one line in the walkthrough that changes
    // what the visitor physically does — they leave the car where it is. Say
    // that, rather than "drive 2 min" for a hundred metres of the same lane.
    let text = s.anchor
      ? nm({
          en: `${leaveVehicle()} ${dur(s.travel)} to ${name}. Stay about ${dur(s.visit)}.`,
          hi: `${leaveVehicle()} ${dur(s.travel)} — ${name}। लगभग ${dur(s.visit)} रुकें।`,
        })
      : nm({
          en: `${move} ${dur(s.travel)} to ${name}. Stay about ${dur(s.visit)}.`,
          hi: `${dur(s.travel)} ${move} — ${name}। लगभग ${dur(s.visit)} रुकें।`,
        });
    if (s.wait > 5)
      text += nm({
        en: ` It opens at ${clock(s.arrive)}, so there is a short wait.`,
        hi: ` यह ${clock(s.arrive)} बजे खुलता है, थोड़ी प्रतीक्षा होगी।`,
      });
    out.push({ ic: s.anchor ? "walk" : "route", time: clock(s.arrive), text });

    breaks
      .filter((b) => b.after === i)
      .forEach((b) =>
        out.push({
          ic: b.kind === "tea" ? "clock" : "surya",
          time: clock(b.at),
          text: nm({
            en: `${nm(b.name)} — about ${dur(b.min)}. ${nm(b.note)}`,
            hi: `${nm(b.name)} — लगभग ${dur(b.min)}। ${nm(b.note)}`,
          }),
        }),
      );
  });

  const endName = p.endType === "backToStart" ? p.start.label : p.end.label;
  out.push({
    ic: "check",
    time: clock(T.finish),
    text: nm({
      en: `Head back to ${endName || "where you finish"}. You should be there by ${clock(T.finish)}.`,
      hi: `${endName || "समाप्ति स्थान"} लौटें। आप ${clock(T.finish)} तक पहुँच जाएँगे।`,
    }),
  });

  return out;
}

/** One sentence that says what kind of day this is, before any of the detail. */
export function gist(it: Itinerary, p: Plan): string {
  const stops = it.stops as any[];
  const T = it.totals as any;
  const start = clock(stops[0].arrive - stops[0].travel - stops[0].wait);
  const meals = ((it as any).breaks || []).length;
  const lang = S.lang;
  if (lang === "hi")
    return `${stops.length} स्थान, ${start} से ${clock(T.finish)} तक। ${dur(T.travel)} यात्रा, ${dur(T.visit)} दर्शन${meals ? `, और ${meals} विराम` : ""}।`;
  return `${stops.length} places, from ${start} to ${clock(T.finish)}. ${dur(T.travel)} travelling, ${dur(T.visit)} at the places${meals ? `, and ${meals} break${meals > 1 ? "s" : ""} along the way` : ""}.`;
}
