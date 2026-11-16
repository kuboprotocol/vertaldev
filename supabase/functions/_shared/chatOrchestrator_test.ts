// Testes Deno do orquestrador v2 do Vertal Chat (o mesmo código roda na edge function).
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { agentOutputNeedsRetry, parseAgentOutput } from "./chatAgent.ts";
import { chooseAgentTier, groupActionsForExecution, repairAgentJson } from "./chatOrchestrator.ts";

Deno.test("orquestrador: flash por padrão, pro na síntese do plano", () => {
  assertEquals(chooseAgentTier({ lastUserText: "oi", firstRound: true }).tier, "flash");
  assertEquals(chooseAgentTier({ lastUserText: "oi", firstRound: false, planPhase: "final" }).tier, "pro");
  assertEquals(chooseAgentTier({ lastUserText: "oi", firstRound: false, planPhase: "final", escalation: false }).tier, "flash");
});

Deno.test("orquestrador: conserta JSON cercado e cortado", () => {
  assertEquals(repairAgentJson('ok:\n```json\n{"reply":"oi"}\n```')?.value, { reply: "oi" });
  const cut = parseAgentOutput('{"reply":"Gerando","actions":[{"tool":"image","prompt":"gato');
  assertEquals(cut.status, "truncated");
  assertEquals(cut.turn.actions.length, 0);
  assert(agentOutputNeedsRetry(cut.status));
  assertEquals(parseAgentOutput('{"actions":[').turn.reply, "");
});

Deno.test("orquestrador: leituras juntas, escrita sozinha", () => {
  const groups = groupActionsForExecution([
    { tool: "web_search", query: "a" },
    { tool: "web_read", url: "https://x.com" },
    { tool: "image", prompt: "logo" },
  ]);
  assertEquals(groups.map((g) => g.length), [2, 1]);
});
