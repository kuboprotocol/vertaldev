// Vertal Chat: pedidos sobre o e-mail do próprio usuário ("entre no meu email",
// "leia meus e-mails", "responda", "convites") vão para o conector do Gmail
// (gmail_search / gmail_read / gmail_send), não para o navegador na nuvem.
//
// Bug 22/11: pedido "entre no gmail, leia, me pergunte o que responder, preencha os
// convites" abriu o Vertal Navigator em mail.google.com, que sem login cai na página
// de marketing (workspace.google.com/.../gmail/). Pelo conector: lê, resume, pergunta
// e só envia depois da aprovação explícita (diálogo de aprovação do chat).
//
// O navegador só entra se o usuário INSISTIR nele (pede "pelo navegador" com todas as letras).
// Módulo puro (sem Deno/Node): usado pelo creative-router e pelos testes (deno e vitest).

export type EmailRoute = "gmail" | "browser";

/** Pedido sobre o e-mail do próprio usuário (caixa de entrada, ler, responder, convites). */
const OWN_EMAIL_RE = new RegExp(
  [
    String.raw`(?<!@)\bg-?mail\b(?!\.com)`,
    String.raw`\b(meus?|minhas?|o meu|a minha)\s+(e-?mails?|emails?|caixa de entrada|inbox|correio|mensagens do gmail)\b`,
    String.raw`\bcaixa de entrada\b`,
    String.raw`\binbox\b`,
    String.raw`\b(ler|leia|l[eê]|ver|veja|checar|cheque|checa|verificar|verifique|olhar|olhe|abrir|abra|entrar|entre|acessar|acesse|resumir|resuma|responder|responda)\s+(os\s+|meus\s+|o\s+|no\s+|meu\s+|ao\s+)?(e-?mails?|emails?)\b`,
    String.raw`\b(convites?|invites?|rsvp)\b.{0,40}\b(e-?mails?|emails?|gmail|agenda|calend[aá]rio|evento|reuni[aã]o)\b`,
    String.raw`\b(e-?mails?|emails?|gmail)\b.{0,60}\b(convites?|invites?|rsvp)\b`,
  ].join("|"),
  "i",
);

/** O usuário pediu, com todas as letras, para usar o navegador. */
const INSISTS_BROWSER_RE =
  /\b(pel[oa]\s+(o\s+)?(navegador|browser)|n[oa]\s+navegador|via\s+(navegador|browser)|usando\s+o\s+(navegador|browser)|com\s+o\s+(navegador|browser)|vertal navigator|abr(a|ir|e)\s+o\s+navegador)\b/i;

export function wantsOwnEmail(text: unknown): boolean {
  return OWN_EMAIL_RE.test(String(text ?? ""));
}

export function insistsOnBrowser(text: unknown): boolean {
  return INSISTS_BROWSER_RE.test(String(text ?? ""));
}

/**
 * Rota de um pedido de e-mail olhando as últimas mensagens do USUÁRIO (mais recente por último).
 * null = a conversa recente não é sobre o e-mail do usuário.
 * "browser" só quando uma das 2 últimas mensagens insiste no navegador.
 */
export function emailRoute(recentUserTexts: string[], lookback = 4): EmailRoute | null {
  const recent = recentUserTexts.slice(-lookback);
  if (!recent.some(wantsOwnEmail)) return null;
  return recent.slice(-2).some(insistsOnBrowser) ? "browser" : "gmail";
}

/** Regras + ferramentas do Gmail para o prompt na rota do conector (curto: o prompt tem orçamento). */
export const EMAIL_RULES = [
  "E-MAIL DO USUÁRIO (regra dura): use o Gmail conectado, nunca o navigator (navegador só se ele insistir com todas as letras).",
  '- {"tool":"gmail_search","query":"in:inbox newer_than:7d","max":10} → lista e-mails (com thread). {"tool":"gmail_read","thread":"id"} → conversa inteira (Message-ID, convite).',
  '- {"tool":"gmail_send","to":"email","subject":"Re: ...","body":"...","thread":"id","in_reply_to":"<Message-ID>"} → envia/responde (o chat pede aprovação).',
  '- {"tool":"gmail_draft","to":"email","subject":"...","body":"...","thread":"id"} → salva rascunho no Gmail (não envia). {"tool":"gmail_forward","message":"msg id","to":"email","note":"..."} → encaminha (o chat pede aprovação).',
  '- {"tool":"gmail_modify","op":"read|unread|archive|inbox|star|unstar|important|not_important|label|unlabel|trash|untrash","thread":"id","labels":["Nome"]} → organiza (use "message" para um e-mail só; "trash" pede aprovação). {"tool":"gmail_attachment","thread":"id","message":"msg id","attachment":"id"} → lê anexo de texto.',
  "Você é o secretário do usuário no e-mail: resume a caixa, lê, rascunha, responde, encaminha e organiza. Nunca invente ids: use os de gmail_search/gmail_read.",
  "Fluxo: resuma os principais e PERGUNTE quais responder; mostre o rascunho inteiro e só use gmail_send depois do \"sim\". Convite: mostre data/hora/local e pergunte Sim, Não ou Talvez; sem conector de agenda, a resposta vai por e-mail ao organizador, com aprovação.",
].join("\n");

const EMAIL_SITE_RE = /(^|\.)(mail\.google\.com|gmail\.com|outlook\.live\.com|outlook\.office\.com|mail\.yahoo\.com)$/i;

/** A ação do navegador é sobre a caixa de e-mail? (URL de webmail ou tarefa de e-mail). */
export function isEmailNavigatorAction(a: { tool?: unknown; op?: unknown; url?: unknown; task?: unknown }): boolean {
  if (a?.tool !== "navigator" || a.op === "stop") return false;
  if (typeof a.url === "string") {
    try {
      const u = new URL(a.url);
      if (EMAIL_SITE_RE.test(u.hostname)) return true;
      if (u.hostname === "workspace.google.com" && /gmail/i.test(u.pathname)) return true;
      if (u.hostname === "accounts.google.com" && /service=mail|mail\.google\.com/i.test(u.search)) return true;
    } catch {
      // URL inválida: decide pela tarefa
    }
  }
  return wantsOwnEmail(a.task);
}

/** Primeira leitura padrão da caixa de entrada (substitui o navigator na rota "gmail"). */
export const DEFAULT_INBOX_SEARCH = { tool: "gmail_search", query: "in:inbox newer_than:7d", max: 10 } as const;

/**
 * Rota "gmail": ações do navigator sobre e-mail viram UMA leitura pelo conector
 * (nada é enviado sem aprovação). Rota "browser" ou sem pedido de e-mail: não mexe.
 */
export function rerouteEmailActions<T extends { tool: string }>(actions: T[], route: EmailRoute | null): { actions: Array<T | typeof DEFAULT_INBOX_SEARCH>; rerouted: number } {
  if (route !== "gmail") return { actions, rerouted: 0 };
  let rerouted = 0;
  const out: Array<T | typeof DEFAULT_INBOX_SEARCH> = [];
  const alreadyReads = actions.some((a) => a.tool === "gmail_search" || a.tool === "gmail_read");
  for (const a of actions) {
    if (isEmailNavigatorAction(a as unknown as Record<string, unknown>)) {
      rerouted++;
      if (!alreadyReads && !out.some((x) => x.tool === "gmail_search")) out.push(DEFAULT_INBOX_SEARCH);
      continue;
    }
    out.push(a);
  }
  return { actions: out, rerouted };
}
