// Memória do Prime (KUBO Prime / futuro Vertal Prime).
//
// 1) Extrai do pedido do usuário as frases que são claramente memória
//    ("sempre use…", "prefiro…", "nunca use…", "este projeto usa…"), sem
//    chamar IA (custo zero).
// 2) Guarda em prime_memories (escopo usuário ou projeto).
// 3) Antes de planejar, carrega as memórias relevantes e injeta no contexto,
//    com limite de tamanho para não encarecer a chamada.
// deno-lint-ignore-file no-explicit-any

export type MemoryKind = "preference" | "constraint" | "architecture" | "design" | "integration" | "decision" | "note";
export type MemoryScope = "user" | "project";

export interface ExtractedMemory {
  scope: MemoryScope;
  kind: MemoryKind;
  content: string;
}

export interface StoredMemory extends ExtractedMemory {
  id?: string;
  project_id?: string | null;
}

const MAX_CONTENT = 500;
export const MAX_MEMORIES_IN_CONTEXT = 20;
export const MAX_MEMORY_CONTEXT_CHARS = 2000;

// A frase precisa começar com o gatilho (depois de pontuação ou início).
const RULES: Array<{ re: RegExp; kind: MemoryKind; scope?: MemoryScope }> = [
  { re: /\b(n[ãa]o use|nunca use|n[ãa]o utilize|nunca utilize|evite)\b/i, kind: "constraint" },
  { re: /\b(este|esse) projeto (usa|utiliza|vai usar|deve usar|roda)\b/i, kind: "architecture", scope: "project" },
  { re: /\b(neste|nesse) projeto\b/i, kind: "decision", scope: "project" },
  { re: /\b(sempre|prefiro|eu gosto de|use sempre|utilize sempre)\b/i, kind: "preference" },
  { re: /\blembr(e|a)-?se( de| que)?\b/i, kind: "note" },
];

const DESIGN_WORDS = /\b(layout|design|visual|cor(es)?|tema|dark|light|minimalista|fonte|tipografia|ui|ux)\b/i;
const INTEGRATION_WORDS = /\b(supabase|stripe|polar|github|gitmoom|vercel|railway|cloudflare|firebase|mongodb|gmail|slack|whatsapp|api)\b/i;

function normalize(s: string) {
  return s.replace(/\s+/g, " ").trim().replace(/^[-•*\d.)\s]+/, "");
}

/** Extrai memórias explícitas do texto. `hasProject` libera o escopo projeto. */
export function extractMemories(text: string, hasProject: boolean): ExtractedMemory[] {
  const sentences = text
    .split(/(?<=[.!?\n])\s+|\n+/)
    .map(normalize)
    .filter((s) => s.length >= 8 && s.length <= MAX_CONTENT);

  const out: ExtractedMemory[] = [];
  const seen = new Set<string>();
  for (const sentence of sentences) {
    const rule = RULES.find((r) => r.re.test(sentence));
    if (!rule) continue;
    let kind = rule.kind;
    if (kind === "preference" && DESIGN_WORDS.test(sentence)) kind = "design";
    if ((kind === "architecture" || kind === "decision") && INTEGRATION_WORDS.test(sentence)) kind = "integration";
    const scope: MemoryScope = rule.scope === "project" && hasProject ? "project" : "user";
    const key = sentence.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ scope, kind, content: sentence });
  }
  return out.slice(0, 5);
}

const KIND_LABEL: Record<MemoryKind, string> = {
  preference: "Preferência",
  constraint: "Restrição",
  architecture: "Arquitetura",
  design: "Design",
  integration: "Integração",
  decision: "Decisão",
  note: "Nota",
};

/** Bloco de texto para o system prompt (vazio se não houver memórias). */
export function formatMemoriesForPrompt(memories: StoredMemory[]): string {
  if (memories.length === 0) return "";
  const lines: string[] = [];
  let used = 0;
  // Restrições primeiro (são as que mais evitam retrabalho).
  const ordered = [...memories].sort((a, b) => Number(b.kind === "constraint") - Number(a.kind === "constraint"));
  for (const m of ordered.slice(0, MAX_MEMORIES_IN_CONTEXT)) {
    const line = `- [${m.scope === "project" ? "Projeto" : "Usuário"} · ${KIND_LABEL[m.kind] ?? "Nota"}] ${m.content}`;
    if (used + line.length > MAX_MEMORY_CONTEXT_CHARS) break;
    lines.push(line);
    used += line.length;
  }
  return `\n\nMemória do Prime (respeite estas preferências e restrições do usuário; restrições têm prioridade):\n${lines.join("\n")}`;
}

type Admin = { from: (table: string) => any };

/** Memórias do usuário + do projeto (se houver), mais recentes primeiro. */
export async function loadMemories(admin: Admin, userId: string, projectId: string | null): Promise<StoredMemory[]> {
  let query = admin
    .from("prime_memories")
    .select("id, scope, kind, content, project_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(MAX_MEMORIES_IN_CONTEXT * 2);
  query = projectId ? query.or(`project_id.is.null,project_id.eq.${projectId}`) : query.is("project_id", null);
  const { data } = await query;
  return (data ?? []) as StoredMemory[];
}

/** Grava as memórias extraídas; ignora duplicadas (índice único). Devolve as novas. */
export async function saveMemories(
  admin: Admin,
  userId: string,
  projectId: string | null,
  memories: ExtractedMemory[],
): Promise<ExtractedMemory[]> {
  const saved: ExtractedMemory[] = [];
  for (const m of memories) {
    const { error } = await admin.from("prime_memories").insert({
      user_id: userId,
      project_id: m.scope === "project" ? projectId : null,
      scope: m.scope,
      kind: m.kind,
      content: m.content.slice(0, MAX_CONTENT),
      source: "agent",
    });
    if (!error) saved.push(m);
  }
  return saved;
}
