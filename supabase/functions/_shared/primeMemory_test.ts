import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { extractMemories, formatMemoriesForPrompt, MAX_MEMORY_CONTEXT_CHARS } from "./primeMemory.ts";

Deno.test("extrai preferência de design do usuário", () => {
  const m = extractMemories("Sempre utilize um layout minimalista. Crie a tela de login.", false);
  assertEquals(m, [{ scope: "user", kind: "design", content: "Sempre utilize um layout minimalista." }]);
});

Deno.test("extrai integração do projeto quando há projeto", () => {
  const m = extractMemories("Este projeto usa Supabase para autenticação.", true);
  assertEquals(m[0].scope, "project");
  assertEquals(m[0].kind, "integration");
});

Deno.test("sem projeto, a memória vira do usuário", () => {
  const m = extractMemories("Este projeto usa Supabase para autenticação.", false);
  assertEquals(m[0].scope, "user");
});

Deno.test("restrição: nunca use", () => {
  const m = extractMemories("Nunca use jQuery nesse código.", false);
  assertEquals(m[0].kind, "constraint");
});

Deno.test("pedido comum não gera memória", () => {
  assertEquals(extractMemories("Mude a cor do botão de login para azul.", true), []);
  assertEquals(extractMemories("oi", true), []);
});

Deno.test("no máximo 5 memórias por pedido, sem duplicadas", () => {
  const text = Array.from({ length: 10 }, (_, i) => `Sempre use o padrão ${i} no código.`).join(" ");
  assertEquals(extractMemories(text, false).length, 5);
  assertEquals(extractMemories("Prefiro tema escuro. Prefiro tema escuro.", false).length, 1);
});

Deno.test("formatMemoriesForPrompt: vazio sem memórias, restrições primeiro, com limite", () => {
  assertEquals(formatMemoriesForPrompt([]), "");
  const out = formatMemoriesForPrompt([
    { scope: "user", kind: "design", content: "Prefiro layout minimalista." },
    { scope: "project", kind: "constraint", content: "Nunca use jQuery." },
  ]);
  assert(out.indexOf("Nunca use jQuery") < out.indexOf("layout minimalista"));
  assert(out.includes("[Projeto · Restrição]"));
  const many = Array.from({ length: 50 }, (_, i) => ({ scope: "user" as const, kind: "note" as const, content: "x".repeat(200) + i }));
  assert(formatMemoriesForPrompt(many).length < MAX_MEMORY_CONTEXT_CHARS + 300);
});
