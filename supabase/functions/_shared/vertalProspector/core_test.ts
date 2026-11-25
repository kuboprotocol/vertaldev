// Deno: as regras puras do Vertal Prospector rodam iguais no servidor.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyEmail, isProspectorEnabled, isValidCnpj, sendGate, waLink } from "./core.ts";

Deno.test("prospector desligado por padrão e só na lista", () => {
  assertEquals(isProspectorEnabled({}, "u"), false);
  assertEquals(isProspectorEnabled({ VERTAL_PROSPECTOR_ENABLED: "true" }, "u"), false);
  assertEquals(isProspectorEnabled({ VERTAL_PROSPECTOR_ENABLED: "true", VERTAL_PROSPECTOR_USER_IDS: "u" }, "u"), true);
});

Deno.test("portão recusa rascunho e palpite", () => {
  const base = { channel: "email" as const, kind: "first" as const, subject: "oi", body: "Olá, tudo bem por aí?", to: "a@b.com", blocked: false, sentToday: 0, cap: 20 };
  assert(sendGate({ ...base, status: "draft", emailStatus: "verified" }).includes("mensagem não aprovada"));
  assert(sendGate({ ...base, status: "approved", emailStatus: "guess" }).length > 0);
  assertEquals(sendGate({ ...base, status: "approved", emailStatus: "verified" }), []);
});

Deno.test("cnpj, e-mail e wa.me", () => {
  assert(isValidCnpj("65.822.139/0001-66"));
  assertEquals(classifyEmail({ email: "a@b.com", published: true, patternConfirmed: false, hasMx: true }), "verified");
  assertEquals(waLink("11 98888-7777", "oi"), "https://wa.me/5511988887777?text=oi");
});
