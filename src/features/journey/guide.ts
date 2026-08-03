// guide.ts — the voice of the drive guide, and the rules that keep it welcome.
//
// It says one thing: what you are passing, and which window to look out of.
// Everything else here exists to stop it saying that too often, at the wrong
// moment, or about somewhere you are already going.
import { S } from "@/app/state";

/* ---- what "not a nag" means, in numbers ---- */
/** metres before the closest approach to start speaking — about 15s at town speed */
export const LEAD_M = 220;
/** never two announcements closer together than this */
const GAP_MS = 45_000;
/** below this speed you are parked or crawling, not passing anything */
const MOVING_KMH = 8;

let lastAt = 0;
const said = new Set<string>();

/** Forget everything said — a new journey starts with a clean slate. */
export function resetGuide() {
  said.clear();
  lastAt = 0;
  try {
    speechSynthesis?.cancel();
  } catch {
    /* no speech in this browser */
  }
}

export const alreadySaid = (id: string) => said.has(id);

/**
 * Should we announce this place, now?
 *
 * `progress` and `along` are metres from the start of the route; `speed` is
 * m/s from the fix, or null when the browser does not supply it.
 */
export function due(id: string, progress: number, along: number, speed: number | null, now: number): boolean {
  if (said.has(id)) return false;
  if (now - lastAt < GAP_MS) return false;
  // Standing still means you are AT somewhere, not passing it. A null speed is
  // treated as moving, because some browsers never fill it in and silence
  // would then be permanent.
  if (speed != null && speed * 3.6 < MOVING_KMH) return false;
  // in the window: close enough to be useful, not so far past that "on your
  // left" is a lie
  return progress >= along - LEAD_M && progress <= along + 60;
}

/** Mark a place as announced, so it is never repeated on this journey. */
export function markSaid(id: string, now: number) {
  said.add(id);
  lastAt = now;
}

/* ---- speech ----
   Two things about the Web Speech API decide the design here:
   iOS will not speak until an utterance has been triggered inside a real user
   gesture, and Hindi voices are present on most Android and iOS builds but
   absent on some desktops. So we prime on the tap that starts the tour, and we
   never depend on the voice alone — the card on screen carries the same words. */

export const speechAvailable = () => typeof speechSynthesis !== "undefined";

let primed = false;

/**
 * Unlock audio. MUST be called synchronously inside a user gesture (the tap
 * that starts the tour), or the first real announcement is silent on iOS.
 */
export function primeSpeech() {
  if (primed || !speechAvailable()) return;
  try {
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    speechSynthesis.speak(u);
    primed = true;
  } catch {
    /* not fatal — the card still shows */
  }
}

function voiceFor(lang: string): SpeechSynthesisVoice | undefined {
  const want = lang === "hi" ? "hi" : "en";
  const all = speechSynthesis.getVoices();
  return (
    all.find((v) => v.lang.toLowerCase().startsWith(want + "-in")) ||
    all.find((v) => v.lang.toLowerCase().startsWith(want))
  );
}

/** Say it, if this device can and the visitor has not turned the voice off. */
export function speak(text: string) {
  if (!speechAvailable() || !voiceOn()) return;
  try {
    const u = new SpeechSynthesisUtterance(text);
    const v = voiceFor(S.lang);
    if (v) u.voice = v;
    u.lang = S.lang === "hi" ? "hi-IN" : "en-IN";
    // Place names carry the meaning here, and they are long. Slightly slow.
    u.rate = 0.92;
    speechSynthesis.cancel(); // never let two announcements overlap
    speechSynthesis.speak(u);
  } catch {
    /* the card still shows */
  }
}

/* ---- the mute switch, remembered between journeys ---- */
const KEY = "k_guide_voice";
export const voiceOn = () => localStorage.getItem(KEY) !== "0";
export const setVoiceOn = (on: boolean) => {
  localStorage.setItem(KEY, on ? "1" : "0");
  if (!on) {
    try {
      speechSynthesis?.cancel();
    } catch {
      /* ignore */
    }
  }
};
