import { S, store, bump } from "@/app/state";
import { go, track } from "@/app/nav";
import { t, nm } from "@/shared/i18n/i18n";
import { dur } from "@/shared/lib/format";
import { clock } from "@/shared/lib/datetime";
import { toast } from "@/shared/ui/overlays";

export const modeWord = () => {
  const m = (S.plan && S.plan.mode) || "car";
  return m === "walking" ? t("walkThere") : m === "public" ? t("rideThere") : t("driveThere");
};

export function saveRoute() {
  const it = S.plan && S.plan.res;
  if (!it || !it.stops.length) return;
  const a = store.routes;
  a.unshift({
    id: "r" + Date.now(),
    title: (typeof S.plan!.label === "string" ? S.plan!.label : nm(S.plan!.label)) || dur(S.plan!.mins!),
    at: Date.now(),
    ids: it.stops.map((s) => s.d.id),
    mode: S.plan!.mode,
    pace: S.plan!.pace,
    themes: S.plan!.themes,
    mins: S.plan!.mins,
  });
  store.routes = a;
  toast(t("savedT"));
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
  S.journey = { stops: it.stops.map((s) => Object.assign({}, s)), i: 0 };
  track("go_start");
  go("/go");
}

export function useAlt(i: number) {
  const a = S.plan!.alts[i];
  if (!a) return;
  const old = S.plan!.res!;
  S.plan!.res = a.it;
  S.plan!.alts = [{ tag: "primary", it: old } as any].concat(S.plan!.alts.filter((_, n) => n !== i));
  bump();
  window.scrollTo(0, 0);
  toast(t("applied"));
}
