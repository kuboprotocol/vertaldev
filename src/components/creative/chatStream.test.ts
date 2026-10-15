import { describe, expect, it } from "vitest";
import { readChatStream } from "./chatStream";

function streamOf(parts: string[]) {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(c) { parts.forEach((p) => c.enqueue(enc.encode(p))); c.close(); },
  });
}

describe("readChatStream", () => {
  it("junta o texto mesmo com linhas quebradas entre pedaços e ignora keep-alives", async () => {
    let text = "";
    const res = await readChatStream(streamOf([
      ": OPENROUTER PROCESSING\n\n",
      'data: {"choices":[{"delta":{"content":"Olá"}}]}\n\ndata: {"choi',
      'ces":[{"delta":{"content":", mundo"}}]}\n\ndata: [DONE]\n\n',
    ]), (d) => { text += d; });
    expect(text).toBe("Olá, mundo");
    expect(res.sources).toEqual([]);
  });

  it("coleta fontes do Perplexity (citations) e anotações url_citation sem duplicar", async () => {
    const res = await readChatStream(streamOf([
      'data: {"citations":["https://a.com","https://b.com"],"choices":[{"delta":{"content":"x"}}]}\n',
      'data: {"choices":[{"delta":{"annotations":[{"type":"url_citation","url_citation":{"url":"https://b.com","title":"B"}},{"type":"url_citation","url_citation":{"url":"https://c.com","title":"C"}}]}}]}\n',
      'data: {"citations":["javascript:alert(1)"]}\n',
    ]), () => {});
    expect(res.sources.map((s) => s.url)).toEqual(["https://a.com", "https://b.com", "https://c.com"]);
    expect(res.sources[2].title).toBe("C");
  });

  it("devolve o erro enviado no meio do stream", async () => {
    const res = await readChatStream(streamOf(['data: {"error":{"message":"model not found"}}']), () => {});
    expect(res.error).toBe("model not found");
  });
});
