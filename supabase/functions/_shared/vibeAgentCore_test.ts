// Testes Deno do parseAgentTurn (Vibe Code Agent): JSON quebrado não derruba o loop.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseAgentTurn } from "./vibeAgentCore.ts";

Deno.test("parseAgentTurn: JSON válido e cercado continua igual", () => {
  const t = parseAgentTurn('Aqui vai:\n```json\n{"summary":"ok","actions":[{"type":"edit_file","path":"src/a.ts","content":"x"}],"title":"Login"}\n```');
  assertEquals(t.summary, "ok");
  assertEquals(t.actions, [{ type: "edit_file", path: "src/a.ts", content: "x" }]);
  assertEquals(t.title, "Login");
  assert(t.final);
  assert(!t.retry);
});

Deno.test("parseAgentTurn: vírgula sobrando é consertada", () => {
  const t = parseAgentTurn('{"summary":"x","actions":[{"type":"message","reason":"oi"},],}');
  assertEquals(t.parse, "repaired");
  assertEquals(t.actions, [{ type: "message", reason: "oi" }]);
  assert(!t.retry);
});

Deno.test("parseAgentTurn: sem JSON ou ilegível não lança, pede retry", () => {
  for (const raw of ["sem json", "{quebrado", "", "```json\n```"]) {
    const t = parseAgentTurn(raw);
    assertEquals(t.parse, "failed", raw);
    assert(t.retry, raw);
    assertEquals(t.actions, []);
    assert(!t.final);
  }
});

Deno.test("parseAgentTurn: edit_file cortado no meio é descartado, o resto fica", () => {
  const raw = '{"summary":"dois arquivos","actions":[' +
    '{"type":"edit_file","path":"src/a.ts","content":"export const a = 1;\\n"},' +
    '{"type":"edit_file","path":"src/b.ts","content":"export function b() {\\n  return';
  const t = parseAgentTurn(raw);
  assertEquals(t.parse, "truncated");
  assertEquals(t.actions.map((a) => a.path), ["src/a.ts"]);
  assert(!t.final);
  assert(!t.retry);
});

Deno.test("parseAgentTurn: cortado só com um edit_file pela metade pede retry", () => {
  const t = parseAgentTurn('{"summary":"x","actions":[{"type":"edit_file","path":"src/a.ts","content":"const a =');
  assertEquals(t.actions, []);
  assert(t.retry);
});

Deno.test("parseAgentTurn: cortado depois do array de ações mantém os edit_file completos", () => {
  const t = parseAgentTurn('{"summary":"x","actions":[{"type":"edit_file","path":"src/a.ts","content":"ok"}],"memories":[{"text":"pref');
  assertEquals(t.parse, "truncated");
  assertEquals(t.actions, [{ type: "edit_file", path: "src/a.ts", content: "ok" }]);
  assert(!t.retry);
});

Deno.test("parseAgentTurn: leitura cortada no fim não é edit_file e é mantida", () => {
  const t = parseAgentTurn('{"summary":"x","actions":[{"type":"read_file","path":"src/a.ts"');
  assertEquals(t.actions, [{ type: "read_file", path: "src/a.ts" }]);
  assert(!t.final);
  assert(!t.retry);
});
