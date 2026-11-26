// VERTAL Code AI · ações "senses" (Decide / Visão / Ouvir) e "novela" da edge function.
// Sem Deno: rede, assinatura de job e relógio são injetados → testável no Vitest. Cobrança DESLIGADA (só estimativa).

import { retailCredits } from "./router.ts";
import {
  audioPart,
  DATA_URL_AUDIO,
  DATA_URL_IMAGE,
  decide,
  type DecideResult,
  type DecisionQuestions,
  HEAR_PROMPT,
  isSensesFeatureOn,
  MAX_AUDIO_DATA_URL,
  MAX_FRAMES,
  MAX_IMAGE_DATA_URL,
  multimodalChat,
  novelaPublicStatus,
  novelaSubmitBody,
  ownGpuCostUsd,
  parseHearJson,
  parseProductJson,
  PRODUCT_DESCRIBE_PROMPT,
  PRODUCT_QUESTIONS,
  productRoute,
  type SensesConfig,
  type SensesDeps,
  sensesStatus,
  validQuestions,
} from "./senses.ts";

export const VCA_NOVELA_JOB_PREFIX = "vcanov_";

export interface SensesHandlerDeps extends SensesDeps {
  /** fetch "cru" (para repassar bytes de vídeo/áudio). */
  rawFetch: (url: string, init: { method?: string; headers: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<Response>;
  signJob: (jobId: string) => Promise<string>;
  verifyJob: (token: string) => Promise<string | null>;
  log?: (msg: string) => void;
}

export type SensesReply = { status: number; body: unknown } | { response: Response };

/** AbortSignal com prazo (sem depender de AbortSignal.timeout, ausente em alguns ambientes de teste). */
function timeoutSignal(ms: number): AbortSignal {
  const ac = new AbortController();
  setTimeout(() => ac.abort(), ms);
  return ac.signal;
}

const label = (name: string, source: "own" | "fallback") => `${name} · ${source === "own" ? "Própria" : "Reserva"}`;
const estimate = (usd: number) => ({ usd: Math.round(usd * 1e6) / 1e6, credits: retailCredits(usd), charged: false });
const disabled = (): SensesReply => ({ status: 404, body: { error: "vertal_senses_disabled" } });

function decisionPublic(d: DecideResult | null) {
  return d ? { answers: d.answers, model: { label: label("Vertal Decide", d.source) }, ms: d.ms } : null;
}

export async function handleSenses(body: Record<string, unknown>, cfg: SensesConfig, deps: SensesHandlerDeps): Promise<SensesReply> {
  const op = typeof body.op === "string" ? body.op : "status";
  const log = deps.log ?? (() => {});
  if (op === "status") return { status: 200, body: { features: sensesStatus(cfg) } };

  if (op === "decide") {
    if (!isSensesFeatureOn(cfg, "decide")) return disabled();
    const questions = validQuestions(body.questions);
    if (!questions) return { status: 400, body: { error: "invalid_questions" } };
    const text = typeof body.state === "string" ? body.state.slice(0, 20_000) : JSON.stringify(body.state ?? "").slice(0, 20_000);
    const imgs = (Array.isArray(body.images) ? body.images : []).filter((u): u is string => typeof u === "string" && DATA_URL_IMAGE.test(u) && u.length < MAX_IMAGE_DATA_URL).slice(0, 4);
    const state = imgs.length ? [text, ...imgs.map((url) => ({ type: "image_url" as const, image_url: { url } }))] : text;
    const d = await decide(cfg, deps, state, questions);
    if (!d) return { status: 502, body: { error: "vca_senses_failed" } };
    return { status: 200, body: { ...decisionPublic(d), estimate: estimate(d.source === "own" ? ownGpuCostUsd("L4", d.ms) : d.costUsd) } };
  }

  if (op === "photo") {
    if (!isSensesFeatureOn(cfg, "vision")) return disabled();
    const image = typeof body.image === "string" ? body.image : "";
    if (!DATA_URL_IMAGE.test(image) || image.length > MAX_IMAGE_DATA_URL) return { status: 400, body: { error: "invalid_image" } };
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";
    // 1) Decide na hora (categoria, é produto?, qualidade, impróprio?) — só se o Decide estiver configurado.
    const d = isSensesFeatureOn(cfg, "decide")
      ? await decide(cfg, { ...deps, timeoutMs: 12_000 }, ["Foto enviada por um cliente para anunciar um produto." + (note ? ` Nota: ${note}` : ""), { type: "image_url", image_url: { url: image } }], PRODUCT_QUESTIONS)
      : null;
    const route = productRoute(d?.answers ?? null);
    let usd = d ? (d.source === "own" ? ownGpuCostUsd("L4", d.ms) : d.costUsd) : 0;
    if (!route.describe) {
      return { status: 200, body: { decision: decisionPublic(d), route, product: null, estimate: estimate(usd) } };
    }
    // 2) Descrição de venda com o multimodal (própria → reserva).
    const category = d?.answers.category?.choice;
    const prompt = PRODUCT_DESCRIBE_PROMPT + (category ? ` Categoria provável: ${category}.` : "") + (note ? ` Nota do vendedor: ${note}` : "");
    const messages = [{ role: "user", content: [{ type: "image_url", image_url: { url: image } }, { type: "text", text: prompt }] }];
    const c = await multimodalChat(cfg, deps, messages, { json: true, maxTokens: 700 });
    if (!c) return { status: 502, body: { error: "vca_senses_failed", decision: decisionPublic(d), route } };
    usd += c.source === "own" ? ownGpuCostUsd("L40S", c.ms) : c.costUsd;
    const product = parseProductJson(c.text);
    log(`[vertal-code-ai] senses photo decide=${d?.source ?? "none"}:${d?.ms ?? 0}ms describe=${c.source}:${c.ms}ms usd=${usd.toFixed(6)}`);
    return {
      status: 200,
      body: { decision: decisionPublic(d), route, product, raw: product ? undefined : c.text.slice(0, 2000), model: { label: label("Vertal Visão", c.source) }, ms: c.ms, estimate: estimate(usd) },
    };
  }

  if (op === "frames") {
    if (!isSensesFeatureOn(cfg, "decide")) return disabled();
    const questions = validQuestions(body.questions);
    if (!questions) return { status: 400, body: { error: "invalid_questions" } };
    const frames = (Array.isArray(body.frames) ? body.frames : [])
      .filter((f): f is { t: number; image: string } => !!f && typeof f === "object" && typeof (f as { image?: unknown }).image === "string" && DATA_URL_IMAGE.test((f as { image: string }).image) && (f as { image: string }).image.length < 1_500_000)
      .slice(0, MAX_FRAMES);
    if (!frames.length) return { status: 400, body: { error: "no_frames" } };
    const ctx = typeof body.state === "string" ? body.state.slice(0, 2_000) : "A frame sampled from a video.";
    const out: Array<{ t: number; answers: DecideResult["answers"] | null }> = [];
    let usd = 0;
    let source: "own" | "fallback" = "own";
    const t0 = (deps.now ?? Date.now)();
    for (const f of frames) {
      const d = await decide(cfg, deps, [ctx, { type: "image_url", image_url: { url: f.image } }], questions);
      if (d) {
        usd += d.source === "own" ? ownGpuCostUsd("L4", d.ms) : d.costUsd;
        if (d.source === "fallback") source = "fallback";
      }
      out.push({ t: Number(f.t) || 0, answers: d?.answers ?? null });
    }
    const rankBy = typeof body.rank_by === "string" && body.rank_by in questions ? body.rank_by : null;
    const val = (a: DecideResult["answers"] | null) => {
      const x = rankBy && a ? a[rankBy] : null;
      return x ? (x.noul ?? x.score ?? x.confidence ?? 0) : -1;
    };
    const top = rankBy ? [...out].sort((a, b) => val(b.answers) - val(a.answers)).slice(0, 5).map((f) => f.t) : [];
    return { status: 200, body: { frames: out, top, model: { label: label("Vertal Decide", source) }, ms: (deps.now ?? Date.now)() - t0, estimate: estimate(usd) } };
  }

  if (op === "hear") {
    if (!isSensesFeatureOn(cfg, "hear")) return disabled();
    const audio = typeof body.audio === "string" ? body.audio : "";
    if (!DATA_URL_AUDIO.test(audio) || audio.length > MAX_AUDIO_DATA_URL) return { status: 400, body: { error: "invalid_audio" } };
    const part = audioPart(audio);
    if (!part) return { status: 400, body: { error: "invalid_audio" } };
    const messages = [{ role: "user", content: [part, { type: "text", text: HEAR_PROMPT }] }];
    const c = await multimodalChat(cfg, deps, messages, { json: true, maxTokens: 900 });
    if (!c) return { status: 502, body: { error: "vca_senses_failed" } };
    const usd = c.source === "own" ? ownGpuCostUsd("L40S", c.ms) : c.costUsd;
    return { status: 200, body: { hear: parseHearJson(c.text), model: { label: label("Vertal Ouvir", c.source) }, ms: c.ms, estimate: estimate(usd) } };
  }

  if (op === "speak") {
    // Resposta em voz pt-BR (voz própria do pipeline da Novela). Sem reserva paga.
    if (!isSensesFeatureOn(cfg, "novela") || !cfg.novela) return disabled();
    const text = typeof body.text === "string" ? body.text.trim().slice(0, 1_200) : "";
    if (!text) return { status: 400, body: { error: "empty_text" } };
    const r = await deps.rawFetch(`${cfg.novela.url}/tts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.novela.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice: typeof body.voice === "string" ? body.voice : "pf_dora" }),
      signal: timeoutSignal(90_000),
    });
    if (!r.ok || !r.body) {
      await r.body?.cancel();
      return { status: 502, body: { error: "vca_senses_failed" } };
    }
    return { response: new Response(r.body, { headers: { "Content-Type": "audio/wav", "Cache-Control": "private, max-age=600" } }) };
  }

  return { status: 400, body: { error: "unknown_op" } };
}

export async function handleNovela(body: Record<string, unknown>, cfg: SensesConfig, deps: SensesHandlerDeps): Promise<SensesReply> {
  if (!isSensesFeatureOn(cfg, "novela") || !cfg.novela) return { status: 404, body: { error: "vertal_novela_disabled" } };
  const op = typeof body.op === "string" ? body.op : "submit";
  const auth = { Authorization: `Bearer ${cfg.novela.token}` };
  if (op === "submit") {
    const req = novelaSubmitBody(body);
    if (!req) return { status: 400, body: { error: "empty_premise" } };
    const r = await deps.rawFetch(`${cfg.novela.url}/submit`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify(req),
      signal: timeoutSignal(30_000),
    });
    if (!r.ok) {
      await r.body?.cancel();
      return { status: 502, body: { error: "vca_novela_failed" } };
    }
    const d = (await r.json()) as { id?: unknown };
    if (typeof d?.id !== "string" || !/^fc-[A-Za-z0-9]+$/.test(d.id)) return { status: 502, body: { error: "vca_novela_failed" } };
    return {
      status: 202,
      body: { job: await deps.signJob(`${VCA_NOVELA_JOB_PREFIX}${d.id}`), status: "pending", model: { label: "Vertal Novela · Própria" }, estimate: { ...estimate(0.03), note: "estimativa; custo real vem no status" } },
    };
  }
  const jobId = await deps.verifyJob(typeof body.job === "string" ? body.job : "");
  if (!jobId || !jobId.startsWith(VCA_NOVELA_JOB_PREFIX)) return { status: 404, body: { error: "job_not_found" } };
  const id = encodeURIComponent(jobId.slice(VCA_NOVELA_JOB_PREFIX.length));
  if (op === "status") {
    const r = await deps.rawFetch(`${cfg.novela.url}/status?id=${id}`, { headers: auth, signal: timeoutSignal(20_000) });
    if (!r.ok) {
      await r.body?.cancel();
      return { status: 502, body: { error: "vca_novela_failed" } };
    }
    const s = novelaPublicStatus(await r.json());
    return { status: 200, body: { ...s, estimate: typeof s.costUsd === "number" ? estimate(s.costUsd) : undefined } };
  }
  if (op === "result") {
    const r = await deps.rawFetch(`${cfg.novela.url}/result?id=${id}`, { headers: auth, signal: timeoutSignal(90_000) });
    if (!r.ok || !r.body) {
      await r.body?.cancel();
      return { status: r.status === 409 ? 409 : 502, body: { error: "vca_novela_not_ready" } };
    }
    return { response: new Response(r.body, { headers: { "Content-Type": "video/mp4", "Cache-Control": "private, max-age=3600" } }) };
  }
  return { status: 400, body: { error: "unknown_op" } };
}

export type { DecisionQuestions };
