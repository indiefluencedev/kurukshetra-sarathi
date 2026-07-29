import { S } from "@/app/state";
import { go, track } from "@/app/nav";
import { t, nm } from "@/shared/i18n/i18n";
import { openSheet, closeSheet } from "@/shared/ui/overlays";
import { Icon } from "@/shared/icons/Icon";
import type { Loc } from "@/shared/types";

const DEMO: [string, string, Loc, Loc][] = [
  ["cal", "sun", { en: "Tell it which day you are going", hi: "बताइए किस दिन जाना है" }, { en: "Open <b>Plan</b> at the bottom of the screen. It starts on today. If you are going another day, tap that date on the calendar. The weather card on this screen tells you what to carry.", hi: "नीचे <b>योजना</b> दबाइए। यह आज से शुरू होता है। किसी और दिन जाना हो तो कैलेंडर में वह तारीख़ दबाइए। इस स्क्रीन का मौसम कार्ड बताता है कि क्या साथ ले जाएँ।" }],
  ["clock", "clock", { en: "Say how much time you have", hi: "बताइए कितना समय है" }, { en: "Two hours, half a day, three days — tap whichever is true. Nothing is fixed; you can change it later.", hi: "दो घंटे, आधा दिन, तीन दिन — जो सही हो वही दबाइए। कुछ भी स्थायी नहीं, बाद में बदल सकते हैं।" }],
  ["route", "route", { en: "Let it build the route", hi: "मार्ग बनने दीजिए" }, { en: "It puts the stops in a sensible order, allows for the drive between them, and leaves out anything shut on the day you chose.", hi: "यह पड़ावों को उचित क्रम में रखता है, बीच की यात्रा का समय जोड़ता है, और आपके चुने दिन बंद रहने वाले स्थल हटा देता है।" }],
  ["navigate", "navigate", { en: "Set out, and follow it", hi: "निकलिए, और अनुसरण कीजिए" }, { en: "Tap <b>Start</b>. At each stop there is a <b>Navigate</b> button — that opens your maps app and drives you there.", hi: "<b>आरंभ</b> दबाइए। हर पड़ाव पर <b>दिशा</b> बटन है — वह आपका नक्शा ऐप खोलकर वहाँ पहुँचाता है।" }],
  ["calplus", "calplus", { en: "Keep it, or put it in your calendar", hi: "सहेजिए, या कैलेंडर में डालिए" }, { en: "<b>Save</b> keeps the route inside this app. <b>Calendar</b> puts every stop in your phone's calendar with a reminder before each one.", hi: "<b>सहेजें</b> मार्ग को इसी ऐप में रखता है। <b>कैलेंडर</b> हर पड़ाव को आपके फ़ोन के कैलेंडर में स्मरण-सूचना सहित डाल देता है।" }],
];

export function showDemo() {
  track("demo_open");
  openSheet(
    <>
      <h2 className="display" style={{ fontSize: "calc(21px*var(--ts))" }} lang={S.lang}>
        {nm({ en: "How to use this app", hi: "यह ऐप कैसे उपयोग करें" })}
      </h2>
      <p className="muted" style={{ margin: "8px 0 12px", fontSize: "calc(13.5px*var(--ts))", lineHeight: 1.6 }}>
        {nm({ en: "Nothing here can be broken. Tap anything; the arrow at the top left always brings you back.", hi: "यहाँ कुछ भी बिगड़ नहीं सकता। कुछ भी दबाइए; ऊपर बाईं ओर का तीर सदैव वापस ले आता है।" })}
      </p>
      <div className="demo">
        {DEMO.map((x, i) => (
          <div className="demostep" key={i}>
            <span className="n">{i + 1}</span>
            <span style={{ flex: 1 }}>
              <b lang={S.lang}>{nm(x[2])}</b>
              <p dangerouslySetInnerHTML={{ __html: nm(x[3]) }} />
            </span>
            <span className="ic">
              <Icon name={x[1]} />
            </span>
          </div>
        ))}
      </div>
      <button
        className="btn primary"
        style={{ marginTop: 16, minHeight: 54, fontSize: "calc(16px*var(--ts))" }}
        onClick={() => {
          closeSheet();
          go("/plan");
        }}
      >
        <Icon name="route" />
        {nm({ en: "Start planning", hi: "योजना आरंभ करें" })}
      </button>
      <button className="btn ghost" style={{ marginTop: 9 }} onClick={closeSheet}>
        {t("gotIt")}
      </button>
    </>,
  );
}

export function HowToCard() {
  return (
    <button className="card rcard" style={{ marginTop: 20, width: "100%" }} onClick={showDemo}>
      <span className="ic">
        <Icon name="help" />
      </span>
      <span style={{ flex: 1 }}>
        <h3 lang={S.lang}>{nm({ en: "How to use this app", hi: "यह ऐप कैसे उपयोग करें" })}</h3>
        <p>{nm({ en: "Five short steps. Under a minute.", hi: "पाँच छोटे चरण। एक मिनट से कम।" })}</p>
      </span>
      <span style={{ color: "var(--stone-2)", display: "grid", placeItems: "center" }}>
        <Icon name="fwd" />
      </span>
    </button>
  );
}
