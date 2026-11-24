// VERTAL Code AI · edge function (nuvem). Modo NOVO, ao lado do Vibe Code — não substitui nada.
//
//   POST {action:"status"}                       → {enabled, allowed} (200 só para quem está liberado)
//   POST {action:"models"}                       → modelos disponíveis (só nomes Vertal)
//   POST {action:"run", mode, effort, prompt...}  → SSE: status/read/model/verify/diff/plan/reply/done
//   POST {action:"apply", projectId, changes}     → grava versões novas no cofre de código do projeto
//
// Liga só com VERTAL_CODE_AI_ENABLED=true (padrão: desligado → 404).
// Com VERTAL_CODE_AI_USER_IDS (lista de ids separada por vírgula), só esses usuários; os demais recebem 404.
// Não escreve em ai_gateway_runs (para não mexer na saúde/roteamento do Vibe Code) e
// não cobra créditos na v1 (modelos grátis). Chaves só por variável de ambiente.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  buildChain,
  isVcaEnabled,
  isVcaUserAllowed,
  publicModelInfo,
  requestBody,
  shouldFallback,
  type VcaChatMessage,
  type VcaEffort,
  type VcaMode,
  type VcaModel,
} from "../_shared/vertalCodeAi/router.ts";
import { isSafePath } from "../_shared/vibeAgentCore.ts";
import { type ModelReply, runVertalCodeAi, type VcaEvent, type VcaPlan } from "../_shared/vertalCodeAi/core.ts";

// Cliente do Supabase e módulo TypeScript sem tipos gerados (mesmo padrão do vibe-code-agent).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EFFORTS: VcaEffort[] = ["auto", "low", "high", "max"];
const ORIGINS = ["vertal_code_ai", "vibe_code", "vertal_chat"] as const;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const env = () => Deno.env.toObject();

// Catálogo grátis ao vivo do OpenRouter (cache por isolate, 1 h). Falha = mantém a lista configurada.
let liveFree: { at: number; ids: string[] } | null = null;
async function liveFreeIds(): Promise<string[] | null> {
  if (liveFree && Date.now() - liveFree.at < 3_600_000) return liveFree.ids;
  try {
    const r = await fetch("https://openrouter.ai/api/v1/models", { signal: AbortSignal.timeout(3_000) });
    if (!r.ok) return null;
    const d = await r.json();
    const ids = ((d?.data ?? []) as Array<{ id: string }>).map((m) => m.id).filter((id) => id.endsWith(":free"));
    liveFree = { at: Date.now(), ids };
    return ids;
  } catch {
    return null;
  }
}

/** Checagem de sintaxe real com o compilador TypeScript (carregado só quando preciso). */
let tsMod: Loose = null;
async function checkSyntax(path: string, content: string): Promise<string[]> {
  if (/^(0|false|off)$/i.test(Deno.env.get("VERTAL_CODE_AI_TS_CHECK") ?? "")) return [];
  tsMod ??= (await import("npm:typescript@5.8.3")).default;
  const ts = tsMod;
  const out = ts.transpileModule(content, {
    fileName: path,
    reportDiagnostics: true,
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  });
  return (out.diagnostics ?? []).slice(0, 5).map((d: Loose) => {
    const msg = ts.flattenDiagnosticMessageText(d.messageText, "\n");
    if (d.file && typeof d.start === "number") {
      const { line } = d.file.getLineAndCharacterOfPosition(d.start);
      return `linha ${line + 1}: ${msg}`;
    }
    return msg;
  });
}

async function callChain(
  chain: VcaModel[],
  messages: VcaChatMessage[],
  opts: { json: boolean; maxTokens: number; effort: VcaEffort; deadline: number },
): Promise<ModelReply> {
  const e = env();
  const failures: string[] = [];
  for (let i = 0; i < chain.length; i++) {
    const m = chain[i];
    const left = opts.deadline - Date.now();
    if (left < 8_000) break;
    const timeout = Math.min(left - 3_000, m.provider === "ollama" ? 240_000 : 90_000);
    const key = (e[m.keyEnv] ?? "").trim();
    try {
      const r = await fetch(m.url, {
        method: "POST",
        signal: AbortSignal.timeout(timeout),
        headers: {
          "Content-Type": "application/json",
          ...(key ? { Authorization: `Bearer ${key}` } : {}),
          ...(m.provider === "openrouter" ? { "HTTP-Referer": "https://vertal.dev", "X-Title": "VERTAL Code AI" } : {}),
        },
        body: JSON.stringify(requestBody(m, messages, { effort: opts.effort, json: opts.json, maxTokens: opts.maxTokens })),
      });
      if (!r.ok) {
        failures.push(`${m.id}:${r.status}`);
        await r.body?.cancel();
        if (shouldFallback(r.status)) continue;
        break;
      }
      const d = await r.json();
      const content = d?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) {
        failures.push(`${m.id}:empty`);
        continue;
      }
      console.log(`[vertal-code-ai] ok ${m.id} (${m.provider}/${m.model}) tokens=${JSON.stringify(d?.usage ?? {})}`);
      const info = publicModelInfo(m);
      return { content, label: info.label, cost: info.cost, fellBack: i > 0 };
    } catch (err) {
      failures.push(`${m.id}:${err instanceof Error ? err.name : "err"}`);
    }
  }
  console.warn(`[vertal-code-ai] chain failed: ${failures.join(",")}`);
  throw new Error("vca_all_models_failed");
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  if (!isVcaEnabled(env())) return json(404, { error: "vertal_code_ai_disabled" });

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { error: "missing_authorization" });
  const userClient: Loose = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: userRes, error: userErr } = await userClient.auth.getUser(token);
  if (userErr || !userRes?.user) return json(401, { error: "invalid_token" });
  const userId: string = userRes.user.id;
  // Lista de liberação: quem não está nela não vê nada (mesma resposta de "desligado").
  if (!isVcaUserAllowed(env(), userId)) return json(404, { error: "vertal_code_ai_disabled" });
  const admin: Loose = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  let body: Record<string, Loose>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json_body" });
  }
  const action = body.action ?? "run";
  if (action === "status") return json(200, { enabled: true, allowed: true });
  const origin = ORIGINS.includes(body.origin) ? body.origin : "vertal_code_ai";

  // Projeto do usuário (RLS decide se ele pode ver). Sem projeto = cofre pessoal (project_id nulo).
  let projectId: string | null = null;
  if (typeof body.projectId === "string" && UUID_RE.test(body.projectId)) {
    const { data: proj } = await userClient.from("projects").select("id").eq("id", body.projectId).maybeSingle();
    if (!proj) return json(404, { error: "project_not_found" });
    projectId = proj.id;
  }
  const scope = (q: Loose) => (projectId ? q.eq("project_id", projectId) : q.is("project_id", null));

  if (action === "models") {
    const effort: VcaEffort = EFFORTS.includes(body.effort) ? body.effort : "auto";
    const chain = buildChain(env(), { effort, liveFreeIds: await liveFreeIds() });
    return json(200, { models: chain.map(publicModelInfo), paidEnabled: chain.some((m) => m.cost === "paid") });
  }

  // Limite por usuário (balde próprio; não divide cota com o Vibe Code).
  try {
    const { data: rl } = await admin.rpc("bump_rate_limit", { _bucket: "vertal_code_ai", _user: userId, _window_seconds: 60 });
    if (typeof rl === "number" && rl > 12) return json(429, { error: "rate_limited" });
  } catch (e) {
    console.warn("[vertal-code-ai] rate-limit check failed:", e instanceof Error ? e.message : e);
  }

  // Últimas versões dos arquivos do projeto no cofre de código (mesma tabela do Vibe Code, só leitura aqui).
  const latestFiles = async (): Promise<Map<string, string>> => {
    const { data } = await scope(
      admin.from("vibe_project_files").select("path, content, version").eq("user_id", userId)
        .order("version", { ascending: false }).limit(4000),
    );
    const out = new Map<string, string>();
    for (const r of (data ?? []) as Array<{ path: string; content: string }>) if (!out.has(r.path)) out.set(r.path, r.content ?? "");
    return out;
  };

  if (action === "apply") {
    const changes = Array.isArray(body.changes) ? body.changes.slice(0, 40) : [];
    if (!changes.length) return json(400, { error: "no_changes" });
    const current = await latestFiles();
    const applied: string[] = [];
    const conflicts: string[] = [];
    const skipped: string[] = [];
    for (const c of changes) {
      const path = typeof c?.path === "string" ? c.path : "";
      if (!isSafePath(path)) {
        skipped.push(path);
        continue;
      }
      if (typeof c.after !== "string") {
        skipped.push(path); // apagar arquivo: v1 só sinaliza; o dev apaga no Vibe Code.
        continue;
      }
      const base = typeof c.baseHash === "string" ? c.baseHash : null;
      if (base !== null && base !== (await sha256(current.get(path) ?? ""))) {
        conflicts.push(path);
        continue;
      }
      // Versionamento igual ao do cofre do Vibe Code: nova versão = última + 1.
      let ok = false;
      for (let attempt = 0; attempt < 3 && !ok; attempt++) {
        const { data: latest } = await scope(
          admin.from("vibe_project_files").select("version").eq("user_id", userId).eq("path", path)
            .order("version", { ascending: false }).limit(1),
        );
        const version = ((latest?.[0]?.version as number | undefined) ?? 0) + 1;
        const { error } = await admin.from("vibe_project_files").insert({
          user_id: userId,
          project_id: projectId,
          conversation_id: null,
          path,
          content: c.after.slice(0, 500_000),
          version,
          commit_sha: null,
        });
        if (!error) ok = true;
        else if (error.code !== "23505") break;
      }
      (ok ? applied : skipped).push(path);
    }
    return json(200, { applied, conflicts, skipped });
  }

  if (action !== "run") return json(400, { error: "unknown_action" });

  const mode: VcaMode = body.mode === "plan" ? "plan" : "build";
  const effort: VcaEffort = EFFORTS.includes(body.effort) ? body.effort : "auto";
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) return json(400, { error: "empty_prompt" });
  const images: string[] = (Array.isArray(body.images) ? body.images : [])
    .filter((u: unknown): u is string => typeof u === "string" && (/^data:image\/(png|jpe?g|webp|gif);base64,/.test(u) || /^https:\/\//.test(u)))
    .filter((u: string) => u.length < 6_000_000)
    .slice(0, 4);
  const attachments = (Array.isArray(body.attachments) ? body.attachments : [])
    .filter((a: Loose) => a && typeof a.path === "string" && typeof a.content === "string")
    .slice(0, 10)
    .map((a: Loose) => ({ path: a.path.slice(0, 300), content: a.content.slice(0, 200_000) }));
  const history = (Array.isArray(body.history) ? body.history : [])
    .filter((h: Loose) => h && (h.role === "user" || h.role === "assistant") && typeof h.content === "string")
    .slice(-8);

  const deadlineMs = Number(Deno.env.get("VERTAL_CODE_AI_DEADLINE_MS")) || 140_000;
  const deadline = Date.now() + deadlineMs;
  const chain = buildChain(env(), {
    effort,
    needsVision: images.length > 0,
    promptTokens: Math.ceil(prompt.length / 3.5),
    liveFreeIds: await liveFreeIds(),
  });
  if (!chain.length) return json(503, { error: "no_model_configured" });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: VcaEvent | Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          /* cliente fechou */
        }
      };
      send({ kind: "status", title: mode === "plan" ? "Planejando" : "Construindo", origin });
      try {
        let files: Map<string, string> | null = null;
        const getFiles = async () => (files ??= await latestFiles());
        const result = await runVertalCodeAi(
          {
            mode,
            effort,
            prompt,
            history,
            images,
            attachments,
            plan: body.plan && typeof body.plan === "object" ? (body.plan as VcaPlan) : null,
          },
          {
            callModel: (messages, o) => callChain(chain, messages, { ...o, effort, deadline }),
            listPaths: async () => [...(await getFiles()).keys()],
            readFile: async (p) => (await getFiles()).get(p),
            indexSource: async () => [...(await getFiles())].filter(([, c]) => c.length < 60_000).map(([path, content]) => ({ path, content })),
            checkSyntax,
            emit: send,
          },
        );
        // Hash do "antes" de cada arquivo: o apply recusa se o arquivo mudou no meio do caminho.
        send({
          kind: "base_hashes",
          hashes: Object.fromEntries(await Promise.all(result.changes.map(async (c) => [c.path, await sha256(c.before)]))),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        send({
          kind: "error",
          message: msg === "vca_all_models_failed"
            ? "Todos os modelos grátis estão ocupados ou sem cota agora. Tente em alguns minutos ou ative o servidor próprio Vertal."
            : "Não consegui concluir o pedido.",
        });
        console.error("[vertal-code-ai] run failed:", msg);
      } finally {
        try {
          controller.close();
        } catch {
          /* já fechado */
        }
      }
    },
  });
  return new Response(stream, { headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
});
