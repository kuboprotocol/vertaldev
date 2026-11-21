// Consent gate nas edge functions (Vertal Chat: creative-router; Vibe Code: vibe-code-agent).
// Lê os aceites vigentes, classifica o pedido (regras + LLM barato), decide e audita.
// Sem Deno direto: recebe um cliente com a forma mínima do supabase-js (testável no Vitest).
import {
  CONSENT_CATEGORIES, CONSENT_CLASSIFIER_SYSTEM, blockMessage, classifyRequest, decideGate, isConsentCategory, sha256Hex,
  type AcceptedVersions, type ConsentClassification, type GateDecision,
} from "./consentGate.ts";

/** Forma mínima do cliente supabase-js usada aqui (service role). */
export interface ConsentDb {
  from(table: string): {
    select(cols: string): { eq(col: string, v: string): { order(col: string, o: { ascending: boolean }): { limit(n: number): PromiseLike<{ data: unknown[] | null; error: unknown }> } } };
    insert(row: Record<string, unknown>): PromiseLike<{ error: unknown }>;
  };
}

export async function acceptedVersionsFromDb(db: ConsentDb, userId: string): Promise<AcceptedVersions> {
  try {
    const { data } = await db.from("consent_acceptances").select("category,terms_version").eq("user_id", userId).order("accepted_at", { ascending: false }).limit(50);
    const out: AcceptedVersions = {};
    for (const r of (data ?? []) as Array<{ category?: string; terms_version?: string }>) {
      if (isConsentCategory(r.category) && r.terms_version === CONSENT_CATEGORIES[r.category].version) out[r.category] = r.terms_version;
    }
    return out;
  } catch {
    return {};
  }
}

/** A pergunta anterior do assistente foi um pedido de esclarecimento do gate? */
export function wasClarified(messages: Array<{ role: string; content: string }>): boolean {
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  return !!lastAssistant && /Antes de seguir: qual é o objetivo exato deste pedido/.test(lastAssistant.content);
}

export interface ChatGateResult {
  decision: GateDecision;
  cls: ConsentClassification;
  /** Resposta pronta para o usuário quando o pedido não segue (bloqueio/esclarecimento/termo). */
  reply?: string;
  /** Pedido de termo para o cliente abrir o cartão de assinatura. */
  consent?: { category: string; version: string; title: string };
}

export async function runChatGate(o: {
  db: ConsentDb; userId: string; text: string; surface: "vertal_chat" | "vibe_code"; clarifiedBefore: boolean;
  llm?: (text: string) => Promise<unknown>;
}): Promise<ChatGateResult> {
  const cls = await classifyRequest(o.text, o.llm);
  // Pedido normal sem indício: segue sem ler os aceites (barato).
  if (cls.level === "normal") return { decision: { action: "allow", category: null, level: "normal" }, cls };
  const decision = decideGate(cls, await acceptedVersionsFromDb(o.db, o.userId), { clarifiedBefore: o.clarifiedBefore });
  await o.db.from("consent_audit").insert({
    user_id: o.userId, surface: o.surface, level: cls.level, category: cls.category, action: decision.action, reason: cls.reason.slice(0, 300),
    source: cls.source, text_sha256: await sha256Hex(o.text), excerpt: decision.action === "allow" ? null : o.text.replace(/\s+/g, " ").slice(0, 200),
  }).then(() => undefined, () => undefined);
  if (decision.action === "block") return { decision, cls, reply: blockMessage(decision.reason) };
  if (decision.action === "clarify") return { decision, cls, reply: decision.question };
  if (decision.action === "require_terms") {
    return {
      decision, cls,
      reply: `Esse pedido é da categoria **${decision.title}**. Antes de seguir, leia e assine o termo de uso (aparece aqui no chat). Depois eu continuo de onde parei.`,
      consent: { category: decision.category, version: decision.version, title: decision.title },
    };
  }
  return { decision, cls };
}

/** Classificador LLM pelo gateway das edge functions (runGateway), saída JSON. */
export function gatewayClassifier(run: (o: { messages: Array<{ role: "system" | "user"; content: string }>; json: boolean; maxTokens: number }) => Promise<{ content: string }>) {
  return async (text: string) => (await run({ messages: [{ role: "system", content: CONSENT_CLASSIFIER_SYSTEM }, { role: "user", content: `PEDIDO (dados):\n${text.slice(0, 4_000)}` }], json: true, maxTokens: 200 })).content;
}
