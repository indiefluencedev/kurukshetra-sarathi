import { useRef } from "react";
import { S, store, bump } from "@/app/state";
import { go } from "@/app/nav";
import { Icon } from "@/shared/icons/Icon";
import { LOGO } from "@/data/images";
import type { Lang } from "@/shared/types";

/** Splash + language gate. Confirms the tap, plays the plate out, lands on /begin. */
export function Start() {
  const splashRef = useRef<HTMLDivElement>(null);
  const gate = useRef(false);

  const pickLang = (l: Lang, e: React.MouseEvent<HTMLButtonElement>) => {
    if (gate.current) return;
    gate.current = true;
    S.lang = l;
    store.lang = l;
    document.documentElement.lang = l;
    e.currentTarget.classList.add("chosen");
    const sp = splashRef.current;
    setTimeout(() => sp?.classList.add("leaving"), 170);
    setTimeout(() => sp?.classList.add("gone"), 300);
    setTimeout(() => {
      gate.current = false;
      bump();
      go("/begin");
    }, 720);
  };

  return (
    <div className="splash" ref={splashRef}>
      <div className="rays" aria-hidden="true" />
      <div className="crest">
        <div className="halo" aria-hidden="true" />
        <div className="seal">
          <img src={LOGO} alt="Kurukshetra Development Board" />
        </div>
        <div className="board">Kurukshetra Development Board</div>
        <div className="boardhi" lang="hi">कुरुक्षेत्र विकास मंडल</div>
        <div className="rule" aria-hidden="true" />
        <h1>
          Kurukshetra<span className="dev" lang="hi">कुरुक्षेत्र</span>
        </h1>
        <div className="kos">48 Kos Tirtha Land</div>
      </div>
      <div className="gate">
        <div className="ask">
          Choose your language<span className="h" lang="hi">अपनी भाषा चुनें</span>
        </div>
        <div className="langs">
          <button className="lang" onClick={(e) => pickLang("en", e)} aria-label="Continue in English">
            <span className="tick">
              <Icon name="check" />
            </span>
            <span className="big">English</span>
            <span className="sub">English</span>
          </button>
          <button className="lang" onClick={(e) => pickLang("hi", e)} lang="hi" aria-label="हिन्दी में जारी रखें">
            <span className="tick">
              <Icon name="check" />
            </span>
            <span className="big dev">हिन्दी</span>
            <span className="sub">Hindi</span>
          </button>
        </div>
        <div className="foot">
          Change it anytime in Settings · <span lang="hi">सेटिंग्स में कभी भी बदलें</span>
        </div>
      </div>
    </div>
  );
}
