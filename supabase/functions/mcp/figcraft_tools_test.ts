// Testes das ferramentas de design do figCraft no servidor MCP (banco e storage falsos).
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { handleMessage, toolsForScopes, type Scope } from "./server.ts";

type Call = { table?: string; op: string; args: unknown[] };

/** Builder mínimo do supabase-js: registra as chamadas e resolve para `result`. */
function builder(calls: Call[], table: string, result: { data: unknown; error: null | { message: string } }) {
  const chain: Record<string, unknown> = {};
  for (const op of ["select", "eq", "order", "limit", "insert", "update", "delete"]) {
    chain[op] = (...args: unknown[]) => {
      calls.push({ table, op, args });
      return chain;
    };
  }
  chain.maybeSingle = () => Promise.resolve(result);
  chain.single = () => Promise.resolve(result);
  chain.then = (ok: (v: unknown) => unknown) => Promise.resolve(result).then(ok);
  return chain;
}

function fakeCtx(scopes: Scope[], row: Record<string, unknown> | null = null) {
  const calls: Call[] = [];
  const db = {
    from: (table: string) => builder(calls, table, { data: table === "design_files" && row ? row : null, error: null }),
    storage: {
      from: (bucket: string) => ({
        upload: (path: string, bytes: Uint8Array, opts: unknown) => {
          calls.push({ table: bucket, op: "upload", args: [path, bytes.byteLength, opts] });
          return Promise.resolve({ data: { path }, error: null });
        },
        remove: (paths: string[]) => {
          calls.push({ table: bucket, op: "remove", args: [paths] });
          return Promise.resolve({ data: [], error: null });
        },
        createSignedUrl: (path: string, secs: number) => {
          calls.push({ table: bucket, op: "createSignedUrl", args: [path, secs] });
          return Promise.resolve({ data: { signedUrl: `https://x.test/${path}?t=1` }, error: null });
        },
      }),
    },
  };
  return { ctx: { db: db as never, userId: "user-1", scopes }, calls };
}

const call = (name: string, args: Record<string, unknown>, id = 1) => ({
  jsonrpc: "2.0",
  id,
  method: "tools/call",
  params: { name, arguments: args },
});

const textOf = (reply: any) => reply.result.content[0].text as string;

Deno.test("chave só de leitura não vê as ferramentas de escrita do figCraft", () => {
  const names = toolsForScopes(["read"]).map((t) => t.name);
  assert(names.includes("list_design_files"));
  assert(names.includes("get_design_file"));
  assert(!names.includes("create_design_file"));
  assert(!names.includes("update_design_file"));
});

Deno.test("create_design_file com modelo grava o arquivo e a linha", async () => {
  const { ctx, calls } = fakeCtx(["read", "write"]);
  const reply: any = await handleMessage(call("create_design_file", { title: "Painel da loja", template: "dashboard" }) as any, ctx);
  assert(!reply.result.isError, textOf(reply));
  const upload = calls.find((c) => c.op === "upload");
  assert(upload, "faltou o upload");
  assertStringIncludes(upload.args[0] as string, "user-1/");
  assert((upload.args[1] as number) > 1000, "o modelo dashboard tem bytes");
  const insert = calls.find((c) => c.table === "design_files" && c.op === "insert");
  assertEquals((insert!.args[0] as any).title, "Painel da loja");
  assertEquals((insert!.args[0] as any).user_id, "user-1");
});

Deno.test("create_design_file recusa modelo e base64 juntos, e base64 inválido", async () => {
  const { ctx } = fakeCtx(["read", "write"]);
  const both: any = await handleMessage(call("create_design_file", { title: "A", template: "dashboard", base64: "AAAA" }) as any, ctx);
  assertEquals(both.result.isError, true);
  assertStringIncludes(textOf(both), "um dos dois");
  const bad: any = await handleMessage(call("create_design_file", { title: "B", base64: "não é base64" }) as any, ctx);
  assertEquals(bad.result.isError, true);
  assertStringIncludes(textOf(bad), "base64");
});

Deno.test("update_design_file só com título não mexe no arquivo", async () => {
  const row = { id: "3f2c1a9e-7b44-4c1d-9a8e-112233445566", title: "Velho", engine: "figcraft", size_bytes: 9, created_at: "x", updated_at: "y", file_path: "user-1/3f2c.figcraft" };
  const { ctx, calls } = fakeCtx(["read", "write"], row);
  const reply: any = await handleMessage(call("update_design_file", { designId: row.id, title: "Novo nome" }) as any, ctx);
  assert(!reply.result.isError, textOf(reply));
  assertEquals(calls.filter((c) => c.op === "upload").length, 0);
  const update = calls.find((c) => c.table === "design_files" && c.op === "update");
  assertEquals((update!.args[0] as any).title, "Novo nome");
});

Deno.test("get_design_file devolve link temporário do arquivo do dono", async () => {
  const row = { id: "3f2c1a9e-7b44-4c1d-9a8e-112233445566", title: "Cartão", engine: "figcraft", size_bytes: 9, created_at: "x", updated_at: "y", file_path: "user-1/3f2c.figcraft" };
  const { ctx, calls } = fakeCtx(["read"], row);
  const reply: any = await handleMessage(call("get_design_file", { designId: row.id }) as any, ctx);
  assert(!reply.result.isError, textOf(reply));
  const body = JSON.parse(textOf(reply));
  assertEquals(body.expiresInSeconds, 900);
  assertStringIncludes(body.downloadUrl, "user-1/3f2c.figcraft");
  assert(!("file_path" in body.design), "não expõe o caminho interno");
  assert(calls.some((c) => c.op === "createSignedUrl"));
});
