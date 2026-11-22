// Testes Deno do núcleo do Huginn (mesmo módulo que o creative-router usa).
import { assert, assertEquals } from "jsr:@std/assert@1";
import { extractCsrfToken, normalizeHuginnUrl, normalizeScenario, parseHuginnOp, redactOptions, runHuginnOp } from "./huginnCore.ts";
import { isFlowWebhookUrl } from "./huginnBridge.ts";

Deno.test("parseHuginnOp valida e recusa ShellCommandAgent", () => {
  assertEquals(parseHuginnOp({ op: "get_agent", agent_id: "4" }), { op: "get_agent", agent_id: 4 });
  assertEquals(parseHuginnOp({ op: "create_agent", type: "ShellCommandAgent", name: "x", options: {} }), null);
  assertEquals(parseHuginnOp({ op: "nope" }), null);
});

Deno.test("utilitários", () => {
  assertEquals(normalizeHuginnUrl("https://h.example.com/agents/"), "https://h.example.com");
  assertEquals(normalizeHuginnUrl("http://h.example.com"), null);
  assertEquals(extractCsrfToken('<meta name="csrf-token" content="t-1" />'), "t-1");
  assertEquals(redactOptions({ api_key: "k", a: 1 }), { api_key: "[oculto]", a: 1 });
  const s = normalizeScenario({ name: "C", agents: [{ type: "ManualEventAgent" }] });
  assert(typeof s.guid === "string" && (s.agents as Array<Record<string, unknown>>)[0].disabled === false);
  assert(isFlowWebhookUrl("https://a.example.com/webhooks/flows/11111111-1111-4111-8111-111111111111", "11111111-1111-4111-8111-111111111111"));
});

Deno.test("login recusado não lança e não vaza a senha", async () => {
  const html = '<meta name="csrf-token" content="tok-abc" />';
  const fetch = (url: string, init: { method: string }) => {
    const ok = url.endsWith("/users/sign_in") && init.method === "GET";
    return Promise.resolve({
      status: ok ? 200 : 422, ok,
      headers: { get: () => null, getSetCookie: () => ["_rails_session=abcdefgh123; path=/"] },
      text: () => Promise.resolve(html),
    });
  };
  const r = await runHuginnOp({ op: "status" }, { url: "https://h.example.com", username: "u", password: "senha-secreta" }, { fetch });
  assertEquals(r.ok, false);
  assert(!JSON.stringify(r).includes("senha-secreta"));
  if (!r.ok) assertEquals(r.code, "auth_failed");
});
