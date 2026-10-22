// Browser AI — agente que navega na internet para responder uma tarefa.
//
// Loop de tool calling via OpenRouter. Modelo padrão: moonshotai/kimi-k2
// (chinês, barato, com suporte confiável a tools). Troca via BROWSER_AI_MODEL.
//
// Ferramentas do navegador (Firecrawl, já usado no projeto):
//   • web_search — pesquisa na web e devolve título, URL e resumo
//   • open_url   — abre uma página e devolve o conteúdo principal em markdown
//
// Toda URL passa por validatePublicUrl (bloqueia SSRF / IPs internos).
import { corsHeaders } from "../_shared/cors.ts";
import { getUser, deductCredits, recordAsset, sanitizeError, withRefundOnFailure } from "../_shared/creative.ts";
import { validatePublicUrl } from "../_shared/security.ts";
import { z } from "npm:zod@3";

const COST = 2;
const MAX_STEPS = 6;
const PAGE_CHARS = 6000;
const FETCH_TIMEOUT_MS = 25_000;
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const FIRECRAWL_URL = "https://api.firecrawl.dev/v1";
const DEFAULT_MODEL = "moonshotai/kimi-k2";

const SYSTEM_PROMPT = `Você é o Browser AI da KUBO Vibe: um agente que navega na internet para responder com fatos verificados.
Use web_search para encontrar fontes e open_url para ler a página certa antes de afirmar algo.
Regras:
- Não invente dados. Se não achou a informação, diga isso.
- Cite as fontes pelo URL no texto da resposta.
- Seja objetivo, em Português Brasileiro, com a resposta final organizada em tópicos quando ajudar.
- Use no máximo o necessário; quando já tiver evidência suficiente, responda sem chamar mais ferramentas.`;

const TOOLS = [
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Pesquisa na web. Devolve títulos, URLs e resumos.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Termos de busca." } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "open_url",
      description: "Abre uma página pública e devolve o conteúdo principal em markdown.",
      parameters: {
        type: "object",
        properties: { url: { type: "string", description: "URL https completa." } },
        required: ["url"],
      },
    },
  },
];

const InputSchema = z.object({
  task: z.string().trim().min(3).max(2000),
});

type Source = { title: string; url: string };
type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
};

Deno.serve(withRefundOnFailure(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const user = await getUser(req.headers.get("Authorization"));
  if (!user) {
    return json(401, { error: "Unauthorized" });
  }

  const idempotencyKey = req.headers.get("X-Idempotency-Key") ?? undefined;
  try {
    const parsed = InputSchema.safeParse(await req.json());
    if (!parsed.success) {
      return json(400, { error: "invalid_input", details: parsed.error.flatten() });
    }
    const { task } = parsed.data;

    const openRouterKey = Deno.env.get("OPENROUTER_API_KEY");
    if (!openRouterKey) return json(503, { error: "OPENROUTER_API_KEY not configured" });
    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");
    if (!firecrawlKey) return json(503, { error: "FIRECRAWL_API_KEY not configured" });

    const ded = await deductCredits(user.id, COST, "creative_browser_ai", { task: task.slice(0, 200) }, user.email, idempotencyKey);
    if (!ded.ok) {
      return json((ded as any).status ?? 402, { error: ded.error });
    }

    const model = Deno.env.get("BROWSER_AI_MODEL") || DEFAULT_MODEL;
    const result = await runBrowserAgent(task, { openRouterKey, firecrawlKey, model });

    recordAsset(user.id, {
      tool: "browser_ai",
      prompt: task.slice(0, 1000),
      output_text: result.output.slice(0, 4000),
      credits_spent: COST,
      metadata: { engine: "openrouter", model, steps: result.steps, sources: result.sources.length },
    }).catch(console.error);

    return json(200, { ok: true, output: result.output, sources: result.sources, steps: result.steps, engine: "openrouter", model });
  } catch (e) {
    console.error("[creative-browser-ai] error:", e);
    return json(500, { error: sanitizeError(e) });
  }
}));

async function runBrowserAgent(task: string, cfg: { openRouterKey: string; firecrawlKey: string; model: string }) {
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: task },
  ];
  const sources: Source[] = [];

  for (let step = 1; step <= MAX_STEPS; step++) {
    // No último passo as ferramentas saem da requisição: o modelo é obrigado a responder.
    const useTools = step < MAX_STEPS;
    const msg = await callModel(messages, cfg, useTools);
    const calls = msg.tool_calls ?? [];

    if (calls.length === 0 || !useTools) {
      const output = (msg.content ?? "").trim();
      if (!output) throw new Error("browser_ai_empty_answer");
      return { output, sources: dedupe(sources), steps: step };
    }

    messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: calls });
    for (const call of calls) {
      let content: string;
      try {
        const args = JSON.parse(call.function.arguments || "{}");
        content = call.function.name === "web_search"
          ? await webSearch(String(args.query ?? ""), cfg.firecrawlKey, sources)
          : call.function.name === "open_url"
          ? await openUrl(String(args.url ?? ""), cfg.firecrawlKey, sources)
          : `ferramenta desconhecida: ${call.function.name}`;
      } catch (e) {
        content = `erro: ${e instanceof Error ? e.message : String(e)}`;
      }
      messages.push({ role: "tool", tool_call_id: call.id, content });
    }
  }
  throw new Error("browser_ai_no_answer");
}

async function callModel(
  messages: ChatMessage[],
  cfg: { openRouterKey: string; model: string },
  useTools: boolean,
): Promise<ChatMessage> {
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.openRouterKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://kubovibe.dev",
      "X-Title": "KUBO Vibe Browser AI",
    },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      temperature: 0.2,
      max_tokens: 1500,
      ...(useTools ? { tools: TOOLS, tool_choice: "auto" } : {}),
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("[creative-browser-ai] OpenRouter failed:", res.status, JSON.stringify(data).slice(0, 500));
    throw new Error(`openrouter_http_${res.status}`);
  }
  const msg = data?.choices?.[0]?.message;
  if (!msg) throw new Error("openrouter_empty_response");
  return msg as ChatMessage;
}

async function webSearch(query: string, firecrawlKey: string, sources: Source[]): Promise<string> {
  if (!query.trim()) return "erro: query vazia";
  const res = await fetch(`${FIRECRAWL_URL}/search`, {
    method: "POST",
    headers: { Authorization: `Bearer ${firecrawlKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, limit: 5 }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !Array.isArray(data?.data)) return `busca falhou (${res.status})`;

  const results = data.data.slice(0, 5).map((r: any) => ({
    title: String(r.title ?? r.metadata?.title ?? r.url ?? "sem título"),
    url: String(r.url ?? ""),
    snippet: String(r.description ?? "").slice(0, 300),
  })).filter((r: any) => r.url);

  for (const r of results) sources.push({ title: r.title, url: r.url });
  return results.length ? JSON.stringify(results) : "nenhum resultado";
}

async function openUrl(rawUrl: string, firecrawlKey: string, sources: Source[]): Promise<string> {
  const url = validatePublicUrl(rawUrl.trim()).toString();
  const res = await fetch(`${FIRECRAWL_URL}/scrape`, {
    method: "POST",
    headers: { Authorization: `Bearer ${firecrawlKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const data = await res.json().catch(() => ({}));
  const markdown: string = data?.data?.markdown ?? "";
  if (!res.ok || !markdown) return `não foi possível abrir ${url} (${res.status})`;

  const title = String(data?.data?.metadata?.title ?? url);
  sources.push({ title, url });
  return `# ${title}\nURL: ${url}\n\n${markdown.slice(0, PAGE_CHARS)}`;
}

function dedupe(sources: Source[]): Source[] {
  const seen = new Set<string>();
  return sources.filter((s) => (seen.has(s.url) ? false : (seen.add(s.url), true))).slice(0, 10);
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
