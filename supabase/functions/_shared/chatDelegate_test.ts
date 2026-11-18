// Testes Deno da ponte Vibe Code → Vertal Chat: filtro de ferramentas por origem
// (feito no creative-router) e o laço de delegação com um transporte falso.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  CHAT_DELEGATE_LIMITS,
  delegateAgentChatBody,
  delegatedResultsViolateDepth,
  filterActionsForOrigin,
  formatChatAnswerForAgent,
  insertDelegateAnswer,
  parseChatOrigin,
  type RouterCall,
  runChatDelegation,
} from "./chatDelegate.ts";
import { canAskChat, parseAgentTurn } from "./vibeAgentCore.ts";

Deno.test("parseChatOrigin: ausente = vertal_chat; desconhecida = null", () => {
  assertEquals(parseChatOrigin(undefined), "vertal_chat");
  assertEquals(parseChatOrigin("vibe_code"), "vibe_code");
  assertEquals(parseChatOrigin("hacker"), null);
  assertEquals(parseChatOrigin(3), null);
});

Deno.test("filterActionsForOrigin: vibe_code só passa leitura/pesquisa/imagem e recusa vibe_code", () => {
  const actions = [
    { tool: "web_search", query: "stripe sdk" },
    { tool: "vibe_code", op: "start", prompt: "x" },
    { tool: "gmail_send", to: "a@b.c" },
    { tool: "image", prompt: "logo" },
    { tool: "plan", goal: "g" },
    { tool: "web_read", url: "https://x.dev" },
  ];
  const r = filterActionsForOrigin(actions, "vibe_code");
  assertEquals(r.actions.map((a) => a.tool), ["web_search", "image", "web_read"]);
  assertEquals(r.refused, ["vibe_code", "gmail_send", "plan"]);
});

Deno.test("filterActionsForOrigin: origem do próprio chat não muda nada", () => {
  const actions = [{ tool: "vibe_code" }, { tool: "gmail_send" }];
  assertEquals(filterActionsForOrigin(actions, "vertal_chat"), { actions, refused: [] });
});

Deno.test("filterActionsForOrigin: respeita o teto de ações por rodada", () => {
  const many = Array.from({ length: 6 }, (_, i) => ({ tool: "web_search", query: `q${i}` }));
  const r = filterActionsForOrigin(many, "vibe_code");
  assertEquals(r.actions.length, CHAT_DELEGATE_LIMITS.maxActionsPerRound);
  assertEquals(r.refused.length, 6 - CHAT_DELEGATE_LIMITS.maxActionsPerRound);
});

Deno.test("delegatedResultsViolateDepth: resultado vibe_code num pedido delegado é barrado", () => {
  assert(delegatedResultsViolateDepth([{ tool: "vibe_code" }], "vibe_code"));
  assert(!delegatedResultsViolateDepth([{ tool: "vibe_code" }], "vertal_chat"));
  assert(!delegatedResultsViolateDepth([{ tool: "web_search" }], "vibe_code"));
});

Deno.test("delegateAgentChatBody: agent_chat com origin vibe_code", () => {
  const b = delegateAgentChatBody("pergunta", { final: true }) as { tool: string; agent: Record<string, unknown> };
  assertEquals(b.tool, "agent_chat");
  assertEquals(b.agent.origin, "vibe_code");
  assertEquals(b.agent.final, true);
});

Deno.test("runChatDelegation: pesquisa, segunda rodada final e ignora vibe_code vindo do servidor", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const router: RouterCall = async (body) => {
    calls.push(body);
    if (body.tool === "agent_op") return { status: 200, data: { ok: true, summary: "Stripe SDK 18.0" } };
    const agent = body.agent as { final?: boolean };
    if (!agent.final) {
      return { status: 200, data: { reply: "", actions: [{ tool: "web_search", query: "stripe" }, { tool: "vibe_code", op: "start", prompt: "x" }] } };
    }
    return { status: 200, data: { reply: "Use o SDK 18.0.", actions: [] } };
  };
  const r = await runChatDelegation("Qual a versão do SDK do Stripe?", router);
  assert(r.ok);
  assertEquals(r.answer, "Use o SDK 18.0.");
  assertEquals(r.tools, [{ tool: "web_search", ok: true }]);
  assert(r.refused.includes("vibe_code"));
  assertEquals(calls.map((c) => c.tool), ["agent_chat", "agent_op", "agent_chat"]);
  assert(!calls.some((c) => c.tool === "vibe_code"));
  assert(formatChatAnswerForAgent(r).includes("Use o SDK 18.0."));
});

Deno.test("runChatDelegation: erro do servidor vira texto, sem lançar", async () => {
  const r = await runChatDelegation("pergunta qualquer", async () => ({ status: 402, data: { error: "insufficient_credits" } }));
  assert(!r.ok);
  assert(r.error?.includes("créditos"));
});

Deno.test("canAskChat: pedido vindo do Vertal Chat não pergunta de volta (profundidade 1)", () => {
  assertEquals(canAskChat("vertal_chat", 0), { ok: false, reason: "delegation_depth_exceeded" });
  assertEquals(canAskChat("vibe_code", 0), { ok: true });
  assertEquals(canAskChat("vibe_code", 1), { ok: false, reason: "chat_delegation_limit" });
});

Deno.test("parseAgentTurn: ask_chat é aceito e pede nova volta", () => {
  const t = parseAgentTurn('{"summary":"vou pesquisar","actions":[{"type":"ask_chat","reason":"versão do Next?"}]}');
  assertEquals(t.actions, [{ type: "ask_chat", reason: "versão do Next?" }]);
  assert(!t.final);
});

Deno.test("insertDelegateAnswer: junta ao texto do campo", () => {
  assertEquals(insertDelegateAnswer("", "x"), "Resposta do Vertal Chat:\nx");
  assertEquals(insertDelegateAnswer("crie o checkout", "SDK 18"), "crie o checkout\n\nResposta do Vertal Chat:\nSDK 18");
  assertEquals(insertDelegateAnswer("abc", "  "), "abc");
});
