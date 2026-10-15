/** Leitura do stream SSE (formato OpenAI/OpenRouter) devolvido pelo creative-router. */

export type Source = { url: string; title?: string };

type Chunk = {
  error?: { message?: string } | string;
  citations?: unknown[];
  choices?: {
    delta?: { content?: string; annotations?: unknown[] };
    message?: { annotations?: unknown[] };
  }[];
};

function addSource(list: Source[], url: unknown, title?: unknown) {
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return;
  if (list.some((s) => s.url === url)) return;
  list.push({ url, title: typeof title === "string" && title ? title : undefined });
}

/** Junta as fontes: anotações url_citation (busca da OpenRouter) e o array citations (Perplexity Sonar). */
function collectSources(chunk: Chunk, sources: Source[]) {
  for (const c of chunk.citations ?? []) {
    if (typeof c === "string") addSource(sources, c);
    else if (c && typeof c === "object") addSource(sources, (c as Partial<Source>).url, (c as Partial<Source>).title);
  }
  for (const choice of chunk.choices ?? []) {
    for (const a of [...(choice.delta?.annotations ?? []), ...(choice.message?.annotations ?? [])]) {
      const ann = a as { url_citation?: Partial<Source> } & Partial<Source> | null;
      const cite = ann?.url_citation ?? ann;
      addSource(sources, cite?.url, cite?.title);
    }
  }
}

/** Lê o stream chamando onDelta a cada pedaço de texto; devolve as fontes e um erro enviado no meio do stream. */
export async function readChatStream(
  body: ReadableStream<Uint8Array>,
  onDelta: (text: string) => void,
): Promise<{ sources: Source[]; error?: string }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const sources: Source[] = [];
  let error: string | undefined;
  let buffer = "";

  const handleLine = (line: string) => {
    // Linhas que começam com ":" são comentários de keep-alive (ex.: ": OPENROUTER PROCESSING").
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") return;
    let chunk: Chunk;
    try { chunk = JSON.parse(data); } catch { return; }
    if (chunk.error) error = typeof chunk.error === "string" ? chunk.error : chunk.error.message ?? "erro do provedor";
    collectSources(chunk, sources);
    const text = chunk.choices?.[0]?.delta?.content;
    if (text) onDelta(text);
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    lines.forEach((l) => handleLine(l.replace(/\r$/, "")));
  }
  buffer += decoder.decode();
  if (buffer) handleLine(buffer.trim());
  return { sources, error };
}
