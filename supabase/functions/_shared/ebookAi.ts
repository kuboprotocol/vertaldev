// Chamadas de IA do Vertal Ebook Engine (texto + imagens), usadas pela criação
// (creative-ebook) e pelo editor (creative-ebook-edit).
import { supaAdmin } from "./creative.ts";
import { EBOOK_OPENROUTER_MODELS } from "./ebookPricing.ts";

export type EbookMsg = { role: "system" | "user"; content: string };

/** Texto: OpenRouter (EBOOK_MODEL → Kimi K2.6 → DeepSeek V3.2 → Gemini 3 Flash) → DeepSeek oficial → Lovable. */
export async function ebookChat(messages: EbookMsg[], max_tokens: number, json = false): Promise<{ content: string; model: string }> {
  const OR = Deno.env.get("OPENROUTER_API_KEY");
  const DS = Deno.env.get("DEEPSEEK_API_KEY");
  const LK = Deno.env.get("LOVABLE_API_KEY");
  const override = Deno.env.get("EBOOK_MODEL");
  const tries: Array<{ url: string; key: string; model: string }> = [];
  if (OR) {
    for (const m of [...(override ? [override] : []), ...EBOOK_OPENROUTER_MODELS]) {
      tries.push({ url: "https://openrouter.ai/api/v1/chat/completions", key: OR, model: m });
    }
  }
  if (DS) tries.push({ url: "https://api.deepseek.com/chat/completions", key: DS, model: "deepseek-chat" });
  if (LK) tries.push({ url: "https://ai.gateway.lovable.dev/v1/chat/completions", key: LK, model: "google/gemini-3-flash-preview" });

  for (const t of tries) {
    try {
      const payload: Record<string, unknown> = { model: t.model, messages, max_tokens, temperature: 0.8 };
      if (json) payload.response_format = { type: "json_object" };
      const r = await fetch(t.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${t.key}`, "Content-Type": "application/json", "X-Title": "Vertal Ebook Engine" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) { console.warn(`[ebookAi] ${t.model} failed ${r.status}`); continue; }
      const d = await r.json();
      const content = d?.choices?.[0]?.message?.content ?? "";
      if (content) return { content, model: t.model };
    } catch (e) {
      console.warn(`[ebookAi] ${t.model} threw`, e);
    }
  }
  throw new Error("all_providers_failed");
}

/** Roda `fn` sobre os itens com no máximo `limit` chamadas simultâneas, preservando a ordem. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  for (let i = 0; i < items.length; i += limit) {
    const batch = await Promise.all(items.slice(i, i + limit).map((it, k) => fn(it, i + k)));
    batch.forEach((r, k) => { out[i + k] = r; });
  }
  return out;
}

/**
 * Gera uma imagem (Nano Banana via Lovable) e a hospeda no bucket público `uploads`,
 * para não guardar data URLs gigantes no texto do livro. Retorna null em falha.
 */
export async function ebookImage(prompt: string, userId: string, kind: "cover" | "illustration"): Promise<string | null> {
  const LK = Deno.env.get("LOVABLE_API_KEY");
  if (!LK) return null;
  try {
    const ir = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LK}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [{ role: "user", content: prompt }],
        modalities: ["image", "text"],
      }),
    });
    const id = await ir.json();
    const url: string | undefined = id?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!url) return null;
    return (await rehost(url, userId, kind)) ?? url;
  } catch (_) {
    return null;
  }
}

async function rehost(url: string, userId: string, kind: string): Promise<string | null> {
  try {
    let bytes: Uint8Array;
    let type = "image/png";
    const m = url.match(/^data:([^;]+);base64,(.+)$/);
    if (m) {
      type = m[1];
      bytes = Uint8Array.from(atob(m[2]), (ch) => ch.charCodeAt(0));
    } else {
      const r = await fetch(url);
      if (!r.ok) return null;
      type = r.headers.get("content-type") ?? type;
      bytes = new Uint8Array(await r.arrayBuffer());
    }
    const ext = type.includes("jpeg") ? "jpg" : type.includes("webp") ? "webp" : "png";
    const path = `${userId}/ebook/${kind}-${crypto.randomUUID()}.${ext}`;
    const storage = supaAdmin().storage.from("uploads");
    const { error } = await storage.upload(path, bytes, { contentType: type, upsert: false });
    if (error) return null;
    return storage.getPublicUrl(path).data.publicUrl;
  } catch {
    return null;
  }
}

export function coverPrompt(title: string, topic: string, style?: string): string {
  return `Premium bestseller ebook cover, portrait 2:3, for the book "${title}" about: ${topic}. ${style ? `Style: ${style}. ` : ""}Modern, cinematic, elegant typography with the exact title text only.`;
}
