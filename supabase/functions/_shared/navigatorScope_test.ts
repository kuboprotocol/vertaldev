// Testes de escopo do Vertal Navigator (fix navigator-scope-email, 22/11):
// só o que foi pedido, busca no DuckDuckGo, Gmail direto no login, senha fora da
// tarefa e aprovação para toda ação de escrita.
import { assert, assertEquals, assertFalse } from "jsr:@std/assert@1";
import {
  GMAIL_LOGIN_URL, NAVIGATOR_LIMITS, NAVIGATOR_MESSAGES, NAVIGATOR_SCOPE_RULES, auditDetail, describeAudit, framedNavigatorTask,
  knownSiteUrlForTask, looksLikeCredentials, navigatorStartUrl, needsActionApproval, needsWriteApproval, parseTaskBody,
  redactCredentials, rewriteSearchUrl, sanitizePending,
} from "./navigatorCore.ts";

const SID = "123e4567-e89b-42d3-a456-426614174000";

Deno.test("toda tarefa leva as regras de escopo e a regra do DuckDuckGo", () => {
  const t = framedNavigatorTask("me diga o título", "https://example.com");
  assert(t.startsWith("Comece abrindo https://example.com. me diga o título"));
  assert(t.includes(NAVIGATOR_SCOPE_RULES));
  assert(t.includes("SOMENTE o que a tarefa pede"));
  assert(t.includes("duckduckgo.com"));
  assert(t.includes("nunca google.com/search"));
  assertFalse(t.includes("pode abrir outra aba se precisar"));
});

Deno.test("com página já aberta, a tarefa continua dali (não volta ao buscador)", () => {
  const t = framedNavigatorTask("clique na primeira mensagem", undefined, { currentUrl: "https://mail.google.com/mail/u/0/#inbox" });
  assert(t.startsWith("Continue a partir da página que já está aberta"));
  assertFalse(t.startsWith("Comece abrindo um buscador"));
  // A URL atual não vai no texto (o browser-use recarregaria a página).
  assertFalse(t.includes("https://mail.google.com/mail/u/0/#inbox"));
  // Navegador em branco: continua pesquisando no DuckDuckGo (bug #199).
  assert(framedNavigatorTask("pesquise o preço do café").startsWith("Comece abrindo um buscador público (https://duckduckgo.com)"));
  assert(framedNavigatorTask("pesquise o preço do café", undefined, { currentUrl: "about:blank" }).startsWith("Comece abrindo um buscador"));
});

Deno.test("Gmail abre direto no login do Google (não na página de marketing)", () => {
  assertEquals(navigatorStartUrl("https://mail.google.com/"), GMAIL_LOGIN_URL);
  assertEquals(navigatorStartUrl("https://gmail.com/"), GMAIL_LOGIN_URL);
  assertEquals(navigatorStartUrl("https://workspace.google.com/intl/en-US/gmail/"), GMAIL_LOGIN_URL);
  assertEquals(navigatorStartUrl("https://mail.google.com/mail/u/0/#inbox"), "https://mail.google.com/mail/u/0/#inbox");
  assertEquals(navigatorStartUrl("https://github.com/"), "https://github.com/");
  assertEquals(knownSiteUrlForTask("Entre no gmail"), GMAIL_LOGIN_URL);
  assertEquals(knownSiteUrlForTask("abra o github"), null);
  assert(framedNavigatorTask("Entre no gmail").startsWith(`Comece abrindo ${GMAIL_LOGIN_URL}.`));
  // Já no Gmail: continua dali.
  assert(framedNavigatorTask("Entre no gmail", undefined, { currentUrl: "https://mail.google.com/mail/u/0/" }).startsWith("Continue a partir"));
});

Deno.test("busca do Google/Bing vira busca no DuckDuckGo", () => {
  assertEquals(rewriteSearchUrl("https://www.google.com/search?q=vertal+dev"), "https://duckduckgo.com/?q=vertal%20dev");
  assertEquals(rewriteSearchUrl("https://www.google.com.br/search?q=caf%C3%A9"), "https://duckduckgo.com/?q=caf%C3%A9");
  assertEquals(rewriteSearchUrl("https://www.bing.com/search?q=x"), "https://duckduckgo.com/?q=x");
  assertEquals(rewriteSearchUrl("https://www.google.com/maps"), "https://www.google.com/maps");
  assertEquals(navigatorStartUrl("https://google.com/search?q=a"), "https://duckduckgo.com/?q=a");
});

Deno.test("senha no texto da tarefa é recusada e nunca vai para a auditoria", () => {
  const leaked = "Email, fulano@gmail.com e senga Abcdef1@#$";
  assert(looksLikeCredentials(leaked));
  assert(looksLikeCredentials("login fulano senha: minhaSenha123"));
  assert(looksLikeCredentials("password=hunter2!"));
  assertFalse(looksLikeCredentials("faça login com a senha do cofre GMAIL_PASSWORD"));
  assertFalse(looksLikeCredentials("Passo 2 navegar para o gmail e se logar nele"));
  assertFalse(looksLikeCredentials("troque a senha da conta"));
  assertEquals(parseTaskBody({ sessionId: SID, task: leaked }), { ok: false, status: "credentials_in_task" });
  assert(NAVIGATOR_MESSAGES.credentials_in_task.includes("Cofre"));
  assertFalse(redactCredentials(leaked).includes("Abcdef1"));
  assertFalse(String(auditDetail({ task: leaked }).task).includes("Abcdef1"));
});

Deno.test("teto duro de passos por tarefa", () => {
  assertEquals(NAVIGATOR_LIMITS.maxStepsCap, 40);
  const r = parseTaskBody({ sessionId: SID, task: "abra o site", maxSteps: 999 });
  assert(r.ok && r.data.maxSteps === 40);
  const d = parseTaskBody({ sessionId: SID, task: "abra o site" });
  assert(d.ok && d.data.maxSteps === NAVIGATOR_LIMITS.defaultMaxSteps && d.data.maxSteps <= 20);
});

Deno.test("ações de escrita pedem aprovação (enviar, responder, convite, publicar, excluir)", () => {
  for (const target of ["Enviar", "Send", "Responder a todos", "Reply", "Publicar", "Excluir", "Delete", "Aceitar", "Recusar", "Submit"]) {
    assert(needsWriteApproval("click", target, "https://example.com/", ""), target);
  }
  // Convite no Gmail: Sim / Não / Talvez.
  assertEquals(needsWriteApproval("click", "Sim", "https://mail.google.com/mail/u/0/#inbox/abc", "Convite: Reunião"), "rsvp:sim");
  assertEquals(needsWriteApproval("click", "Talvez", "https://calendar.google.com/calendar/event?eid=1"), "rsvp:talvez");
  assertEquals(needsWriteApproval("click", "Sim", "https://loja.com/produto", "Produto"), null);
  // Ctrl+Enter envia e-mail; digitar não envia; leitura não pede nada.
  assertEquals(needsWriteApproval("send_keys", "", "https://mail.google.com/", "", "Control+Enter"), "keyboard_send");
  assertEquals(needsWriteApproval("input", "Enviar", "https://mail.google.com/"), null);
  assertEquals(needsWriteApproval("click", "Caixa de entrada", "https://mail.google.com/"), null);
  assertEquals(needsWriteApproval("click", "Próxima", "https://accounts.google.com/"), null);
  // Pagamento continua no cartão de pagamento; escrita no de envio.
  assertEquals(needsActionApproval("click", "Comprar agora", "https://loja.com/")?.category, "payment");
  assertEquals(needsActionApproval("click", "Enviar", "https://mail.google.com/")?.category, "write");
  assertEquals(needsActionApproval("click", "Ver mais", "https://mail.google.com/"), null);
});

Deno.test("cartão de escrita leva categoria e o conteúdo exato (campos), sem perder o de pagamento", () => {
  const [w] = sanitizePending([{
    id: "abcdef1234567890", kind: "approval", category: "write", target: "Enviar", url: "https://mail.google.com/",
    fields: [{ label: "Para", value: "ana@exemplo.com" }, { label: "Corpo", value: "Olá Ana, confirmo." }, { label: "vazio", value: "  " }],
  }]);
  assertEquals(w.category, "write");
  assertEquals(w.fields, [{ label: "Para", value: "ana@exemplo.com" }, { label: "Corpo", value: "Olá Ana, confirmo." }]);
  // navd antigo (sem categoria): continua igual, tratado como pagamento pela UI.
  const [p] = sanitizePending([{ id: "abcdef1234567891", kind: "approval", target: "Pagar" }]);
  assertEquals(p.category, undefined);
  assertEquals(sanitizePending([{ id: "abcdef1234567892", kind: "approval", category: "payment" }])[0].category, "payment");
  assert(describeAudit({ kind: "approval_granted", detail: { reason: "write:enviar", target: "Enviar", url: "https://mail.google.com/" } }).startsWith("Envio/confirmação aprovado"));
  assert(describeAudit({ kind: "approval_granted", detail: { reason: "pagar", store: "Loja" } }).startsWith("Pagamento aprovado"));
});
