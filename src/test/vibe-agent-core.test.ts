import { describe, expect, it } from "vitest";
import {
  buildHistory,
  composeAgentReply,
  filterRepoTree,
  formatObservations,
  isSafePath,
  lintGeneratedFile,
  looksLikeSecret,
  parseAgentTurn,
  sanitizeMemories,
  titleFromPrompt,
} from "@/config/vibeAgentCore";

describe("parseAgentTurn", () => {
  it("lê JSON com cercas e texto em volta", () => {
    const t = parseAgentTurn('Aqui vai:\n```json\n{"summary":"ok","actions":[{"type":"edit_file","path":"src/a.ts","content":"x"}],"title":"Login"}\n```');
    expect(t.summary).toBe("ok");
    expect(t.actions).toHaveLength(1);
    expect(t.title).toBe("Login");
    expect(t.final).toBe(true);
  });

  it("final é false quando há leituras pendentes e o modelo não disse o contrário", () => {
    const t = parseAgentTurn('{"summary":"x","actions":[{"type":"read_file","path":"src/a.ts"}]}');
    expect(t.final).toBe(false);
    expect(parseAgentTurn('{"summary":"x","final":true,"actions":[{"type":"read_file","path":"a"}]}').final).toBe(true);
  });

  it("descarta ações inválidas e normaliza campos", () => {
    const t = parseAgentTurn('{"actions":[{"type":"rm_rf","path":"/"},{"type":"message","reason":"oi"},42,null],"summary":5}');
    expect(t.actions).toEqual([{ type: "message", reason: "oi" }]);
    expect(t.summary).toBe("");
  });

  it("falha com plan_parse_failed quando não há JSON", () => {
    expect(() => parseAgentTurn("sem json")).toThrow("plan_parse_failed");
    expect(() => parseAgentTurn("{quebrado")).toThrow("plan_parse_failed");
  });
});

describe("isSafePath", () => {
  it.each(["src/App.tsx", "supabase/functions/x/index.ts", "README.md", ".gitignore"])("aceita %s", (p) => {
    expect(isSafePath(p)).toBe(true);
  });
  it.each(["../etc/passwd", "/abs/file", "src/../../x", ".env", "src/.env.local", ".git/config", "node_modules/a/b.js",
    ".github/workflows/ci.yml", "keys/server.pem", "a\\b", "src//a.ts", "", "C:/x"])("recusa %s", (p) => {
    expect(isSafePath(p)).toBe(false);
  });
});

describe("lintGeneratedFile", () => {
  it("aceita código completo", () => {
    expect(lintGeneratedFile("src/a.ts", "export const a = () => { return [1, 2, `x${1}`]; };\n")).toEqual([]);
  });
  it("pega placeholder, TODO, vazio e JSON inválido", () => {
    expect(lintGeneratedFile("src/a.ts", "function a() {\n  // ...\n}")[0]).toContain("placeholder");
    expect(lintGeneratedFile("src/a.ts", "// TODO: fazer\nconst a = 1;")[0]).toContain("placeholder");
    expect(lintGeneratedFile("src/a.ts", "  ")).toContain("conteúdo vazio");
    expect(lintGeneratedFile("package.json", "{ a: 1 }")).toContain("JSON inválido");
  });
  it("pega delimitadores sem par, mas ignora chaves dentro de strings e comentários", () => {
    expect(lintGeneratedFile("src/a.ts", "function a() {\n  return 1;\n")[0]).toContain("sintaxe");
    expect(lintGeneratedFile("src/a.ts", 'const s = "}"; // {\nconst t = `${"{"}`;\n')).toEqual([]);
  });
  it("pega segredo escrito no código e caminho proibido", () => {
    expect(lintGeneratedFile("src/a.ts", 'const k = "sk_live_abcdefghij1234567890";')[0]).toContain("segredo");
    expect(lintGeneratedFile(".env", "A=1")[0]).toContain("caminho não permitido");
  });
});

describe("memória", () => {
  it("looksLikeSecret reconhece chaves comuns", () => {
    expect(looksLikeSecret("use sk_test_abcdefghijklmnop")).toBe(true);
    expect(looksLikeSecret("ghp_abcdefghijklmnopqrstuvwxyz0123")).toBe(true);
    expect(looksLikeSecret('api_key = "abcdefghijklmnopqrstuvwxyz"')).toBe(true);
    expect(looksLikeSecret("prefiro layout minimalista")).toBe(false);
  });

  it("sanitizeMemories valida, remove segredos, duplicadas e limita a 3", () => {
    const out = sanitizeMemories(
      [
        { scope: "project", kind: "architecture", content: "O app usa Supabase para login." },
        { scope: "project", kind: "architecture", content: "O app usa Supabase para login." },
        { scope: "user", kind: "preference", content: "chave sk_live_abcdefghij1234567890 do cliente" },
        { scope: "x", kind: "inexistente", content: "Prefere botões arredondados." },
        { content: "curto" },
        { content: "Terceira memória válida aqui." },
        { content: "Quarta memória válida aqui." },
      ],
      true,
    );
    expect(out).toEqual([
      { scope: "project", kind: "architecture", content: "O app usa Supabase para login." },
      { scope: "user", kind: "note", content: "Prefere botões arredondados." },
      { scope: "user", kind: "note", content: "Terceira memória válida aqui." },
    ]);
  });

  it("sem projeto, tudo vira memória do usuário", () => {
    expect(sanitizeMemories([{ scope: "project", kind: "note", content: "Este projeto é um blog." }], false)[0].scope).toBe("user");
    expect(sanitizeMemories("x", true)).toEqual([]);
  });
});

describe("contexto", () => {
  it("buildHistory resume respostas do assistente e respeita o limite", () => {
    const h = buildHistory(
      [
        { role: "user", content: "Crie o login" },
        { role: "assistant", content: "", steps: [{ kind: "plan", title: "Tela de login" }, { kind: "commit", path: "src/Login.tsx" }, { kind: "diff", path: "src/Login.tsx" }] },
        { role: "assistant", content: "", steps: [] },
        { role: "user", content: "Agora o cadastro" },
      ],
      3,
    );
    expect(h).toEqual([
      { role: "assistant", content: "Plano: Tela de login\nArquivos: src/Login.tsx" },
      { role: "user", content: "Agora o cadastro" },
    ]);
  });

  it("filterRepoTree tira lixo e limita", () => {
    const tree = filterRepoTree(["src/a.ts", "node_modules/x/i.js", "package-lock.json", "logo.png", "dist/a.js", "src/b.ts"], 2);
    expect(tree).toEqual(["src/a.ts", "src/b.ts"]);
  });

  it("formatObservations corta arquivos grandes e avisa de inexistentes", () => {
    const text = formatObservations(
      [{ path: "a.ts", found: true, content: "x".repeat(50) }, { path: "b.ts", found: false, content: "" }],
      20,
      100,
    );
    expect(text).toContain("### a.ts\n" + "x".repeat(20));
    expect(text).toContain("cortado: 30");
    expect(text).toContain("arquivo não existe");
  });

  it("titleFromPrompt usa a primeira frase", () => {
    expect(titleFromPrompt("Crie uma landing page. Use azul.")).toBe("Crie uma landing page.");
    expect(titleFromPrompt("a".repeat(100))).toHaveLength(60);
    expect(titleFromPrompt("   ")).toBe("Nova conversa");
  });
});

describe("composeAgentReply", () => {
  const base = { notes: [], questions: [], files: [], mode: "preview" as const, rejected: [], pendingRequirements: [] };

  it("responde como conversa quando o pedido é só uma pergunta", () => {
    const text = composeAgentReply({ ...base, summary: "O projeto usa React com Vite." });
    expect(text).toBe("O projeto usa React com Vite.");
  });

  it("não repete a nota igual ao resumo", () => {
    const text = composeAgentReply({ ...base, summary: "Feito.", notes: ["Feito.", "Revise o tema escuro."] });
    expect(text).toBe("Feito.\n\nRevise o tema escuro.");
  });

  it("aponta as caixinhas de código no preview e no commit", () => {
    const preview = composeAgentReply({ ...base, files: [{ path: "src/App.tsx" }, { path: "src/App.tsx" }] });
    expect(preview).toContain("Preparei 1 arquivo(s)");
    expect(preview).toContain("`src/App.tsx`");
    expect(preview).toMatch(/caixinha de código/);

    const applied = composeAgentReply({ ...base, mode: "apply", files: [{ path: "a.ts" }] });
    expect(applied).toContain("Commitei 1 arquivo(s)");
  });

  it("diz o que falta, com o caminho certo para conector e para chave de API", () => {
    const text = composeAgentReply({
      ...base,
      pendingRequirements: [
        {
          label: "Stripe",
          secrets: ["STRIPE_SECRET_KEY"],
          kind: "connector",
          connectPath: "/connect",
          keyUrl: "https://dashboard.stripe.com/apikeys",
          linkSource: "catalog",
        },
        {
          label: "Resend",
          secrets: ["RESEND_API_KEY"],
          kind: "api",
          keyUrl: "https://resend.com/api-keys",
          siteUrl: "https://resend.com/signup",
          linkSource: "catalog",
        },
      ],
    });
    expect(text).toContain("faltam 2 coisas");
    // Conector: manda conectar e diz onde gerar a chave.
    expect(text).toContain('- Stripe: toque em "Conectar" logo abaixo para ligar o conector. Se ele pedir uma chave, você gera em https://dashboard.stripe.com/apikeys.');
    // API sem conector: conta, chave, campo e cofre.
    expect(text).toContain(
      "- Resend: crie sua conta em https://resend.com/signup, gere a chave em https://resend.com/api-keys e cole em `RESEND_API_KEY` no campo logo abaixo. Eu guardo no Cofre de segredos para você.",
    );
  });

  it("avisa quando o link foi sugerido pelo modelo", () => {
    const text = composeAgentReply({
      ...base,
      pendingRequirements: [
        { label: "API de Frete", secrets: ["FRETE_API_KEY"], kind: "api", keyUrl: "https://frete.example.com/keys", linkSource: "agent" },
      ],
    });
    expect(text).toContain("falta só uma coisa");
    expect(text).toContain("confira se é o site oficial");
  });

  it("faz as perguntas no fim", () => {
    expect(composeAgentReply({ ...base, questions: ["Qual a cor da marca?"] })).toBe(
      "Antes de seguir, preciso saber: Qual a cor da marca?",
    );
    expect(composeAgentReply({ ...base, questions: ["A?", "B?"] })).toBe("Antes de seguir, preciso saber:\n- A?\n- B?");
  });

  it("nunca devolve resposta vazia", () => {
    expect(composeAgentReply(base)).toBe("Pronto. Me diga o próximo passo.");
  });
});
