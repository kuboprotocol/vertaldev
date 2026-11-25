// Testes Deno das regras puras do Vertal CRM (o Vitest cobre o resto, inclusive o handler).
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { computeMetrics, CRM_AI_COST, CRM_SYNC_ACTIVATE_COST, CRM_SYNC_AI_RUN_COST, defaultStages, isCrmEnabled, isSafeWebhookUrl, sanitizeSearchFilter } from "./core.ts";
import { hashApiKey } from "./handler.ts";

const U = "5441b397-7be8-44fc-87e8-8057fdb79a0e";

Deno.test("crm: liga só com a flag e a allowlist", () => {
  assert(isCrmEnabled({ VERTAL_CRM_ENABLED: "true", VERTAL_CRM_USER_IDS: U }, U));
  assert(!isCrmEnabled({ VERTAL_CRM_ENABLED: "true", VERTAL_CRM_USER_IDS: "" }, U));
  assertEquals([CRM_AI_COST, CRM_SYNC_ACTIVATE_COST, CRM_SYNC_AI_RUN_COST], [1, 4, 2]);
});

Deno.test("crm: métricas, busca e webhook", async () => {
  const m = computeMetrics([{ pipeline_id: "p", stage: "proposta", amount: 100 }], [{ id: "p", name: "V", stages: defaultStages("pt") }]);
  assertEquals(m.weightedForecast, 50);
  assertEquals(sanitizeSearchFilter({ entity: "deals", deal_status: "won" }), { entity: "deals", deal_status: "won" });
  assert(!isSafeWebhookUrl("https://127.0.0.1/x"));
  assertEquals((await hashApiKey("vcrm_x")).length, 64);
});
