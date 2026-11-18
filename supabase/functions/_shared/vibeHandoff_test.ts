// Testes Deno do handoff (agent_state.handoff): normalizeAgentState preserva,
// campos inválidos somem e o corpo {action:"note"} vira patch validado.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { compactAgentState, mergeHandoff, normalizeAgentState, normalizeHandoff, parseHandoffNote } from "./vibePlandexEngine.ts";

const CHAT_ID = "11111111-2222-4333-8444-555555555555";

Deno.test("normalizeAgentState preserva agent_state.handoff", () => {
  const st = normalizeAgentState({
    staged: [],
    handoff: { chatConversationId: CHAT_ID, goal: "landing page", status: "running", lastSummary: "ok", origin: "vertal_chat" },
  });
  assertEquals(st.handoff, { chatConversationId: CHAT_ID, goal: "landing page", status: "running", lastSummary: "ok", origin: "vertal_chat" });
  // compact (antes de gravar) também mantém
  assertEquals(compactAgentState(st).handoff?.goal, "landing page");
});

Deno.test("normalizeAgentState sem handoff não inventa o campo", () => {
  assertEquals("handoff" in normalizeAgentState({}), false);
  assertEquals("handoff" in normalizeAgentState({ handoff: { status: "nope", origin: "x" } }), false);
});

Deno.test("normalizeHandoff descarta campos inválidos e corta textos", () => {
  const h = normalizeHandoff({ chatConversationId: "not-a-uuid", goal: "  a   b ", status: "weird", origin: "vibe_code", lastSummary: "x".repeat(5000), extra: 1 });
  assertEquals(h?.chatConversationId, undefined);
  assertEquals(h?.goal, "a b");
  assertEquals(h?.status, undefined);
  assertEquals(h?.origin, "vibe_code");
  assertEquals(h?.lastSummary?.length, 1500);
  assert(!("extra" in (h ?? {})));
  assertEquals(normalizeHandoff(null), undefined);
  assertEquals(normalizeHandoff([1]), undefined);
});

Deno.test("parseHandoffNote: só action 'note', com algum campo válido", () => {
  assertEquals(parseHandoffNote({ action: "note", status: "done", lastSummary: "pronto" }), { status: "done", lastSummary: "pronto" });
  assertEquals(parseHandoffNote({ action: "delete", status: "done" }), null);
  assertEquals(parseHandoffNote({ action: "note" }), null);
  assertEquals(parseHandoffNote("note"), null);
});

Deno.test("mergeHandoff mantém o que o patch não traz", () => {
  const prev = { chatConversationId: CHAT_ID, goal: "g", status: "running" as const, origin: "vertal_chat" as const };
  const next = mergeHandoff(prev, { status: "done", lastSummary: "feito" }, "2026-11-18T00:00:00.000Z");
  assertEquals(next, { chatConversationId: CHAT_ID, goal: "g", status: "done", origin: "vertal_chat", lastSummary: "feito", updatedAt: "2026-11-18T00:00:00.000Z" });
});
