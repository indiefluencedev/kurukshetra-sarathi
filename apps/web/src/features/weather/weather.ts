import { CONFIG } from "@/data/config";
import { S, bump, city, type WeatherState } from "@/app/state";
import type { Loc } from "@/shared/types";

// WMO weather codes → [glyph, label]. Ported verbatim from the demo.
export const WMO: Record<number, [string, Loc]> = {
  0: ["sun", { en: "Clear sky", hi: "साफ़ आसमान" }],
  1: ["sun", { en: "Mainly clear", hi: "अधिकतर साफ़" }],
  2: ["partly", { en: "Partly cloudy", hi: "आंशिक बादल" }],
  3: ["cloud", { en: "Overcast", hi: "बादल छाए" }],
  45: ["fog", { en: "Fog", hi: "कोहरा" }],
  48: ["fog", { en: "Freezing fog", hi: "पाला-कोहरा" }],
  51: ["rain", { en: "Light drizzle", hi: "हल्की बूँदाबाँदी" }],
  53: ["rain", { en: "Drizzle", hi: "बूँदाबाँदी" }],
  55: ["rain", { en: "Heavy drizzle", hi: "तेज़ बूँदाबाँदी" }],
  56: ["rain", { en: "Freezing drizzle", hi: "शीत बूँदाबाँदी" }],
  57: ["rain", { en: "Freezing drizzle", hi: "शीत बूँदाबाँदी" }],
  61: ["rain", { en: "Light rain", hi: "हल्की वर्षा" }],
  63: ["rain", { en: "Rain", hi: "वर्षा" }],
  65: ["rain", { en: "Heavy rain", hi: "तेज़ वर्षा" }],
  66: ["rain", { en: "Freezing rain", hi: "शीत वर्षा" }],
  67: ["rain", { en: "Freezing rain", hi: "शीत वर्षा" }],
  71: ["snow", { en: "Light snow", hi: "हल्का हिमपात" }],
  73: ["snow", { en: "Snow", hi: "हिमपात" }],
  75: ["snow", { en: "Heavy snow", hi: "भारी हिमपात" }],
  77: ["snow", { en: "Snow grains", hi: "हिमकण" }],
  80: ["rain", { en: "Rain showers", hi: "बौछारें" }],
  81: ["rain", { en: "Rain showers", hi: "बौछारें" }],
  82: ["rain", { en: "Heavy showers", hi: "तेज़ बौछारें" }],
  85: ["snow", { en: "Snow showers", hi: "हिम बौछार" }],
  86: ["snow", { en: "Snow showers", hi: "हिम बौछार" }],
  95: ["storm", { en: "Thunderstorm", hi: "आँधी-तूफ़ान" }],
  96: ["storm", { en: "Storm with hail", hi: "ओलावृष्टि" }],
  99: ["storm", { en: "Storm with hail", hi: "ओलावृष्टि" }],
};
export const wcode = (c: number): [string, Loc] => WMO[c] || WMO[0];

// Animated glyph bodies (the wxchip / wxsheet icon), same 24-grid as the icons.
const GLYPH: Record<string, (day: number) => string> = {
  sun: (day) =>
    day
      ? '<g class="spin"><path d="M12 2.7v2.3M12 19v2.3M2.7 12H5M19 12h2.3M5.5 5.5l1.6 1.6M16.9 16.9l1.6 1.6M18.5 5.5l-1.6 1.6M7.1 16.9l-1.6 1.6"/></g><circle cx="12" cy="12" r="4.3"/>'
      : '<path d="M20.3 14.2A8.6 8.6 0 0 1 9.8 3.7a8.6 8.6 0 1 0 10.5 10.5Z"/>',
  partly: () =>
    '<g class="spin"><path d="M8.6 2.4v1.6M2.8 8.2h1.6M4.5 4.1l1.1 1.1M12.7 4.1l-1.1 1.1"/></g><circle cx="8.6" cy="8.2" r="3.1"/><g class="drift"><path d="M9 19.4h8.4a3.5 3.5 0 0 0 .4-6.98 5 5 0 0 0-9.6-1.05A3.5 3.5 0 0 0 9 19.4Z"/></g>',
  cloud: () =>
    '<g class="drift"><path d="M7.2 18.6h9.9a3.9 3.9 0 0 0 .5-7.77 5.6 5.6 0 0 0-10.8-1.2A3.9 3.9 0 0 0 7.2 18.6Z"/></g>',
  rain: () =>
    '<path d="M7.4 15.4h9.4a3.6 3.6 0 0 0 .4-7.18 5.2 5.2 0 0 0-10-1.1A3.6 3.6 0 0 0 7.4 15.4Z"/><g class="fall"><path d="M8.4 18.1l-.9 2.3M12 18.1l-.9 2.3M15.6 18.1l-.9 2.3"/></g>',
  storm: () =>
    '<path d="M7.4 14.6h9.4a3.6 3.6 0 0 0 .4-7.18 5.2 5.2 0 0 0-10-1.1A3.6 3.6 0 0 0 7.4 14.6Z"/><g class="fall"><path d="M13 16.2l-2.6 3.4h3l-2 3"/></g>',
  fog: () =>
    '<g class="drift"><path d="M6.6 12.6h10.8a3.5 3.5 0 0 0 .4-6.98 5.1 5.1 0 0 0-9.8-1.1A3.5 3.5 0 0 0 6.6 12.6Z"/><path d="M4.4 16.2h15.2M6.6 19.4h11"/></g>',
  snow: () =>
    '<path d="M7.4 14.6h9.4a3.6 3.6 0 0 0 .4-7.18 5.2 5.2 0 0 0-10-1.1A3.6 3.6 0 0 0 7.4 14.6Z"/><g class="fall"><path d="M9 18.3h.01M12 20h.01M15 18.3h.01"/></g>',
};
/** Inner SVG markup for an animated weather glyph. */
export const glyphBody = (kind: string, day: number): string =>
  (GLYPH[kind] || (() => ""))(day);

/** What to carry — plain words, at most two entries. Ported verbatim. */
export function advice(w: WeatherState): [string, Loc][] {
  const k = wcode(w.code)[0];
  const out: [string, Loc][] = [];
  if (k === "storm")
    out.push(["storm", { en: "<b>Thunder about.</b> Keep to the covered stops — the Krishna Museum, the Panorama, the Anubhav Kendra. Stay off open ghats and mounds until it passes.", hi: "<b>आँधी की संभावना।</b> ढके हुए स्थलों में रहें — कृष्ण संग्रहालय, पैनोरमा, अनुभव केंद्र। खुले घाट और टीलों से तब तक दूर रहें।" }]);
  else if (k === "rain" || w.pop >= 55)
    out.push(["umbrella", { en: "<b>Carry an umbrella.</b> The steps at Brahma Sarovar and Sannihit turn slippery — flat shoes with grip will serve you better.", hi: "<b>छाता साथ रखें।</b> ब्रह्म सरोवर और सन्निहित के घाट फिसलन भरे हो जाते हैं — पकड़ वाले सपाट जूते पहनें।" }]);
  if (w.temp >= 40)
    out.push(["sun", { en: "<b>Severe heat.</b> Do the open sites before 11, keep noon to four for the museums, and drink water at every stop.", hi: "<b>भीषण गर्मी।</b> खुले स्थल 11 बजे से पहले देखें, दोपहर 12 से 4 संग्रहालयों के लिए रखें, हर पड़ाव पर पानी पिएँ।" }]);
  else if (w.temp >= 34)
    out.push(["sun", { en: "<b>Strong sun.</b> Sunscreen, a cap and water. Temple courtyards are walked barefoot and the marble is hot by midday.", hi: "<b>तेज़ धूप।</b> सनस्क्रीन, टोपी और पानी रखें। मंदिर प्रांगण नंगे पाँव चलने होते हैं और दोपहर तक संगमरमर तपता है।" }]);
  else if (w.uv >= 8)
    out.push(["sun", { en: "<b>High UV.</b> Sunscreen and dark glasses, pleasant as the air feels.", hi: "<b>तेज़ पराबैंगनी किरणें।</b> मौसम सुहाना लगे तब भी सनस्क्रीन और चश्मा लगाएँ।" }]);
  if (w.temp <= 8)
    out.push(["snow", { en: "<b>Cold morning.</b> Wear layers — the ghats and Jyotisar catch the wind. Warm socks help where you must go barefoot.", hi: "<b>ठंडी सुबह।</b> गरम कपड़े पहनें — घाट और ज्योतिसर पर हवा तेज़ रहती है। नंगे पाँव वाले स्थलों के लिए मोज़े रखें।" }]);
  if (k === "fog")
    out.push(["fog", { en: "<b>Fog on the roads.</b> Drive gently on the Pehowa and Pipli stretches, and allow extra time between stops.", hi: "<b>सड़कों पर कोहरा।</b> पिहोवा और पिपली मार्ग पर धीरे चलें, पड़ावों के बीच अतिरिक्त समय रखें।" }]);
  if (w.wind >= 30)
    out.push(["wind", { en: "<b>Windy.</b> Hold on to caps and dupattas at the open sarovars.", hi: "<b>तेज़ हवा।</b> खुले सरोवरों पर टोपी और दुपट्टा सँभालें।" }]);
  if (w.rh >= 80 && w.temp >= 28)
    out.push(["drop", { en: "<b>Humid.</b> It will feel warmer than the number reads — rest in the shade between stops.", hi: "<b>उमस।</b> तापमान से अधिक गर्मी लगेगी — पड़ावों के बीच छाँव में विश्राम करें।" }]);
  if (!out.length)
    out.push(["sun", { en: "<b>A fine day to be out.</b> Good weather for Brahma Sarovar, Jyotisar and the open heritage sites. Comfortable shoes and you are set.", hi: "<b>घूमने के लिए अच्छा दिन।</b> ब्रह्म सरोवर, ज्योतिसर और खुले धरोहर स्थलों के लिए उपयुक्त मौसम। आरामदायक जूते पहन लीजिए।" }]);
  return out.slice(0, 2);
}

/** Fetch live weather (Open-Meteo), with a seasonal offline fallback. */
export function loadWeather(force?: boolean) {
  if (S.wxBusy) return;
  if (!force && S.wx && Date.now() - S.wxAt < 15 * 60 * 1000) return;
  S.wxBusy = true;
  const C = CONFIG.weather;
  const P = city().wx;
  const url =
    C.api +
    "?latitude=" + P.lat + "&longitude=" + P.lng +
    "&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day" +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,sunset" +
    "&timezone=Asia%2FKolkata&forecast_days=2";
  const timeout = new Promise<never>((_, bad) => setTimeout(() => bad(new Error("slow")), 7000));
  Promise.race([fetch(url).then((r) => { if (!r.ok) throw 0; return r.json(); }), timeout])
    .then((j: any) => {
      S.wx = {
        temp: Math.round(j.current.temperature_2m),
        feels: Math.round(j.current.apparent_temperature),
        code: j.current.weather_code,
        wind: Math.round(j.current.wind_speed_10m),
        rh: j.current.relative_humidity_2m,
        day: j.current.is_day === 1,
        hi: Math.round(j.daily.temperature_2m_max[0]),
        lo: Math.round(j.daily.temperature_2m_min[0]),
        pop: j.daily.precipitation_probability_max[0] || 0,
        uv: j.daily.uv_index_max[0] || 0,
        sunset: (j.daily.sunset[0] || "").slice(11, 16),
        live: true,
      };
      S.wxAt = Date.now();
    })
    .catch(() => {
      // Offline / unkind network: fall back to the season's usual figures.
      const m = new Date().getMonth(), h = new Date().getHours();
      const T = [[19, 7], [22, 9], [28, 13], [35, 19], [40, 25], [39, 27], [34, 27], [33, 26], [33, 23], [31, 17], [26, 11], [21, 7]][m];
      const monsoon = m >= 5 && m <= 8;
      S.wx = {
        temp: T[0], feels: T[0], code: monsoon ? 61 : m === 11 || m === 0 ? 45 : 0,
        wind: 9, rh: monsoon ? 78 : 45, day: h > 6 && h < 19, hi: T[0], lo: T[1],
        pop: monsoon ? 60 : 5, uv: m >= 3 && m <= 8 ? 9 : 5, sunset: "19:00", live: false,
      };
      S.wxAt = Date.now();
    })
    .then(() => {
      S.wxBusy = false;
      bump();
    });
}
