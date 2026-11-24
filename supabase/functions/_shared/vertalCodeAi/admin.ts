// VERTAL Code AI — agente de operação do Vertal Dev ("o cérebro"), só para o dono.
//
// Regras (obrigatórias):
//  1. Só leitura por padrão. Ferramenta de leitura roda direto.
//  2. Escrita, destrutiva, dinheiro, deploy ou algo que o cliente vê: SEMPRE
//     cartão de aprovação do Laércio. O cartão amarra ferramenta + argumentos
//     (hash) + admin + validade numa assinatura HMAC, e o servidor ainda exige o
//     registro "pending" no banco (uso único). Mudou um argumento = outra aprovação.
//  3. Tudo vai para a auditoria cifrada (mesmo cofre do navigator_audit).
//  4. Cliente nunca vê nem chama nada disto (isolamento por papel + lista de ids).
// Módulo puro (WebCrypto): Vitest, navegador e edge function.
import { channelDecision, type OperatorIdentity, parseInbound, parseOutbound } from "./channels.ts";

export type ToolRisk = "read" | "write" | "destructive" | "money" | "deploy" | "user_facing";

export interface AdminTool {
  name: string;
  risk: ToolRisk;
  description: string;
  /** Fase em que o executor existe. "spec" = só documentado, o servidor recusa. */
  phase: 1 | 2 | "spec";
}

export const ADMIN_TOOLS: AdminTool[] = [
  { name: "metrics_overview", risk: "read", description: "Usuários, assinaturas ativas e créditos gastos no período.", phase: 1 },
  { name: "credits_by_category", risk: "read", description: "Créditos gastos por categoria (chat, vibe code, sandbox, API…).", phase: 1 },
  { name: "top_users", risk: "read", description: "Quem mais gastou créditos no período (ids, sem dados pessoais).", phase: 1 },
  { name: "recent_errors", risk: "read", description: "Últimos erros de runtime do app.", phase: 1 },
  { name: "list_prs", risk: "read", description: "Pull requests abertos do repositório do Vertal.", phase: 1 },
  { name: "api_usage", risk: "read", description: "Uso da API VERTAL por chave (tokens, créditos).", phase: 1 },
  { name: "ops_report", risk: "read", description: "Monta o relatório de operação (diário/semanal) sem enviar.", phase: 1 },
  { name: "inbox_list", risk: "read", description: "Lista o que chegou num canal (gmail, slack, outlook, crm:pipedrive, crm:hubspot). Só leitura.", phase: 1 },
  { name: "inbox_read", risk: "read", description: "Abre um item de um canal (fio do e-mail, canal do Slack, registros do CRM). Só leitura.", phase: 1 },
  { name: "send_message", risk: "user_facing", description: "Envia por um canal (gmail, slack, outlook, own_email) ou registra nota no CRM. Para o próprio Laércio vai direto; para outros, cartão.", phase: 1 },
  { name: "send_report", risk: "user_facing", description: "Envia o relatório de operação por um canal (padrão: Gmail, só para o Laércio).", phase: 1 },
  { name: "revoke_api_key", risk: "destructive", description: "Revoga uma chave da API VERTAL.", phase: 1 },
  { name: "set_key_cap", risk: "money", description: "Muda o teto mensal de gasto de uma chave.", phase: 1 },
  { name: "grant_credits", risk: "money", description: "Dá créditos a um usuário.", phase: "spec" },
  { name: "rerun_ci", risk: "write", description: "Roda de novo o CI de um PR.", phase: "spec" },
  { name: "trigger_deploy", risk: "deploy", description: "Dispara deploy.", phase: "spec" },
  { name: "notify_users", risk: "user_facing", description: "Manda aviso para usuários.", phase: "spec" },
];

export function findTool(name: unknown): AdminTool | null {
  return ADMIN_TOOLS.find((t) => t.name === name) ?? null;
}

export function requiresApproval(tool: AdminTool): boolean {
  return tool.risk !== "read";
}

/** Ferramentas de canal: a aprovação depende do destino (channels.ts). */
export const CHANNEL_TOOLS = new Set(["inbox_list", "inbox_read", "send_message", "send_report"]);

export interface AdminIdentity {
  userId: string;
  /** user_roles.role = admin (has_role). */
  hasAdminRole: boolean;
}

/** Admin = papel admin E estar na lista VERTAL_ADMIN_USER_IDS (as duas coisas). Lista vazia = ninguém. */
export function isOperator(id: AdminIdentity, allowList: string[]): boolean {
  return id.hasAdminRole && allowList.map((s) => s.trim().toLowerCase()).filter(Boolean).includes(id.userId.toLowerCase());
}

export type GateDecision =
  | { kind: "run" }
  | { kind: "needs_approval"; tool: AdminTool }
  | { kind: "deny"; reason: string };

/** Decide o que fazer com um pedido de ferramenta, antes de qualquer efeito. */
export function gate(toolName: unknown, operator: boolean, approvalVerified: boolean): GateDecision {
  if (!operator) return { kind: "deny", reason: "Somente o operador do Vertal pode usar o agente de operação." };
  const tool = findTool(toolName);
  if (!tool) return { kind: "deny", reason: "Ferramenta desconhecida." };
  if (tool.phase === "spec") return { kind: "deny", reason: `"${tool.name}" ainda não existe (planejada para uma próxima fase).` };
  if (!requiresApproval(tool)) return { kind: "run" };
  return approvalVerified ? { kind: "run" } : { kind: "needs_approval", tool };
}

/**
 * Decisão completa de um pedido do agente: catálogo + política dos canais.
 * Para send_message/send_report, mandar só para o próprio Laércio roda direto;
 * qualquer outro destino (ou escrita no CRM) pede cartão. Leitura de canal roda direto.
 * `defaults` completa o envio do relatório (texto montado no servidor, destino padrão).
 */
export function decideTool(
  toolName: unknown,
  args: Record<string, unknown>,
  ctx: { operator: boolean; approvalVerified: boolean; me: OperatorIdentity },
): GateDecision {
  const base = gate(toolName, ctx.operator, ctx.approvalVerified);
  if (base.kind === "deny" || !CHANNEL_TOOLS.has(String(toolName))) return base;
  const tool = findTool(toolName)!;
  try {
    if (toolName === "inbox_list" || toolName === "inbox_read") {
      const q = parseInbound(args);
      const d = channelDecision(toolName === "inbox_list" ? "receive" : "read", q.channel, ctx.operator);
      return d.kind === "deny" ? d : { kind: "run" };
    }
    const msg = parseOutbound(toolName === "send_report" ? reportOutbound(args, ctx.me) : args);
    const d = channelDecision("send", msg.channel, ctx.operator, { outbound: msg, me: ctx.me });
    if (d.kind === "deny") return d;
    if (d.kind === "run") return { kind: "run" };
    return ctx.approvalVerified ? { kind: "run" } : { kind: "needs_approval", tool };
  } catch (e) {
    return { kind: "deny", reason: e instanceof Error ? e.message : "pedido inválido" };
  }
}

/** Relatório: canal padrão Gmail, destino padrão o próprio Laércio; o texto é marcado aqui e montado no servidor. */
export function reportOutbound(args: Record<string, unknown>, me: OperatorIdentity): Record<string, unknown> {
  const channel = typeof args.channel === "string" ? args.channel : "gmail";
  const defaultTo = channel === "slack" ? me.slackUserIds[0] : me.emails[0];
  const period = args.period === "weekly" ? "semanal" : "diário";
  return {
    channel,
    to: args.to ?? defaultTo ?? "",
    subject: `Vertal Dev — relatório ${period}`,
    text: typeof args.text === "string" && args.text ? args.text : "(relatório gerado no envio)",
  };
}

/** JSON estável (chaves ordenadas) para o hash dos argumentos. */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`)
    .join(",")}}`;
}

const enc = new TextEncoder();

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function argsHash(args: unknown): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(canonicalJson(args))));
}

export interface ApprovalClaims {
  approvalId: string;
  adminId: string;
  tool: string;
  argsHash: string;
  /** Epoch ms. */
  exp: number;
}

async function hmac(secret: string, data: string): Promise<string> {
  if (!secret || secret.length < 16) throw new Error("chave de aprovação ausente");
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

function claimsString(c: ApprovalClaims): string {
  return `vcai-approval:v1|${c.approvalId}|${c.adminId}|${c.tool}|${c.argsHash}|${c.exp}`;
}

export async function signApproval(secret: string, c: ApprovalClaims): Promise<string> {
  return `${btoa(JSON.stringify(c))}.${await hmac(secret, claimsString(c))}`;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export type ApprovalCheck = { ok: true; claims: ApprovalClaims } | { ok: false; reason: string };

/**
 * Confere o cartão: assinatura, validade, mesmo admin, mesma ferramenta e
 * MESMOS argumentos. O uso único (status pending→done) é checado no banco.
 */
export async function verifyApproval(
  secret: string,
  token: unknown,
  expect: { adminId: string; tool: string; args: unknown },
  now = Date.now(),
): Promise<ApprovalCheck> {
  if (typeof token !== "string" || token.length > 2000 || !token.includes(".")) return { ok: false, reason: "cartão inválido" };
  const [payload, sig] = token.split(".");
  let c: ApprovalClaims;
  try {
    c = JSON.parse(atob(payload));
  } catch {
    return { ok: false, reason: "cartão inválido" };
  }
  if (!c || typeof c.approvalId !== "string" || typeof c.exp !== "number") return { ok: false, reason: "cartão inválido" };
  if (!timingSafeEqual(await hmac(secret, claimsString(c)), sig ?? "")) return { ok: false, reason: "assinatura não confere" };
  if (now > c.exp) return { ok: false, reason: "cartão expirado" };
  if (c.adminId !== expect.adminId) return { ok: false, reason: "cartão de outro usuário" };
  if (c.tool !== expect.tool) return { ok: false, reason: "ferramenta diferente da aprovada" };
  if (c.argsHash !== (await argsHash(expect.args))) return { ok: false, reason: "argumentos diferentes dos aprovados" };
  return { ok: true, claims: c };
}

export const APPROVAL_TTL_MS = 15 * 60 * 1000;

/** Texto do cartão de aprovação (pt-BR) mostrado ao Laércio. */
export function approvalCardText(tool: AdminTool, args: unknown): string {
  const risk: Record<ToolRisk, string> = {
    read: "leitura",
    write: "altera dados",
    destructive: "DESTRUTIVA",
    money: "mexe com créditos/dinheiro",
    deploy: "DEPLOY",
    user_facing: "chega a pessoas (e-mail/aviso)",
  };
  return `Aprovar "${tool.name}" (${risk[tool.risk]})? ${tool.description}\nArgumentos: ${canonicalJson(args).slice(0, 600)}`;
}

/** (Legado) destino do relatório permitido sem cartão. A política atual é decideTool/channelDecision. */
export function reportRecipientAllowed(to: string, operatorEmail: string | null, extraAllowed: string[]): boolean {
  const t = to.trim().toLowerCase();
  if (operatorEmail && t === operatorEmail.trim().toLowerCase()) return true;
  return extraAllowed.map((s) => s.trim().toLowerCase()).filter(Boolean).includes(t);
}
