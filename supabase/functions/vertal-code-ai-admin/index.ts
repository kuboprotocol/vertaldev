// deno-lint-ignore-file no-explicit-any
/* eslint-disable @typescript-eslint/no-explicit-any -- cliente Supabase sem tipos gerados nas edge functions, como no vibe-code-agent */
// VERTAL Code AI — agente de operação do Vertal Dev (só o operador: papel admin
// + VERTAL_ADMIN_USER_IDS). Lê métricas, usuários (ids), créditos, erros, PRs e uso
// da API; monta e envia relatórios; recebe relatórios enviados pelo Laércio.
//
//   ask      {prompt, attachments?}  ─► o modelo escolhe ferramentas do catálogo;
//                                       leitura roda na hora, o resto vira CARTÃO de aprovação
//   approve  {approvalId, token, decision}  ─► executa (uso único) ou rejeita
//   report   {period}               ─► relatório pronto (leitura)
//
// Toda ação vai para vertal_ai_audit, cifrada como no navigator_audit.
// Desligado por padrão (VERTAL_CODE_AI_ADMIN_ENABLED=true). Tabelas: docs/vertal-code-ai/proposed-migration.sql.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";
import { auditWriteKey, sealAuditDetail } from "../_shared/navigatorAuditVault.ts";
import { buildChain } from "../_shared/vertalCodeAi/models.ts";
import { callChain, ChainError } from "../_shared/vertalCodeAi/llm.ts";
import { extractJson, sanitizeAttachments, type ChatMessage } from "../_shared/vertalCodeAi/protocol.ts";
import {
  ADMIN_TOOLS,
  APPROVAL_TTL_MS,
  approvalCardText,
  argsHash,
  canonicalJson,
  findTool,
  gate,
  isOperator,
  reportRecipientAllowed,
  signApproval,
  verifyApproval,
} from "../_shared/vertalCodeAi/admin.ts";
import { aggregate, formatReport, periodRange, prepareIngestedReport } from "../_shared/vertalCodeAi/reports.ts";

const env = (k: string) => Deno.env.get(k) ?? undefined;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function approvalSecret(): string {
  return env("VERTAL_ADMIN_APPROVAL_KEY") ?? env("CONNECTOR_ENC_KEY") ?? "";
}

const AGENT_PROMPT = `Você é o VERTAL Code AI no modo operação, ajudando o Laércio a administrar o Vertal Dev.
Responda em português do Brasil. Ferramentas disponíveis (use só estas):
${ADMIN_TOOLS.filter((t) => t.phase !== "spec").map((t) => `- ${t.name} [${t.risk}]: ${t.description}`).join("\n")}
Argumentos: period ("daily"|"weekly") para métricas/relatórios; keyId e monthlyCapCredits para chaves; to (opcional) para e-mail.
Ações que não são leitura SEMPRE passam por um cartão de aprovação do Laércio; nunca diga que já executou uma delas.
Responda SOMENTE com JSON: {"reply":"texto curto","calls":[{"tool":"nome","args":{}}]}. Sem ferramentas, "calls": [].`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (env("VERTAL_CODE_AI_ADMIN_ENABLED") !== "true") return json(404, { error: "disabled" });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json(401, { error: "missing_authorization" });
  const userClient = createClient(env("SUPABASE_URL")!, env("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } });
  const { data: u } = await userClient.auth.getUser(jwt);
  if (!u?.user) return json(401, { error: "invalid_token" });
  const userId = u.user.id;
  let hasAdminRole = false;
  try {
    hasAdminRole = (await userClient.rpc("has_role", { _role: "admin" })).data === true;
  } catch {
    hasAdminRole = false;
  }
  const operator = isOperator({ userId, hasAdminRole }, (env("VERTAL_ADMIN_USER_IDS") ?? "").split(","));
  // Cliente comum recebe 404: o agente de operação nem "existe" para ele.
  if (!operator) return json(404, { error: "not_found" });

  const admin: any = createClient(env("SUPABASE_URL")!, env("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const audit = async (kind: string, detail: Record<string, unknown>) => {
    try {
      const sealed = await sealAuditDetail(auditWriteKey({ NAVIGATOR_AUDIT_KEY: env("NAVIGATOR_AUDIT_KEY"), NAVIGATOR_ENC_KEY: env("NAVIGATOR_ENC_KEY"), CONNECTOR_ENC_KEY: env("CONNECTOR_ENC_KEY") }), userId, kind, detail);
      await admin.from("vertal_ai_audit").insert({ user_id: userId, kind, ...sealed });
    } catch (e) {
      console.error("[vertal-code-ai-admin] auditoria falhou:", e instanceof Error ? e.message : e);
    }
  };

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    if (body.action === "report") {
      const period = body.period === "weekly" ? "weekly" : "daily";
      const text = formatReport(await collectMetrics(admin, period));
      await audit("vcai_admin:report", { name: "ops_report", status: "ok", reason: period });
      return json(200, { report: text });
    }

    if (body.action === "ask") {
      const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 8000) : "";
      if (!prompt) return json(400, { error: "Escreva o que você quer saber ou fazer." });
      const reports = sanitizeAttachments(body.attachments).filter((a) => a.kind === "text").map((a) => prepareIngestedReport(a.name, a.data));
      const context = reports.map((r) => `### Relatório enviado: ${r.name}${r.truncated ? " (cortado)" : ""}\n${r.text}`).join("\n\n");
      const chain = buildChain({ profile: "raciocinio", mode: "plan", needsVision: false, env });
      const first = await callChain({
        chain,
        messages: [{ role: "system", content: AGENT_PROMPT }, { role: "user", content: context ? `${prompt}\n\n${context}` : prompt }],
        effort: "medium",
        parse: (raw) => extractJson(raw) as { reply?: string; calls?: Array<{ tool?: string; args?: unknown }> },
        budgetMs: 70_000,
      });
      const calls = Array.isArray(first.value.calls) ? first.value.calls.slice(0, 6) : [];
      const results: Array<{ tool: string; ok: boolean; result: unknown }> = [];
      const cards: Array<{ approvalId: string; token: string; tool: string; text: string; args: unknown }> = [];
      for (const c of calls) {
        const args = c.args && typeof c.args === "object" ? c.args : {};
        const decision = gate(c.tool, operator, false);
        if (decision.kind === "deny") {
          results.push({ tool: String(c.tool), ok: false, result: decision.reason });
          continue;
        }
        if (decision.kind === "needs_approval") {
          const exp = Date.now() + APPROVAL_TTL_MS;
          const hash = await argsHash(args);
          const { data: ap, error } = await admin
            .from("vertal_ai_approvals")
            .insert({ admin_id: userId, tool: decision.tool.name, args, args_hash: hash, expires_at: new Date(exp).toISOString() })
            .select("id")
            .single();
          if (error || !ap) {
            results.push({ tool: decision.tool.name, ok: false, result: "Não consegui criar o cartão de aprovação." });
            continue;
          }
          const token = await signApproval(approvalSecret(), { approvalId: ap.id, adminId: userId, tool: decision.tool.name, argsHash: hash, exp });
          cards.push({ approvalId: ap.id, token, tool: decision.tool.name, text: approvalCardText(decision.tool, args), args });
          await audit("vcai_admin:approval_requested", { name: decision.tool.name, target: canonicalJson(args), status: "pending" });
          continue;
        }
        try {
          const result = await runReadTool(admin, String(c.tool), args as Record<string, unknown>);
          results.push({ tool: String(c.tool), ok: true, result });
          await audit("vcai_admin:read", { name: String(c.tool), target: canonicalJson(args), status: "ok" });
        } catch (e) {
          results.push({ tool: String(c.tool), ok: false, result: e instanceof Error ? e.message : "falhou" });
        }
      }
      let reply = typeof first.value.reply === "string" ? first.value.reply : "";
      if (results.some((r) => r.ok)) {
        const second = await callChain({
          chain,
          messages: [
            { role: "system", content: "Você é o VERTAL Code AI no modo operação. Resuma os dados para o Laércio em português, com números, em até 12 linhas. Não invente nada que não esteja nos dados." },
            { role: "user", content: `Pergunta: ${prompt}\n\nDados:\n${JSON.stringify(results).slice(0, 30_000)}` },
          ] as ChatMessage[],
          effort: "low",
          parse: (raw) => raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim(),
          budgetMs: 50_000,
        }).catch(() => null);
        if (second) reply = second.value;
      }
      await audit("vcai_admin:ask", { task: prompt, items: calls.map((c) => String(c.tool)), status: "ok" });
      return json(200, { reply, results, approvals: cards });
    }

    if (body.action === "approve") {
      if (typeof body.approvalId !== "string" || !UUID_RE.test(body.approvalId)) return json(400, { error: "Cartão inválido." });
      const { data: ap } = await admin.from("vertal_ai_approvals").select("*").eq("id", body.approvalId).eq("admin_id", userId).maybeSingle();
      if (!ap) return json(404, { error: "Cartão não encontrado." });
      if (body.decision === "reject") {
        await admin.from("vertal_ai_approvals").update({ status: "rejected", decided_at: new Date().toISOString() }).eq("id", ap.id).eq("status", "pending");
        await audit("vcai_admin:rejected", { name: ap.tool, status: "rejected" });
        return json(200, { ok: true, status: "rejected" });
      }
      const check = await verifyApproval(approvalSecret(), body.token, { adminId: userId, tool: ap.tool, args: ap.args });
      if (check.ok === false) {
        await audit("vcai_admin:approval_denied", { name: ap.tool, reason: (check as { reason: string }).reason, status: "denied" });
        return json(403, { error: `Aprovação recusada: ${(check as { reason: string }).reason}.` });
      }
      const decision = gate(ap.tool, operator, true);
      if (decision.kind !== "run") return json(403, { error: decision.kind === "deny" ? decision.reason : "Aprovação necessária." });
      // Uso único: só um pedido consegue mudar pending → executing.
      const { data: claimed } = await admin
        .from("vertal_ai_approvals")
        .update({ status: "executing", decided_at: new Date().toISOString() })
        .eq("id", ap.id)
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString())
        .select("id");
      if (!claimed?.length) return json(409, { error: "Este cartão já foi usado ou expirou." });
      try {
        const result = await runApprovedTool(admin, ap.tool, ap.args ?? {}, { userId, email: u.user.email ?? null, jwt });
        await admin.from("vertal_ai_approvals").update({ status: "done", result }).eq("id", ap.id);
        await audit("vcai_admin:executed", { name: ap.tool, target: canonicalJson(ap.args), status: "done" });
        return json(200, { ok: true, status: "done", result });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "falhou";
        await admin.from("vertal_ai_approvals").update({ status: "failed", result: { error: msg } }).eq("id", ap.id);
        await audit("vcai_admin:failed", { name: ap.tool, reason: msg, status: "failed" });
        return json(500, { error: msg });
      }
    }

    return json(400, { error: "Ação desconhecida." });
  } catch (e) {
    if (e instanceof ChainError) return json(503, { error: e.message });
    console.error("[vertal-code-ai-admin]", e instanceof Error ? e.message : e);
    return json(500, { error: "Algo deu errado no modo operação." });
  }
});

async function collectMetrics(admin: any, period: "daily" | "weekly") {
  const { from, to } = periodRange(period, new Date());
  const since = from.toISOString();
  const [tx, errs, api, prs] = await Promise.all([
    admin.from("credit_transactions").select("user_id, delta, category, created_at").gte("created_at", since).limit(20000),
    admin.from("runtime_errors").select("message, severity, created_at").gte("created_at", since).limit(5000),
    admin.from("vertal_ai_usage").select("key_id, prompt_tokens, completion_tokens, cost_micro").gte("created_at", since).limit(20000),
    listPrs().catch(() => []),
  ]);
  return aggregate({ period, from, to, txs: tx.data ?? [], errors: errs.data ?? [], api: api.data ?? [], openPrs: prs });
}

async function listPrs(): Promise<Array<{ number: number; title: string }>> {
  const token = env("GITHUB_TOKEN");
  const repo = env("GITHUB_REPO");
  if (!token || !repo) return [];
  const r = await fetch(`https://api.github.com/repos/${repo}/pulls?state=open&per_page=20`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "vertal-code-ai" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) return [];
  return ((await r.json()) as any[]).map((p) => ({ number: p.number, title: String(p.title).slice(0, 140) }));
}

async function runReadTool(admin: any, tool: string, args: Record<string, unknown>): Promise<unknown> {
  const period = args.period === "weekly" ? "weekly" : "daily";
  switch (tool) {
    case "metrics_overview": {
      const m = await collectMetrics(admin, period);
      return { period, activeUsers: m.activeUsers, creditsSpent: m.creditsSpent, errors: m.errors.total, api: m.api };
    }
    case "credits_by_category":
      return (await collectMetrics(admin, period)).creditsByCategory;
    case "top_users":
      return (await collectMetrics(admin, period)).topUsers.map((u) => ({ user: `${u.userId.slice(0, 8)}…`, credits: u.credits }));
    case "recent_errors": {
      const { data } = await admin.from("runtime_errors").select("message, severity, created_at").order("created_at", { ascending: false }).limit(30);
      return (data ?? []).map((e: any) => ({ ...e, message: String(e.message).slice(0, 200) }));
    }
    case "list_prs":
      return await listPrs();
    case "api_usage": {
      const { from } = periodRange(period, new Date());
      const { data } = await admin.from("vertal_ai_usage").select("key_id, prompt_tokens, completion_tokens, cost_micro").gte("created_at", from.toISOString()).limit(20000);
      const byKey = new Map<string, { requests: number; tokens: number; credits: number }>();
      for (const r of data ?? []) {
        const k = byKey.get(r.key_id) ?? { requests: 0, tokens: 0, credits: 0 };
        k.requests++;
        k.tokens += r.prompt_tokens + r.completion_tokens;
        k.credits += r.cost_micro / 1e6;
        byKey.set(r.key_id, k);
      }
      return [...byKey].map(([keyId, v]) => ({ keyId, ...v, credits: Math.round(v.credits * 100) / 100 }));
    }
    case "ops_report":
      return formatReport(await collectMetrics(admin, period));
    default:
      throw new Error("ferramenta de leitura desconhecida");
  }
}

async function runApprovedTool(admin: any, tool: string, args: Record<string, unknown>, who: { userId: string; email: string | null; jwt: string }): Promise<unknown> {
  const t = findTool(tool);
  if (!t || t.phase === "spec") throw new Error("ferramenta indisponível");
  switch (tool) {
    case "revoke_api_key": {
      if (typeof args.keyId !== "string" || !UUID_RE.test(args.keyId)) throw new Error("keyId inválido");
      const { data } = await admin.from("vertal_ai_api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", args.keyId).is("revoked_at", null).select("id");
      return { revoked: data?.length ?? 0 };
    }
    case "set_key_cap": {
      if (typeof args.keyId !== "string" || !UUID_RE.test(args.keyId)) throw new Error("keyId inválido");
      const cap = args.monthlyCapCredits === null ? null : Number(args.monthlyCapCredits);
      if (cap !== null && (!Number.isFinite(cap) || cap < 0 || cap > 1_000_000)) throw new Error("teto inválido");
      await admin.from("vertal_ai_api_keys").update({ monthly_cap_credits: cap }).eq("id", args.keyId);
      return { keyId: args.keyId, monthlyCapCredits: cap };
    }
    case "send_report_email": {
      const to = typeof args.to === "string" && args.to ? args.to : who.email ?? "";
      if (!reportRecipientAllowed(to, who.email, (env("VERTAL_ADMIN_REPORT_RECIPIENTS") ?? "").split(","))) {
        throw new Error("destinatário não permitido (padrão: só o seu e-mail)");
      }
      const period = args.period === "weekly" ? "weekly" : "daily";
      const text = formatReport(await collectMetrics(admin, period));
      const { data: acct } = await admin.from("gmail_accounts").select("id").eq("user_id", who.userId).limit(1).maybeSingle();
      if (!acct) throw new Error("conecte o Gmail no Vertal Chat para enviar relatórios");
      const r = await fetch(`${env("SUPABASE_URL")}/functions/v1/gmail-send-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${who.jwt}`, apikey: env("SUPABASE_ANON_KEY") ?? "" },
        body: JSON.stringify({ accountId: acct.id, to, subject: `Vertal Dev — ${period === "weekly" ? "relatório semanal" : "relatório diário"}`, body: text, mode: "send" }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!r.ok) throw new Error(`envio falhou (${r.status})`);
      return { sentTo: to };
    }
    default:
      throw new Error("ferramenta sem executor");
  }
}
