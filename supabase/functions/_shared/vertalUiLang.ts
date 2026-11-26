// Idiomas da interface do Vertal CRM / Growth Team / Prospector — os mesmos 21 das páginas de SEO do CRM
// grátis (src/config/freeCrm). "pt" é o português do Brasil (código histórico gravado em crm_workspaces.lang).
// Arquivo compartilhado (navegador + Deno): sem imports.

export const UI_LANGS = [
  "pt", "pt-PT", "en", "es", "fr", "de", "it", "nl", "pl", "tr", "ru", "uk",
  "ar", "hi", "id", "vi", "th", "ja", "ko", "zh-CN", "zh-TW",
] as const;

export type UiLang = (typeof UI_LANGS)[number];

const SET = new Set<string>(UI_LANGS);

/** "de-AT" → "de"; "pt-PT"/"pt_pt" → "pt-PT"; "pt-BR"/"pt" → "pt"; "zh-Hant"/"zh-TW"/"zh-HK" → "zh-TW"; "zh" → "zh-CN". */
export function normUiLang(hint: string | null | undefined): UiLang | null {
  const s = String(hint ?? "").trim().replace(/_/g, "-").toLowerCase();
  if (!s) return null;
  if (s === "pt-pt" || s === "pt-ao" || s === "pt-mz") return "pt-PT";
  if (s.startsWith("pt")) return "pt";
  if (s.startsWith("zh")) return /^zh-(tw|hk|mo|hant)/.test(s) ? "zh-TW" : "zh-CN";
  const base = s.split("-")[0];
  if (base === "iw") return null; // hebraico não está entre os 21
  if (base === "in") return "id";
  return SET.has(base) ? (base as UiLang) : null;
}

/** Primeiro palpite reconhecido entre os 21; sem nenhum, pt (Brasil). */
export function resolveUiLang(...hints: Array<string | null | undefined>): UiLang {
  for (const h of hints) {
    const n = normUiLang(h);
    if (n) return n;
  }
  return "pt";
}

export const isUiLang = (v: unknown): v is UiLang => typeof v === "string" && SET.has(v);

/** Locale para Intl (datas, números, moeda). */
export function uiLocale(lang: UiLang): string {
  switch (lang) {
    case "pt": return "pt-BR";
    case "en": return "en-US";
    case "es": return "es-ES";
    default: return lang;
  }
}

export const RTL_UI_LANGS: readonly UiLang[] = ["ar"];
export const uiDir = (lang: UiLang): "rtl" | "ltr" => (RTL_UI_LANGS.includes(lang) ? "rtl" : "ltr");

/** Idioma de 3 (pt/en/es) para conteúdo que só existe nesses 3 (ex.: textos legais dos e-mails a leads). */
export function baseUiLang(lang: UiLang): "pt" | "en" | "es" {
  if (lang === "pt" || lang === "pt-PT") return "pt";
  if (lang === "es") return "es";
  return "en";
}

/** Nome de cada idioma nele mesmo (seletor de idioma). */
export const UI_LANG_NAMES: Record<UiLang, string> = {
  pt: "Português (Brasil)", "pt-PT": "Português (Portugal)", en: "English", es: "Español", fr: "Français", de: "Deutsch",
  it: "Italiano", nl: "Nederlands", pl: "Polski", tr: "Türkçe", ru: "Русский", uk: "Українська", ar: "العربية",
  hi: "हिन्दी", id: "Bahasa Indonesia", vi: "Tiếng Việt", th: "ไทย", ja: "日本語", ko: "한국어", "zh-CN": "简体中文", "zh-TW": "繁體中文",
};

/** Nome do idioma para instruir a IA ("Responda SEMPRE em …"). */
export const UI_LANG_AI_NAME: Record<UiLang, string> = {
  pt: "português do Brasil", "pt-PT": "português europeu (de Portugal)", en: "English", es: "español", fr: "français", de: "Deutsch",
  it: "italiano", nl: "Nederlands", pl: "polski", tr: "Türkçe", ru: "русский", uk: "українська", ar: "العربية (Arabic)",
  hi: "हिन्दी (Hindi)", id: "Bahasa Indonesia", vi: "Tiếng Việt (Vietnamese)", th: "ภาษาไทย (Thai)", ja: "日本語 (Japanese)",
  ko: "한국어 (Korean)", "zh-CN": "简体中文 (Simplified Chinese)", "zh-TW": "繁體中文 (Traditional Chinese)",
};
