// Testes da rota de e-mail do Vertal Chat (fix navigator-scope-email, 22/11).
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  DEFAULT_INBOX_SEARCH, EMAIL_RULES, emailRoute, insistsOnBrowser, isEmailNavigatorAction, rerouteEmailActions, wantsOwnEmail,
} from "./emailRouting.ts";
import { buildAgentSystemPrompt, parseAgentAction } from "./chatAgent.ts";

Deno.test("pedido de e-mail do usuário é reconhecido", () => {
  for (const t of [
    "entra no meu email e me fala o que chegou",
    "leia meus e-mails e me pergunte o que responder",
    "Entre no gmail",
    "verifique minha caixa de entrada",
    "preencha os convites que chegaram no email",
    "responda os emails importantes",
  ]) assert(wantsOwnEmail(t), t);
  for (const t of [
    "meu contato é kuboprotocol@gmail.com, crie o repositório",
    "escreva um e-mail de boas-vindas para clientes",
    "qual o clima em São Paulo?",
  ]) assert(!wantsOwnEmail(t), t);
});

Deno.test("e-mail vai pelo conector; navegador só se o usuário insistir", () => {
  assertEquals(emailRoute(["leia meus emails e me diga os principais"]), "gmail");
  assertEquals(emailRoute(["oi", "entre no meu email e responda os convites"]), "gmail");
  // Conversa real de 22/11: o usuário pediu o navegador com todas as letras.
  assertEquals(emailRoute(["Entre no gmail pelo o navegador e faz o login", "Pelo navegador"]), "browser");
  assertEquals(emailRoute(["qual a previsão do tempo?"]), null);
  assert(insistsOnBrowser("faz pelo navegador mesmo"));
  assert(!insistsOnBrowser("leia meus emails"));
});

Deno.test("navigator sobre a caixa de e-mail vira gmail_search na rota do conector", () => {
  assert(isEmailNavigatorAction({ tool: "navigator", op: "open", url: "https://mail.google.com/" }));
  assert(isEmailNavigatorAction({ tool: "navigator", op: "run", task: "leia meus e-mails" }));
  assert(isEmailNavigatorAction({ tool: "navigator", op: "open", url: "https://workspace.google.com/intl/en-US/gmail/" }));
  assert(!isEmailNavigatorAction({ tool: "navigator", op: "run", task: "veja o preço do café", url: "https://loja.com/" }));
  assert(!isEmailNavigatorAction({ tool: "navigator", op: "stop" }));

  const actions = [
    { tool: "navigator", op: "open", url: "https://mail.google.com/" },
    { tool: "navigator", op: "run", task: "leia meus emails" },
    { tool: "weather" },
  ];
  const r = rerouteEmailActions(actions, "gmail");
  assertEquals(r.rerouted, 2);
  assertEquals(r.actions, [DEFAULT_INBOX_SEARCH, { tool: "weather" }]);
  // Rota "browser" (usuário insistiu): não mexe.
  assertEquals(rerouteEmailActions(actions, "browser").rerouted, 0);
  assertEquals(rerouteEmailActions(actions, null).actions, actions);
});

Deno.test("prompt: regras de e-mail só na rota do conector, e cabe no orçamento", () => {
  const on = buildAgentSystemPrompt({ secretNames: [], email: "gmail" });
  assert(on.includes(EMAIL_RULES));
  assert(on.includes('"tool":"gmail_read"'));
  assert(!buildAgentSystemPrompt({ secretNames: [] }).includes("E-MAIL DO USUÁRIO (regra dura)"));
  // Na rota do conector o navigator fica desligado (creative-router: navigatorOn exige mailRoute !== "gmail").
  const heavy = buildAgentSystemPrompt({
    browserForm: true, email: "gmail",
    secretNames: Array.from({ length: 60 }, (_, i) => `SEGREDO_${i}`),
    localNow: "agora", memories: "x".repeat(2_500), recall: "y".repeat(700), summary: "z".repeat(2_400), plan: "p".repeat(2_500),
  });
  assert(heavy.length < 26_000, `prompt com ${heavy.length} caracteres`);
});

Deno.test("gmail_read e resposta no mesmo thread (gmail_send com thread/in_reply_to)", () => {
  assertEquals(parseAgentAction({ tool: "gmail_read", thread: "18c2f0a9b1d2e3f4" }), { tool: "gmail_read", thread: "18c2f0a9b1d2e3f4" });
  assertEquals(parseAgentAction({ tool: "gmail_read", thread: "../x" }), null);
  assertEquals(
    parseAgentAction({ tool: "gmail_send", to: "ana@exemplo.com", subject: "Re: Convite", body: "Confirmo presença.", thread: "18c2f0a9b1d2e3f4", in_reply_to: "<abc@mail.gmail.com>" }),
    { tool: "gmail_send", to: "ana@exemplo.com", subject: "Re: Convite", body: "Confirmo presença.", thread: "18c2f0a9b1d2e3f4", in_reply_to: "<abc@mail.gmail.com>" },
  );
  // Cabeçalho injetado no in_reply_to é descartado.
  assertEquals(
    parseAgentAction({ tool: "gmail_send", to: "ana@exemplo.com", subject: "Oi", body: "x", in_reply_to: "<a@b>\r\nBcc: x@y.z" }),
    { tool: "gmail_send", to: "ana@exemplo.com", subject: "Oi", body: "x" },
  );
});
