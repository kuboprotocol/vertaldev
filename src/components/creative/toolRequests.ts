/** Requisições das ferramentas criativas (sem componentes, para o Fast Refresh do Vite). */

export type ToolKey = "chat" | "nano_banana" | "downloader" | "clips" | "avatar" | "shorts" | "music" | "ebook" | "emo" | "image_editor" | "video_studio";

/** Chave do sessionStorage com a object URL da imagem enviada pelo painel */
export const PENDING_IMAGE_KEY = "creative_pending_image";

/** Função de edge e corpo da requisição para cada ferramenta, a partir do prompt e das opções. */
type ToolMetadata = Record<string, unknown>;
export const TOOL_REQUESTS: Record<ToolKey, (prompt: string, metadata: ToolMetadata) => { fn: string; body: ToolMetadata }> = {
  chat: (prompt) => ({ fn: "creative-router", body: { tool: "chat", messages: [{ role: "user", content: prompt }] } }),
  nano_banana: (prompt, m) => ({ fn: "creative-router", body: { tool: "image", prompt, metadata: m } }),
  downloader: (prompt, m) => ({ fn: "creative-download", body: { url: prompt.trim(), format: m.format ?? "mp4" } }),
  clips: (prompt) => ({ fn: "creative-clips", body: { transcript: prompt } }),
  avatar: (prompt, m) => ({ fn: "creative-video", body: { mode: "avatar", prompt, duration: m.duration ?? 30 } }),
  shorts: (prompt) => ({ fn: "creative-video", body: { mode: "shorts", prompt, duration: 30 } }),
  music: (prompt, m) => ({ fn: "creative-music", body: { action: "generate", prompt, instrumental: m.instrumental ?? false } }),
  ebook: (prompt, m) => ({ fn: "creative-ebook", body: { topic: prompt, chapters: m.chapters ?? 5 } }),
  emo: (prompt, m) => ({ fn: "emo-animate", body: { source_image: m.source_image, driving_video: m.driving_video, prompt } }),
  image_editor: () => { throw new Error("image_editor não usa requisição de API"); },
  video_studio: () => { throw new Error("video_studio tem componente próprio"); },
};

/** Extrai o que mostrar no histórico a partir da resposta de cada função. */
type FunctionResponse = {
  ok?: boolean;
  image_url?: string; asset_url?: string; download_url?: string; cover?: string;
  output?: string; content?: string; script?: string; clips?: unknown[];
} | string | null;

export function summarizeResult(data: FunctionResponse): { assetUrl?: string; output_text?: string } {
  if (!data) return {};
  if (typeof data === "string") return { output_text: data };
  const assetUrl = data.image_url || data.asset_url || data.download_url || data.cover || undefined;
  const text = data.output || data.content || data.script || (data.clips ? JSON.stringify(data.clips, null, 2) : undefined);
  return { assetUrl, output_text: text };
}
