// Vertal Music AI · lógica pura do painel de criação de música (mesmo fluxo do Studio da MusKAI).
// Módulo PURO (sem Deno, sem rede): roda no Vitest, no navegador e na edge function creative-music.
//
// Provedores, em ordem:
//   1. "muskai"  → sunoapi.org (o mesmo provedor/modelo da MusKAI: api.sunoapi.org/api/v1, V4_5, customMode,
//                  2 versões A/B por geração). Liga só com SUNOAPI_KEY (chave paga, não configurada hoje).
//   2. "vertal"  → motor próprio em GPU (ACE-Step v1.5 XL Turbo no Modal, infra/vertal-gpu-modal/vertal_music.py),
//                  com VERTAL_OWN_MUSIC_URL + VERTAL_OWN_MUSIC_TOKEN.
//   VERTAL_MUSIC_PROVIDER=muskai|vertal força um deles (se configurado); "off" desliga a geração.

export type MusicProvider = "muskai" | "vertal";
export type LyricsMode = "auto" | "assist" | "paste";

export const MUSIC_COST_CREDITS = 1; // preço atual (creative-router estima música em 1 crédito)
import { MUSIC_LYRIC_LANGUAGES, genreHint } from "./worldGenres.ts";

export const SUNO_BASE = "https://api.sunoapi.org/api/v1";
export const SUNO_DEFAULT_MODEL = "V4_5";
export const MUSIC_JOB_MAX_MS = 15 * 60_000; // depois disso a geração é dada como falha e o crédito volta

export interface MusicEnv {
  [k: string]: string | undefined;
}

export interface MusicDna {
  depth: number;
  punch: number;
  space: number;
  texture: number;
}

export interface MusicRequest {
  title?: string;
  /** Descrição livre (pedido antigo: {action:"generate", prompt}). */
  prompt?: string;
  style?: string;
  mood?: string;
  energy?: number;
  tempo?: number;
  music_key?: string;
  language?: string;
  vocal_type?: string;
  vocal_tone?: string;
  instruments_primary?: string;
  instruments_secondary?: string;
  lyrics_mode?: LyricsMode;
  lyrics_input?: string;
  reference?: string;
  vibe_dna?: Partial<MusicDna>;
  instrumental?: boolean;
  seconds?: number;
}

export interface NormalizedMusicRequest {
  title: string;
  description: string;
  style: string;
  mood: string;
  energy: number;
  tempo: number;
  musicKey: string;
  language: string;
  languageCode: string;
  vocalType: string;
  vocalTone: string;
  primary: string;
  secondary: string;
  lyricsMode: LyricsMode;
  lyricsInput: string;
  reference: string;
  dna: MusicDna;
  instrumental: boolean;
  seconds: number;
  structured: boolean;
}

const clamp = (n: unknown, min: number, max: number, d: number) => {
  const v = typeof n === "number" && Number.isFinite(n) ? n : Number(n);
  return Number.isFinite(v) ? Math.max(min, Math.min(max, Math.round(v))) : d;
};
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

const LANG_CODES: Record<string, string> = {
  "português": "pt", portugues: "pt", pt: "pt", "pt-br": "pt",
  english: "en", en: "en", inglês: "en",
  "español": "es", espanol: "es", es: "es",
  "français": "fr", francais: "fr", fr: "fr",
  "日本語": "ja", ja: "ja", japanese: "ja",
};
export function languageCode(language: string): string {
  const raw = language.trim().toLowerCase();
  if (LANG_CODES[raw]) return LANG_CODES[raw];
  // Qualquer um dos 50 idiomas do ACE-Step 1.5: código ("ko", "pt-BR", "zh-Hant") ou nome nativo ("한국어", "Kiswahili").
  const base = raw.split(/[-_ (]/)[0];
  if (base === "nb" || base === "nn") return "no";
  if (base === "fil") return "tl";
  if (MUSIC_LYRIC_LANGUAGES[base]) return base;
  const plain = raw.replace(/\s*\(.*\)\s*$/, "");
  const byName = Object.entries(MUSIC_LYRIC_LANGUAGES).find(([, n]) => {
    const name = n.toLowerCase();
    return name === raw || name === plain || name.replace(/\s*\(.*\)\s*$/, "") === plain;
  });
  if (byName) return byName[0];
  // Idioma fora da lista: o motor aceita "unknown" (antes caía em "pt").
  return raw ? "unknown" : "pt";
}

export function normalizeMusicRequest(body: MusicRequest): NormalizedMusicRequest {
  const structured = Boolean(body.style || body.mood || body.lyrics_mode || body.vibe_dna);
  const description = str(body.prompt, 3000);
  const vocalType = str(body.vocal_type, 60) || "Feminino";
  const instrumental = Boolean(body.instrumental) || /^sem vocal$/i.test(vocalType);
  const mode: LyricsMode = body.lyrics_mode === "auto" || body.lyrics_mode === "paste" ? body.lyrics_mode : "assist";
  const language = str(body.language, 40) || "Português";
  const dna = body.vibe_dna ?? {};
  return {
    title: str(body.title, 80),
    description,
    style: str(body.style, 80),
    mood: str(body.mood, 80),
    energy: clamp(body.energy, 0, 100, 70),
    tempo: clamp(body.tempo, 60, 200, 110),
    musicKey: str(body.music_key, 30),
    language,
    languageCode: languageCode(language),
    vocalType,
    vocalTone: str(body.vocal_tone, 60) || "Suave",
    primary: str(body.instruments_primary, 200),
    secondary: str(body.instruments_secondary, 200),
    lyricsMode: mode,
    lyricsInput: str(body.lyrics_input, 4000) || (mode === "paste" ? "" : description),
    reference: str(body.reference, 300),
    dna: {
      depth: clamp(dna.depth, 0, 100, 60),
      punch: clamp(dna.punch, 0, 100, 60),
      space: clamp(dna.space, 0, 100, 50),
      texture: clamp(dna.texture, 0, 100, 40),
    },
    instrumental,
    seconds: clamp(body.seconds, 30, 180, 90),
    structured,
  };
}

/** Pedido válido? Precisa de algo para compor: estilo/tema/letra/descrição. */
export function musicRequestError(r: NormalizedMusicRequest): string | null {
  if (!r.description && !r.style && !r.lyricsInput && r.lyricsMode !== "auto") return "prompt_required";
  if (r.lyricsMode === "paste" && !r.instrumental && r.lyricsInput.length < 8) return "lyrics_required";
  return null;
}

/** Tags de estilo como a MusKAI monta (estilo, mood, vocal, instrumentos, tom, bpm, energia, Vibe DNA). */
export function buildMusicTags(r: NormalizedMusicRequest): string {
  const dnaTags = [
    r.dna.depth > 60 ? "deep reverb" : null,
    r.dna.punch > 60 ? "punchy drums" : null,
    r.dna.space > 60 ? "wide stereo" : null,
    r.dna.texture > 60 ? "digital texture" : "analog warmth",
  ].filter(Boolean).join(", ");
  const vocals = r.instrumental ? "instrumental, no vocals" : `${r.vocalType} vocals (${r.vocalTone})`;
  const parts = [
    r.style || null,
    // Ritmo do catálogo do mundo (forró, amapiano, qawwali…): instrumentos/levada típicos. Estilos antigos: nada muda.
    genreHint(r.style) || null,
    r.mood || null,
    vocals,
    r.primary || null,
    r.secondary || null,
    r.musicKey ? `key ${r.musicKey}` : null,
    `${r.tempo}bpm`,
    `energy ${r.energy}/100`,
    dnaTags,
    r.reference ? `reference: ${r.reference}` : null,
    r.description && r.description !== r.lyricsInput ? r.description : null,
    !r.structured && r.description && r.description === r.lyricsInput ? r.description : null,
  ].filter(Boolean);
  return parts.join(", ").slice(0, 900);
}

/** "Super Prompt" exibido no painel (mesmo formato do MūskAI Engine). */
export function buildSuperPrompt(r: NormalizedMusicRequest): string {
  return `[VERTAL_MUSIC_ENGINE]
STYLE: ${r.style || "(livre)"}
MOOD: ${r.mood || "(livre)"}
ENERGY: ${r.energy}
TEMPO: ${r.tempo}
KEY: ${r.musicKey || "(livre)"}
LANGUAGE: ${r.language}

VOCALS:
- type: ${r.instrumental ? "sem vocal" : r.vocalType}
- tone: ${r.instrumental ? "-" : r.vocalTone}

INSTRUMENTS:
- primary: ${r.primary || "(livre)"}
- secondary: ${r.secondary || "(livre)"}

STRUCTURE: intro · verse · chorus · bridge · outro

LYRICS_MODE: ${r.lyricsMode}
LYRICS:
${r.lyricsInput || "(auto)"}

VIBE_DNA:
- depth: ${r.dna.depth}
- punch: ${r.dna.punch}
- space: ${r.dna.space}
- texture: ${r.dna.texture}

REFERENCE: ${r.reference || "(livre)"}`;
}

/** Título automático curto (quando o usuário deixa em branco). */
export function autoTitle(r: NormalizedMusicRequest, seed: string): string {
  if (r.title) return r.title;
  const theme = (r.lyricsMode === "assist" ? r.lyricsInput : r.description).replace(/\s+/g, " ").trim();
  if (theme && theme.length <= 40) return theme.charAt(0).toUpperCase() + theme.slice(1);
  const base = [r.style, r.mood].filter(Boolean).join(" · ") || "Vertal Music";
  return `${base} #${seed}`.slice(0, 80);
}

/** Pedido ao LLM para escrever a letra (modos Auto e Assistido). */
export function lyricsPrompt(r: NormalizedMusicRequest): string {
  const theme = r.lyricsMode === "assist" && r.lyricsInput ? `Tema/ideia do usuário: "${r.lyricsInput}".` : "Tema livre, combinando com o estilo e o mood.";
  return [
    `Escreva a letra de uma música no idioma ${r.language}.`,
    `Estilo: ${r.style || "livre"}. Mood: ${r.mood || "livre"}. ${theme}`,
    "Estrutura com marcações em linhas próprias: [verse], [chorus], [verse], [chorus], [bridge], [chorus].",
    "Versos curtos e cantáveis, no máximo 24 linhas no total. Responda SOMENTE com a letra, sem título, sem comentários.",
  ].join("\n");
}

/** Limpa a resposta do LLM e garante as marcações de seção. */
export function cleanLyrics(text: string): string {
  const t = text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^```[a-z]*\n?|```$/gim, "")
    .replace(/\*\*/g, "")
    .replace(/^\s*\(?(verso|verse)\s*\d*\)?\s*:?\s*$/gim, "[verse]")
    .replace(/^\s*\(?(refrão|refrao|chorus)\)?\s*:?\s*$/gim, "[chorus]")
    .replace(/^\s*\(?(ponte|bridge)\)?\s*:?\s*$/gim, "[bridge]")
    .trim();
  return t.slice(0, 3000);
}

/** Letra de reserva quando nenhum LLM responde: usa o tema do usuário numa estrutura simples. */
export function fallbackLyrics(r: NormalizedMusicRequest): string {
  const theme = (r.lyricsInput || r.description || r.mood || "a vida").replace(/\s+/g, " ").trim().slice(0, 80);
  if (r.languageCode === "en") {
    return `[verse]\nI keep on walking, thinking of ${theme}\nEvery step I take, I feel it in my dreams\n[chorus]\nOh, ${theme}, light up my way\nSing it out loud, today\n[verse]\nThe night is long but I won't let go\nThe rhythm in my heart keeps the fire aglow\n[chorus]\nOh, ${theme}, light up my way\nSing it out loud, today`;
  }
  return `[verse]\nSigo em frente pensando em ${theme}\nCada passo que eu dou me leva além\n[chorus]\nÔ, ${theme}, ilumina o meu caminho\nCanta comigo, eu não tô sozinho\n[verse]\nA noite é longa, mas eu vou ficar\nO ritmo no peito não para de tocar\n[chorus]\nÔ, ${theme}, ilumina o meu caminho\nCanta comigo, eu não tô sozinho`;
}

/** Qual provedor usar com a config atual (null = nenhum configurado). */
export function pickMusicProvider(env: MusicEnv): MusicProvider | null {
  const forced = (env.VERTAL_MUSIC_PROVIDER ?? "").trim().toLowerCase();
  if (/^(off|false|0|none)$/.test(forced)) return null;
  const hasSuno = Boolean((env.SUNOAPI_KEY ?? env.SUNO_API_KEY ?? "").trim());
  const ownUrl = (env.VERTAL_OWN_MUSIC_URL ?? "").trim();
  const hasOwn = /^https:\/\//i.test(ownUrl) && Boolean((env.VERTAL_OWN_MUSIC_TOKEN ?? "").trim());
  if (forced === "vertal" && hasOwn) return "vertal";
  if (forced === "muskai" && hasSuno) return "muskai";
  if (hasSuno) return "muskai";
  if (hasOwn) return "vertal";
  return null;
}

/** Status do sunoapi.org → estado do Vertal. */
export function mapSunoStatus(status: string | undefined, readyCount: number): "processing" | "completed" | "failed" {
  const s = (status ?? "").toUpperCase();
  if (["CREATE_TASK_FAILED", "GENERATE_AUDIO_FAILED", "SENSITIVE_WORD_ERROR", "CALLBACK_EXCEPTION"].includes(s)) return "failed";
  if (s === "SUCCESS" && readyCount > 0) return "completed";
  if (readyCount >= 2) return "completed";
  return "processing";
}

/** Payload do sunoapi.org exatamente como a MusKAI envia (customMode, style = tags, título, modelo). */
export function sunoPayload(r: NormalizedMusicRequest, lyrics: string, title: string, model: string, callBackUrl: string) {
  return {
    customMode: true,
    instrumental: r.instrumental,
    prompt: r.instrumental ? "" : lyrics.slice(0, 3000),
    style: buildMusicTags(r).slice(0, 200),
    title: title.slice(0, 80),
    model: model || SUNO_DEFAULT_MODEL,
    callBackUrl,
  };
}

/** Pedido ao motor próprio (ACE-Step). */
export function ownPayload(r: NormalizedMusicRequest, lyrics: string, seed: number) {
  return {
    prompt: buildMusicTags(r),
    lyrics: r.instrumental ? "[Instrumental]" : lyrics,
    instrumental: r.instrumental,
    seconds: r.seconds,
    language: r.languageCode,
    bpm: r.tempo,
    key: r.musicKey ? r.musicKey.replace(/\s*\/.*?(major|minor)/i, " $1") : undefined,
    seed,
  };
}
