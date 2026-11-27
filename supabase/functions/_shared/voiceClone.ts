// Vertal · Clonador de voz — parte pura (sem Deno/Supabase), usada pela edge function creative-music,
// pelo creative-router (prompt do Vertal Chat) e pelo navegador (painel e Studio de Música).
//
// O que faz: o usuário grava ou envia uma amostra da PRÓPRIA voz (ou de quem autorizou por escrito),
// aceita o termo de consentimento e a voz fica salva na conta dele. Com ela:
//   - "speak": fala qualquer texto com a voz clonada (TTS zero-shot, Chatterbox Multilingual, MIT);
//   - "sing":  canta uma música já criada com a voz clonada (separa a voz com Demucs, MIT, converte com
//              Seed-VC, GPL-3.0 rodando só no servidor próprio, e mixa de novo com o instrumental).
// Tudo roda no app Modal próprio "vertal-voice" (infra/vertal-gpu-modal/vertal_voice.py).
//
// Liga/desliga (tudo DESLIGADO por padrão; sem as chaves abaixo nada muda para ninguém):
//   VERTAL_OWN_VOICE_ENABLED=true          liga o recurso
//   VERTAL_OWN_VOICE_USER_IDS="uuid,uuid"  quem pode usar (vazio = só a conta do Laércio)
//   VERTAL_OWN_VOICE_URL / _TOKEN          endereço e token do app Modal vertal-voice
//   VERTAL_OWN_VOICE_TTS_CREDITS (1), VERTAL_OWN_VOICE_SING_CREDITS (3), VERTAL_OWN_VOICE_CREATE_CREDITS (0)
// Podem ir no segredo JSON VERTAL_GPU_CONFIG (lido por voiceEnvFrom) (o projeto está no limite de 100 segredos) ou no cofre da conta dona.

/** Conta do Laércio (dono do Vertal Dev): o único liberado quando a lista estiver vazia. */
export const VOICE_CLONE_DEFAULT_USER_IDS = ["5441b397-7be8-44fc-87e8-8057fdb79a0e"] as const;

export const VOICE_CONSENT_VERSION = "voice-consent-v1";
/** Mesmo texto do gate que já existia em supabase/functions/voice-clone (o servidor é a fonte). */
export const VOICE_CONSENT_TEXT: Record<VoiceLang, string> = {
  pt:
    "Declaro que sou o titular desta voz ou tenho autorização escrita do titular para cloná-la. " +
    "Entendo que o áudio gerado é sintético e será identificado como tal. " +
    "Não usarei esta voz para se passar por outra pessoa, enganar ou aplicar fraude.",
  en:
    "I confirm this is my own voice or I have the owner's written permission to clone it. " +
    "I understand the generated audio is synthetic and will be labeled as such. " +
    "I will not use this voice to impersonate anyone, deceive or commit fraud.",
  es:
    "Declaro que soy el titular de esta voz o tengo autorización escrita del titular para clonarla. " +
    "Entiendo que el audio generado es sintético y será identificado como tal. " +
    "No usaré esta voz para hacerme pasar por otra persona, engañar ni cometer fraude.",
};

export const VOICE_LIMITS = {
  maxVoicesPerUser: 5,
  minSampleSeconds: 8,
  maxSampleSeconds: 90,
  maxSampleBytes: 12 * 1024 * 1024,
  maxNameChars: 60,
  maxTextChars: 1_500,
  /** Depois disso o trabalho é dado como falho e o crédito volta. */
  jobMaxMs: 15 * 60_000,
} as const;

export const VOICE_DEFAULT_COSTS = { create: 0, speak: 1, sing: 3 } as const;
export type VoiceJobKind = "speak" | "sing";
export type VoiceLang = "pt" | "en" | "es";

export const VOICE_SAMPLE_MIME = /^audio\/(mpeg|mp3|mp4|m4a|x-m4a|wav|x-wav|wave|webm|ogg|aac)(;.*)?$/i;

type Env = Record<string, string | undefined>;
const truthy = (v?: string) => /^(1|true|yes|on|sim)$/i.test((v ?? "").trim());
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Lê as chaves VERTAL_OWN_VOICE_* do segredo JSON VERTAL_GPU_CONFIG (o projeto está no limite de 100 segredos).
 * Segredo avulso com o mesmo nome vence. Leitura própria para não mexer no expandVcaEnv do VERTAL Code AI.
 */
export function voiceEnvFrom(env: Env): Env {
  const out: Env = { ...env };
  const raw = (env.VERTAL_GPU_CONFIG ?? "").trim();
  if (!raw) return out;
  let cfg: unknown;
  try {
    cfg = JSON.parse(raw);
  } catch {
    return out;
  }
  if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) return out;
  for (const [k, v] of Object.entries(cfg as Record<string, unknown>)) {
    if (!/^VERTAL_OWN_VOICE_[A-Z_]+$/.test(k) || (out[k] ?? "").trim()) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[k] = String(v);
  }
  return out;
}

export function voiceCloneUserIds(env: Env): string[] {
  const ids = (env.VERTAL_OWN_VOICE_USER_IDS ?? "").split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter((s) => UUID_RE.test(s));
  return ids.length ? ids : [...VOICE_CLONE_DEFAULT_USER_IDS];
}

/** Liberado para este usuário? Precisa da flag ligada E estar na lista (padrão: só o Laércio). */
export function voiceCloneAllowed(env: Env, userId: string | null | undefined): boolean {
  if (!userId || !truthy(env.VERTAL_OWN_VOICE_ENABLED)) return false;
  return voiceCloneUserIds(env).includes(userId.toLowerCase());
}

export function voiceCloneCosts(env: Env): { create: number; speak: number; sing: number } {
  const n = (v: string | undefined, d: number) => {
    const x = Number((v ?? "").trim());
    return (v ?? "").trim() !== "" && Number.isFinite(x) && x >= 0 && x <= 500 ? Math.round(x) : d;
  };
  return {
    create: n(env.VERTAL_OWN_VOICE_CREATE_CREDITS, VOICE_DEFAULT_COSTS.create),
    speak: n(env.VERTAL_OWN_VOICE_TTS_CREDITS, VOICE_DEFAULT_COSTS.speak),
    sing: n(env.VERTAL_OWN_VOICE_SING_CREDITS, VOICE_DEFAULT_COSTS.sing),
  };
}

export function voiceLang(v: unknown): VoiceLang {
  const s = typeof v === "string" ? v.toLowerCase() : "";
  if (s.startsWith("en")) return "en";
  if (s.startsWith("es")) return "es";
  return "pt";
}

export interface VoiceConsentInput {
  accepted?: unknown;
  owner_confirmed?: unknown;
  version?: unknown;
}

export function consentValid(c: VoiceConsentInput | null | undefined): boolean {
  return !!c && c.accepted === true && c.owner_confirmed === true && c.version === VOICE_CONSENT_VERSION;
}

export function cleanVoiceName(v: unknown): string {
  return typeof v === "string" ? v.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, VOICE_LIMITS.maxNameChars) : "";
}

/** Caminho de uma amostra no bucket "uploads": sempre dentro da pasta do próprio usuário. */
export function ownVoiceSamplePath(userId: string, path: unknown): string | null {
  if (typeof path !== "string") return null;
  const p = path.trim().replace(/^\/+/, "");
  if (!p.startsWith(`${userId}/voices/`) || p.includes("..") || p.length > 300) return null;
  return /^[\w\-./]+$/.test(p) ? p : null;
}

/**
 * Áudio de origem para "cantar com minha voz": só arquivos do próprio usuário no bucket "uploads"
 * (link assinado que o Vertal gerou, ou o caminho direto). Nunca uma URL qualquer da internet.
 */
export function ownUploadPathFromUrl(userId: string, source: unknown, supabaseUrl: string): string | null {
  if (typeof source !== "string" || !source.trim()) return null;
  let path = source.trim();
  if (/^https?:\/\//i.test(path)) {
    let u: URL;
    try {
      u = new URL(path);
    } catch {
      return null;
    }
    let base: URL;
    try {
      base = new URL(supabaseUrl);
    } catch {
      return null;
    }
    if (u.host !== base.host) return null;
    const m = u.pathname.match(/^\/storage\/v1\/object\/(?:sign|public|authenticated)\/uploads\/(.+)$/);
    if (!m) return null;
    path = decodeURIComponent(m[1]);
  }
  path = path.replace(/^\/+/, "");
  if (!path.startsWith(`${userId}/`) || path.includes("..") || path.length > 400) return null;
  return /\.(mp3|wav|m4a|mp4|ogg|webm|aac|flac)$/i.test(path) ? path : null;
}

export function cleanSpeakText(v: unknown): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, VOICE_LIMITS.maxTextChars) : "";
}

// ─── Vertal Chat ─────────────────────────────────────────────────────────

export const VOICE_CLONE_OPS = ["setup", "list", "speak", "sing"] as const;
export type VoiceCloneOp = (typeof VOICE_CLONE_OPS)[number];

export type VoiceCloneAction =
  | { tool: "voice_clone"; op: "setup" | "list" }
  | { tool: "voice_clone"; op: "speak"; text: string; voice_id?: string; language?: VoiceLang }
  | { tool: "voice_clone"; op: "sing"; source_artifact?: string; audio_url?: string; voice_id?: string };

const VOICE_ID_RE = UUID_RE;

export function parseVoiceCloneAction(a: Record<string, unknown>): VoiceCloneAction | null {
  const op = typeof a.op === "string" && (VOICE_CLONE_OPS as readonly string[]).includes(a.op) ? (a.op as VoiceCloneOp) : null;
  if (!op) return null;
  const voiceId = typeof a.voice_id === "string" && VOICE_ID_RE.test(a.voice_id) ? a.voice_id.toLowerCase() : undefined;
  if (op === "setup" || op === "list") return { tool: "voice_clone", op };
  if (op === "speak") {
    const text = cleanSpeakText(a.text);
    if (text.length < 2) return null;
    return {
      tool: "voice_clone", op, text,
      ...(voiceId ? { voice_id: voiceId } : {}),
      ...(typeof a.language === "string" ? { language: voiceLang(a.language) } : {}),
    };
  }
  const src = typeof a.source_artifact === "string" && /^[a-z0-9_-]{1,40}$/i.test(a.source_artifact) ? a.source_artifact : undefined;
  const url = typeof a.audio_url === "string" && /^https:\/\//i.test(a.audio_url) ? a.audio_url.slice(0, 2000) : undefined;
  return {
    tool: "voice_clone", op: "sing",
    ...(src ? { source_artifact: src } : {}),
    ...(url ? { audio_url: url } : {}),
    ...(voiceId ? { voice_id: voiceId } : {}),
  };
}

/** A conversa fala de clonar voz, cantar com a minha voz, falar com a minha voz? (pt/en/es) */
const VOICE_INTENT_RE =
  /\b(clon\w*|imit\w*)\b[^.?!]{0,40}\b(voz|voice)\b|\b(voz|voice)\b[^.?!]{0,30}\b(clon\w*)\b|\b(minha|mi|my)\s+(pr[oó]pria\s+)?(voz|voice)\b|\bcom\s+a\s+minha\s+voz\b|\bwith\s+my\s+voice\b|\bcon\s+mi\s+voz\b|\bclonador\b|\bvoice[\s-]?clon\w*/i;

export function wantsVoiceClone(texts: Array<{ content: string } | string>): boolean {
  return texts.some((t) => {
    const s = typeof t === "string" ? t : t?.content ?? "";
    return VOICE_INTENT_RE.test(s) || s.includes('"voice_clone"');
  });
}

export function voiceCloneToolPrompt(costs: { create: number; speak: number; sing: number }): string {
  const c = (n: number) => (n === 0 ? "grátis" : `${n} crédito${n > 1 ? "s" : ""}`);
  return [
    `- {"tool":"voice_clone","op":"setup"} → abre o Clonador de voz ao lado: o usuário grava (ou envia) 10–60 s da PRÓPRIA voz e aceita o termo de consentimento (${c(costs.create)}). Use quando ele pedir para clonar/capturar a voz dele e ainda não tiver voz salva.`,
    `- {"tool":"voice_clone","op":"list"} → lista as vozes clonadas do usuário (grátis).`,
    `- {"tool":"voice_clone","op":"sing","source_artifact":"a1","voice_id":"uuid opcional"} → nova versão de uma música JÁ criada (artefato de música da conversa) cantada com a voz clonada (${c(costs.sing)}, devolvido se falhar; leva 1 a 4 min). Sem voice_id usa a voz mais recente.`,
    `- {"tool":"voice_clone","op":"speak","text":"o que falar","voice_id":"uuid opcional"} → áudio falado com a voz clonada (${c(costs.speak)}).`,
  ].join("\n");
}

export const VOICE_CLONE_RULES =
  "Clonador de voz: \"clona minha voz\", \"canta com a minha voz\", \"versão da música com a minha voz\" → voice_clone (nunca open_panel voice, que é só um ditado). Se ele ainda não tem voz salva, use op setup e explique em 1 frase que ele grava a amostra e confirma o consentimento; depois ele pede de novo. Com voz salva e uma música na conversa, use op sing com o id do artefato da música. Só clone a voz do próprio usuário ou de quem autorizou: nunca de famosos ou terceiros sem autorização.";

/** Mensagens curtas do Clonador no idioma do usuário (pt-BR padrão). */
export const VOICE_MESSAGES: Record<VoiceLang, Record<string, string>> = {
  pt: {
    disabled: "O Clonador de voz ainda não está liberado para a sua conta.",
    unavailable: "O Clonador de voz está indisponível agora. Nenhum crédito foi cobrado.",
    no_voice: "Você ainda não tem uma voz clonada. Abri o Clonador de voz: grave de 10 a 60 segundos falando normalmente, aceite o termo e salve. Depois é só pedir de novo.",
    consent_required: "Para clonar, confirme que a voz é sua (ou que você tem autorização por escrito).",
    sample_invalid: "A amostra precisa ter de 8 a 90 segundos de áudio (webm, mp3, wav, m4a ou ogg).",
    too_many: "Você já tem 5 vozes salvas. Apague uma para criar outra.",
    source_missing: "Não achei a música para refazer com a sua voz. Crie a música primeiro ou indique qual delas.",
    insufficient_credits: "Créditos insuficientes para usar a sua voz.",
    timeout: "Está demorando mais que o normal. A versão continua sendo feita e aparece no Clonador de voz quando terminar; se falhar, o crédito volta.",
    failed: "Não consegui gerar o áudio com a sua voz. O crédito foi devolvido.",
    language_unsupported: "A fala com voz clonada ainda não lê este idioma. Idiomas da fala: {langs}. Cantar com a sua voz funciona em qualquer idioma. Nada foi cobrado.",
  },
  en: {
    disabled: "The voice cloner isn't enabled for your account yet.",
    unavailable: "The voice cloner is unavailable right now. No credits were charged.",
    no_voice: "You don't have a cloned voice yet. I opened the voice cloner: record 10 to 60 seconds speaking normally, accept the consent and save. Then just ask again.",
    consent_required: "To clone, confirm the voice is yours (or that you have written permission).",
    sample_invalid: "The sample must be 8 to 90 seconds of audio (webm, mp3, wav, m4a or ogg).",
    too_many: "You already have 5 saved voices. Delete one to create another.",
    source_missing: "I couldn't find the song to redo with your voice. Create the song first or say which one.",
    insufficient_credits: "Not enough credits to use your voice.",
    timeout: "This is taking longer than usual. It keeps going and shows up in the voice cloner when done; if it fails, the credit comes back.",
    failed: "I couldn't generate the audio with your voice. The credit was refunded.",
    language_unsupported: "Cloned-voice speech can't read this language yet. Speech languages: {langs}. Singing with your voice works in any language. Nothing was charged.",
  },
  es: {
    disabled: "El clonador de voz aún no está habilitado para tu cuenta.",
    unavailable: "El clonador de voz no está disponible ahora. No se cobró ningún crédito.",
    no_voice: "Aún no tienes una voz clonada. Abrí el clonador: graba de 10 a 60 segundos hablando normalmente, acepta el consentimiento y guarda. Luego pídelo de nuevo.",
    consent_required: "Para clonar, confirma que la voz es tuya (o que tienes autorización por escrito).",
    sample_invalid: "La muestra debe tener de 8 a 90 segundos de audio (webm, mp3, wav, m4a u ogg).",
    too_many: "Ya tienes 5 voces guardadas. Borra una para crear otra.",
    source_missing: "No encontré la canción para rehacer con tu voz. Crea la canción primero o indica cuál.",
    insufficient_credits: "Créditos insuficientes para usar tu voz.",
    timeout: "Está tardando más de lo normal. Sigue en proceso y aparecerá en el clonador al terminar; si falla, el crédito vuelve.",
    failed: "No pude generar el audio con tu voz. El crédito fue devuelto.",
    language_unsupported: "El habla con voz clonada aún no lee este idioma. Idiomas del habla: {langs}. Cantar con tu voz funciona en cualquier idioma. No se cobró nada.",
  },
};

export function voiceMessage(code: string, lang: VoiceLang = "pt"): string {
  const m = VOICE_MESSAGES[lang][code] ?? VOICE_MESSAGES.pt[code] ?? VOICE_MESSAGES[lang].failed;
  return m.replace("{langs}", Object.values(TTS_LANGUAGES).join(", "));
}

// ─── Idiomas da fala (TTS) ───────────────────────────────────────────────
//
// Motor de fala: Chatterbox Multilingual (chatterbox-tts 0.1.6, MIT, Resemble AI). SUPPORTED_LANGUAGES do
// pacote (chatterbox/mtl_tts.py) = 23 idiomas abaixo. O canto (Demucs + Seed-VC) converte o timbre e não
// depende do idioma: serve para qualquer língua.
// Fora dos 23: texto em alfabeto latino cai no idioma da voz (ou inglês) e o resultado avisa
// language_fallback=true; escrita sem suporte (ex.: tailandês, bengali, tâmil) responde
// language_unsupported ANTES de cobrar. Nunca quebra.

export const TTS_LANGUAGES = {
  ar: "العربية", da: "Dansk", de: "Deutsch", el: "Ελληνικά", en: "English", es: "Español", fi: "Suomi", fr: "Français",
  he: "עברית", hi: "हिन्दी", it: "Italiano", ja: "日本語", ko: "한국어", ms: "Bahasa Melayu", nl: "Nederlands", no: "Norsk",
  pl: "Polski", pt: "Português", ru: "Русский", sv: "Svenska", sw: "Kiswahili", tr: "Türkçe", zh: "中文",
} as const;
export type TtsLang = keyof typeof TTS_LANGUAGES;
export const TTS_LANG_CODES = Object.keys(TTS_LANGUAGES) as TtsLang[];

/** "pt-BR", "zh-Hans", "nb", "Português"… → código do TTS, ou null se não houver. */
export function ttsLangCode(v: unknown): TtsLang | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  if (!s || s === "auto") return null;
  const base = s.split(/[-_]/)[0];
  if (base === "nb" || base === "nn") return "no";
  if ((TTS_LANG_CODES as string[]).includes(base)) return base as TtsLang;
  const byName = (Object.entries(TTS_LANGUAGES) as Array<[TtsLang, string]>).find(([, n]) => n.toLowerCase() === s);
  return byName ? byName[0] : null;
}

const SCRIPT_RE: Array<[string, RegExp]> = [
  ["kana", /[\u3040-\u30ff]/g], ["han", /[\u4e00-\u9fff]/g], ["hangul", /[\uac00-\ud7af\u1100-\u11ff]/g],
  ["arabic", /[\u0600-\u06ff]/g], ["hebrew", /[\u0590-\u05ff]/g], ["greek", /[\u0370-\u03ff]/g],
  ["cyrillic", /[\u0400-\u04ff]/g], ["devanagari", /[\u0900-\u097f]/g], ["thai", /[\u0e00-\u0e7f]/g],
  ["bengali", /[\u0980-\u09ff]/g], ["tamil", /[\u0b80-\u0bff]/g], ["telugu", /[\u0c00-\u0c7f]/g],
  ["georgian", /[\u10a0-\u10ff]/g], ["armenian", /[\u0530-\u058f]/g], ["ethiopic", /[\u1200-\u137f]/g],
  ["khmer", /[\u1780-\u17ff]/g], ["lao", /[\u0e80-\u0eff]/g], ["myanmar", /[\u1000-\u109f]/g], ["gujarati", /[\u0a80-\u0aff]/g],
  ["gurmukhi", /[\u0a00-\u0a7f]/g], ["sinhala", /[\u0d80-\u0dff]/g], ["malayalam", /[\u0d00-\u0d7f]/g], ["kannada", /[\u0c80-\u0cff]/g],
];
const SCRIPT_LANG: Record<string, string> = {
  kana: "ja", han: "zh", hangul: "ko", arabic: "ar", hebrew: "he", greek: "el", cyrillic: "ru", devanagari: "hi",
  thai: "th", bengali: "bn", tamil: "ta", telugu: "te", georgian: "ka", armenian: "hy", ethiopic: "am", khmer: "km",
  lao: "lo", myanmar: "my", gujarati: "gu", gurmukhi: "pa", sinhala: "si", malayalam: "ml", kannada: "kn",
};

// Palavras funcionais frequentes (artigos, preposições, pronomes) por idioma latino do TTS.
const LATIN_STOP: Record<string, string> = {
  pt: "o a os as um uma de do da dos das em no na nos nas que não é eu você ele ela com para por mas como mais muito isso esse essa também meu minha seu sua então está são foi tem vamos",
  es: "el la los las un una de del en que no es yo tú usted él ella con para por pero como más muy eso este esta también mi su entonces está son fue tiene vamos y",
  en: "the a an of to in on at and is are was were it this that you he she we they with for but not be have has do does my your our their from by as or so will would can",
  fr: "le la les un une des de du en et est que qui ne pas je tu il elle nous vous ils avec pour mais comme plus très ce cette mon ma mes son sa dans sur au aux",
  de: "der die das ein eine einen und ist nicht ich du er sie wir ihr mit für aber wie mehr sehr auch mein meine dein sein in auf zu den dem des von im es",
  it: "il lo la gli le un una di del della che non è io tu lui lei noi voi con per ma come più molto anche mio mia suo sua nel nella sono questo questa",
  nl: "de het een en is niet ik jij je hij zij wij we met voor maar zoals meer zeer ook mijn zijn haar in op van te dat dit er",
  pl: "i w na z że nie jest to się jak ale do co ja ty on ona my wy dla tak bardzo też mój moja jego jej od po przez",
  tr: "ve bir bu da de ne için ile ama çok gibi ben sen o biz siz onlar değil var yok daha mı mi şey olan",
  sv: "och att det som en ett är inte jag du han hon vi ni de med för men hur mer mycket också min mitt på av till i",
  da: "og at det som en et er ikke jeg du han hun vi de med for men hvordan mere meget også min mit på af til i",
  no: "og at det som en et er ikke jeg du han hun vi dere de med for men hvordan mer veldig også min mitt på av til i meg deg",
  fi: "ja on ei se että minä sinä hän me te he kanssa mutta kuin myös minun sinun tämä tuo oli ovat joka",
  ms: "dan yang di ke dari ini itu tidak saya awak anda dia kami kita mereka dengan untuk tetapi seperti lebih sangat juga ada akan",
  sw: "na ya wa kwa ni la za katika hii hiyo si mimi wewe yeye sisi ninyi wao lakini kama zaidi sana pia yangu",
};
const LATIN_STOP_SETS = Object.fromEntries(Object.entries(LATIN_STOP).map(([k, v]) => [k, new Set(v.split(" "))]));
const LATIN_HINT: Record<string, RegExp> = {
  pt: /[ãõç]|ção\b/, es: /[ñ¿¡]|ción\b/, de: /ß|[äöü]/, fr: /[œèêàù]|\bj'|\bc'|\bd'/, pl: /[ąęłńśźż]/, tr: /[ığş]/,
  sv: /å|ä/, da: /[æø]/, no: /[æø]/, fi: /ää|öö|yy/, it: /\bè\b|zione\b/, nl: /ij\b|\bhet\b/,
};

/**
 * Idioma provável do texto para a fala. Devolve um código ISO (pode estar fora do TTS, ex. "th")
 * ou null quando não dá para dizer (texto curto ou ambíguo).
 */
export function detectSpeechLanguage(text: string): string | null {
  const t = (text ?? "").toLowerCase();
  const letters = (t.match(/\p{L}/gu) ?? []).length;
  if (!letters) return null;
  const scores = SCRIPT_RE.map(([name, re]) => [name, (t.match(re) ?? []).length] as const).filter(([, n]) => n > 0);
  if (scores.length) {
    const kana = scores.find(([n]) => n === "kana")?.[1] ?? 0;
    const han = scores.find(([n]) => n === "han")?.[1] ?? 0;
    if ((kana + han) / letters >= 0.3) return kana > 0 ? "ja" : "zh";
    const [top, n] = [...scores].sort((a, b) => b[1] - a[1])[0];
    if (n / letters >= 0.4) {
      if (top === "cyrillic" && /[іїєґ]/.test(t)) return "uk";
      if (top === "cyrillic" && /[ђћџљњј]/.test(t)) return "sr";
      if (top === "arabic" && /[پچژگ]/.test(t)) return "fa";
      if (top === "arabic" && /[ٹڈڑںے]/.test(t)) return "ur";
      return SCRIPT_LANG[top] ?? null;
    }
  }
  const words = t.split(/[^\p{L}']+/u).filter(Boolean);
  let best: { lang: string; score: number } | null = null;
  let second = 0;
  for (const [lang, set] of Object.entries(LATIN_STOP_SETS)) {
    let score = LATIN_HINT[lang]?.test(t) ? 2 : 0;
    for (const w of words) if (set.has(w)) score += 1;
    if (!best || score > best.score) {
      second = best?.score ?? 0;
      best = { lang, score };
    } else if (score > second) second = score;
  }
  if (!best || best.score < 2 || best.score === second) return null;
  return best.lang;
}

export interface SpeechLanguageChoice {
  /** Código enviado ao motor (sempre um dos 23). */
  language: TtsLang;
  /** Como foi escolhido. */
  source: "requested" | "detected" | "voice" | "default";
  /** O idioma do texto não está entre os 23 (ou não foi reconhecido): falou com o mais próximo possível. */
  fallback: boolean;
  /** Idioma detectado no texto (pode estar fora do TTS). */
  detected: string | null;
}

/**
 * Idioma da fala: pedido explícito (seletor) → detectado no texto → idioma da voz → inglês.
 * Escrita que o TTS não sabe ler (ex.: tailandês, bengali) → { unsupported } para recusar sem cobrar.
 */
export function resolveSpeechLanguage(
  i: { requested?: unknown; text: string; voiceLanguage?: unknown },
): SpeechLanguageChoice | { unsupported: string } {
  const detected = detectSpeechLanguage(i.text);
  const req = ttsLangCode(i.requested);
  if (req) return { language: req, source: "requested", fallback: false, detected };
  const det = ttsLangCode(detected);
  if (det) return { language: det, source: "detected", fallback: false, detected };
  // Escrita própria fora do TTS: falar com outro idioma sairia ininteligível.
  if (detected && !/^(uk|sr|fa|ur)$/.test(detected) && SCRIPT_LANG_VALUES.has(detected)) return { unsupported: detected };
  if (detected === "uk" || detected === "sr") return { language: "ru", source: "detected", fallback: true, detected };
  if (detected === "fa" || detected === "ur") return { language: "ar", source: "detected", fallback: true, detected };
  const voice = ttsLangCode(i.voiceLanguage);
  if (voice) return { language: voice, source: "voice", fallback: detected !== null, detected };
  return { language: "en", source: "default", fallback: true, detected };
}
const SCRIPT_LANG_VALUES = new Set(Object.values(SCRIPT_LANG).filter((c) => !(TTS_LANG_CODES as string[]).includes(c)));

export function isUnsupportedSpeech(r: SpeechLanguageChoice | { unsupported: string }): r is { unsupported: string } {
  return "unsupported" in r;
}
