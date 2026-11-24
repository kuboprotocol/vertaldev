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
  { name: "send_report_email", risk: "user_facing", description: "Envia o relatório por e-mail (padrão: só para o Laércio).", phase: 1 },
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

/** E-mail do relatório: por padrão só o do próprio Laércio; outro destino exige estar na lista. */
export function reportRecipientAllowed(to: string, operatorEmail: string | null, extraAllowed: string[]): boolean {
  const t = to.trim().toLowerCase();
  if (operatorEmail && t === operatorEmail.trim().toLowerCase()) return true;
  return extraAllowed.map((s) => s.trim().toLowerCase()).filter(Boolean).includes(t);
}

// ---------------------------------------------------------------------------
// Isolamento entre clientes no VERTAL Code AI (tela)
// ---------------------------------------------------------------------------

/**
 * De onde o agente lê/escreve o código. O repositório da plataforma (GITHUB_REPO)
 * é do Vertal: só o operador lê/clona. Cliente usa sempre o cofre do próprio projeto.
 */
export function projectSourceFor(operator: boolean, githubConfigured: boolean): "github" | "vault" {
  return operator && githubConfigured ? "github" : "vault";
}

/**
 * "Aplicar" passa pelo vibe-code-agent, que grava no GitHub da plataforma quando ele
 * está configurado. Para não deixar cliente escrever no repo do Vertal, só o
 * operador aplica nesse modo; no modo cofre, cada um aplica no próprio projeto.
 */
export function canApplyChanges(operator: boolean, platformGithubConfigured: boolean): boolean {
  return operator || !platformGithubConfigured;
}
