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

const READ = { scopes: ["read"] as const };
const READ_WRITE = { scopes: ["read", "write"] as const };

Deno.test("initialize negocia a versão e anuncia tools", async () => {
  const { db } = fakeDb([]);
  const r: any = await handleMessage({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } }, { db, userId: "u", ...READ_WRITE });
  assertEquals(r.result.protocolVersion, "2025-03-26");
  assert(r.result.capabilities.tools);
  const r2: any = await handleMessage({ jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1999-01-01" } }, { db, userId: "u", ...READ_WRITE });
  assertEquals(r2.result.protocolVersion, "2025-06-18");
});

Deno.test("notificação não tem resposta", async () => {
  const { db } = fakeDb([]);
  assertEquals(await handleMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, { db, userId: "u", ...READ_WRITE }), null);
});

Deno.test("tools/list com leitura e escrita expõe as 6 ferramentas", async () => {
  const { db } = fakeDb([]);
  const r: any = await handleMessage({ jsonrpc: "2.0", id: 3, method: "tools/list" }, { db, userId: "u", ...READ_WRITE });
  assertEquals(r.result.tools.map((t: any) => t.name).sort(), TOOLS.map((t) => t.name).sort());
  assertEquals(r.result.tools.length, 6);
});

Deno.test("chave só de leitura não vê ferramentas de escrita", async () => {
  const { db } = fakeDb([]);
  const r: any = await handleMessage({ jsonrpc: "2.0", id: 3, method: "tools/list" }, { db, userId: "u", ...READ });
  const names = r.result.tools.map((t: any) => t.name);
  assert(!names.includes("create_project"));
  assert(!names.includes("update_project"));
  assert(names.includes("list_projects"));
  assertEquals(names.length, 4);
});

Deno.test("chave só de leitura é recusada em ferramenta de escrita", async () => {
  const { db, calls } = fakeDb([]);
  const r: any = await handleMessage({ jsonrpc: "2.0", id: 8, method: "tools/call", params: { name: "create_project", arguments: { title: "X" } } }, { db, userId: "u", ...READ });
  assertEquals(r.result.isError, true);
  assert(r.result.content[0].text.includes("permissão de escrita"));
  assertEquals(calls.length, 0, "nenhuma consulta deve ser feita");
});

Deno.test("tools/call list_projects consulta projects com limite e o dono", async () => {
  const { db, calls } = fakeDb([{ id: "p1" }]);
  const r: any = await handleMessage({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "list_projects", arguments: { limit: 3 } } }, { db, userId: "user-1", ...READ });
  assertEquals(r.result.structuredContent.projects, [{ id: "p1" }]);
  assert(calls.includes("from(projects)"));
  assert(calls.some((c) => c === "limit([3])"));
  assert(calls.some((c) => c === `eq(${JSON.stringify(["user_id", "user-1"])})`));
});

Deno.test("update_project exige algum campo e filtra pelo dono", async () => {
  const { db } = fakeDb(null);
  const semCampos: any = await handleMessage({ jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "update_project", arguments: { projectId: "7b1e2d3c-4f5a-4b6c-8d7e-9f0a1b2c3d4e" } } }, { db, userId: "u", ...READ_WRITE });
  assertEquals(semCampos.result.isError, true);

  const { db: db2, calls } = fakeDb(null);
  const naoAchou: any = await handleMessage({ jsonrpc: "2.0", id: 10, method: "tools/call", params: { name: "update_project", arguments: { projectId: "7b1e2d3c-4f5a-4b6c-8d7e-9f0a1b2c3d4e", title: "Novo" } } }, { db: db2, userId: "u", ...READ_WRITE });
  assertEquals(naoAchou.result.isError, true);
  assert(calls.some((c) => c === `eq(${JSON.stringify(["user_id", "u"])})`));
});

Deno.test("entrada inválida vira isError, não exceção", async () => {
  const { db } = fakeDb(null);
  const r: any = await handleMessage({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "get_project", arguments: { projectId: "x" } } }, { db, userId: "u", ...READ_WRITE });
  assertEquals(r.result.isError, true);
  const bad: any = await handleMessage({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "nope" } }, { db, userId: "u", ...READ_WRITE });
  assertEquals(bad.error.code, -32602);
  const unknown: any = await handleMessage({ jsonrpc: "2.0", id: 7, method: "resources/list" }, { db, userId: "u", ...READ_WRITE });
  assertEquals(unknown.error.code, -32601);
});
