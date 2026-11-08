// Edge function `kubo-secrets-orchestrator`: o orquestrador do painel secreto.
// Cruza, para o usuário logado, três coisas que continuam separadas no banco:
//   - o cofre de segredos (kubo_secrets + concessões),
//   - os conectores (api_credentials), só para mostrar se estão conectados,
//   - os destinos conhecidos (ORCHESTRATION_TARGETS) e as chaves que cada um exige.
// Nunca devolve valores. A injeção de variáveis numa execução é feita no servidor,
// por `resolveEnvForRun` (_shared/kuboSecrets.ts), e fica registrada na auditoria.
//
//   POST { action: "targets" }
//   POST { action: "plan", target?: slug, env_keys?: string[] }
//   POST { action: "overview" }
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, sanitizeError } from "../_shared/cors.ts";
import {
  ORCHESTRATION_TARGETS,
  findTarget,
  normalizeEnvKey,
  planReadiness,
  summarizePlan,
  ENV_KEY_RE,
  type PlanEntry,
  type PlanStatus,
} from "../_shared/kuboSecretsCore.ts";
import { listVisibleSecrets } from "../_shared/kuboSecrets.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function connectorConnected(admin: SupabaseClient, userId: string, slug: string): Promise<boolean> {
  const { count, error } = await admin
    .from("api_credentials")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("connector_slug", slug);
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

function warningsFor(entries: PlanEntry[]): string[] {
  const out: string[] = [];
  for (const e of entries) {
    if (e.status === "missing") out.push(`${e.env_key}: falta cadastrar ou receber acesso`);
    else if (e.stale) out.push(`${e.env_key}: não é trocado há muito tempo`);
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "missing auth" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    const userDb = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userErr } = await userDb.auth.getUser();
    if (userErr || !userData.user) return json({ error: "invalid token" }, 401);
    const userId = userData.user.id;

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return json({ error: "JSON inválido" }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const now = new Date();

    switch (String(body.action ?? "")) {
      case "targets": {
        return json({ targets: ORCHESTRATION_TARGETS });
      }

      case "plan": {
        let label: string;
        let requiredKeys: string[];
        let connectorSlug: string | null = null;

        if (typeof body.target === "string" && body.target) {
          const target = findTarget(body.target);
          if (!target) return json({ error: "Destino desconhecido" }, 400);
          label = target.label;
          requiredKeys = target.env_keys;
          connectorSlug = target.connector_slug;
        } else if (Array.isArray(body.env_keys) && body.env_keys.length > 0) {
          if (body.env_keys.length > 50) return json({ error: "No máximo 50 variáveis por plano" }, 400);
          label = "Plano personalizado";
          requiredKeys = body.env_keys.map((k) => normalizeEnvKey(k));
          const bad = requiredKeys.find((k) => !ENV_KEY_RE.test(k));
          if (bad) return json({ error: `Nome de variável inválido: ${bad}` }, 400);
        } else {
          return json({ error: "Informe um destino ou uma lista de variáveis" }, 400);
        }

        const visible = await listVisibleSecrets(admin, userId);
        const entries = planReadiness(requiredKeys, visible, now);
        const status: PlanStatus = summarizePlan(entries);
        const connector = connectorSlug
          ? { slug: connectorSlug, connected: await connectorConnected(admin, userId, connectorSlug) }
          : null;

        return json({
          target: typeof body.target === "string" ? body.target : null,
          label,
          status,
          ready: status === "ready",
          entries,
          connector,
          warnings: warningsFor(entries),
        });
      }

      case "overview": {
        const visible = await listVisibleSecrets(admin, userId);
        const targets = [];
        for (const target of ORCHESTRATION_TARGETS) {
          const entries = planReadiness(target.env_keys, visible, now);
          const status = summarizePlan(entries);
          targets.push({
            slug: target.slug,
            label: target.label,
            description: target.description,
            status,
            ready_count: entries.filter((e) => e.status === "ready").length,
            total: entries.length,
            warnings: warningsFor(entries),
            connector: target.connector_slug
              ? { slug: target.connector_slug, connected: await connectorConnected(admin, userId, target.connector_slug) }
              : null,
          });
        }
        const attention = targets.filter((t) => t.status !== "ready").length;
        return json({
          secrets_total: visible.length,
          owned: visible.filter((v) => v.role === "owner").length,
          shared_with_me: visible.filter((v) => v.role === "grant").length,
          targets,
          needs_attention: attention,
          checked_at: now.toISOString(),
        });
      }

      default:
        return json({ error: "ação desconhecida" }, 400);
    }
  } catch (e) {
    console.error("[kubo-secrets-orchestrator] error:", e instanceof Error ? e.message : e);
    return json({ error: sanitizeError(e) }, 500);
  }
});
