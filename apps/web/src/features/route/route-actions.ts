import { S, bump } from "@/app/state";
import { primeSpeech, resetGuide } from "@/features/journey/guide";
import { savePlan } from "@/features/planner/persist";
import { go, track } from "@/app/nav";
import { t, nm } from "@/shared/i18n/i18n";
import { dur } from "@/shared/lib/format";
import { clock } from "@/shared/lib/datetime";
import { toast } from "@/shared/ui/overlays";

export { modeWord, leaveVehicle, leaveVehicleShort } from "./mode-words";

export function saveRoute() {
  const it = S.plan && S.plan.res;
  if (!it || !it.stops.length) return;
  // the whole plan, not a summary of it — the day, the start point, the people,
  // everything the route was built from, so reopening it is not re-answering it
  savePlan(S.plan!).then(
    () => toast(t("savedT")),
    () => toast(nm({ en: "Could not save — storage is unavailable.", hi: "सहेजा नहीं जा सका — संग्रहण उपलब्ध नहीं।" })),
  );
}

export function shareRoute() {
  const it = S.plan && S.plan.res;
  if (!it) return;
  const label = typeof S.plan!.label === "string" ? S.plan!.label : nm(S.plan!.label);
  const txt =
    "Kurukshetra Saarthi · " + (label || dur(S.plan!.mins!)) + "\n" +
    it.stops.map((s, i) => i + 1 + ". " + nm(s.d.name) + " — " + clock(s.arrive)).join("\n") + "\n" +
    t("estimates");
  if (navigator.share) navigator.share({ title: "Kurukshetra Saarthi", text: txt }).catch(() => {});
  else if (navigator.clipboard) navigator.clipboard.writeText(txt).then(() => toast(t("copiedT")), () => {});
}

export function startGo() {
  const it = S.plan && S.plan.res;
  if (!it || !it.stops.length) return;
  // Audio has to be unlocked inside the gesture that starts the tour. Do it
  // here and the guide can speak later; do it later and iOS silently swallows
  // the first announcement — the one that teaches the visitor the feature
  // exists at all.
  primeSpeech();
  resetGuide();
  S.journey = { stops: it.stops.map((s) => Object.assign({}, s)), i: 0 };
  track("go_start");
  go("/go");
}

