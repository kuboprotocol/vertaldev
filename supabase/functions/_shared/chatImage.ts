// Geração de imagem do Vertal Chat (ação "image") e do painel Nano Banana.
//
// Módulo puro (sem APIs do Deno nem do DOM): a edge function `creative-router`
// usa este código e o Vitest testa exatamente o que roda em produção.
//
// Por que existe: até 2026-11 o `creative-router` NÃO gerava a imagem. Ele só
// montava uma URL da Pollinations ("Classic API", anônima) e devolvia ok. Essa
// API (a) usa um modelo antigo que não entende português — "sapo de língua
// vermelha com uma estrela no meio" virava o retrato de uma mulher de cabelo
// verde —, (b) limita 1 imagem a cada 45 s por IP e responde 402/503 (imagem
// quebrada no chat) e (c) ignora `nologo`. O crédito era cobrado do mesmo jeito.
// Agora a imagem é gerada de verdade no servidor por um modelo multimodal que
// segue o pedido em português (o mesmo do Design Premium), e só volta "ok"
// quando existe uma imagem.

/** Modelo de imagem (Nano Banana via OpenRouter), o mesmo do creative-design. */
export const CHAT_IMAGE_MODEL = "google/gemini-2.5-flash-image";
export const CHAT_IMAGE_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export const CHAT_IMAGE_LIMITS = {
  /** Tentativas no modelo quando ele responde só texto ou falha de forma transitória. */
  attempts: 2,
  maxPromptChars: 2_000,
  timeoutMs: 55_000,
} as const;

/**
 * Texto enviado ao modelo de imagem. O pedido do usuário vai inteiro e o modelo
 * é instruído a desenhar TODOS os elementos (cores, objetos, posições), em vez
 * de reinterpretar o pedido.
 */
export function buildImageInstruction(prompt: string, attempt = 1): string {
  const request = prompt.trim().slice(0, CHAT_IMAGE_LIMITS.maxPromptChars);
  const lines = [
    "Gere UMA imagem (não responda só com texto).",
    "Siga o pedido à risca: inclua todos os elementos pedidos, com as cores, quantidades e posições descritas (ex.: \"no meio\" = no centro). Não troque o assunto principal nem acrescente elementos que contradigam o pedido.",
    "Sem marca d'água e sem texto na imagem, a não ser que o pedido peça texto.",
  ];
  if (attempt > 1) lines.push("Atenção: a resposta anterior veio sem imagem. Devolva a imagem desta vez.");
  return [...lines, "", `Pedido: ${request}`].join("\n");
}

/** URL da imagem (data: ou https:) na resposta do OpenRouter, ou null. */
export function extractImageUrl(data: unknown): string | null {
  const choice = (data as { choices?: Array<{ message?: { images?: Array<{ image_url?: { url?: unknown } }> } }> } | null)
    ?.choices?.[0];
  const url = choice?.message?.images?.find((i) => typeof i?.image_url?.url === "string")?.image_url?.url;
  return typeof url === "string" && /^(data:image\/|https:\/\/)/i.test(url) ? url : null;
}

export type ImageGenResult =
  | { ok: true; url: string; model: string; attempts: number }
  | { ok: false; error: "image_provider_unavailable" | "image_generation_failed"; attempts: number; detail?: string };

export interface GenerateImageOptions {
  prompt: string;
  apiKey: string | undefined | null;
  fetchImpl?: typeof fetch;
  attempts?: number;
  referer?: string;
}

/**
 * Gera a imagem. Nunca lança. Repete quando o modelo responde só texto, 429 ou 5xx;
 * erro 4xx de pedido (ex.: chave inválida) encerra na hora. Sem chave: provider indisponível.
 */
export async function generateChatImage(opts: GenerateImageOptions): Promise<ImageGenResult> {
  if (!opts.apiKey) return { ok: false, error: "image_provider_unavailable", attempts: 0 };
  const prompt = opts.prompt.trim();
  if (prompt.length < 3) return { ok: false, error: "image_generation_failed", attempts: 0, detail: "empty_prompt" };
  const doFetch = opts.fetchImpl ?? fetch;
  const max = Math.max(1, opts.attempts ?? CHAT_IMAGE_LIMITS.attempts);
  let detail = "";
  for (let attempt = 1; attempt <= max; attempt++) {
    let status = 0;
    try {
      const r = await doFetch(CHAT_IMAGE_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${opts.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": opts.referer ?? "https://vertal.dev",
          "X-Title": "Vertal Chat",
        },
        body: JSON.stringify({
          model: CHAT_IMAGE_MODEL,
          messages: [{ role: "user", content: buildImageInstruction(prompt, attempt) }],
          modalities: ["image", "text"],
        }),
        signal: AbortSignal.timeout(CHAT_IMAGE_LIMITS.timeoutMs),
      });
      status = r.status;
      const data = await r.json().catch(() => null);
      if (r.ok) {
        const url = extractImageUrl(data);
        if (url) return { ok: true, url, model: CHAT_IMAGE_MODEL, attempts: attempt };
        detail = "no_image_in_response";
      } else {
        detail = `http_${r.status}`;
        // Erro do pedido (chave, modelo, conteúdo recusado): repetir não muda nada.
        if (r.status >= 400 && r.status < 500 && r.status !== 408 && r.status !== 429) break;
      }
    } catch (e) {
      detail = e instanceof Error ? e.name : "network_error";
    }
    if (status === 0 && detail === "TimeoutError") break;
  }
  return { ok: false, error: "image_generation_failed", attempts: max, detail };
}

/** Decodifica uma data URL de imagem (para guardar no bucket). Null se não for uma. */
export function decodeImageDataUrl(url: string): { type: string; ext: string; bytes: Uint8Array } | null {
  const m = url.match(/^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!m) return null;
  const type = m[1].toLowerCase();
  const bin = atob(m[2].replace(/\s+/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const ext = type.includes("jpeg") || type.includes("jpg") ? "jpg" : type.includes("webp") ? "webp" : "png";
  return { type, ext, bytes };
}
