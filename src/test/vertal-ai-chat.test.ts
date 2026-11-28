// Conector Vertal AI no Vertal Chat + consciência de conectores (caso SunkAI, teste do Laércio 28/11 07:08).
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  applyVertalAiChat,
  explicitVertalAiIntent,
  formatDevConnectorsBlock,
  lastVibeConversationId,
  rewriteVertalAiActions,
  sanitizeVertalAiReply,
  vertalAiChatDecision,
  vertalAiFixEnvNames,
  wantsVertalAiApp,
  type DevConnectorsSnapshot,
} from "../../supabase/functions/_shared/vertalAiChat";
import { loadVertalAiChat, vertalAiAwarenessFor } from "../../supabase/functions/_shared/vertalAiChatStore";
import { buildAgentSystemPrompt, parseVibeCodeAction } from "../../supabase/functions/_shared/chatAgent";
import { vibeCodeRequestBody } from "@/lib/chatAgent/vibeBridge";
import { applyVertalAiToRequirements, type RequirementLike } from "../../supabase/functions/_shared/vertalAiConnector";

const LAERCIO = "5441b397-7be8-44fc-87e8-8057fdb79a0e";
const OTHER = "11111111-2222-4333-8444-555555555555";
const VIBE_CONV = "0f1e2d3c-4b5a-4968-8776-655443322110";

/** Pedido real do Laércio no Vertal Chat, texto exato (28/11 01:38, inglês, Next.js/Supabase/Stripe). */
const SUNKAI_EN = readFileSync(path.resolve(__dirname, "fixtures/sunkai-request.txt"), "utf8");
const SUNKAI_EN_NO_VERTAL = SUNKAI_EN.replace("through the Vertal AI API behind a provider interface", "behind a provider interface");
if (SUNKAI_EN_NO_VERTAL === SUNKAI_EN) throw new Error("fixture do SunkAI mudou");

/** As mensagens dele, na ordem (28/11 01:38 → 07:09). */
const HIS_TURNS = [
  SUNKAI_EN,
  "Pode mais use a API da Vertal deLLM para criar os vídeos",
  "Use a chave da VERTAL AI",
  "Continue a chave já está conectada",
  "A LLM já está conectada, conecte a LLM para video",
];
/** O que o modelo respondeu na hora (texto salvo na conversa). */
const BAD_REPLY_A3 = '[artefato a3: aplicativo "SunkAI — MVP com geração de vídeo real via Vertal AI (chave do Cofre no servidor), fila assíncrona"]';
const BAD_REPLY_ENV =
  "- Créditos debitados só no `completed`.\n\n**O que falta do seu lado:** confirmar que `VERTAL_API_KEY` está nas variáveis de ambiente do deploy (Vercel ou onde estiver hospedado). Sem ela, o app cai no modo demo e mostra o aviso na tela.\n\nQuer que eu abra o painel de segredos para você conferir se a chave está registrada com o nome exato `VERTAL_API_KEY`?";

const onEnv = { SUPABASE_URL: "https://x.supabase.co", VERTAL_GPU_CONFIG: JSON.stringify({ VERTAL_AI_API_ENABLED: true, VERTAL_AI_CONNECTOR_ENABLED: true, VERTAL_AI_CONNECTOR_USER_IDS: [LAERCIO] }) };
/** Qualquer acesso ao banco explode: prova que, sem a flag, nada é consultado. */
const explodingAdmin = new Proxy({}, { get: () => { throw new Error("banco não deveria ser tocado"); } });

describe("detecção (pt, en, es)", () => {
  it("pedido explícito de usar/conectar a Vertal AI", () => {
    for (const t of [
      "Use a chave da VERTAL AI",
      "Pode mais use a API da Vertal deLLM para criar os vídeos",
      "Continue a chave já está conectada",
      "A LLM já está conectada, conecte a LLM para video",
      "Use the Vertal AI API for video",
      "the key is already connected",
      "connect the AI to the video generator",
      "usa la Vertal AI",
      "Video generation through the Vertal AI API behind a provider interface",
    ]) expect(explicitVertalAiIntent(t), t).toBe(true);
  });
  it("não confunde com outros pedidos nem com outro provedor pedido de propósito", () => {
    for (const t of ["faça um site de padaria", "use the OpenAI API for the chatbot", "Vertal Run está no ar?", ""]) expect(explicitVertalAiIntent(t), t).toBe(false);
  });
  it("SunkAI em inglês é app com IA de vídeo", () => {
    const r = wantsVertalAiApp([SUNKAI_EN]);
    expect(r.on).toBe(true);
    expect(r.needs.video).toBe(true);
  });
  it("acha a conversa do Vibe Code no histórico (artefato ou resultado)", () => {
    expect(lastVibeConversationId([`ok\n[artefato a4: vibe code "SunkAI", conversationId ${VIBE_CONV}]`])).toBe(VIBE_CONV);
    expect(lastVibeConversationId([`{"summary":"Vibe Code (conversa ${VIBE_CONV}): pronto"}`])).toBe(VIBE_CONV);
    expect(lastVibeConversationId(["nada"])).toBeNull();
  });
});

describe("caso SunkAI no Vertal Chat (inglês, Next.js/Supabase)", () => {
  it("1ª mensagem já cita a Vertal AI → ativa direto e o app vira Vibe Code com o conector (não o gerador de HTML)", () => {
    const ctx = vertalAiChatDecision({ userTexts: [SUNKAI_EN], active: false });
    expect(ctx.mode).toBe("activate");
    const out = applyVertalAiChat({ actions: [{ tool: "app", prompt: SUNKAI_EN }], reply: "Vou construir o SunkAI agora.", ctx });
    expect(out.actions).toHaveLength(1);
    const a = out.actions[0] as Record<string, unknown>;
    expect(a).toMatchObject({ tool: "vibe_code", op: "start", vertalAi: true });
    expect(String(a.prompt)).toContain("src/lib/vertalAi.ts");
    expect(String(a.prompt)).toContain("/v1/videos/generations");
    expect(String(a.prompt)).toMatch(/sem modo demo/);
    expect(String(a.prompt)).not.toMatch(/VERTAL_API_KEY\b/);
    expect(out.offer).toBeNull();
    // A ponte manda {vertalAi:{enabled:true}} e nenhum projectId → escopo "default" da conta (como o #333 previa).
    const body = vibeCodeRequestBody(a as never);
    expect(body).toMatchObject({ vertalAi: { enabled: true }, mode: "preview" });
    expect(body).not.toHaveProperty("projectId");
  });

  it('"a chave já está conectada" com o conector inativo → ativa; artefato escrito como texto some', () => {
    const ctx = vertalAiChatDecision({ userTexts: HIS_TURNS.slice(0, 4), active: false });
    expect(ctx.mode).toBe("activate");
    expect(ctx.explicitNow).toBe(true);
    // O modelo não chamou ferramenta nenhuma (só escreveu "[artefato a3 …]"): o Vertal dispara o build com o conector.
    const out = applyVertalAiChat({ actions: [], reply: BAD_REPLY_A3, ctx });
    expect(out.reply).not.toContain("[artefato");
    expect(out.reply).toContain("Vertal AI");
    expect(out.actions).toHaveLength(1);
    expect(out.actions[0]).toMatchObject({ tool: "vibe_code", op: "start", vertalAi: true });
    expect(String((out.actions[0] as Record<string, unknown>).prompt)).toContain("Build SunkAI");
  });

  it('"conecte a LLM para video": nunca pede variável nem abre o painel de segredos; nomes certos', () => {
    const ctx = vertalAiChatDecision({ userTexts: HIS_TURNS, active: false });
    const out = applyVertalAiChat({ actions: [{ tool: "open_panel", panel: "secrets" }], reply: BAD_REPLY_ENV, ctx });
    expect(out.actions.some((a) => a.tool === "open_panel")).toBe(false);
    expect(out.actions.some((a) => a.tool === "vibe_code" && (a as Record<string, unknown>).vertalAi === true)).toBe(true);
    expect(out.reply).not.toMatch(/vari[áa]veis de ambiente|painel de segredos|VERTAL_API_KEY\b|modo demo/i);
    expect(out.reply).toContain("Créditos debitados");
  });

  it("conector já ativo e app já no Vibe Code → continua a mesma conversa com o conector", () => {
    const assistant = [`Pronto.\n[artefato a4: vibe code "SunkAI", conversationId ${VIBE_CONV}]`];
    const ctx = vertalAiChatDecision({ userTexts: HIS_TURNS, assistantTexts: assistant, active: true });
    expect(ctx.mode).toBe("active");
    const out = applyVertalAiChat({ actions: [{ tool: "app", prompt: "SunkAI com vídeo real", source_artifact: "a1" }], reply: "Feito.", ctx });
    expect(out.actions[0]).toMatchObject({ tool: "vibe_code", op: "continue", conversationId: VIBE_CONV, vertalAi: true });
  });

  it("rodada com resultados (o build já rodou) não dispara outro build", () => {
    const ctx = vertalAiChatDecision({ userTexts: HIS_TURNS, active: true, firstRound: false });
    const out = rewriteVertalAiActions([], ctx);
    expect(out.actions).toEqual([]);
  });

  it("app com IA sem pedido explícito → cartão de um clique (oferta) e o app já nasce no Vibe Code", () => {
    const ctx = vertalAiChatDecision({ userTexts: [SUNKAI_EN_NO_VERTAL], active: false });
    expect(ctx.mode).toBe("offer");
    const out = applyVertalAiChat({ actions: [{ tool: "app", prompt: SUNKAI_EN_NO_VERTAL }], reply: "Configure a sua chave nas variáveis de ambiente.", ctx });
    expect(out.offer).toEqual({ video: true });
    expect(out.actions[0]).toMatchObject({ tool: "vibe_code", op: "start" });
    expect(out.actions[0]).not.toHaveProperty("vertalAi");
    expect(out.reply).toContain("Ativar Vertal AI");
    expect(out.reply).not.toMatch(/vari[áa]veis de ambiente/);
  });

  it("conversa sem app com IA → nada muda (mesmos objetos)", () => {
    const ctx = vertalAiChatDecision({ userTexts: ["faça um documento sobre café"], active: false });
    expect(ctx.mode).toBe("off");
    const actions = [{ tool: "app", prompt: "site de padaria" }, { tool: "open_panel", panel: "secrets" }];
    const out = applyVertalAiChat({ actions, reply: "Configure a chave nas variáveis de ambiente.", ctx });
    expect(out.actions).toBe(actions);
    expect(out.reply).toBe("Configure a chave nas variáveis de ambiente.");
    expect(sanitizeVertalAiReply("x [artefato a1: doc \"y\"]", { mode: "off" })).toBe("x [artefato a1: doc \"y\"]");
  });

  it("a ação reescrita passa pelo parser do chat (vertal_ai) e pela ponte", () => {
    const parsed = parseVibeCodeAction({ op: "start", prompt: SUNKAI_EN, vertal_ai: true });
    expect(parsed).toMatchObject({ tool: "vibe_code", op: "start", vertalAi: true });
  });
});

describe("consciência de conectores (só nomes/status)", () => {
  const snap: DevConnectorsSnapshot = {
    vertalAi: { active: true, video: true, scope: "default" },
    secretNames: ["VERTAL_GEMINI_KEY", "STRIPE_SECRET_KEY", "bad name; DROP", "VERTAL_AI_API_KEY_PDEFAULT"],
    fluxos: ["pipedrive", "typeform"],
    metamask: { connected: true, chainId: 11155111 },
  };
  it("bloco do chat: status de cada conector, sem valores e com como agir", () => {
    const b = formatDevConnectorsBlock(snap, "chat");
    expect(b).toContain("Vertal AI (texto, vídeo, voz): ATIVA");
    expect(b).toContain("MetaMask: conectada (rede 11155111)");
    expect(b).toContain("pipedrive, typeform");
    expect(b).toContain("STRIPE_SECRET_KEY");
    expect(b).not.toContain("bad name");
    expect(b).toContain("nunca VERTAL_API_KEY");
    expect(b).toContain("vibe_code");
    expect(b).toContain("[artefato");
  });
  it("bloco do Vibe Code aponta o helper", () => {
    expect(formatDevConnectorsBlock(snap, "vibe")).toContain("src/lib/vertalAi.ts");
  });
  it("prompt do chat: o bloco entra só quando vem no contexto (sem ele, idêntico)", () => {
    const base = { secretNames: [], today: "2026-11-28" };
    const without = buildAgentSystemPrompt(base);
    const withBlock = buildAgentSystemPrompt({ ...base, vertalAiConnectors: "CONECTORES DO DEV (teste)" });
    expect(without).not.toContain("CONECTORES DO DEV");
    expect(withBlock).toContain("CONECTORES DO DEV (teste)");
    const norm = (t: string) => t.replace(/\n+/g, "\n");
    expect(norm(withBlock.replace("CONECTORES DO DEV (teste)", ""))).toBe(norm(without));
  });
});

describe("engine guard: flag desligada não toca no banco", () => {
  it("chat: sem flag → null", async () => {
    await expect(loadVertalAiChat(explodingAdmin, {}, LAERCIO, { userTexts: HIS_TURNS, assistantTexts: [], secretNames: [] })).resolves.toBeNull();
  });
  it("chat: usuário fora da allowlist → null", async () => {
    await expect(loadVertalAiChat(explodingAdmin, onEnv, OTHER, { userTexts: HIS_TURNS, assistantTexts: [], secretNames: [] })).resolves.toBeNull();
  });
  it("Vibe Code: sem flag → bloco vazio", async () => {
    await expect(vertalAiAwarenessFor(explodingAdmin, {}, LAERCIO, null, [])).resolves.toBe("");
  });
});

/** Admin falso: tabelas vazias (sem conector, sem Fluxos, sem carteira). */
function emptyAdmin() {
  const calls: string[] = [];
  const chain = (table: string): unknown => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is", "order", "limit"]) q[m] = () => q;
    q.maybeSingle = () => Promise.resolve({ data: null, error: null });
    q.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok, ko);
    calls.push(table);
    return q;
  };
  return { admin: { from: chain }, calls };
}

describe("com a flag ligada para o Laércio", () => {
  it("chat lê os conectores e decide ativar no caso SunkAI", async () => {
    const { admin, calls } = emptyAdmin();
    const r = await loadVertalAiChat(admin, onEnv, LAERCIO, { userTexts: HIS_TURNS, assistantTexts: [], secretNames: ["VERTAL_GEMINI_KEY"] });
    expect(r?.ctx.mode).toBe("activate");
    expect(r?.block).toContain("não ativa ainda");
    expect(r?.block).toContain("VERTAL_GEMINI_KEY");
    expect(calls).toEqual(expect.arrayContaining(["vertal_ai_api_keys", "fluxos_connections", "vertal_wallet_connections"]));
    expect(calls).not.toContain("kubo_secrets"); // nomes já vieram do router; valores nunca são lidos
  });
  it("Vibe Code recebe o bloco de conectores", async () => {
    const { admin } = emptyAdmin();
    const b = await vertalAiAwarenessFor(admin, onEnv, LAERCIO, null, ["stripe"]);
    expect(b).toContain("CONECTORES DO DEV");
    expect(b).toContain("Conectores marcados: stripe");
  });
});

vi.mock("../../supabase/functions/_shared/vertalAiConnector", async (orig) => {
  const mod = await orig<typeof import("../../supabase/functions/_shared/vertalAiConnector")>();
  return {
    ...mod,
    ensureProjectConnector: vi.fn(async () => ({ ok: true, created: true, keyId: "k1", ref: "vapp_AAAAAAAAAAAAAAAAAAAAAAAA", proxyUrl: "https://x.supabase.co/functions/v1/vertal-ai-api/p/vapp_AAAAAAAAAAAAAAAAAAAAAAAA", video: true, scope: "default" })),
  };
});

describe("Vibe Code: pedido explícito ativa sem cartão", () => {
  it('"conecte a LLM para video" → ativa (idempotente) e o app recebe o helper', async () => {
    const { vertalAiForRequest } = await import("../../supabase/functions/_shared/vertalAiConnectorStore");
    const { admin } = emptyAdmin();
    const r = await vertalAiForRequest(admin, onEnv, { userId: LAERCIO, projectId: null, prompt: "A LLM já está conectada, conecte a LLM para video", request: undefined });
    expect(r.created).toBe(true);
    expect(r.state.mode).toBe("active");
  });
  it("sem pedido explícito e sem clique → só oferta", async () => {
    const { vertalAiForRequest } = await import("../../supabase/functions/_shared/vertalAiConnectorStore");
    const { admin } = emptyAdmin();
    const r = await vertalAiForRequest(admin, onEnv, { userId: LAERCIO, projectId: null, prompt: "crie um app gerador de vídeo com IA", request: undefined });
    expect(r.state.mode).toBe("offer");
    expect(r.created).toBeUndefined();
  });
});

describe("inglês, Next.js/Vercel e VERTAL_API_KEY → conector, nunca chave à mão", () => {
  const EN_TURNS = [SUNKAI_EN, "Deploy it on Vercel with Next.js. Use VERTAL_API_KEY for the videos."];
  it("citar VERTAL_API_KEY conta como pedido da Vertal AI (mapeia para o conector)", () => {
    expect(explicitVertalAiIntent("Use VERTAL_API_KEY for the videos.")).toBe(true);
    expect(explicitVertalAiIntent("set NEXT_PUBLIC_VERTAL_API_KEY")).toBe(true);
    const ctx = vertalAiChatDecision({ userTexts: EN_TURNS, active: false });
    expect(ctx.mode).toBe("activate");
  });
  it("resposta em inglês pedindo env na Vercel / colar a chave some; nomes corrigidos", () => {
    const ctx = vertalAiChatDecision({ userTexts: EN_TURNS, active: false });
    const reply = "Your Studio is ready. Add VERTAL_API_KEY to your Vercel environment variables. Paste your API key in .env.local. The job queue polls every 3s.";
    const out = applyVertalAiChat({ actions: [{ tool: "app", prompt: EN_TURNS[1] }], reply, ctx });
    expect(out.reply).toContain("Your Studio is ready.");
    expect(out.reply).toContain("The job queue polls every 3s.");
    expect(out.reply).not.toMatch(/Vercel environment|Paste your API key|\.env\.local|VERTAL_API_KEY\b/);
    expect(out.actions[0]).toMatchObject({ tool: "vibe_code", vertalAi: true });
  });
  it("o Dev pedindo o painel de segredos ele mesmo → abre normalmente", () => {
    const ctx = vertalAiChatDecision({ userTexts: [SUNKAI_EN, "abra o painel de segredos"], active: true });
    const out = rewriteVertalAiActions([{ tool: "open_panel", panel: "secrets" }], ctx);
    expect(out.actions).toEqual([{ tool: "open_panel", panel: "secrets" }]);
  });
  it("código gerado: VERTAL_API_KEY / NEXT_PUBLIC_ / VITE_ viram os nomes do servidor do conector", () => {
    const src = "const k = process.env.VERTAL_API_KEY;\nconst u = process.env.VERTAL_API_URL;\nconst b = import.meta.env.VITE_VERTAL_API_KEY;\nconst n = process.env.NEXT_PUBLIC_VERTAL_API_KEY;";
    const fixed = vertalAiFixEnvNames(src);
    expect(fixed).not.toMatch(/VERTAL_API_(KEY|URL)/);
    expect(fixed).toContain("process.env.VERTAL_AI_API_KEY");
    expect(fixed).toContain("process.env.VERTAL_AI_BASE_URL");
    expect(fixed).not.toMatch(/VITE_VERTAL|NEXT_PUBLIC_VERTAL/);
    expect(vertalAiFixEnvNames("sem nada")).toBe("sem nada");
  });
  it("requisitos: pedido de VERTAL_API_KEY / 'Vertal AI API' some (o conector cobre)", () => {
    const req = (slug: string, label: string, secrets: string[]): RequirementLike => ({ slug, label, kind: "api", description: "", reason: "", secrets, builtin: false, status: "needed" });
    const reqs = [req("custom:vertal-ai-api", "Vertal AI API", ["VERTAL_API_KEY", "VERTAL_API_URL"]), req("stripe", "Stripe", ["STRIPE_SECRET_KEY"]), req("custom:x", "X", ["NEXT_PUBLIC_VERTAL_API_KEY"])];
    const out = applyVertalAiToRequirements(reqs, { mode: "offer", needs: { any: true, text: false, image: false, video: true, voice: false } }, SUNKAI_EN);
    expect(out.map((r) => r.slug)).toEqual(["stripe"]);
  });
  it("Vibe Code: resposta final sem 'configure a chave' (ativo) e com o cartão (oferta)", () => {
    const r = "Pronto: Studio e fila. Configure a sua chave VERTAL_API_KEY nas variáveis de ambiente.";
    expect(sanitizeVertalAiReply(r, { mode: "active" })).not.toMatch(/vari[áa]veis de ambiente|VERTAL_API_KEY\b/);
    expect(sanitizeVertalAiReply(r, { mode: "offer" })).toContain("Ativar Vertal AI");
  });
});
