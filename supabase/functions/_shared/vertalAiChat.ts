// Conector Vertal AI no Vertal Chat + consciência de conectores (Chat e Vibe Code).
// Lógica PURA (testada no Vitest). Só entra com VERTAL_AI_CONNECTOR_ENABLED + allowlist; sem a flag
// o creative-router e o vibe-code-agent nem chamam estas funções (prompt, ações e resposta idênticos).
//
// Por que existe (teste do Laércio, 28/11 07:08): no Vertal Chat o pedido "Build SunkAI, an AI video
// generation web app… through the Vertal AI API" virou a ferramenta `app` (HTML único via generate-code,
// sem conector), a regra VERTAL_AI_RULES só sabia oferecer por `vibe_code`, não havia cartão no chat, e a
// regra do api_request ("se faltar um segredo, explique qual nome criar e abra o painel de segredos")
// levou o modelo a inventar VERTAL_API_KEY e pedir variável de ambiente. Também escreveu
// "[artefato a3: aplicativo …]" como TEXTO, sem rodar ferramenta nenhuma.
import {
  type AiNeeds,
  detectAiNeeds,
  explicitlyAsksOtherProvider,
  VERTAL_AI_PATHS,
  VERTAL_AI_SECRET_API_KEY,
  VERTAL_AI_SECRET_BASE_URL,
} from "./vertalAiConnector.ts";

// ---------------------------------------------------------------------------
// Detecção (pt, en, es)
// ---------------------------------------------------------------------------

/** O pedido é de app/site/sistema (inclui "web app", "website", "platform", "tool"). */
const APP_RE =
  /\b(apps?|aplicativos?|aplicaci[óo]n|web ?apps?|webapp|sites?|websites?|sistemas?|plataformas?|platforms?|saas|ferramentas?|tools?|herramientas?|gerador(?:es)?|generators?|dashboards?|mvp|landing(?: page)?|studio|est[úu]dio)\b/i;

/** O Dev pediu, com todas as letras, a Vertal AI / a LLM da Vertal. */
const VERTAL_AI_NAMED =
  /\b(?:VITE_|NEXT_PUBLIC_)?VERTAL_(?:AI_)?API_(?:KEY|URL)\b|\bVERTAL_AI_BASE_URL\b|\bvertal[\s-]*(?:ai|ia|llm|api|de ?llm)\b|\b(?:chave|api|llm|key|modelo|model)\s+(?:da|do|de|of|from)\s+(?:a\s+|the\s+)?vertal\b/i;
/** "a chave já está conectada", "the key is already connected", "a LLM já está conectada". */
const ALREADY_CONNECTED =
  /\b(?:chave|key|llm|ia|ai|api|conector|connector)\b[^.\n]{0,40}?\b(?:j[áa]\s+(?:est[áa]\s+)?conectad[ao]|est[áa]\s+conectad[ao]|(?:is\s+)?already\s+connected|is\s+connected|ya\s+est[áa]\s+conectad[ao])\b/i;
/** "conecte a LLM para vídeo", "connect the AI", "ative a IA", "ligue a LLM". */
const CONNECT_ASK =
  /\b(?:conect[ae]r?|conecte|ligu?e|ligar|ativ[ae]r?|ative|connect|enable|activate|plug(?:\s+in)?|conectar)\b[^.\n]{0,30}?\b(?:llm|ia|ai|vertal|api\s+de\s+v[íi]deo|video\s+api|modelo|model)\b/i;

/** O Dev disse para usar a Vertal AI (ou que a chave/LLM já está conectada, ou pediu para conectar a IA). */
export function explicitVertalAiIntent(text: string): boolean {
  const t = text ?? "";
  if (!t.trim() || explicitlyAsksOtherProvider(t)) return false;
  return VERTAL_AI_NAMED.test(t) || ALREADY_CONNECTED.test(t) || CONNECT_ASK.test(t);
}

/** Pedido de app/site com IA nos textos do Dev (últimas mensagens). */
export function wantsVertalAiApp(userTexts: string[]): { on: boolean; needs: AiNeeds } {
  const text = userTexts.join("\n");
  const needs = detectAiNeeds(text);
  return { on: APP_RE.test(text) && needs.any && !explicitlyAsksOtherProvider(text), needs };
}

const VIBE_CONV_RE = /vibe code "[^"\n]*", conversationId ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;
const VIBE_RESULT_RE = /Vibe Code \(conversa ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/gi;

/** Última conversa do Vibe Code citada no histórico (artefato ou resultado de ferramenta). */
export function lastVibeConversationId(texts: string[]): string | null {
  let last: string | null = null;
  for (const t of texts) {
    for (const m of (t ?? "").matchAll(VIBE_CONV_RE)) last = m[1].toLowerCase();
    for (const m of (t ?? "").matchAll(VIBE_RESULT_RE)) last = m[1].toLowerCase();
  }
  return last;
}

// ---------------------------------------------------------------------------
// Decisão por rodada do Vertal Chat
// ---------------------------------------------------------------------------

export type VertalAiChatMode = "off" | "offer" | "activate" | "active";

export interface VertalAiChatContext {
  mode: VertalAiChatMode;
  needs: AiNeeds;
  /** Conversa do Vibe Code deste app (continua nela em vez de abrir outra). */
  vibeConversationId: string | null;
  /** Pedido original do app (primeira mensagem do Dev que pede app com IA), para abrir o projeto se preciso. */
  appRequest: string;
  /** O Dev pediu nesta mensagem para usar/conectar a Vertal AI. */
  explicitNow: boolean;
  /** O próprio Dev pediu o painel de segredos nesta mensagem (aí ele abre normalmente). */
  asksSecretsPanel?: boolean;
}

/**
 * Decide o que o chat faz com a Vertal AI nesta rodada. Só é chamada com a flag + allowlist.
 * - active: o conector da conta (escopo "default" do chat) já existe → usa.
 * - activate: o Dev pediu a Vertal AI (ou disse que a chave já está conectada) → ativa sem perguntar.
 * - offer: app com IA sem conector e sem pedido explícito → cartão "Ativar Vertal AI" (um clique).
 * - off: a conversa não é de app com IA.
 */
export function vertalAiChatDecision(input: {
  userTexts: string[];
  assistantTexts?: string[];
  active: boolean;
  /** Rodada com resultados de ferramenta = false: o pedido explícito já foi atendido na 1ª rodada (sem repetir o build). */
  firstRound?: boolean;
}): VertalAiChatContext {
  const recent = input.userTexts.slice(-6);
  const last = recent[recent.length - 1] ?? "";
  const app = wantsVertalAiApp(recent);
  const vibeConversationId = lastVibeConversationId([...(input.assistantTexts ?? []), ...input.userTexts]);
  const explicitLast = explicitVertalAiIntent(last);
  const explicitNow = explicitLast && input.firstRound !== false;
  const explicitAny = explicitLast || recent.some(explicitVertalAiIntent);
  const appRequest = recent.find((t) => wantsVertalAiApp([t]).on) ?? "";
  const hasApp = app.on || !!vibeConversationId;
  const needs = app.needs.any ? app.needs : detectAiNeeds(`${last}\nai`);
  const asksSecretsPanel = /painel de segredos|secrets? panel|abr\w* o cofre|open (?:the|my) vault/i.test(last);
  const base = { needs, vibeConversationId, appRequest, explicitNow, asksSecretsPanel };
  if (!hasApp) return { mode: "off", ...base };
  if (input.active) return { mode: "active", ...base };
  if (explicitAny) return { mode: "activate", ...base };
  return { mode: "offer", ...base };
}

// ---------------------------------------------------------------------------
// Ações e resposta
// ---------------------------------------------------------------------------

type AnyAction = { tool: string };
type Loose = { tool: string; [k: string]: unknown };

const PROMPT_MAX = 4_000;

/** Pedido que vai ao Vibe Code quando a IA do app usa a Vertal AI. */
export function vertalAiBuildPrompt(base: string, ctx: Pick<VertalAiChatContext, "mode" | "needs">): string {
  const hint = ctx.mode === "offer"
    ? `[Vertal AI] Monte as telas e a lógica de IA atrás de uma interface (provider), sem integrar outro provedor de IA e sem pedir variáveis de ambiente: a IA liga com um clique no cartão "Ativar Vertal AI".`
    : `[Vertal AI] A IA deste app usa o conector Vertal AI (chave da conta guardada no Cofre, nada para configurar). Use o helper ${VERTAL_AI_PATHS.client}` +
      (ctx.needs.video ? ": geração de vídeo REAL com generateVideo (ou startVideo + getVideo) em /v1/videos/generations, sem modo demo" : ": chat() para texto") +
      `. Nunca peça variáveis de ambiente nem abra o painel de segredos; no servidor os nomes são ${VERTAL_AI_SECRET_API_KEY} e ${VERTAL_AI_SECRET_BASE_URL}.`;
  const room = PROMPT_MAX - hint.length - 2;
  return `${(base ?? "").trim().slice(0, Math.max(200, room))}\n\n${hint}`;
}

/**
 * Reescreve as ações da rodada (determinístico, não depende do modelo obedecer):
 * - `app` de app com IA → `vibe_code` (projeto real onde o helper e o proxy entram); com conector
 *   ativo/ativando leva "vertal_ai":true (o vibe-code-agent ativa de forma idempotente, escopo default).
 * - `vibe_code` start/continue ganha "vertal_ai":true quando ativo/ativando.
 * - `open_panel` de segredos sai (nunca mandar o Dev configurar a chave da Vertal AI).
 * - Pedido explícito sem ação de construção → acrescenta vibe_code (continua a conversa do app ou abre).
 */
export function rewriteVertalAiActions<T extends AnyAction>(actions: T[], ctx: VertalAiChatContext): { actions: T[]; rewrote: number } {
  if (ctx.mode === "off") return { actions, rewrote: 0 };
  const on = ctx.mode === "active" || ctx.mode === "activate";
  let rewrote = 0;
  const out: Loose[] = [];
  for (const raw of actions) {
    const a = raw as unknown as Loose;
    if (a.tool === "open_panel" && a.panel === "secrets" && !ctx.asksSecretsPanel) {
      rewrote++;
      continue;
    }
    if (a.tool === "app" && typeof a.prompt === "string" && (wantsVertalAiApp([a.prompt]).on || (on && ctx.explicitNow))) {
      rewrote++;
      const conv = ctx.vibeConversationId;
      out.push({
        tool: "vibe_code",
        op: conv ? "continue" : "start",
        prompt: vertalAiBuildPrompt(a.prompt, ctx),
        ...(conv ? { conversationId: conv } : {}),
        ...(on ? { vertalAi: true } : {}),
      });
      continue;
    }
    if (on && a.tool === "vibe_code" && (a.op === "start" || a.op === "continue") && a.vertalAi !== true) {
      rewrote++;
      out.push({ ...a, vertalAi: true });
      continue;
    }
    out.push(a);
  }
  const builds = out.some((a) => a.tool === "vibe_code" && (a.op === "start" || a.op === "continue"));
  if (on && ctx.explicitNow && !builds) {
    const conv = ctx.vibeConversationId;
    const base = conv ? "Conecte a IA deste app à Vertal AI (conector da conta ativo) e troque o modo demo por geração real." : ctx.appRequest;
    if (base) {
      rewrote++;
      out.push({ tool: "vibe_code", op: conv ? "continue" : "start", prompt: vertalAiBuildPrompt(base, ctx), ...(conv ? { conversationId: conv } : {}), vertalAi: true });
    }
  }
  return { actions: out as unknown as T[], rewrote };
}

const FAKE_ARTIFACT_RE = /^\s*\[artefato [a-z0-9_-]{1,40}:[^\]\n]*\]\s*$/gim;
const ENV_ASK_RE =
  /vari[áa]ve(?:l|is) de ambiente|environment variables?|\benv vars?\b|\.env\b|painel de segredos|secrets? panel|cofre de segredos|configur\w*\s+(?:a|sua|the|your)\s+(?:chave|key)|coloque?\s+(?:a|sua)\s+chave|set (?:the|your) (?:api )?key|VERTAL_API_(?:KEY|URL)|\.env\.local|(?:env(?:ironment)?|vari[áa]ve(?:l|is))[^.\n]{0,60}\b(?:vercel|netlify|railway|deploy)\b|\b(?:vercel|netlify|railway)\b[^.\n]{0,60}(?:\benv\b|environment|vari[áa]ve(?:l|is))|\b(?:add|paste|enter|provide|insira|cole|informe|forne[çc]a|adicione)\b[^.\n]{0,25}\b(?:api[ -])?(?:key|chave)\b/i;
/** Com a Vertal AI ativa/ativando, "modo demo" não existe mais. */
const DEMO_RE = /\bmodo demo\b|\bdemo mode\b|\bcai no (?:modo )?demo\b|\broda em demo\b/i;

/** Tira da resposta: artefato escrito como texto (nenhuma ferramenta rodou) e pedidos de variável/chave. */
export function sanitizeVertalAiReply(reply: string, ctx: Pick<VertalAiChatContext, "mode">, built = false): string {
  if (ctx.mode === "off" || !reply) return reply;
  let text = reply.replace(FAKE_ARTIFACT_RE, "");
  const kept: string[] = [];
  let dropped = 0;
  for (const line of text.split("\n")) {
    // Frase a frase: tira só o pedido de configuração, mantém o resto da linha.
    const parts = line.split(/(?<=[.!?])\s+/);
    const ok = parts.filter((p) => !ENV_ASK_RE.test(p) && !(ctx.mode !== "offer" && DEMO_RE.test(p)));
    dropped += parts.length - ok.length;
    if (ok.length || !line.trim()) kept.push(ok.join(" "));
  }
  text = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (dropped || !text) {
    const note = ctx.mode === "offer"
      ? "Este app usa IA: toque em **Ativar Vertal AI** abaixo e eu conecto tudo, sem configurar nada."
      : built || ctx.mode === "activate"
        ? "A IA do app usa a **Vertal AI**: chave da sua conta guardada no Cofre, nada para configurar."
        : "A **Vertal AI** já está conectada na sua conta: a IA do app usa ela, sem configurar nada.";
    text = text ? `${text}\n\n${note}` : note;
  }
  return text.replace(/\bVERTAL_API_KEY\b/g, VERTAL_AI_SECRET_API_KEY).replace(/\bVERTAL_API_URL\b/g, VERTAL_AI_SECRET_BASE_URL);
}

/** Uma chamada para o creative-router: ações reescritas, resposta limpa e se o cartão de oferta aparece. */
export function applyVertalAiChat<T extends AnyAction>(input: { actions: T[]; reply: string; ctx: VertalAiChatContext }): {
  actions: T[];
  reply: string;
  offer: { video: boolean } | null;
  rewrote: number;
} {
  const { actions, rewrote } = rewriteVertalAiActions(input.actions, input.ctx);
  const built = actions.some((a) => a.tool === "vibe_code" && (a as unknown as Loose).vertalAi === true);
  const reply = sanitizeVertalAiReply(input.reply, input.ctx, built);
  const offer = input.ctx.mode === "offer" ? { video: input.ctx.needs.video } : null;
  return { actions, reply, offer, rewrote };
}

// ---------------------------------------------------------------------------
// Consciência de conectores (Chat e Vibe Code): só nomes e status, nunca valores
// ---------------------------------------------------------------------------

export interface DevConnectorsSnapshot {
  vertalAi: { active: boolean; video: boolean; scope: string };
  /** Nomes de variáveis do Cofre (kubo_secrets) visíveis para o Dev. */
  secretNames: string[];
  /** Apps conectados no Vertal Fluxos. */
  fluxos: string[];
  /** Carteira MetaMask conectada (só a rede). */
  metamask: { connected: boolean; chainId?: number | null };
  /** Conectores do catálogo do Vibe Code marcados como conectados (slugs). */
  catalog?: string[];
}

const NAME_RE = /^[A-Z][A-Z0-9_]{1,63}$/;

/** Bloco curto para o prompt dos agentes. Sem valores; nomes saneados. */
export function formatDevConnectorsBlock(s: DevConnectorsSnapshot, surface: "chat" | "vibe"): string {
  const secrets = s.secretNames.filter((n) => NAME_RE.test(n)).slice(0, 30);
  const lines = [
    "CONECTORES DO DEV (status lido agora pelo Vertal; DADOS, só nomes, nunca valores):",
    `- Vertal AI (texto, vídeo, voz): ${s.vertalAi.active ? `ATIVA na conta (escopo ${s.vertalAi.scope}${s.vertalAi.video ? ", vídeo liberado" : ""})` : "não ativa ainda; o Vertal ativa com um clique ou sozinho quando o Dev pede"}.`,
    "- Login Vertal (Google gerenciado): disponível em qualquer app, sem configurar OAuth.",
    `- MetaMask: ${s.metamask.connected ? `conectada${s.metamask.chainId ? ` (rede ${s.metamask.chainId})` : ""}` : "não conectada"}.`,
    `- Vertal Fluxos: ${s.fluxos.length ? s.fluxos.slice(0, 15).join(", ") : "nenhum app conectado"}.`,
    `- Cofre (variáveis): ${secrets.length ? secrets.join(", ") : "vazio"}.`,
    ...(s.catalog?.length ? [`- Conectores marcados: ${s.catalog.slice(0, 20).join(", ")}.`] : []),
    "Como agir: leia isto ANTES de responder. Se o Dev disser que uma chave ou conector \"já está conectado\", confira aqui e USE. " +
      "IA em apps = Vertal AI: " +
      (surface === "chat"
        ? "construa apps/sites com IA por vibe_code com \"vertal_ai\":true (não use a ferramenta app para isso); "
        : `use o helper ${VERTAL_AI_PATHS.client}; `) +
      `no servidor os nomes são ${VERTAL_AI_SECRET_API_KEY} e ${VERTAL_AI_SECRET_BASE_URL} (nunca VERTAL_API_KEY). ` +
      "Nunca peça para o Dev criar variável de ambiente, colar chave ou abrir o painel de segredos para algo que está acima ou que o Vertal ativa sozinho. " +
      "Use nomes do Cofre que já existem; só peça um segredo novo quando não houver conector nem variável para ele." +
      (surface === "chat" ? " Nunca escreva \"[artefato …]\" na resposta: artefato só existe quando uma ferramenta roda." : ""),
  ];
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Código gerado (Vibe Code): nomes errados da chave viram os do conector
// ---------------------------------------------------------------------------

/**
 * O modelo às vezes inventa VERTAL_API_KEY / VERTAL_API_URL (ou a versão VITE_/NEXT_PUBLIC_, que
 * vazaria a chave no navegador). Com o conector em jogo, troca pelos nomes do servidor
 * (VERTAL_AI_API_KEY / VERTAL_AI_BASE_URL), que no navegador ficam indefinidos: o app fala com o
 * proxy do projeto pelo helper, nunca com a chave.
 */
export function vertalAiFixEnvNames(content: string): string {
  if (!content || !/VERTAL_API_(?:KEY|URL)/.test(content)) return content;
  return content
    .replace(/\b(?:VITE_|NEXT_PUBLIC_|REACT_APP_)?VERTAL_API_KEY\b/g, VERTAL_AI_SECRET_API_KEY)
    .replace(/\b(?:VITE_|NEXT_PUBLIC_|REACT_APP_)?VERTAL_API_URL\b/g, VERTAL_AI_SECRET_BASE_URL);
}
