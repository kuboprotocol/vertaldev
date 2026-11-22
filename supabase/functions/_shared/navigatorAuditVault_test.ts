// Cofre da auditoria do Navigator no runtime das edge functions (Deno):
// cifra/decifra com AAD, fallback de chave e logs redigidos.
import { assert, assertEquals, assertFalse } from "jsr:@std/assert@1";
import { auditWriteKey, openAuditDetail, sealAuditDetail } from "./navigatorAuditVault.ts";
import { redactForLog } from "./logRedact.ts";
import { looksLikeCredentials } from "./navigatorCore.ts";

const KEY = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
const USER = "11111111-1111-4111-8111-111111111111";

Deno.test("auditoria: tarefa cifrada, só dono+tipo abre", async () => {
  const env = { NAVIGATOR_AUDIT_KEY: KEY };
  const sealed = await sealAuditDetail(auditWriteKey(env), USER, "task", { task: "ver extrato", url: "https://b.com/l?t=1" });
  assertEquals(sealed.detail, {});
  assertFalse(JSON.stringify(sealed).includes("extrato"));
  assertEquals(await openAuditDetail(env, { ...sealed, user_id: USER, kind: "task" }), { task: "ver extrato", url: "https://b.com/l" });
  assertEquals(await openAuditDetail(env, { ...sealed, user_id: "x", kind: "task" }), { sealed: true });
});

Deno.test("auditoria: fallback NAVIGATOR_ENC_KEY grava key_version 0", async () => {
  const sealed = await sealAuditDetail(auditWriteKey({ NAVIGATOR_ENC_KEY: KEY }), USER, "secret_used", { name: "GMAIL_PASSWORD" });
  assertEquals(sealed.key_version, 0);
  assertEquals(await openAuditDetail({ CONNECTOR_ENC_KEY: KEY }, { ...sealed, user_id: USER, kind: "secret_used" }), { name: "GMAIL_PASSWORD" });
});

Deno.test("logs e tarefa: senha com qualquer valor é detectada e some do log", () => {
  assert(looksLikeCredentials("senha: x"));
  assertFalse(looksLikeCredentials("trocar minha senha"));
  assertFalse(redactForLog("erro senha: x em https://a.com/p?code=9").includes("code=9"));
  assertFalse(redactForLog("erro senha: x").includes("senha: x"));
});
