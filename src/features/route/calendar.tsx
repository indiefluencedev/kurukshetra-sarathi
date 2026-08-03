import { S } from "@/app/state";
import { track, planDate } from "@/app/nav";
import { t, nm } from "@/shared/i18n/i18n";
import { clock, pad2 } from "@/shared/lib/datetime";
import { openSheet, closeSheet, toast } from "@/shared/ui/overlays";
import { Icon } from "@/shared/icons/Icon";
import { MONS } from "@/features/planner/plan";

interface CalEvent {
  title: string;
  start: string;
  end: string;
  where: string;
  desc: string;
}

function stampUTC(dateObj: Date, mins: number): string {
  const d = new Date(dateObj.getTime());
  d.setHours(0, 0, 0, 0);
  d.setMinutes(Math.round(mins));
  return (
    d.getUTCFullYear() + pad2(d.getUTCMonth() + 1) + pad2(d.getUTCDate()) + "T" +
    pad2(d.getUTCHours()) + pad2(d.getUTCMinutes()) + "00Z"
  );
}

function calStops(): CalEvent[] {
  const it = S.plan && S.plan.res;
  if (!it || !it.stops.length) return [];
  const base = planDate();
  return it.stops.map((s) => ({
    title: nm(s.d.name),
    start: stampUTC(base, s.arrive),
    end: stampUTC(base, s.depart),
    where: nm(s.d.name) + ", Kurukshetra, Haryana",
    desc: nm(s.d.short) + "\n\n" + nm({ en: "Planned with the Kurukshetra Saarthi.", hi: "कुरुक्षेत्र टूरिज़्म ऐप से नियोजित।" }),
  }));
}

function gcalOne(i: number) {
  const e = calStops()[i];
  if (!e) return;
  const u =
    "https://calendar.google.com/calendar/render?action=TEMPLATE" +
    "&text=" + encodeURIComponent(e.title) +
    "&dates=" + e.start + "/" + e.end +
    "&details=" + encodeURIComponent(e.desc) +
    "&location=" + encodeURIComponent(e.where);
  track("gcal_one");
  window.open(u, "_blank", "noopener");
}

function icsFile() {
  const ev = calStops();
  if (!ev.length) {
    toast(t("noRoute"));
    return;
  }
  const stamp = stampUTC(new Date(), new Date().getHours() * 60 + new Date().getMinutes());
  const esc2 = (x: unknown) =>
    String(x).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  let out = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Kurukshetra Saarthi//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  ev.forEach((e, i) => {
    out = out.concat([
      "BEGIN:VEVENT", "UID:kkr-" + Date.now() + "-" + i + "@kurukshetra",
      "DTSTAMP:" + stamp, "DTSTART:" + e.start, "DTEND:" + e.end,
      "SUMMARY:" + esc2(i + 1 + ". " + e.title),
      "LOCATION:" + esc2(e.where), "DESCRIPTION:" + esc2(e.desc),
      "BEGIN:VALARM", "TRIGGER:-PT15M", "ACTION:DISPLAY", "DESCRIPTION:" + esc2(e.title), "END:VALARM",
      "END:VEVENT",
    ]);
  });
  out.push("END:VCALENDAR");
  const blob = new Blob([out.join("\r\n")], { type: "text/calendar;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "kurukshetra-" + S.plan!.date + ".ics";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1500);
  track("ics_download");
  toast(nm({ en: "Calendar file downloaded", hi: "कैलेंडर फ़ाइल डाउनलोड हुई" }));
}

export function calSheet() {
  const ev = calStops();
  if (!ev.length) {
    toast(t("noRoute"));
    return;
  }
  const d = planDate();
  const dateLine = d.getDate() + " " + MONS[S.lang === "hi" ? "hi" : "en"][d.getMonth()] + " " + d.getFullYear();
  const stops = S.plan!.res!.stops;
  openSheet(
    <>
      <h2 className="display" style={{ fontSize: "calc(20px*var(--ts))" }} lang={S.lang}>
        {nm({ en: "Add to your calendar", hi: "कैलेंडर में जोड़ें" })}
      </h2>
      <p className="muted" style={{ margin: "7px 0 14px", fontSize: "calc(13px*var(--ts))", lineHeight: 1.55 }}>
        {nm({ en: "Your route for ", hi: "आपका मार्ग — " })}
        {dateLine}.{" "}
        {nm({ en: "The file below carries every stop with a fifteen-minute reminder, and opens in Google, Apple or Outlook calendars alike.", hi: "नीचे दी फ़ाइल में हर पड़ाव पंद्रह मिनट की स्मरण-सूचना सहित है, और यह गूगल, ऐपल व आउटलुक तीनों कैलेंडर में खुलती है।" })}
      </p>
      <button className="btn primary" style={{ minHeight: 52 }} onClick={icsFile}>
        <Icon name="download" />
        {nm({ en: "Download the whole day", hi: "पूरा दिन डाउनलोड करें" })}
      </button>
      <h3 style={{ margin: "18px 0 2px", fontSize: "calc(13px*var(--ts))", letterSpacing: ".11em", textTransform: "uppercase", color: "var(--muted)" }}>
        {nm({ en: "Or add one stop at a time to Google", hi: "अथवा गूगल में एक-एक पड़ाव जोड़ें" })}
      </h3>
      {ev.map((e, i) => (
        <button className="card rcard" style={{ marginTop: 8 }} onClick={() => gcalOne(i)} key={i}>
          <span className="ic">
            <Icon name="calplus" />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <h3 lang={S.lang}>{e.title}</h3>
            <p>
              {clock(stops[i].arrive)} – {clock(stops[i].depart)}
            </p>
          </span>
          <span style={{ color: "var(--stone-2)", display: "grid", placeItems: "center" }}>
            <Icon name="fwd" />
          </span>
        </button>
      ))}
      <button className="btn ghost" style={{ marginTop: 14 }} onClick={closeSheet}>
        {t("gotIt")}
      </button>
    </>,
  );
}
