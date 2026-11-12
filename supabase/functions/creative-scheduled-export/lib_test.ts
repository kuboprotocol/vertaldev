// Run with: deno test supabase/functions/creative-scheduled-export/lib_test.ts
import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildEmail, isValidEmail, normalizeFormat, periodFor, serialize, toCsv } from "./lib.ts";

Deno.test("isValidEmail aceita e-mails comuns e rejeita injeção de cabeçalho/HTML", () => {
  assert(isValidEmail("ana@kubovibe.dev"));
  assert(!isValidEmail("ana@kubovibe"));
  assert(!isValidEmail("a@b.com\r\nBcc: x@y.com"));
  assert(!isValidEmail("<script>@x.com"));
  assert(!isValidEmail(undefined));
});

Deno.test("normalizeFormat cai para json", () => {
  assertEquals(normalizeFormat("csv"), "csv");
  assertEquals(normalizeFormat("xml"), "json");
});

Deno.test("periodFor usa last_run quando existe e o intervalo como fallback", () => {
  const now = new Date("2026-10-16T12:00:00Z");
  assertEquals(periodFor("2026-10-10T09:00:00Z", 7, now), {
    start: "2026-10-10T09:00:00.000Z", end: "2026-10-16T12:00:00.000Z",
  });
  assertEquals(periodFor(null, 3, now).start, "2026-10-13T12:00:00.000Z");
  // intervalo fora dos limites é limitado a 1..90 dias
  assertEquals(periodFor(null, 0, now).start, "2026-10-15T12:00:00.000Z");
  // last_run no futuro (relógio) não gera janela invertida
  assertEquals(periodFor("2027-01-01T00:00:00Z", 7, now).start, "2026-10-09T12:00:00.000Z");
});

Deno.test("toCsv escapa aspas, vírgulas e neutraliza fórmulas", () => {
  const csv = toCsv([{ id: "1", event_type: "=HYPERLINK(\"x\")", tool: "a,b", metadata: { k: 1 } }]);
  const [header, line] = csv.split("\n");
  assertEquals(header, "id,created_at,event_type,tool,asset_id,idempotency_key,metadata");
  assertStringIncludes(line, `"'=HYPERLINK(""x"")"`);
  assertStringIncludes(line, `"a,b"`);
  assertStringIncludes(line, `"{""k"":1}"`);
});

Deno.test("serialize escolhe content-type pelo formato", () => {
  assertEquals(serialize([], "csv").contentType, "text/csv; charset=utf-8");
  assertEquals(serialize([{ a: 1 }], "json").body, '[\n  {\n    "a": 1\n  }\n]');
});

Deno.test("buildEmail escapa a URL no HTML", () => {
  const { html, text } = buildEmail({
    count: 2, url: 'https://x.dev/f?a=1&b="2"', start: "2026-10-01T00:00:00Z", end: "2026-10-08T00:00:00Z", format: "csv",
  });
  assertStringIncludes(html, "a=1&amp;b=&quot;2&quot;");
  assertStringIncludes(text, "2 eventos");
});
