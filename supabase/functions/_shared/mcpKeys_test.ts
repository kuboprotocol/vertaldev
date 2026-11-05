import { assert, assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  expiresAtFromDays,
  generateMcpKey,
  hasValidMcpKeyShape,
  hashMcpKey,
  isKeyActive,
  isMcpAccessKey,
  mcpKeyPrefix,
  normalizeScopes,
} from "./mcpKeys.ts";

Deno.test("chave gerada tem o formato vtl_mcp_ e passa na validação", () => {
  const key = generateMcpKey();
  assert(key.startsWith("vtl_mcp_"));
  assertEquals(key.length, 8 + 43);
  assert(hasValidMcpKeyShape(key));
  assert(isMcpAccessKey(key));
});

Deno.test("chaves geradas são diferentes", () => {
  assert(generateMcpKey() !== generateMcpKey());
});

Deno.test("JWT e lixo não são chaves de acesso", () => {
  assert(!isMcpAccessKey("eyJhbGciOi.payload.sig"));
  assert(!hasValidMcpKeyShape("vtl_mcp_curta"));
  assert(!hasValidMcpKeyShape("vtl_mcp_" + "a".repeat(43) + "!"));
});

Deno.test("hash SHA-256 é determinístico e não expõe a chave", async () => {
  const key = generateMcpKey();
  const h1 = await hashMcpKey(key);
  const h2 = await hashMcpKey(key);
  assertEquals(h1, h2);
  assertEquals(h1.length, 64);
  assert(!h1.includes(key));
  assert(h1 !== await hashMcpKey(key + "x"));
});

Deno.test("prefixo exibido não revela a chave inteira", () => {
  const key = generateMcpKey();
  assertEquals(mcpKeyPrefix(key), key.slice(0, 12));
  assert(mcpKeyPrefix(key).length < key.length);
});

Deno.test("write sempre inclui read; ordem e duplicatas são normalizadas", () => {
  assertEquals(normalizeScopes(["write"]), ["read", "write"]);
  assertEquals(normalizeScopes(["write", "read", "read"]), ["read", "write"]);
  assertEquals(normalizeScopes(["read"]), ["read"]);
});

Deno.test("escopo vazio ou desconhecido é recusado", () => {
  assertThrows(() => normalizeScopes([]));
  assertThrows(() => normalizeScopes(undefined));
  assertThrows(() => normalizeScopes(["admin"]));
  assertThrows(() => normalizeScopes("read"));
});

Deno.test("validade: sem prazo é null; com prazo é data futura", () => {
  assertEquals(expiresAtFromDays(null), null);
  const iso = expiresAtFromDays(30)!;
  assert(Date.parse(iso) > Date.now() + 29 * 24 * 60 * 60 * 1000);
});

Deno.test("chave revogada ou vencida não está ativa", () => {
  const agora = Date.parse("2026-11-05T12:00:00Z");
  assertEquals(isKeyActive({ revoked_at: null, expires_at: null }, agora), true);
  assertEquals(isKeyActive({ revoked_at: "2026-11-01T00:00:00Z", expires_at: null }, agora), false);
  assertEquals(isKeyActive({ revoked_at: null, expires_at: "2026-11-04T00:00:00Z" }, agora), false);
  assertEquals(isKeyActive({ revoked_at: null, expires_at: "2026-12-04T00:00:00Z" }, agora), true);
});
