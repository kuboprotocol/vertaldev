// Testes Deno das regras puras do Vertal Growth Team (o Vitest cobre o resto).
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  autopilotRequestOk, GROWTH_LAUNCH_COST, growthSendGate, inferBusinessModel, isGrowthEnabled, planTeam,
} from "./core.ts";

const U = "5441b397-7be8-44fc-87e8-8057fdb79a0e";

Deno.test("growth: liga só com a flag e a allowlist do Prospector", () => {
  const on = { VERTAL_GROWTH_TEAM_ENABLED: "true", VERTAL_PROSPECTOR_ENABLED: "true", VERTAL_PROSPECTOR_USER_IDS: U };
  assert(isGrowthEnabled(on, U));
  assert(!isGrowthEnabled({ ...on, VERTAL_PROSPECTOR_USER_IDS: "" }, U));
  assertEquals(GROWTH_LAUNCH_COST, 20);
});

Deno.test("growth: modelo, equipe e portão", () => {
  assertEquals(inferBusinessModel("ONG sem fins lucrativos, faça uma doação, doe agora, voluntário").model, "nonprofit");
  assertEquals(planTeam(["todoist"], "pt").presets.length, 4);
  assert(!autopilotRequestOk({ enabled: true }));
  const g = growthSendGate({ status: "draft", kind: "checkin", subject: "Oi", body: "Tudo bem?", to: "a@b.com", emailStatus: "verified", contactStatus: "active", blocked: false, sentToday: 0, cap: 20 });
  assert(g.includes("mensagem não aprovada"));
});
