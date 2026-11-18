// Testes Deno do orquestrador v2 do Vertal Chat (o mesmo código roda na edge function).
import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { agentOutputNeedsRetry, parseAgentOutput } from "./chatAgent.ts";
import {
  type AgentTier,
  callWithTierFallback,
  chooseAgentTier,
  groupActionsForExecution,
  mapWithConcurrency,
  repairAgentJson,
} from "./chatOrchestrator.ts";

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

// ─── callWithTierFallback ────────────────────────────────────────────────

type Res = { text: string; tier?: AgentTier };
const recoverable = (err: unknown) => err instanceof Error && err.message === "gateway";

Deno.test("tier fallback: resposta boa no primeiro tier não tenta de novo", async () => {
  const calls: AgentTier[] = [];
  const out = await callWithTierFallback<Res, string>({
    tier: "flash",
    call: async (t) => (calls.push(t), { text: "ok", tier: t }),
    parse: (r) => r.text,
    needsRetry: (p) => p === "",
    isRecoverable: recoverable,
  });
  assertEquals(calls, ["flash"]);
  assertEquals(out, { result: { text: "ok", tier: "flash" }, parsed: "ok", usedTier: "flash", fellBack: false, retried: false });
});

Deno.test("tier fallback: pro com erro do gateway volta ao flash", async () => {
  const calls: AgentTier[] = [];
  const out = await callWithTierFallback<Res, string>({
    tier: "pro",
    call: async (t) => {
      calls.push(t);
      if (t === "pro") throw new Error("gateway");
      return { text: "ok", tier: t };
    },
    parse: (r) => r.text,
    needsRetry: (p) => p === "",
    isRecoverable: recoverable,
  });
  assertEquals(calls, ["pro", "flash"]);
  assertEquals(out.usedTier, "flash");
  assert(out.fellBack);
  assert(!out.retried);
});

Deno.test("tier fallback: erro não recuperável (ou já no flash) propaga", async () => {
  await assertRejects(
    () => callWithTierFallback<Res, string>({
      tier: "pro",
      call: async () => { throw new Error("fatal"); },
      parse: (r) => r.text,
      needsRetry: () => false,
      isRecoverable: recoverable,
    }),
    Error,
    "fatal",
  );
  await assertRejects(
    () => callWithTierFallback<Res, string>({
      tier: "flash",
      call: async () => { throw new Error("gateway"); },
      parse: (r) => r.text,
      needsRetry: () => false,
      isRecoverable: recoverable,
    }),
    Error,
    "gateway",
  );
});

Deno.test("tier fallback: saída inútil tenta UMA vez no outro tier e fica com a melhor", async () => {
  const calls: AgentTier[] = [];
  const out = await callWithTierFallback<Res, string>({
    tier: "flash",
    call: async (t) => (calls.push(t), { text: t === "pro" ? "bom" : "", tier: t }),
    parse: (r) => r.text,
    needsRetry: (p) => p === "",
    isRecoverable: recoverable,
  });
  assertEquals(calls, ["flash", "pro"]);
  assertEquals(out.parsed, "bom");
  assertEquals(out.usedTier, "pro");
  assert(out.retried);
});

Deno.test("tier fallback: segunda tentativa pior mantém a primeira", async () => {
  const out = await callWithTierFallback<Res, string>({
    tier: "flash",
    call: async (t) => ({ text: t === "flash" ? "ab" : "a", tier: t }),
    parse: (r) => r.text,
    needsRetry: () => true,
    better: (second, first) => second.length > first.length,
    isRecoverable: recoverable,
  });
  assertEquals(out.parsed, "ab");
  assertEquals(out.usedTier, "flash");
  assert(out.retried);
});

Deno.test("tier fallback: erro recuperável na nova tentativa é engolido; retryOtherTier=false não tenta", async () => {
  const out = await callWithTierFallback<Res, string>({
    tier: "flash",
    call: async (t) => {
      if (t === "pro") throw new Error("gateway");
      return { text: "", tier: t };
    },
    parse: (r) => r.text,
    needsRetry: (p) => p === "",
    isRecoverable: recoverable,
  });
  assertEquals(out.parsed, "");
  assertEquals(out.usedTier, "flash");
  assert(out.retried);

  const calls: AgentTier[] = [];
  const off = await callWithTierFallback<Res, string>({
    tier: "flash",
    call: async (t) => (calls.push(t), { text: "", tier: t }),
    parse: (r) => r.text,
    needsRetry: () => true,
    isRecoverable: recoverable,
    retryOtherTier: false,
  });
  assertEquals(calls, ["flash"]);
  assert(!off.retried);
});

Deno.test("tier fallback: tier informado pelo resultado prevalece", async () => {
  const out = await callWithTierFallback<Res, string>({
    tier: "pro",
    call: async () => ({ text: "ok", tier: "flash" }),
    parse: (r) => r.text,
    needsRetry: () => false,
    isRecoverable: recoverable,
  });
  assertEquals(out.usedTier, "flash");
});

// ─── mapWithConcurrency ──────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.test("mapWithConcurrency: mantém a ordem e respeita o limite", async () => {
  let running = 0;
  let peak = 0;
  const out = await mapWithConcurrency([30, 5, 20, 1, 10, 2], 2, async (ms, i) => {
    running++;
    peak = Math.max(peak, running);
    await sleep(ms);
    running--;
    return `${i}:${ms}`;
  });
  assertEquals(out, ["0:30", "1:5", "2:20", "3:1", "4:10", "5:2"]);
  assertEquals(peak, 2);
});

Deno.test("mapWithConcurrency: lista vazia, limite inválido e limite maior que a lista", async () => {
  assertEquals(await mapWithConcurrency([], 4, async (x: number) => x), []);
  let running = 0;
  let peak = 0;
  const fn = async (x: number) => {
    running++;
    peak = Math.max(peak, running);
    await sleep(1);
    running--;
    return x * 2;
  };
  assertEquals(await mapWithConcurrency([1, 2, 3], 0, fn), [2, 4, 6]);
  assertEquals(peak, 1);
  peak = 0;
  assertEquals(await mapWithConcurrency([1, 2, 3], 10, fn), [2, 4, 6]);
  assertEquals(peak, 3);
});

Deno.test("mapWithConcurrency: erro de um item rejeita", async () => {
  await assertRejects(
    () => mapWithConcurrency([1, 2, 3], 2, async (x) => {
      if (x === 2) throw new Error("falhou 2");
      return x;
    }),
    Error,
    "falhou 2",
  );
});
