import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  applyVertalAiToRequirements,
  buildVertalAiFiles,
  connectorAllowed,
  connectorEnvFrom,
  connectorScope,
  deactivateProjectConnector,
  detectAiNeeds,
  ensureProjectConnector,
  explicitlyAsksOtherProvider,
  formatVertalAiForPrompt,
  isVertalAiPath,
  loadConnectorConfig,
  matchProxyPath,
  originAllowed,
  projectEnvFromVault,
  proxyRouteAllowed,
  resolveVertalAiState,
  vaultNamesFor,
  VERTAL_AI_OFFER_PROMPT,
  VERTAL_AI_PATHS,
  vertalAiFilesFor,
  vertalAiPromptBlock,
  vertalAiSteps,
  withVertalAiHint,
  type ConnectorDeps,
  type ConnectorFeatures,
  type ConnectorKeyRow,
  type RequirementLike,
} from "@/lib/vertalAiConnector";
import { lintGeneratedFile } from "../../supabase/functions/_shared/vibeAgentCore";
import { buildAgentSystemPrompt, parseVibeCodeAction, VERTAL_AI_RULES } from "../../supabase/functions/_shared/chatAgent";
import { vibeCodeRequestBody } from "@/lib/chatAgent/vibeBridge";

const LAERCIO = "5441b397-7be8-44fc-87e8-8057fdb79a0e";
const OTHER = "11111111-2222-4333-8444-555555555555";
const PROJECT = "9b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5d";
const SUPA = "https://sccizjlpwezsgaxkclot.supabase.co";
const SUNKAI_PROMPT = "crie um app gerador de vídeo com IA chamado SunkAI";

const onEnv = (extra: Record<string, unknown> = {}) => ({
  SUPABASE_URL: SUPA,
  VERTAL_GPU_CONFIG: JSON.stringify({ VERTAL_AI_API_ENABLED: true, VERTAL_AI_CONNECTOR_ENABLED: true, VERTAL_AI_CONNECTOR_USER_IDS: [LAERCIO], ...extra }),
});
const ON = loadConnectorConfig(onEnv());
const OFF = loadConnectorConfig({ SUPABASE_URL: SUPA, VERTAL_GPU_CONFIG: JSON.stringify({ VERTAL_AI_API_ENABLED: true }) });

/** Banco em memória com as mesmas regras do /keys (limite de 10, uma chave inteira devolvida uma vez). */
function memoryDeps(opts: { failVault?: boolean; maxKeys?: number } = {}) {
  const keys: Array<{ id: string; owner: string; created_at: string; features: ConnectorFeatures; revoked: boolean; name: string; cap: number; rpm: number; key: string }> = [];
  const vault = new Map<string, string>();
  let n = 0;
  const calls: string[] = [];
  const deps: ConnectorDeps = {
    async findActiveKeys(owner, scope) {
      calls.push("find");
      await Promise.resolve();
      return keys
        .filter((k) => k.owner === owner && !k.revoked && k.features.connector?.project === scope)
        .map((k): ConnectorKeyRow => ({ id: k.id, created_at: k.created_at, features: k.features }));
    },
    async createKey(owner, input, features) {
      calls.push("create");
      await Promise.resolve();
      if (keys.filter((k) => k.owner === owner && !k.revoked).length >= (opts.maxKeys ?? 10)) throw new Error("Limite de 10 chaves ativas.");
      n += 1;
      const id = `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
      const key = `vtl_ai_${"x".repeat(42)}${n}`;
      keys.push({ id, owner, created_at: `2026-11-28T00:00:${String(n).padStart(2, "0")}Z`, features, revoked: false, name: input.name, cap: input.monthlyCapCredits, rpm: input.rpm, key });
      return { id, key };
    },
    async revokeKey(_o, id) {
      calls.push("revoke");
      const k = keys.find((x) => x.id === id);
      if (k) k.revoked = true;
    },
    async setFeatures(_o, id, f) {
      const k = keys.find((x) => x.id === id);
      if (k) k.features = f;
    },
    async putSecret(owner, s) {
      calls.push("put");
      if (opts.failVault) throw new Error("vault down");
      vault.set(`${owner}:${s.envKey}`, s.value);
    },
    async hasSecret(owner, envKey) {
      return vault.has(`${owner}:${envKey}`);
    },
    async deleteSecret(owner, envKey) {
      vault.delete(`${owner}:${envKey}`);
    },
    newRef: () => `vapp_${"a".repeat(23)}${n}`,
  };
  return { deps, keys, vault, calls, active: () => keys.filter((k) => !k.revoked) };
}

describe("configuração e flag", () => {
  it("desligado por padrão; ligado sem lista = só a allowlist de teste (Laércio)", () => {
    expect(loadConnectorConfig({}).enabled).toBe(false);
    expect(connectorAllowed(loadConnectorConfig({}), LAERCIO)).toBe(false);
    expect(connectorAllowed(OFF, LAERCIO)).toBe(false);
    const noList = loadConnectorConfig({ SUPABASE_URL: SUPA, VERTAL_AI_API_ENABLED: "true", VERTAL_AI_CONNECTOR_ENABLED: "true" });
    expect(connectorAllowed(noList, LAERCIO)).toBe(true);
    expect(connectorAllowed(noList, OTHER)).toBe(false);
    const all = loadConnectorConfig({ SUPABASE_URL: SUPA, VERTAL_AI_API_ENABLED: "true", VERTAL_AI_CONNECTOR_ENABLED: "true", VERTAL_AI_CONNECTOR_USER_IDS: "*" });
    expect(connectorAllowed(all, OTHER)).toBe(true);
  });

  it("lê do VERTAL_GPU_CONFIG, libera só a allowlist e exige a API no ar", () => {
    expect(connectorAllowed(ON, LAERCIO)).toBe(true);
    expect(connectorAllowed(ON, OTHER)).toBe(false);
    const noApi = loadConnectorConfig({ SUPABASE_URL: SUPA, VERTAL_GPU_CONFIG: JSON.stringify({ VERTAL_AI_CONNECTOR_ENABLED: true, VERTAL_AI_CONNECTOR_USER_IDS: LAERCIO }) });
    expect(connectorAllowed(noApi, LAERCIO)).toBe(false);
    expect(ON.baseUrl).toBe(`${SUPA}/functions/v1/vertal-ai-api`);
    expect(ON.monthlyCapCredits).toBe(200);
    expect(ON.rpm).toBe(20);
    expect(loadConnectorConfig(onEnv({ VERTAL_AI_CONNECTOR_MONTHLY_CAP_CREDITS: 50, VERTAL_AI_CONNECTOR_RPM: 5 }))).toMatchObject({ monthlyCapCredits: 50, rpm: 5 });
  });

  it("segredo avulso vence o VERTAL_GPU_CONFIG", () => {
    const env = connectorEnvFrom({ VERTAL_AI_CONNECTOR_ENABLED: "false", VERTAL_GPU_CONFIG: JSON.stringify({ VERTAL_AI_CONNECTOR_ENABLED: true, OUTRA: "x" }) });
    expect(env.VERTAL_AI_CONNECTOR_ENABLED).toBe("false");
    expect(env.OUTRA).toBeUndefined();
  });
});

describe("escopo e Cofre", () => {
  it("um nome de variável por projeto (o Cofre é único por dono+variável)", () => {
    expect(connectorScope(PROJECT)).toBe(PROJECT);
    expect(connectorScope(undefined)).toBe("default");
    expect(connectorScope("../etc")).toBe("default");
    const a = vaultNamesFor(PROJECT);
    expect(a.apiKey).toBe("VERTAL_AI_API_KEY_P9B2C3D4E5F60");
    expect(a.baseUrl).toBe("VERTAL_AI_BASE_URL_P9B2C3D4E5F60");
    expect(a.apiKey).toMatch(/^[A-Z][A-Z0-9_]{1,63}$/);
    expect(a.boundTo).toMatch(/^[a-z0-9_-]{1,64}$/);
    expect(vaultNamesFor("default").apiKey).toBe("VERTAL_AI_API_KEY_PDEFAULT");
  });

  it("entrega ao app com os nomes sem sufixo (VERTAL_AI_API_KEY + VERTAL_AI_BASE_URL)", () => {
    const n = vaultNamesFor(PROJECT);
    expect(projectEnvFromVault(PROJECT, { [n.apiKey]: "k", [n.baseUrl]: "u", OUTRA: "z" })).toEqual({ VERTAL_AI_API_KEY: "k", VERTAL_AI_BASE_URL: "u" });
  });
});

describe("detecção de IA", () => {
  it("SunkAI: gerador de vídeo com IA → IA + vídeo", () => {
    expect(detectAiNeeds(SUNKAI_PROMPT)).toMatchObject({ any: true, video: true });
  });
  it("chatbot → texto; narração → voz; app sem IA → nada", () => {
    expect(detectAiNeeds("app com chatbot de atendimento")).toMatchObject({ any: true, text: true });
    expect(detectAiNeeds("app que gera narração com IA")).toMatchObject({ any: true, voice: true });
    expect(detectAiNeeds("crie uma landing page de padaria com formulário de contato").any).toBe(false);
  });
  it("pedido explícito de outro provedor é respeitado", () => {
    expect(explicitlyAsksOtherProvider("chatbot usando a API da OpenAI")).toBe(true);
    expect(explicitlyAsksOtherProvider(SUNKAI_PROMPT)).toBe(false);
  });
});

describe("estado por pedido", () => {
  const active = { keyId: "k1", ref: `vapp_${"b".repeat(24)}`, proxyUrl: `${SUPA}/functions/v1/vertal-ai-api/p/vapp_${"b".repeat(24)}`, video: true };
  it("flag off = off (comportamento atual)", () => {
    expect(resolveVertalAiState({ cfg: OFF, userId: LAERCIO, prompt: SUNKAI_PROMPT, active: null })).toEqual({ mode: "off" });
    expect(resolveVertalAiState({ cfg: ON, userId: OTHER, prompt: SUNKAI_PROMPT, active: null })).toEqual({ mode: "off" });
  });
  it("precisa de IA e não está ativo → oferta; ativo → active", () => {
    expect(resolveVertalAiState({ cfg: ON, userId: LAERCIO, prompt: SUNKAI_PROMPT, active: null }).mode).toBe("offer");
    expect(resolveVertalAiState({ cfg: ON, userId: LAERCIO, prompt: SUNKAI_PROMPT, active }).mode).toBe("active");
    expect(resolveVertalAiState({ cfg: ON, userId: LAERCIO, prompt: "landing page de padaria", active: null }).mode).toBe("off");
  });
});

describe("ativação idempotente da chave do projeto", () => {
  it("cria uma chave + 2 segredos; repetir não cria outra", async () => {
    const db = memoryDeps();
    const a = await ensureProjectConnector(db.deps, { cfg: ON, ownerId: LAERCIO, projectId: PROJECT, projectLabel: "SunkAI", needsVideo: true });
    expect(a).toMatchObject({ ok: true, created: true, video: true });
    expect(db.active()).toHaveLength(1);
    expect(db.active()[0]).toMatchObject({ cap: 200, rpm: 20, name: "Vertal AI · SunkAI" });
    expect(db.active()[0].features.connector).toMatchObject({ kind: "project", project: PROJECT });
    const n = vaultNamesFor(PROJECT);
    expect(db.vault.get(`${LAERCIO}:${n.apiKey}`)).toMatch(/^vtl_ai_/);
    expect(db.vault.get(`${LAERCIO}:${n.baseUrl}`)).toBe(`${SUPA}/functions/v1/vertal-ai-api`);

    const b = await ensureProjectConnector(db.deps, { cfg: ON, ownerId: LAERCIO, projectId: PROJECT });
    expect(b).toMatchObject({ ok: true, created: false });
    if (a.ok && b.ok) {
      expect(b.keyId).toBe(a.keyId);
      expect(b.proxyUrl).toBe(a.proxyUrl);
      expect(a.proxyUrl).not.toContain("vtl_ai_");
    }
    expect(db.keys).toHaveLength(1);
  });

  it("dois cliques ao mesmo tempo terminam com UMA chave ativa", async () => {
    const db = memoryDeps();
    const [a, b] = await Promise.all([
      ensureProjectConnector(db.deps, { cfg: ON, ownerId: LAERCIO, projectId: PROJECT }),
      ensureProjectConnector(db.deps, { cfg: ON, ownerId: LAERCIO, projectId: PROJECT }),
    ]);
    expect(a.ok && b.ok).toBe(true);
    expect(db.active()).toHaveLength(1);
    // O segredo guardado é o da chave que ficou ativa.
    expect(db.vault.get(`${LAERCIO}:${vaultNamesFor(PROJECT).apiKey}`)).toBe(db.active()[0].key);
  });

  it("projetos diferentes = chaves diferentes; outro dono não enxerga", async () => {
    const db = memoryDeps();
    await ensureProjectConnector(db.deps, { cfg: ON, ownerId: LAERCIO, projectId: PROJECT });
    await ensureProjectConnector(db.deps, { cfg: ON, ownerId: LAERCIO, projectId: null });
    expect(db.active()).toHaveLength(2);
    const other = await ensureProjectConnector(db.deps, { cfg: ON, ownerId: OTHER, projectId: PROJECT });
    expect(other).toMatchObject({ ok: false, status: 404 });
  });

  it("segredo apagado do Cofre → revoga a antiga e cria outra (a chave inteira não se recupera)", async () => {
    const db = memoryDeps();
    const a = await ensureProjectConnector(db.deps, { cfg: ON, ownerId: LAERCIO, projectId: PROJECT });
    db.vault.clear();
    const b = await ensureProjectConnector(db.deps, { cfg: ON, ownerId: LAERCIO, projectId: PROJECT });
    expect(b).toMatchObject({ ok: true, created: true });
    if (a.ok && b.ok) expect(b.keyId).not.toBe(a.keyId);
    expect(db.active()).toHaveLength(1);
  });

  it("revogada no /keys → próxima ativação cria outra", async () => {
    const db = memoryDeps();
    await ensureProjectConnector(db.deps, { cfg: ON, ownerId: LAERCIO, projectId: PROJECT });
    db.keys[0].revoked = true;
    const b = await ensureProjectConnector(db.deps, { cfg: ON, ownerId: LAERCIO, projectId: PROJECT });
    expect(b).toMatchObject({ ok: true, created: true });
    expect(db.active()).toHaveLength(1);
  });

  it("Cofre fora do ar → a chave recém-criada é revogada", async () => {
    const db = memoryDeps({ failVault: true });
    const r = await ensureProjectConnector(db.deps, { cfg: ON, ownerId: LAERCIO, projectId: PROJECT });
    expect(r).toMatchObject({ ok: false, code: "vault_unavailable" });
    expect(db.active()).toHaveLength(0);
  });

  it("limite de 10 chaves do /keys vale para o conector", async () => {
    const db = memoryDeps({ maxKeys: 0 });
    const r = await ensureProjectConnector(db.deps, { cfg: ON, ownerId: LAERCIO, projectId: PROJECT });
    expect(r).toMatchObject({ ok: false, code: "key_limit" });
  });

  it("vídeo liberado depois, na mesma chave", async () => {
    const db = memoryDeps();
    await ensureProjectConnector(db.deps, { cfg: ON, ownerId: LAERCIO, projectId: PROJECT });
    expect(db.active()[0].features.video).toBeUndefined();
    const r = await ensureProjectConnector(db.deps, { cfg: ON, ownerId: LAERCIO, projectId: PROJECT, needsVideo: true });
    expect(r).toMatchObject({ ok: true, created: false, video: true });
    expect(db.keys).toHaveLength(1);
  });

  it("flag off: nenhuma chamada ao banco", async () => {
    const db = memoryDeps();
    const r = await ensureProjectConnector(db.deps, { cfg: OFF, ownerId: LAERCIO, projectId: PROJECT });
    expect(r).toMatchObject({ ok: false, code: "connector_disabled" });
    expect(db.calls).toEqual([]);
  });

  it("desativar revoga e limpa o Cofre", async () => {
    const db = memoryDeps();
    await ensureProjectConnector(db.deps, { cfg: ON, ownerId: LAERCIO, projectId: PROJECT });
    expect(await deactivateProjectConnector(db.deps, { ownerId: LAERCIO, projectId: PROJECT })).toEqual({ revoked: 1 });
    expect(db.active()).toHaveLength(0);
    expect(db.vault.size).toBe(0);
  });
});

describe("arquivos do app (chave nunca no navegador)", () => {
  const proxyUrl = `${SUPA}/functions/v1/vertal-ai-api/p/vapp_${"c".repeat(24)}`;
  const files = buildVertalAiFiles({ proxyUrl });

  it("helper do navegador fala com o proxy e chama /v1/videos/generations", () => {
    const client = files.find((f) => f.path === VERTAL_AI_PATHS.client)!;
    expect(client.content).toContain(JSON.stringify(proxyUrl));
    expect(client.content).toContain("/v1/videos/generations");
    expect(client.content).toContain("/v1/chat/completions");
    expect(client.content).toContain('model: "vertal-code-ai"');
    expect(client.content).not.toMatch(/vtl_ai_|Authorization|VERTAL_AI_API_KEY|openai\.com|api\.anthropic/i);
  });

  it("proxy de servidor lê a chave do ambiente do servidor", () => {
    const server = files.find((f) => f.path === VERTAL_AI_PATHS.server)!;
    expect(server.content).toContain('Deno.env.get("VERTAL_AI_API_KEY")');
    expect(server.content).toContain('Deno.env.get("VERTAL_AI_BASE_URL")');
  });

  it("passa no lint do agente e compila", () => {
    for (const f of files) {
      expect(lintGeneratedFile(f.path, f.content)).toEqual([]);
      const out = ts.transpileModule(f.content, { reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext } });
      expect(out.diagnostics ?? []).toEqual([]);
    }
    expect(isVertalAiPath("src/lib/vertalAi.ts")).toBe(true);
    expect(isVertalAiPath("./supabase/functions/vertal-ai/index.ts")).toBe(true);
    expect(isVertalAiPath("src/lib/other.ts")).toBe(false);
  });
});

describe("prompts: Vertal AI por padrão, sem variáveis à mão, sem outros provedores", () => {
  const state = resolveVertalAiState({ cfg: ON, userId: LAERCIO, prompt: SUNKAI_PROMPT, active: { keyId: "k", ref: `vapp_${"d".repeat(24)}`, proxyUrl: "https://x/p/r", video: true } });

  it("ativo: usa o helper, gera vídeo, proíbe variáveis e outros provedores", () => {
    if (state.mode !== "active") throw new Error("esperava active");
    const p = formatVertalAiForPrompt(state);
    expect(p).toContain(VERTAL_AI_PATHS.client);
    expect(p).toContain("generateVideo");
    expect(p).toContain("/v1/videos/generations");
    expect(p).toMatch(/nunca peça variáveis de ambiente/i);
    expect(p).toMatch(/nunca leia OPENAI_API_KEY/i);
  });

  it("oferta: não integra outro provedor nem pede chaves", () => {
    expect(VERTAL_AI_OFFER_PROMPT).toMatch(/SEM integrar outro provedor/);
    expect(VERTAL_AI_OFFER_PROMPT).toMatch(/não peça ao Dev para criar variáveis/);
  });

  it("Vertal Chat: regra só entra com a flag; aceite vira vertal_ai no Vibe Code", () => {
    const base = { secretNames: [], today: "2026-11-28" };
    expect(buildAgentSystemPrompt(base)).not.toContain(VERTAL_AI_RULES);
    expect(buildAgentSystemPrompt({ ...base, vertalAi: true })).toContain(VERTAL_AI_RULES);
    const a = parseVibeCodeAction({ op: "start", prompt: SUNKAI_PROMPT, vertal_ai: true });
    expect(a).toMatchObject({ tool: "vibe_code", vertalAi: true });
    expect(vibeCodeRequestBody(a!)).toMatchObject({ vertalAi: { enabled: true }, mode: "preview" });
    const plain = parseVibeCodeAction({ op: "start", prompt: SUNKAI_PROMPT });
    expect(plain).toEqual({ tool: "vibe_code", op: "start", prompt: SUNKAI_PROMPT });
    expect(vibeCodeRequestBody(plain!)).not.toHaveProperty("vertalAi");
  });

  it("VERTAL Code AI: dica anexada só com a flag + pedido de IA", () => {
    expect(withVertalAiHint(SUNKAI_PROMPT, OFF, LAERCIO)).toBe(SUNKAI_PROMPT);
    expect(withVertalAiHint(SUNKAI_PROMPT, ON, OTHER)).toBe(SUNKAI_PROMPT);
    expect(withVertalAiHint("arrume o CSS do header", ON, LAERCIO)).toBe("arrume o CSS do header");
    expect(withVertalAiHint(SUNKAI_PROMPT, ON, LAERCIO)).toContain("Vertal AI");
  });
});

describe("requisitos", () => {
  const req = (slug: string, secrets: string[], label = slug): RequirementLike => ({ slug, label, kind: "api", description: "", reason: "", secrets, builtin: false, status: "needed" });
  const reqs = [req("custom:openai", ["OPENAI_API_KEY"], "OpenAI"), req("resend", ["RESEND_API_KEY"]), req("ai-gateway", [])];

  it("off devolve a mesma lista (mesma referência)", () => {
    expect(applyVertalAiToRequirements(reqs, { mode: "off" }, SUNKAI_PROMPT)).toBe(reqs);
  });
  it("ativo: tira chaves de outros provedores de IA e mostra Vertal AI conectada", () => {
    const s = resolveVertalAiState({ cfg: ON, userId: LAERCIO, prompt: SUNKAI_PROMPT, active: { keyId: "k", ref: `vapp_${"e".repeat(24)}`, proxyUrl: "https://x", video: true } });
    const out = applyVertalAiToRequirements(reqs, s, SUNKAI_PROMPT);
    expect(out.map((r) => r.slug)).toEqual(["vertal-ai", "resend"]);
    expect(out[0]).toMatchObject({ status: "connected", label: "Vertal AI" });
  });
  it("Dev pediu OpenAI explicitamente: mantém", () => {
    const p = "chatbot usando a API da OpenAI";
    const s = resolveVertalAiState({ cfg: ON, userId: LAERCIO, prompt: p, active: { keyId: "k", ref: `vapp_${"e".repeat(24)}`, proxyUrl: "https://x", video: false } });
    expect(applyVertalAiToRequirements(reqs, s, p).some((r) => r.slug === "custom:openai")).toBe(true);
  });
});

describe("proxy do projeto", () => {
  it("só rotas de app; nada de gestão de chaves nem criação de voz", () => {
    const ref = `vapp_${"f".repeat(24)}`;
    expect(matchProxyPath(`/functions/v1/vertal-ai-api/p/${ref}/v1/videos/generations`)).toEqual({ ref, path: "/v1/videos/generations" });
    expect(matchProxyPath("/functions/v1/vertal-ai-api/v1/chat/completions")).toBeNull();
    expect(proxyRouteAllowed("POST", "/v1/chat/completions")).toBe(true);
    expect(proxyRouteAllowed("POST", "/v1/videos/generations")).toBe(true);
    expect(proxyRouteAllowed("GET", "/v1/videos/abcdefghij123")).toBe(true);
    expect(proxyRouteAllowed("POST", "/v1/voices")).toBe(false);
    expect(proxyRouteAllowed("POST", "/v1/audio/sing")).toBe(false);
    expect(proxyRouteAllowed("POST", "/keys")).toBe(false);
  });
  it("origem: domínios do Vertal e localhost; outros recusados", () => {
    expect(originAllowed("https://sunkai.vertal.dev", ON.allowedOrigins)).toBe(true);
    expect(originAllowed("http://localhost:5173", ON.allowedOrigins)).toBe(true);
    expect(originAllowed("https://evil.example.com", ON.allowedOrigins)).toBe(false);
    expect(originAllowed("https://vertal.dev.evil.com", ON.allowedOrigins)).toBe(false);
    expect(originAllowed(null, ON.allowedOrigins)).toBe(true);
  });
});

describe("fluxo SunkAI ponta a ponta (sem rede)", () => {
  it("pedido → oferta → clique (ativação) → código chamando /v1/videos/generations", async () => {
    const db = memoryDeps();
    const s1 = resolveVertalAiState({ cfg: ON, userId: LAERCIO, prompt: SUNKAI_PROMPT, active: null });
    expect(s1.mode).toBe("offer");
    expect(vertalAiSteps(s1)[0]).toMatchObject({ kind: "vertal_ai", status: "skipped", vertalAi: { offer: true } });
    expect(vertalAiPromptBlock(s1)).toBe(VERTAL_AI_OFFER_PROMPT);

    const r = await ensureProjectConnector(db.deps, { cfg: ON, ownerId: LAERCIO, projectId: PROJECT, projectLabel: "SunkAI", needsVideo: true });
    if (r.ok === false) throw new Error(r.message);
    const s2 = resolveVertalAiState({ cfg: ON, userId: LAERCIO, prompt: SUNKAI_PROMPT, active: { keyId: r.keyId, ref: r.ref, proxyUrl: r.proxyUrl, video: r.video } });
    expect(s2.mode).toBe("active");
    const files = vertalAiFilesFor(s2);
    expect(files.map((f) => f.path)).toEqual([VERTAL_AI_PATHS.client, VERTAL_AI_PATHS.server]);
    expect(files[0].content).toContain("/v1/videos/generations");
    expect(files[0].content).toContain(r.proxyUrl);
    expect(vertalAiPromptBlock(s2)).toContain("generateVideo");
    expect(db.active()[0].features.video).toBe(true);
  });
});

describe("engine guard (vibe-code-agent)", () => {
  // A prova pelo git (só linhas novas do conector no motor) roda em src/test/vertal-code-ai-regression.test.ts
  // e no workflow "VERTAL Code AI guard" (scripts/vertal-code-ai/engine-guard.mjs, lista CONNECTOR_FLAGGED).

  it("flag off: prompt, arquivos, passos e requisitos idênticos ao comportamento atual", () => {
    const off = resolveVertalAiState({ cfg: OFF, userId: LAERCIO, prompt: SUNKAI_PROMPT, active: null });
    expect(off).toEqual({ mode: "off" });
    expect(vertalAiPromptBlock(off)).toBe("");
    expect(vertalAiFilesFor(off)).toEqual([]);
    expect(vertalAiSteps(off)).toEqual([]);
    const reqs: RequirementLike[] = [];
    expect(applyVertalAiToRequirements(reqs, off, SUNKAI_PROMPT)).toBe(reqs);
  });

  it("as únicas mudanças no motor são as listadas no PR e passam pelos helpers do conector", () => {
    const src = readFileSync(path.resolve(__dirname, "../../supabase/functions/vibe-code-agent/index.ts"), "utf8");
    const touched = src.split("\n").map((l) => l.trim()).filter((l) => !l.startsWith("//") && !l.startsWith("/**") && /vertalAi|VertalAi|vertal_ai/i.test(l));
    expect(touched).toEqual([
      "import { applyVertalAiToRequirements, isVertalAiPath, vertalAiFilesFor, vertalAiPromptBlock, vertalAiSteps } from \"../_shared/vertalAiConnector.ts\";",
      "import { vertalAiForRequest } from \"../_shared/vertalAiConnectorStore.ts\";",
      "import { vertalAiAwarenessFor } from \"../_shared/vertalAiChatStore.ts\"; // Vertal AI: conectores do Dev (só nomes/status)",
      "import { sanitizeVertalAiReply, vertalAiFixEnvNames } from \"../_shared/vertalAiChat.ts\"; // Vertal AI: nunca pedir chave/env à mão",
      "vertalAi?: unknown;",
      "const vertalAi = await vertalAiForRequest(admin, Deno.env.toObject(), { userId, projectId, prompt, request: body.vertalAi }).catch(() => ({ state: { mode: \"off\" as const } })); // Vertal AI",
      "for (const st of vertalAiSteps(vertalAi.state, vertalAi).filter((x) => x.status !== \"success\" || x.vertalAi.created)) send(st);",
      "const vertalAiAwareness = await vertalAiAwarenessFor(admin, Deno.env.toObject(), userId, projectId, connected).catch(() => \"\"); // Vertal AI: flag off → \"\" sem banco",
      "vertalAiPromptBlock(vertalAi.state) +",
      "vertalAiAwareness +",
      "if (vertalAi.state.mode === \"active\") for (const path of [...proposed.keys()]) if (isVertalAiPath(path)) proposed.delete(path);",
      "for (const f of vertalAiFilesFor(vertalAi.state)) proposed.set(f.path, { content: f.content, reason: f.reason }); // Vertal AI",
      "if (vertalAi.state.mode !== \"off\") for (const [p, f] of proposed) if (!isVertalAiPath(p)) proposed.set(p, { ...f, content: vertalAiFixEnvNames(f.content) }); // Vertal AI: VERTAL_API_KEY → VERTAL_AI_API_KEY",
      "for (const st of vertalAiSteps(vertalAi.state).filter((x) => x.status === \"success\" && !x.vertalAi.created)) send(st);",
      "if (vertalAi.state.mode !== \"off\") requirements.splice(0, requirements.length, ...applyVertalAiToRequirements(requirements, vertalAi.state, prompt));",
      "if (vertalAi.state.mode !== \"off\") replyText = sanitizeVertalAiReply(replyText, { mode: vertalAi.state.mode === \"active\" ? \"active\" : \"offer\" }); // Vertal AI: sem \"configure a chave/env\"",
    ]);
  });
});
