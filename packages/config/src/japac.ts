// JAPAC market + language registry. Single source of truth for which languages a story
// is produced in, which fictional presenter voices it, and which YouTube channel publishes it.

export type Script = "latin" | "devanagari" | "telugu" | "tamil" | "japanese" | "hangul" | "han-trad" | "han-simp" | "thai";

export const LANGUAGES = {
  en: { name: "English", native: "English", script: "latin" },
  hi: { name: "Hindi", native: "हिन्दी", script: "devanagari" },
  te: { name: "Telugu", native: "తెలుగు", script: "telugu" },
  ta: { name: "Tamil", native: "தமிழ்", script: "tamil" },
  ja: { name: "Japanese", native: "日本語", script: "japanese" },
  ko: { name: "Korean", native: "한국어", script: "hangul" },
  "zh-Hant": { name: "Chinese (Traditional)", native: "繁體中文", script: "han-trad" },
  "zh-Hans": { name: "Chinese (Simplified)", native: "简体中文", script: "han-simp" },
  id: { name: "Indonesian", native: "Bahasa Indonesia", script: "latin" },
  ms: { name: "Malay", native: "Bahasa Melayu", script: "latin" },
  th: { name: "Thai", native: "ไทย", script: "thai" },
  vi: { name: "Vietnamese", native: "Tiếng Việt", script: "latin" },
  fil: { name: "Filipino", native: "Filipino", script: "latin" },
} as const satisfies Record<string, { name: string; native: string; script: Script }>;
export type LangCode = keyof typeof LANGUAGES;
export const LANG_CODES = Object.keys(LANGUAGES) as LangCode[];
export const isLang = (s: string): s is LangCode => s in LANGUAGES;

/** Markets covered. "APAC" is the region-wide English desk. Mainland China is excluded:
 *  YouTube, X, Instagram, Facebook and WhatsApp are unavailable there. */
export const MARKETS = {
  APAC: { name: "Asia-Pacific", languages: ["en"], timezone: "Asia/Singapore" },
  IN: { name: "India", languages: ["hi", "en", "te", "ta"], timezone: "Asia/Kolkata" },
  JP: { name: "Japan", languages: ["ja"], timezone: "Asia/Tokyo" },
  KR: { name: "South Korea", languages: ["ko"], timezone: "Asia/Seoul" },
  TW: { name: "Taiwan", languages: ["zh-Hant"], timezone: "Asia/Taipei" },
  HK: { name: "Hong Kong", languages: ["zh-Hant", "en"], timezone: "Asia/Hong_Kong" },
  SG: { name: "Singapore", languages: ["en", "zh-Hans", "ms"], timezone: "Asia/Singapore" },
  MY: { name: "Malaysia", languages: ["ms", "en", "zh-Hans"], timezone: "Asia/Kuala_Lumpur" },
  ID: { name: "Indonesia", languages: ["id"], timezone: "Asia/Jakarta" },
  TH: { name: "Thailand", languages: ["th"], timezone: "Asia/Bangkok" },
  VN: { name: "Vietnam", languages: ["vi"], timezone: "Asia/Ho_Chi_Minh" },
  PH: { name: "Philippines", languages: ["fil", "en"], timezone: "Asia/Manila" },
  AU: { name: "Australia", languages: ["en"], timezone: "Australia/Sydney" },
  NZ: { name: "New Zealand", languages: ["en"], timezone: "Pacific/Auckland" },
} as const satisfies Record<string, { name: string; languages: readonly LangCode[]; timezone: string }>;
export type MarketCode = keyof typeof MARKETS;
export const MARKET_CODES = Object.keys(MARKETS) as MarketCode[];

/** Market code for a story region such as "JP", "IN-TG" (sub-national) or "APAC". */
export function marketOf(region: string): MarketCode | undefined {
  const code = region.split("-")[0]!.toUpperCase();
  return code in MARKETS ? (code as MarketCode) : undefined;
}

export function regionLabel(region: string): string {
  const m = marketOf(region);
  if (!m) return region;
  return region.includes("-") && m !== "APAC" ? `${MARKETS[m].name} · ${region.split("-").slice(1).join("-")}` : MARKETS[m].name;
}

/** Default languages for a story: its markets' languages plus English for the region-wide desk. */
export function languagesFor(regions: string[]): LangCode[] {
  const out = new Set<LangCode>(["en"]);
  const ms = regions.flatMap((r) => (r.toUpperCase() === "APAC" ? MARKET_CODES : [marketOf(r)].filter((x): x is MarketCode => Boolean(x))));
  for (const m of ms) for (const l of MARKETS[m].languages) out.add(l);
  return LANG_CODES.filter((l) => out.has(l));
}

// Fictional, disclosed synthetic presenters — never modelled on a real journalist.
// Gemini TTS prebuilt voices are multilingual; the language comes from the text.
export const PRESENTERS = {
  "maya-apac": { name: "Maya", lang: "en", voice: "Kore", style: "warm, clear Asia-Pacific news host" },
  "kavya-hi": { name: "Kavya", lang: "hi", voice: "Leda", style: "crisp Hindi news anchor, measured pace" },
  "priya-te": { name: "Priya", lang: "te", voice: "Sulafat", style: "friendly Telugu regional news presenter" },
  "meena-ta": { name: "Meena", lang: "ta", voice: "Kore", style: "calm Tamil regional news presenter" },
  "haruto-ja": { name: "Haruto", lang: "ja", voice: "Kore", style: "polite, measured Japanese news anchor" },
  "jiwoo-ko": { name: "Ji-woo", lang: "ko", voice: "Leda", style: "clear, composed Korean news anchor" },
  "weiting-zhhant": { name: "Wei-Ting", lang: "zh-Hant", voice: "Aoede", style: "steady Taiwanese Mandarin news anchor" },
  "jiahui-zhhans": { name: "Jia Hui", lang: "zh-Hans", voice: "Kore", style: "clear Singaporean Mandarin news presenter" },
  "putri-id": { name: "Putri", lang: "id", voice: "Leda", style: "lively but neutral Indonesian news presenter" },
  "aisyah-ms": { name: "Aisyah", lang: "ms", voice: "Aoede", style: "calm Malay news presenter" },
  "niran-th": { name: "Niran", lang: "th", voice: "Puck", style: "polite Thai news anchor" },
  "linh-vi": { name: "Linh", lang: "vi", voice: "Kore", style: "clear Vietnamese news presenter, northern accent" },
  "marco-fil": { name: "Marco", lang: "fil", voice: "Puck", style: "friendly Filipino news presenter" },
} as const satisfies Record<string, { name: string; lang: LangCode; voice: string; style: string }>;
export type PresenterId = keyof typeof PRESENTERS;

export type Tier = "regional" | "national" | "international";

/** One YouTube channel per language. English is the region-wide (international) desk. */
export const CHANNEL_PLAN: Record<LangCode, { tier: Tier; channel: string; presenter: PresenterId }> = {
  en: { tier: "international", channel: "OpenLens Asia-Pacific", presenter: "maya-apac" },
  hi: { tier: "national", channel: "OpenLens India हिन्दी", presenter: "kavya-hi" },
  te: { tier: "regional", channel: "OpenLens తెలుగు", presenter: "priya-te" },
  ta: { tier: "regional", channel: "OpenLens தமிழ்", presenter: "meena-ta" },
  ja: { tier: "national", channel: "OpenLens 日本", presenter: "haruto-ja" },
  ko: { tier: "national", channel: "OpenLens 한국", presenter: "jiwoo-ko" },
  "zh-Hant": { tier: "national", channel: "OpenLens 繁體中文", presenter: "weiting-zhhant" },
  "zh-Hans": { tier: "national", channel: "OpenLens 简体中文", presenter: "jiahui-zhhans" },
  id: { tier: "national", channel: "OpenLens Indonesia", presenter: "putri-id" },
  ms: { tier: "national", channel: "OpenLens Melayu", presenter: "aisyah-ms" },
  th: { tier: "national", channel: "OpenLens ไทย", presenter: "niran-th" },
  vi: { tier: "national", channel: "OpenLens Việt Nam", presenter: "linh-vi" },
  fil: { tier: "national", channel: "OpenLens Pilipinas", presenter: "marco-fil" },
};

const LOCAL_DISCLOSURE: Record<LangCode, string> = {
  en: "AI-generated presenter and narration. Facts sourced and reviewed by OpenLens editors.",
  hi: "एआई-जनित प्रस्तुतकर्ता और आवाज़। तथ्य OpenLens संपादकों द्वारा स्रोत-सत्यापित।",
  te: "AI ద్వారా రూపొందించిన ప్రెజెంటర్ మరియు వ్యాఖ్యానం. వాస్తవాలను OpenLens ఎడిటర్లు పరిశీలించారు.",
  ta: "AI உருவாக்கிய தொகுப்பாளர் மற்றும் குரல். உண்மைகளை OpenLens ஆசிரியர்கள் சரிபார்த்தனர்.",
  ja: "AI生成のキャスターとナレーション。事実はOpenLens編集部が確認しています。",
  ko: "AI가 생성한 진행자와 내레이션입니다. 사실은 OpenLens 편집진이 검토했습니다.",
  "zh-Hant": "AI 生成的主播與旁白。事實經 OpenLens 編輯查證。",
  "zh-Hans": "AI 生成的主播与旁白。事实经 OpenLens 编辑核实。",
  id: "Presenter dan narasi dibuat oleh AI. Fakta diperiksa oleh editor OpenLens.",
  ms: "Penyampai dan narasi dijana oleh AI. Fakta disemak oleh editor OpenLens.",
  th: "ผู้ประกาศและเสียงบรรยายสร้างโดย AI ข้อเท็จจริงตรวจสอบโดยบรรณาธิการ OpenLens",
  vi: "Người dẫn và lời thuyết minh do AI tạo ra. Dữ kiện được biên tập viên OpenLens kiểm chứng.",
  fil: "AI-generated na presenter at narasyon. Sinuri ng mga editor ng OpenLens ang mga datos.",
};

/** Local-language disclosure; non-English versions also carry "AI-generated" so platform checks and
 *  non-native moderators recognise it. */
export const AI_DISCLOSURE: Record<string, string> = Object.fromEntries(
  Object.entries(LOCAL_DISCLOSURE).map(([l, t]) => [l, l === "en" || /AI-generated/.test(t) ? t : `${t} · AI-generated`]),
);

/** On-screen labels used in rendered video frames and carousel slides. */
export const UI_STRINGS: Record<LangCode, { evidence: string; aiPresenter: string; openResearch: string }> = {
  en: { evidence: "Evidence", aiPresenter: "AI presenter", openResearch: "open the research in the OpenLens app" },
  hi: { evidence: "साक्ष्य", aiPresenter: "एआई प्रस्तुतकर्ता", openResearch: "OpenLens ऐप में पूरा शोध देखें" },
  te: { evidence: "ఆధారాలు", aiPresenter: "AI ప్రెజెంటర్", openResearch: "OpenLens యాప్‌లో పూర్తి పరిశోధన చూడండి" },
  ta: { evidence: "ஆதாரம்", aiPresenter: "AI தொகுப்பாளர்", openResearch: "OpenLens செயலியில் முழு ஆய்வைப் பாருங்கள்" },
  ja: { evidence: "根拠", aiPresenter: "AIキャスター", openResearch: "詳しい検証はOpenLensアプリで" },
  ko: { evidence: "근거", aiPresenter: "AI 진행자", openResearch: "자세한 검증은 OpenLens 앱에서" },
  "zh-Hant": { evidence: "依據", aiPresenter: "AI 主播", openResearch: "完整查證請見 OpenLens App" },
  "zh-Hans": { evidence: "依据", aiPresenter: "AI 主播", openResearch: "完整核实请见 OpenLens App" },
  id: { evidence: "Bukti", aiPresenter: "Presenter AI", openResearch: "lihat riset lengkap di aplikasi OpenLens" },
  ms: { evidence: "Bukti", aiPresenter: "Penyampai AI", openResearch: "lihat kajian penuh dalam aplikasi OpenLens" },
  th: { evidence: "หลักฐาน", aiPresenter: "ผู้ประกาศ AI", openResearch: "ดูการตรวจสอบฉบับเต็มในแอป OpenLens" },
  vi: { evidence: "Bằng chứng", aiPresenter: "Người dẫn AI", openResearch: "xem kiểm chứng đầy đủ trên ứng dụng OpenLens" },
  fil: { evidence: "Ebidensya", aiPresenter: "AI presenter", openResearch: "buksan ang buong pananaliksik sa OpenLens app" },
};
export const uiStrings = (lang: string) => (isLang(lang) ? UI_STRINGS[lang] : UI_STRINGS.en);
