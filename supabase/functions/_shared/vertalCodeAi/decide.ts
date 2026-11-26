// VERTAL Code AI · Vertal Decide: camada de DECISÃO rápida e tipada (lógica pura: sem Deno; rede injetada).
//
// Em vez de uma chamada de LLM inteira para uma bifurcação simples, a Equipe pergunta:
//   • noul   → sim/não, com a probabilidade do "sim"
//   • choice → uma opção de uma lista, com a probabilidade de cada uma
//   • score  → posição numa escala ordenada, com a probabilidade de cada nível
// e age pelo nível de confiança: ALTA age sozinha, MÉDIA sobe para um modelo maior, BAIXA pergunta ao usuário.
//
// Interface única: decide(state, questions). Provedores, nesta ordem (o 1º que responder vence):
//   1. "own"  → modelo de decisão próprio (Vertal Decide na GPU própria), se VERTAL_DECIDE_URL estiver configurado.
//               Contrato: POST {model?, state, questions} → {answers} no MESMO formato da Decisions API.
//               (Kit da GPU própria: POST https://…modal.run/v1/systemone, Bearer VERTAL_DECIDE_TOKEN.)
//   2. "jev"  → modelo de decisão via OpenRouter (POST /api/alpha/decisions), com a OPENROUTER_API_KEY que já existe.
//               É pago por token de entrada → só com VERTAL_CODE_AI_ALLOW_PAID=true. Modelo: VERTAL_DECIDE_JEV_MODEL.
//   3. "llm"  → a cadeia barata/própria de sempre, pedindo JSON com probabilidades (reserva, sempre disponível).
//   4. "none" → nenhuma resposta: devolve answers vazio; quem chamou usa o padrão seguro.
// Nomes de fornecedor ficam só aqui no servidor; a tela mostra "Vertal Decide".

import { repairAgentJson } from "../chatOrchestrator.ts";
import type { VcaChatMessage, VcaEnv } from "./router.ts";

// ───────────────────────────── Tipos ─────────────────────────────

export type DecisionQuestion =
  | { type: "noul"; instructions: string; criteria?: { true: string; false: string } }
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "score"; instructions: string; criteria: string[] };

export type DecisionQuestions = Record<string, DecisionQuestion>;

export type DecisionSource = "own" | "jev" | "llm" | "none";
export type DecisionTier = "act" | "escalate" | "ask";

export interface DecisionAnswer {
  type: DecisionQuestion["type"];
  /** noul → boolean; choice → opção; score → posição (0..n-1, ponderada). */
  value: boolean | string | number;
  /** noul: probabilidade do "sim". */
  yes?: number;
  /** Probabilidade de cada opção/nível (choice/score). */
  probabilities?: Record<string, number>;
  /** 0–1: quanto a distribuição está concentrada na resposta. */
  confidence: number;
  tier: DecisionTier;
}

export interface DecisionResult {
  source: DecisionSource;
  answers: Record<string, DecisionAnswer>;
  costUsd?: number;
  ms: number;
}

export type DecideFn = (state: Record<string, unknown>, questions: DecisionQuestions) => Promise<DecisionResult>;

// ───────────────────────────── Configuração ─────────────────────────────

const truthy = (v: string | undefined) => /^(1|true|yes|on|sim)$/i.test((v ?? "").trim());
const num = (v: string | undefined, d: number) => (Number(v) > 0 && Number(v) <= 1 ? Number(v) : d);

export const DEFAULT_JEV_MODEL = "typesafe/jev-1.14";
export const DECISIONS_URL = "https://openrouter.ai/api/alpha/decisions";

export interface DecideThresholds {
  /** ≥ high → age. */
  high: number;
  /** ≥ medium (e < high) → sobe para modelo maior. Abaixo → pergunta ao usuário. */
  medium: number;
}

export function decideThresholds(env: VcaEnv): DecideThresholds {
  const high = num(env.VERTAL_DECIDE_HIGH, 0.8);
  const medium = Math.min(high, num(env.VERTAL_DECIDE_MEDIUM, 0.55));
  return { high, medium };
}

export function tierFor(confidence: number, t: DecideThresholds): DecisionTier {
  if (confidence >= t.high) return "act";
  if (confidence >= t.medium) return "escalate";
  return "ask";
}

/** Própria configurada? (URL https + token) */
export function ownDecideConfigured(env: VcaEnv): boolean {
  return /^https:\/\//.test((env.VERTAL_DECIDE_URL ?? "").trim()) && !!(env.VERTAL_DECIDE_TOKEN ?? "").trim();
}
/** Decisões via OpenRouter: chave existente + pago liberado (é cobrado por token de entrada). */
export function jevConfigured(env: VcaEnv): boolean {
  return !!(env.OPENROUTER_API_KEY ?? "").trim() && truthy(env.VERTAL_CODE_AI_ALLOW_PAID) && !/^(0|false|off|no)$/i.test((env.VERTAL_DECIDE_JEV ?? "").trim());
}

// ───────────────────────────── Normalização das respostas ─────────────────────────────

const clamp01 = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : NaN);

/** Concentração da distribuição (1 = certeza; 0 = uniforme). Usada quando o provedor não manda confidence. */
export function concentration(probs: number[]): number {
  const p = probs.filter((x) => Number.isFinite(x) && x >= 0);
  const s = p.reduce((a, b) => a + b, 0);
  if (!p.length || s <= 0) return 0;
  if (p.length === 1) return 1;
  const sorted = p.map((x) => x / s).sort((a, b) => b - a);
  // margem entre a 1ª e a 2ª opção.
  return Math.max(0, Math.min(1, sorted[0] - sorted[1]));
}

/**
 * Lê uma resposta bruta (formato da Decisions API: {type, noul} / {type, choice, probabilities, confidence} /
 * {type, score, probabilities, confidence}) para o nosso tipo. Pergunta sem resposta legível = omitida.
 */
export function normalizeAnswers(raw: unknown, questions: DecisionQuestions, t: DecideThresholds): Record<string, DecisionAnswer> {
  const out: Record<string, DecisionAnswer> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [key, q] of Object.entries(questions)) {
    const a = (raw as Record<string, unknown>)[key];
    if (!a || typeof a !== "object") continue;
    const o = a as Record<string, unknown>;
    if (q.type === "noul") {
      const yes = clamp01(typeof o.noul === "number" ? o.noul : o.yes ?? o.probability);
      if (Number.isNaN(yes)) continue;
      const confidence = Math.abs(yes - 0.5) * 2;
      out[key] = { type: "noul", value: yes >= 0.5, yes, confidence, tier: tierFor(confidence, t) };
    } else if (q.type === "choice") {
      const options = Object.keys(q.criteria);
      const probsRaw = (o.probabilities && typeof o.probabilities === "object" ? o.probabilities : {}) as Record<string, unknown>;
      const probabilities: Record<string, number> = {};
      for (const k of options) {
        const v = clamp01(probsRaw[k]);
        probabilities[k] = Number.isNaN(v) ? 0 : v;
      }
      let choice = typeof o.choice === "string" && options.includes(o.choice) ? o.choice : "";
      if (!choice) {
        const best = options.reduce((b, k) => (probabilities[k] > (probabilities[b] ?? -1) ? k : b), options[0]);
        if (!best || !(probabilities[best] > 0)) continue;
        choice = best;
      }
      const c = clamp01(o.confidence);
      const confidence = Number.isNaN(c) ? concentration(Object.values(probabilities)) : c;
      out[key] = { type: "choice", value: choice, probabilities, confidence, tier: tierFor(confidence, t) };
    } else {
      const n = q.criteria.length;
      const probsRaw = (o.probabilities && typeof o.probabilities === "object" ? o.probabilities : {}) as Record<string, unknown>;
      const probabilities: Record<string, number> = {};
      for (let i = 0; i < n; i++) {
        const v = clamp01(probsRaw[String(i)]);
        probabilities[String(i)] = Number.isNaN(v) ? 0 : v;
      }
      let score = typeof o.score === "number" && Number.isFinite(o.score) ? Math.min(n - 1, Math.max(0, o.score)) : NaN;
      if (Number.isNaN(score)) {
        const s = Object.values(probabilities).reduce((a, b) => a + b, 0);
        if (s <= 0) continue;
        score = Object.entries(probabilities).reduce((acc, [i, p]) => acc + Number(i) * (p / s), 0);
      }
      const c = clamp01(o.confidence);
      const confidence = Number.isNaN(c) ? concentration(Object.values(probabilities)) : c;
      out[key] = { type: "score", value: Math.round(score * 100) / 100, probabilities, confidence, tier: tierFor(confidence, t) };
    }
  }
  return out;
}

// ───────────────────────────── Reserva: LLM barata com JSON ─────────────────────────────

export function llmDecisionPrompt(state: Record<string, unknown>, questions: DecisionQuestions): VcaChatMessage[] {
  const spec = Object.entries(questions).map(([k, q]) => {
    if (q.type === "noul") return `- "${k}" (sim/não): ${q.instructions}${q.criteria ? ` [sim: ${q.criteria.true}] [não: ${q.criteria.false}]` : ""} → {"type":"noul","noul":<probabilidade do sim 0-1>}`;
    if (q.type === "choice") return `- "${k}" (escolha): ${q.instructions} Opções: ${Object.entries(q.criteria).map(([o, d]) => `"${o}" = ${d}`).join("; ")} → {"type":"choice","choice":"<opção>","probabilities":{"<opção>":<0-1>,...}}`;
    return `- "${k}" (escala 0..${q.criteria.length - 1}): ${q.instructions} Níveis: ${q.criteria.map((c, i) => `${i} = ${c}`).join("; ")} → {"type":"score","probabilities":{"0":<0-1>,...}}`;
  });
  return [
    {
      role: "system",
      content: [
        "Você é um modelo de DECISÃO. Responda cada pergunta com probabilidades calibradas (honestas: se não dá para saber, espalhe a probabilidade).",
        "Sem explicações. Responda SOMENTE com JSON: {\"answers\":{\"<chave>\":{...}}}.",
      ].join("\n"),
    },
    { role: "user", content: `Estado:\n${JSON.stringify(state).slice(0, 12_000)}\n\nPerguntas:\n${spec.join("\n")}` },
  ];
}

// ───────────────────────────── Fábrica ─────────────────────────────

export interface DeciderDeps {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  env: VcaEnv;
  /** Reserva: cadeia barata/própria (JSON). Sem ela, o 3º degrau não existe. */
  callLlm?: (messages: VcaChatMessage[], opts: { json: boolean; maxTokens: number }) => Promise<{ content: string }>;
  now?: () => number;
  log?: (m: string) => void;
  timeoutMs?: number;
}

function validQuestions(questions: DecisionQuestions): DecisionQuestions {
  const out: DecisionQuestions = {};
  for (const [k, q] of Object.entries(questions ?? {}).slice(0, 12)) {
    if (!/^[a-z0-9_]{1,40}$/i.test(k) || !q || typeof q.instructions !== "string" || !q.instructions.trim()) continue;
    if (q.type === "noul") out[k] = { type: "noul", instructions: q.instructions.slice(0, 600), ...(q.criteria ? { criteria: { true: String(q.criteria.true ?? "").slice(0, 300), false: String(q.criteria.false ?? "").slice(0, 300) } } : {}) };
    else if (q.type === "choice" && q.criteria && typeof q.criteria === "object" && !Array.isArray(q.criteria)) {
      const entries = Object.entries(q.criteria).filter(([o]) => o.length <= 60).slice(0, 12);
      if (entries.length >= 2) out[k] = { type: "choice", instructions: q.instructions.slice(0, 600), criteria: Object.fromEntries(entries.map(([o, d]) => [o, String(d).slice(0, 300)])) };
    } else if (q.type === "score" && Array.isArray(q.criteria) && q.criteria.length >= 2) {
      out[k] = { type: "score", instructions: q.instructions.slice(0, 600), criteria: q.criteria.slice(0, 10).map((c) => String(c).slice(0, 200)) };
    }
  }
  return out;
}

/** Cria o decide(state, questions) com a ordem própria → OpenRouter → LLM barata → nenhum. Nunca lança. */
export function makeDecider(deps: DeciderDeps): DecideFn {
  const t = decideThresholds(deps.env);
  const now = deps.now ?? Date.now;
  const timeoutMs = deps.timeoutMs ?? 15_000;

  const post = async (url: string, headers: Record<string, string>, body: unknown): Promise<{ answers: unknown; cost?: number } | null> => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(new DOMException("timeout", "TimeoutError")), timeoutMs);
    try {
      const r = await deps.fetch(url, { method: "POST", signal: ac.signal, headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
      if (!r.ok) {
        deps.log?.(`[vertal-decide] ${url.includes("openrouter") ? "jev" : "own"} http ${r.status}`);
        await r.body?.cancel().catch(() => {});
        return null;
      }
      const d = await r.json();
      return { answers: d?.answers, cost: typeof d?.usage?.cost === "number" ? d.usage.cost : undefined };
    } catch (err) {
      deps.log?.(`[vertal-decide] falhou: ${err instanceof Error ? err.name : "err"}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  };

  return async (state, questionsIn) => {
    const start = now();
    const questions = validQuestions(questionsIn);
    if (!Object.keys(questions).length) return { source: "none", answers: {}, ms: 0 };
    const complete = (a: Record<string, DecisionAnswer>) => Object.keys(questions).every((k) => k in a);
    const e = deps.env;

    if (ownDecideConfigured(e)) {
      const r = await post(e.VERTAL_DECIDE_URL!.trim(), { Authorization: `Bearer ${e.VERTAL_DECIDE_TOKEN!.trim()}` }, {
        model: (e.VERTAL_DECIDE_MODEL ?? "").trim() || undefined,
        state,
        questions,
      });
      const answers = r ? normalizeAnswers(r.answers, questions, t) : {};
      if (r && complete(answers)) return { source: "own", answers, ms: now() - start };
    }
    if (jevConfigured(e)) {
      const r = await post(DECISIONS_URL, {
        Authorization: `Bearer ${e.OPENROUTER_API_KEY!.trim()}`,
        "HTTP-Referer": "https://vertal.dev",
        "X-Title": "VERTAL Code AI",
      }, { model: (e.VERTAL_DECIDE_JEV_MODEL ?? "").trim() || DEFAULT_JEV_MODEL, state, questions });
      const answers = r ? normalizeAnswers(r.answers, questions, t) : {};
      if (r && complete(answers)) {
        deps.log?.(`[vertal-decide] ok jev cost_usd=${(r.cost ?? 0).toFixed(6)}`);
        return { source: "jev", answers, costUsd: r.cost, ms: now() - start };
      }
    }
    if (deps.callLlm) {
      try {
        const reply = await deps.callLlm(llmDecisionPrompt(state, questions), { json: true, maxTokens: 600 });
        const fixed = repairAgentJson(reply.content ?? "");
        const raw = fixed ? ((fixed.value.answers as unknown) ?? fixed.value) : null;
        const answers = normalizeAnswers(raw, questions, t);
        // Reserva por LLM: confiança limitada (não é um modelo de decisão calibrado) → nunca passa de "sobe".
        for (const a of Object.values(answers)) {
          a.confidence = Math.min(a.confidence, Math.max(0, t.high - 0.01));
          a.tier = tierFor(a.confidence, t);
        }
        if (Object.keys(answers).length) return { source: "llm", answers, ms: now() - start };
      } catch {
        /* sem modelo: cai para "none" */
      }
    }
    return { source: "none", answers: {}, ms: now() - start };
  };
}

// ───────────────────────────── Ajudantes para a Equipe ─────────────────────────────

/** Sim/não com o nível: act só se a resposta é confiante. */
export function yesNo(r: DecisionResult, key: string): { yes: boolean; tier: DecisionTier; confidence: number } | null {
  const a = r.answers[key];
  if (!a || a.type !== "noul") return null;
  return { yes: a.value === true, tier: a.tier, confidence: a.confidence };
}

export function choiceOf(r: DecisionResult, key: string): { value: string; tier: DecisionTier; confidence: number } | null {
  const a = r.answers[key];
  if (!a || a.type !== "choice" || typeof a.value !== "string") return null;
  return { value: a.value, tier: a.tier, confidence: a.confidence };
}

export function scoreOf(r: DecisionResult, key: string): { value: number; level: number; tier: DecisionTier; confidence: number } | null {
  const a = r.answers[key];
  if (!a || a.type !== "score" || typeof a.value !== "number") return null;
  return { value: a.value, level: Math.round(a.value), tier: a.tier, confidence: a.confidence };
}

// ───────────────────────────── Ferramenta "Vertal Decide" (análise de dados) ─────────────────────────────

export const RISK_LEVELS = ["baixo", "médio", "alto", "crítico"] as const;

export interface AnalysisInput {
  /** Dossiê / dados do negócio (texto ou objeto). */
  dossier: unknown;
  /** Pergunta de análise (ex.: "por que as vendas caíram?"). */
  question?: string;
  /** Causas candidatas. Sem elas, a LLM barata propõe 3–5 antes da decisão. */
  causes?: string[];
}

export interface AnalysisResult {
  source: DecisionSource;
  mainCause: string | null;
  causeProbabilities: Record<string, number>;
  risk: (typeof RISK_LEVELS)[number] | null;
  riskScore: number | null;
  confidence: number;
  tier: DecisionTier;
  /** Texto curto para quem pediu (pt-BR). */
  note: string;
}

export function analysisQuestions(causes: string[], question?: string): DecisionQuestions {
  const keys = causes.map((_, i) => `c${i + 1}`);
  return {
    main_cause: {
      type: "choice",
      instructions: question?.trim() ? `Qual é a causa principal? Pergunta: ${question.trim().slice(0, 300)}` : "Qual é a causa principal do problema descrito no dossiê?",
      criteria: Object.fromEntries(keys.map((k, i) => [k, causes[i]])),
    },
    risk: { type: "score", instructions: "Qual o nível de risco para o negócio se nada for feito?", criteria: ["Baixo", "Médio", "Alto", "Crítico"] },
  };
}

/** Análise com a ferramenta: causa principal + risco + confiança. Nunca lança. */
export async function analyzeWithDecide(
  input: AnalysisInput,
  deps: { decide: DecideFn; proposeCauses?: (dossier: string, question?: string) => Promise<string[]> },
): Promise<AnalysisResult> {
  const dossier = typeof input.dossier === "string" ? input.dossier : JSON.stringify(input.dossier ?? {});
  let causes = (Array.isArray(input.causes) ? input.causes : []).filter((c): c is string => typeof c === "string" && !!c.trim()).map((c) => c.trim().slice(0, 200)).slice(0, 8);
  if (causes.length < 2 && deps.proposeCauses) causes = (await deps.proposeCauses(dossier.slice(0, 12_000), input.question).catch(() => [])).slice(0, 6);
  const empty: AnalysisResult = { source: "none", mainCause: null, causeProbabilities: {}, risk: null, riskScore: null, confidence: 0, tier: "ask", note: "Não deu para decidir: faltam causas candidatas ou nenhum modelo respondeu." };
  if (causes.length < 2) return empty;
  const r = await deps.decide({ dossie: dossier.slice(0, 30_000), pergunta: input.question ?? "" }, analysisQuestions(causes, input.question));
  const c = choiceOf(r, "main_cause");
  const s = scoreOf(r, "risk");
  if (!c) return { ...empty, source: r.source };
  const idx = Number(c.value.slice(1)) - 1;
  const probs = r.answers.main_cause?.probabilities ?? {};
  const causeProbabilities = Object.fromEntries(Object.entries(probs).map(([k, p]) => [causes[Number(k.slice(1)) - 1] ?? k, p]));
  const confidence = s ? Math.min(c.confidence, s.confidence) : c.confidence;
  const tier = c.tier === "act" && (!s || s.tier === "act") ? "act" : c.tier === "ask" || s?.tier === "ask" ? "ask" : "escalate";
  const risk = s ? RISK_LEVELS[Math.min(3, Math.max(0, s.level))] : null;
  return {
    source: r.source,
    mainCause: causes[idx] ?? null,
    causeProbabilities,
    risk,
    riskScore: s ? s.value : null,
    confidence: Math.round(confidence * 100) / 100,
    tier,
    note: tier === "act"
      ? "Decisão confiante."
      : tier === "escalate"
      ? "Confiança média: vale confirmar com um modelo maior ou com mais dados."
      : "Confiança baixa: precisa da sua avaliação.",
  };
}
