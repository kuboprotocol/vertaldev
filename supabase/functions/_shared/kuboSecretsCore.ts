// Núcleo puro do cofre de segredos (painel secreto) e do orquestrador.
//
// Sem APIs do Deno e sem imports: roda igual na Edge Function e nos testes do
// Vitest. Tudo que decide "pode ou não pode", "está pronto ou não" e "o que
// validar" mora aqui, para ficar testável sem banco.

export const ENV_KEY_RE = /^[A-Z][A-Z0-9_]{1,63}$/;
export const SLUG_RE = /^[a-z0-9_-]{1,64}$/;
export const MAX_VALUE_LENGTH = 8192;
export const MIN_VALUE_LENGTH = 1;
export const STALE_AFTER_DAYS = 90;
export const REVEAL_WINDOW_LIMIT = 30; // revelações por usuário em 10 minutos
export const REVEAL_WINDOW_MINUTES = 10;

export type SecretRole = "owner" | "grant";

export interface SecretFields {
  name: string;
  env_key: string;
  group_name: string;
  description: string | null;
  bound_to: string | null;
}

export type ParseResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Normaliza a chave de ambiente: aceita "openai_api_key" e grava "OPENAI_API_KEY". */
export function normalizeEnvKey(raw: unknown): string {
  return String(raw ?? "").trim().toUpperCase();
}

export function validateEnvKey(raw: unknown): string | null {
  const key = normalizeEnvKey(raw);
  if (!key) return "Informe o nome da variável (ex.: OPENAI_API_KEY)";
  if (!ENV_KEY_RE.test(key)) {
    return "Use só letras, números e _, começando por letra (ex.: OPENAI_API_KEY)";
  }
  return null;
}

/** Dica segura para exibir: nunca mostra o valor inteiro. */
export function maskSecret(value: string): string {
  if (value.length <= 8) return "••••";
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

export function validateValue(raw: unknown): ParseResult<string> {
  if (typeof raw !== "string") return { ok: false, error: "O valor do segredo é obrigatório" };
  // Não remove espaços: alguns tokens começam ou terminam com caracteres significativos.
  if (raw.length < MIN_VALUE_LENGTH) return { ok: false, error: "O valor do segredo não pode ser vazio" };
  if (raw.length > MAX_VALUE_LENGTH) {
    return { ok: false, error: `O valor do segredo passa de ${MAX_VALUE_LENGTH} caracteres` };
  }
  return { ok: true, data: raw };
}

function cleanText(raw: unknown, max: number): string | null {
  if (raw === undefined || raw === null) return null;
  const text = String(raw).trim();
  if (!text) return null;
  return text.length > max ? text.slice(0, max) : text;
}

/**
 * Valida os campos de metadados. Com `partial`, só valida o que veio no corpo
 * (usado na edição). Sem `partial`, nome e chave são obrigatórios (criação).
 */
export function parseSecretFields(
  input: Record<string, unknown>,
  opts: { partial: boolean },
): ParseResult<Partial<SecretFields>> {
  const out: Partial<SecretFields> = {};

  if (!opts.partial || input.name !== undefined) {
    const name = cleanText(input.name, 80);
    if (!name) return { ok: false, error: "Dê um nome ao segredo" };
    out.name = name;
  }

  if (!opts.partial || input.env_key !== undefined) {
    const err = validateEnvKey(input.env_key);
    if (err) return { ok: false, error: err };
    out.env_key = normalizeEnvKey(input.env_key);
  }

  if (input.group_name !== undefined) {
    out.group_name = cleanText(input.group_name, 40) ?? "geral";
  } else if (!opts.partial) {
    out.group_name = "geral";
  }

  if (input.description !== undefined) {
    out.description = cleanText(input.description, 300);
  }

  if (input.bound_to !== undefined) {
    const slug = cleanText(input.bound_to, 64);
    if (slug !== null && !SLUG_RE.test(slug)) {
      return { ok: false, error: "Destino inválido: use letras minúsculas, números, _ e -" };
    }
    out.bound_to = slug;
  }

  return { ok: true, data: out };
}

/** Linha de segredo visível para quem consulta (sem valor). */
export interface VisibleSecret {
  id: string;
  env_key: string;
  owner_id: string;
  rotated_at: string | null;
  role: SecretRole;
}

export interface PlanEntry {
  env_key: string;
  status: "ready" | "missing";
  source: SecretRole | null;
  secret_id: string | null;
  stale: boolean;
  warning: string | null;
}

export function isStale(rotatedAt: string | null, now: Date): boolean {
  if (!rotatedAt) return false;
  const t = Date.parse(rotatedAt);
  if (Number.isNaN(t)) return false;
  return now.getTime() - t > STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Para cada chave exigida, diz se o usuário tem um segredo utilizável.
 * Se houver o próprio segredo e um compartilhado com a mesma chave, o próprio vence.
 */
export function planReadiness(
  requiredKeys: string[],
  visible: VisibleSecret[],
  now: Date = new Date(),
): PlanEntry[] {
  const best = new Map<string, VisibleSecret>();
  for (const s of visible) {
    const current = best.get(s.env_key);
    if (!current || (s.role === "owner" && current.role !== "owner")) best.set(s.env_key, s);
  }

  const seen = new Set<string>();
  const entries: PlanEntry[] = [];
  for (const raw of requiredKeys) {
    const key = normalizeEnvKey(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const s = best.get(key);
    if (!s) {
      entries.push({
        env_key: key,
        status: "missing",
        source: null,
        secret_id: null,
        stale: false,
        warning: "Nenhum segredo com essa chave está disponível para você",
      });
      continue;
    }

    const stale = isStale(s.rotated_at, now);
    entries.push({
      env_key: key,
      status: "ready",
      source: s.role,
      secret_id: s.id,
      stale,
      warning: stale ? `Não é trocado há mais de ${STALE_AFTER_DAYS} dias` : null,
    });
  }
  return entries;
}

export type PlanStatus = "ready" | "partial" | "missing" | "empty";

export function summarizePlan(entries: PlanEntry[]): PlanStatus {
  if (entries.length === 0) return "empty";
  const ready = entries.filter((e) => e.status === "ready").length;
  if (ready === entries.length) return "ready";
  if (ready === 0) return "missing";
  return "partial";
}

export interface OrchestrationTarget {
  slug: string;
  label: string;
  description: string;
  env_keys: string[];
  /** Conector de mesmo nome, quando existe. Só é consultado, nunca mesclado com o cofre. */
  connector_slug: string | null;
}

/**
 * Destinos que o orquestrador sabe montar. Cada um pede um conjunto de variáveis.
 * O cofre e os conectores continuam separados: o orquestrador só cruza os dois para mostrar.
 */
export const ORCHESTRATION_TARGETS: OrchestrationTarget[] = [
  {
    slug: "ai-providers",
    label: "Provedores de IA",
    description: "Chaves usadas pela KUBO IA e pelos agentes",
    env_keys: ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GOOGLE_AI_API_KEY"],
    connector_slug: null,
  },
  {
    slug: "github",
    label: "GitHub",
    description: "Token para repositórios, PRs e deploy",
    env_keys: ["GITHUB_TOKEN"],
    connector_slug: "github",
  },
  {
    slug: "payments",
    label: "Pagamentos",
    description: "Chaves do Stripe para cobrança e assinaturas",
    env_keys: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
    connector_slug: null,
  },
  {
    slug: "email",
    label: "E-mail",
    description: "Envio de e-mails transacionais",
    env_keys: ["RESEND_API_KEY"],
    connector_slug: null,
  },
  {
    slug: "infra",
    label: "Infraestrutura",
    description: "Banco, storage e deploy",
    env_keys: ["SUPABASE_SERVICE_ROLE_KEY", "CONNECTOR_ENC_KEY"],
    connector_slug: null,
  },
];

export function findTarget(slug: string): OrchestrationTarget | undefined {
  return ORCHESTRATION_TARGETS.find((t) => t.slug === slug);
}

/** Início da janela em que se contam as revelações recentes de um usuário. */
export function revealWindowStartIso(now: Date): string {
  return new Date(now.getTime() - REVEAL_WINDOW_MINUTES * 60 * 1000).toISOString();
}
