import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleMessage, TOOLS } from "./server.ts";

// Banco falso: registra a consulta e devolve linhas fixas.
function fakeDb(rows: unknown) {
  const calls: string[] = [];
  const q: any = new Proxy({}, {
    get(_t, prop) {
      if (prop === "then") return (res: any) => res({ data: rows, error: null });
      return (...args: unknown[]) => { calls.push(`${String(prop)}(${JSON.stringify(args)})`); return q; };
    },
  });
  return { db: { from: (t: string) => { calls.push(`from(${t})`); return q; } }, calls };
}

Deno.test("initialize negocia a versão e anuncia tools", async () => {
  const { db } = fakeDb([]);
  const r: any = await handleMessage({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } }, { db, userId: "u" });
  assertEquals(r.result.protocolVersion, "2025-03-26");
  assert(r.result.capabilities.tools);
  const r2: any = await handleMessage({ jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1999-01-01" } }, { db, userId: "u" });
  assertEquals(r2.result.protocolVersion, "2025-06-18");
});

Deno.test("notificação não tem resposta", async () => {
  const { db } = fakeDb([]);
  assertEquals(await handleMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, { db, userId: "u" }), null);
});

Deno.test("tools/list expõe as 5 ferramentas", async () => {
  const { db } = fakeDb([]);
  const r: any = await handleMessage({ jsonrpc: "2.0", id: 3, method: "tools/list" }, { db, userId: "u" });
  assertEquals(r.result.tools.map((t: any) => t.name).sort(), TOOLS.map((t) => t.name).sort());
  assertEquals(r.result.tools.length, 5);
});

Deno.test("tools/call list_projects consulta projects com limite", async () => {
  const { db, calls } = fakeDb([{ id: "p1" }]);
  const r: any = await handleMessage({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "list_projects", arguments: { limit: 3 } } }, { db, userId: "u" });
  assertEquals(r.result.structuredContent.projects, [{ id: "p1" }]);
  assert(calls.includes("from(projects)"));
  assert(calls.some((c) => c === "limit([3])"));
});

Deno.test("entrada inválida vira isError, não exceção", async () => {
  const { db } = fakeDb(null);
  const r: any = await handleMessage({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "get_project", arguments: { projectId: "x" } } }, { db, userId: "u" });
  assertEquals(r.result.isError, true);
  const bad: any = await handleMessage({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "nope" } }, { db, userId: "u" });
  assertEquals(bad.error.code, -32602);
  const unknown: any = await handleMessage({ jsonrpc: "2.0", id: 7, method: "resources/list" }, { db, userId: "u" });
  assertEquals(unknown.error.code, -32601);
});
