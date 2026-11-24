// Handler do creative-router (tool "fluxos_apps"): conectar/desconectar apps do
// Vertal Fluxos por usuário e rodar ações/buscas deles. Ver fluxosApps.ts.
import { corsHeaders } from "./cors.ts";
import { deductCredits, enforceRateLimit, supaAdmin } from "./creative.ts";
import {
  compactResult,
  describeForAgent,
  FLUXOS_ACTION_COST,
  FLUXOS_PENDING_TTL_MS,
  type FluxosAppDef,
  type FluxosEngine,
  makeEngine,
  parseFluxosOp,
  platformOAuthData,
  userAuthFields,
  whiteLabel,
} from "./fluxosApps.ts";

type User = { id: string; email?: string | null };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

const defCache = new Map<string, { at: number; def: FluxosAppDef }>();

async function appDef(engine: FluxosEngine, app: string): Promise<FluxosAppDef | null> {
  const hit = defCache.get(app);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.def;
  const r = await engine.call("GET", `/apps/${app}`);
  if (r.status !== 200 || !r.data?.key) return null;
  defCache.set(app, { at: Date.now(), def: r.data as FluxosAppDef });
  return r.data as FluxosAppDef;
}

function engineMessage(data: any, fallback: string): string {
  const parts: string[] = [];
  if (typeof data?.message === "string") parts.push(data.message);
  if (data?.details) parts.push(compactResult(data.details, 600));
  return whiteLabel(parts.join(" ").trim() || fallback).slice(0, 800);
}

function log(user: User, app: string, event: string, ok: boolean, message: string) {
  supaAdmin().from("connector_activity_logs").insert({
    user_id: user.id,
    connector_slug: `fluxos-${app}`,
    event_type: `fluxos_${event}`,
    message: message.slice(0, 300),
    status: ok ? "success" : "error",
    metadata: { app, op: event },
  }).then(({ error }) => { if (error) console.error("[fluxos_apps] log failed:", error.message); });
}

export async function handleFluxosApps(user: User, raw: unknown, envGet: (k: string) => string | undefined = (k) => Deno.env.get(k)): Promise<Response> {
  const limit = await enforceRateLimit(user.id, "fluxos_apps", { max: 60, windowSeconds: 60, userEmail: user.email ?? null });
  if (!limit.ok) return json(429, { error: limit.error });

  const op = parseFluxosOp(raw);
  if (!op) return json(400, { error: "invalid_input" });

  const admin = supaAdmin();
  if (op.op === "status") {
    const { data, error } = await admin.from("fluxos_connections")
      .select("app_key, status, screen_name, updated_at").eq("user_id", user.id);
    if (error) return json(500, { error: "status_failed" });
    return json(200, { ok: true, connections: data ?? [] });
  }

  const url = envGet("FLUXOS_INTERNAL_URL");
  const key = envGet("FLUXOS_INTERNAL_KEY");
  if (!url || !key) return json(503, { error: "fluxos_not_configured" });
  const engine = makeEngine(url, key);

  const def = await appDef(engine, op.app);
  if (!def) return json(404, { error: "app_not_found" });
  const platform = def.oauth ? platformOAuthData(op.app, envGet) : null;

  const { data: row } = await admin.from("fluxos_connections").select("*")
    .eq("user_id", user.id).eq("app_key", op.app).maybeSingle();

  if (op.op === "describe") {
    const needs = userAuthFields(def, platform);
    return json(200, {
      ok: true,
      app: { key: def.key, name: def.name, oauth: def.oauth, supportsConnections: def.supportsConnections },
      // OAuth sem cliente do Vertal: o usuário pode usar o próprio app (client id/secret).
      platformClient: def.oauth ? !!platform : null,
      fields: needs,
      actions: def.actions.map((a) => ({ key: a.key, name: a.name, description: a.description })),
      searches: def.searches.map((s) => ({ key: s.key, name: s.name, description: s.description })),
      agentText: describeForAgent(def),
      connection: row ? { status: row.status, screen_name: row.screen_name, updated_at: row.updated_at } : null,
    });
  }

  if (op.op === "start") {
    if (!def.supportsConnections) return json(400, { error: "no_connection_needed" });
    const data: Record<string, string> = { ...(op.fields ?? {}), ...(platform ?? {}) };
    if (!data.screenName) data.screenName = user.email ? `${def.name} · ${user.email}` : def.name;
    const missing = userAuthFields(def, platform)
      .filter((f) => f.required && !data[f.key] && !(f.value !== undefined && f.value !== null && f.value !== ""))
      .map((f) => f.key);
    if (missing.length) return json(400, { error: "missing_fields", fields: missing });
    // Valor padrão dos campos que o usuário não mudou (ex.: URL da instância).
    for (const f of def.authFields) {
      if (data[f.key] === undefined && typeof f.value === "string" && f.value) data[f.key] = f.value;
    }

    if (row?.fluxos_connection_id) {
      await engine.call("DELETE", `/connections/${row.fluxos_connection_id}`);
    }
    const created = await engine.call("POST", "/connections", { appKey: op.app, formattedData: data });
    if (created.status !== 201 || !created.data?.id) {
      log(user, op.app, "start", false, "create failed");
      return json(400, { error: "create_failed", message: engineMessage(created.data, "Não foi possível criar a conexão.") });
    }
    const connId = created.data.id as string;
    const now = new Date().toISOString();
    const { error: upErr } = await admin.from("fluxos_connections").upsert({
      user_id: user.id, app_key: op.app, fluxos_connection_id: connId,
      status: "pending", screen_name: data.screenName.slice(0, 200), updated_at: now,
    }, { onConflict: "user_id,app_key" });
    if (upErr) {
      await engine.call("DELETE", `/connections/${connId}`);
      return json(500, { error: "save_failed" });
    }

    if (def.oauth) {
      const r = await engine.call("POST", `/connections/${connId}/auth-url`);
      if (r.status !== 200 || typeof r.data?.url !== "string") {
        log(user, op.app, "start", false, "auth url failed");
        return json(400, { error: "auth_url_failed", message: engineMessage(r.data, "Não foi possível abrir o login do app.") });
      }
      log(user, op.app, "start", true, `OAuth iniciado: ${def.name}`);
      return json(200, { ok: true, mode: "oauth", url: r.data.url });
    }

    const v = await engine.call("POST", `/connections/${connId}/verify`);
    if (v.status === 200 && v.data?.verified) {
      await admin.from("fluxos_connections").update({ status: "connected", updated_at: new Date().toISOString() })
        .eq("user_id", user.id).eq("app_key", op.app);
      log(user, op.app, "connect", true, `${def.name} conectado`);
      return json(200, { ok: true, mode: "connected" });
    }
    await engine.call("DELETE", `/connections/${connId}`);
    await admin.from("fluxos_connections").delete().eq("user_id", user.id).eq("app_key", op.app);
    log(user, op.app, "connect", false, "verify failed");
    return json(400, { error: "verify_failed", message: engineMessage(v.data, "O app recusou os dados informados.") });
  }

  if (op.op === "complete") {
    const fresh = row && Date.now() - new Date(row.updated_at).getTime() < FLUXOS_PENDING_TTL_MS;
    if (!row || row.status !== "pending" || !fresh) return json(400, { error: "no_pending_connection" });
    if (op.params.error) {
      await engine.call("DELETE", `/connections/${row.fluxos_connection_id}`);
      await admin.from("fluxos_connections").delete().eq("user_id", user.id).eq("app_key", op.app);
      return json(400, { error: "oauth_denied", message: whiteLabel(op.params.error_description || op.params.error).slice(0, 300) });
    }
    const r = await engine.call("POST", `/connections/${row.fluxos_connection_id}/complete`, { formattedData: op.params });
    if (r.status === 200 && r.data?.verified) {
      await admin.from("fluxos_connections").update({
        status: "connected", updated_at: new Date().toISOString(),
        ...(typeof r.data.screenName === "string" && r.data.screenName ? { screen_name: r.data.screenName.slice(0, 200) } : {}),
      }).eq("user_id", user.id).eq("app_key", op.app);
      log(user, op.app, "connect", true, `${def.name} conectado (OAuth)`);
      return json(200, { ok: true });
    }
    await admin.from("fluxos_connections").update({ status: "error", updated_at: new Date().toISOString() })
      .eq("user_id", user.id).eq("app_key", op.app);
    log(user, op.app, "connect", false, "oauth verify failed");
    return json(400, { error: "verify_failed", message: engineMessage(r.data, "O app não confirmou a conexão.") });
  }

  if (op.op === "disconnect") {
    if (row?.fluxos_connection_id) await engine.call("DELETE", `/connections/${row.fluxos_connection_id}`);
    await admin.from("fluxos_connections").delete().eq("user_id", user.id).eq("app_key", op.app);
    log(user, op.app, "disconnect", true, `${def.name} desconectado`);
    return json(200, { ok: true });
  }

  // run / options: precisam da conexão do próprio usuário (salvo apps sem login).
  let connectionId: string | undefined;
  if (def.supportsConnections) {
    if (!row || row.status !== "connected") return json(409, { error: "not_connected", message: `${def.name} não está conectado. Conecte em Conectores → ${def.name}.` });
    connectionId = row.fluxos_connection_id;
  }

  if (op.op === "options") {
    const r = await engine.call("POST", "/dynamic-data", { appKey: op.app, key: op.key, connectionId, parameters: op.parameters });
    if (r.status !== 200 || !r.data?.ok) return json(502, { error: "options_failed", message: engineMessage(r.data, "Não foi possível listar as opções.") });
    const items = (r.data.data as Array<{ name?: unknown; value?: unknown }>).slice(0, 100)
      .map((d) => ({ name: String(d?.name ?? ""), value: d?.value }));
    return json(200, { ok: true, options: items });
  }

  // op === "run"
  const list = op.kind === "trigger" ? def.searches : def.actions;
  if (!list.some((a) => a.key === op.key)) return json(404, { error: op.kind === "trigger" ? "search_not_found" : "action_not_found" });
  if (op.chatCharge) {
    const ded = await deductCredits(user.id, FLUXOS_ACTION_COST, `chat_fluxos_${op.app}`,
      { source: "vertal_chat", app: op.app, key: op.key, kind: op.kind }, user.email ?? null, `fluxos:${op.chatCharge}`);
    if (!ded.ok) return json(ded.status ?? 402, { error: ded.error });
  }
  const r = await engine.call("POST", "/run", {
    appKey: op.app, kind: op.kind, key: op.key, connectionId, parameters: op.parameters,
  });
  if (r.status !== 200 || !r.data?.ok) {
    log(user, op.app, "run", false, `${op.kind} ${op.key} falhou`);
    // Não-2xx: os créditos voltam (withRefundOnFailure no creative-router).
    return json(502, { error: "run_failed", message: engineMessage(r.data, "O app recusou o pedido.") });
  }
  log(user, op.app, "run", true, `${op.kind} ${op.key}`);
  const payload = op.kind === "trigger" ? r.data.items : r.data.data;
  return json(200, { ok: true, result: compactResult(payload) });
}
