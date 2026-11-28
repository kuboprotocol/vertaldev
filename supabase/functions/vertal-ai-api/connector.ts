// deno-lint-ignore-file no-explicit-any
/* eslint-disable @typescript-eslint/no-explicit-any -- cliente Supabase sem tipos gerados nas edge functions */
// VERTAL AI API · conector "Vertal AI" (o equivalente ao "Lovable AI").
//
//   POST …/vertal-ai-api/connector   (JWT do Dev)  {action:"status"|"activate"|"deactivate", projectId?, projectLabel?, needs?:{video?}}
//   *    …/vertal-ai-api/p/<ref>/v1/…              proxy do projeto, chamado pelo app gerado (sem chave)
//
// Ativar = uma chave white-label escopada ao projeto, criada pela MESMA função do /keys
// (apiKeysStore.ts) e guardada cifrada no Cofre do Dev. O proxy troca o ref público pela chave
// dentro do servidor e reentra nas rotas de sempre (route): mesma medição, mesma cobrança
// (atacado nos créditos do dono, clonagem/raspagem recusadas, saldo zero → 402). Nada é cobrado aqui.
//
// Desligado por padrão: VERTAL_AI_CONNECTOR_ENABLED (+ _USER_IDS) no VERTAL_GPU_CONFIG. Desligado,
// handleConnector devolve null e a API se comporta exatamente como antes.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";
import {
  connectorAllowed,
  connectorScope,
  deactivateProjectConnector,
  ensureProjectConnector,
  loadConnectorConfig,
  matchProxyPath,
  originAllowed,
  proxyRouteAllowed,
} from "../_shared/vertalAiConnector.ts";
import { loadActiveConnector, makeConnectorDeps, resolveProxyKey } from "../_shared/vertalAiConnectorStore.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
const err = (status: number, code: string, message: string) =>
  json(status, { error: { message, code, type: status === 402 ? "insufficient_quota" : status === 401 ? "authentication_error" : "invalid_request_error" } });

export async function handleConnector(
  req: Request,
  admin: any,
  path: string,
  route: (req: Request, path: string) => Promise<Response>,
): Promise<Response | null> {
  const proxied = matchProxyPath(path);
  const isConnector = path.endsWith("/connector");
  if (!proxied && !isConnector) return null;
  const cfg = loadConnectorConfig(Deno.env.toObject());
  // Flag desligada: nem o proxy nem a ativação existem (as rotas de antes seguem intactas).
  if (!cfg.enabled) return null;
  return proxied ? await proxy(req, admin, cfg, proxied, route) : await manage(req, admin, cfg);
}

async function manage(req: Request, admin: any, cfg: ReturnType<typeof loadConnectorConfig>): Promise<Response> {
  if (req.method !== "POST") return err(405, "method_not_allowed", "Use POST.");
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return err(401, "unauthorized", "Entre na sua conta.");
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  });
  const { data: u } = await userClient.auth.getUser(jwt);
  if (!u?.user) return err(401, "unauthorized", "Sessão inválida.");
  const userId = u.user.id as string;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  // Projeto: precisa ser do Dev (RLS do próprio usuário, como no vibe-code-agent). Sem projeto = "default".
  let projectId: string | null = null;
  let projectLabel = typeof body.projectLabel === "string" ? body.projectLabel : "";
  if (body.projectId !== undefined && body.projectId !== null && body.projectId !== "") {
    if (typeof body.projectId !== "string" || !UUID_RE.test(body.projectId)) return err(400, "invalid_project", "Projeto inválido.");
    const { data: proj } = await userClient.from("projects").select("id, name").eq("id", body.projectId).maybeSingle();
    if (!proj?.id) return err(404, "project_not_found", "Projeto não encontrado.");
    projectId = proj.id;
    if (!projectLabel && typeof proj.name === "string") projectLabel = proj.name;
  }

  const allowed = connectorAllowed(cfg, userId);
  const deps = makeConnectorDeps(admin, userId);
  switch (body.action) {
    case "status": {
      if (!allowed) return json(200, { allowed: false, active: false });
      const active = await loadActiveConnector(admin, cfg, userId, projectId);
      return json(200, { allowed: true, active: !!active, scope: connectorScope(projectId), ...(active ? { proxyUrl: active.proxyUrl, video: active.video, keyId: active.keyId } : {}) });
    }
    case "activate": {
      const needs = (body.needs ?? {}) as { video?: unknown };
      const r = await ensureProjectConnector(deps, { cfg, ownerId: userId, projectId, projectLabel, needsVideo: needs.video === true });
      if (r.ok === false) return err(r.status, r.code, r.message);
      // Nunca devolve a chave: só o que o app e a tela precisam.
      return json(200, { active: true, created: r.created, keyId: r.keyId, proxyUrl: r.proxyUrl, video: r.video, scope: connectorScope(projectId) });
    }
    case "deactivate": {
      if (!allowed) return err(404, "connector_disabled", "O conector Vertal AI ainda não está disponível para esta conta.");
      const r = await deactivateProjectConnector(deps, { ownerId: userId, projectId });
      return json(200, { active: false, revoked: r.revoked });
    }
    default:
      return err(400, "unknown_action", "Ação desconhecida.");
  }
}

async function proxy(
  req: Request,
  admin: any,
  cfg: ReturnType<typeof loadConnectorConfig>,
  p: { ref: string; path: string },
  route: (req: Request, path: string) => Promise<Response>,
): Promise<Response> {
  if (!proxyRouteAllowed(req.method, p.path)) return err(404, "not_found", "Rota não disponível pelo proxy do projeto.");
  if (!originAllowed(req.headers.get("Origin"), cfg.allowedOrigins)) return err(403, "origin_not_allowed", "Origem não autorizada para este app.");
  const k = await resolveProxyKey(admin, p.ref);
  // Chave revogada (no /keys), expirada, ou dono fora da allowlist do conector: o app para na hora.
  if (!k || !connectorAllowed(cfg, k.ownerId)) return err(401, "vertal_ai_inactive", "A Vertal AI não está ativa neste app.");

  const url = new URL(req.url);
  const headers = new Headers({ Authorization: `Bearer ${k.key}`, "Content-Type": req.headers.get("Content-Type") ?? "application/json" });
  for (const h of ["Accept-Language", "Idempotency-Key", "X-Request-Id"]) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v.slice(0, 200));
  }
  const inner = new Request(`${url.origin}${url.pathname.replace(/\/p\/vapp_[A-Za-z0-9_-]{24}\/v1\/.*$/, "")}${p.path}${url.search}`, {
    method: req.method,
    headers,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer(),
  });
  return await route(inner, p.path);
}
