// Regras do figCraft no Vertal: templates, nomes de arquivo e caminhos no bucket `design-files`.
//
// Módulo puro (sem APIs do Deno nem do DOM): o painel (src/lib/figcraft/*), o Vertal Chat e a
// Edge Function `mcp` usam exatamente o mesmo código. As regras de "é um documento?" espelham
// `apps/figcraft-web/src/hostmode.rs` do figCraft: só `.figcraft` e `.json` viram o arquivo do
// documento; exportações (PNG, SVG, PDF, .fig, variáveis) são cópias.

/** Templates iniciais do figCraft (`file.newFromTemplate {template}`, ver docs/mcp.md no upstream). */
export const FIGCRAFT_TEMPLATES = [
  { id: "mobile-app", label: "App mobile", description: "Telas de aplicativo com auto layout e componentes" },
  { id: "landing-page", label: "Landing page", description: "Página de captura com seções e botões" },
  { id: "dashboard", label: "Dashboard", description: "Painel com cartões, gráficos e grade de 12 colunas" },
  { id: "design-system", label: "Sistema de design", description: "Cores, textos, variáveis e componentes base" },
  { id: "wireframe-kit", label: "Kit de wireframes", description: "Esboços de telas para validar fluxos" },
  { id: "social-posts", label: "Posts para redes", description: "Tamanhos prontos para feed, story e capa" },
  { id: "slides", label: "Apresentação", description: "Slides com layout e texto editáveis" },
  { id: "icon-set", label: "Conjunto de ícones", description: "Base para uma biblioteca de ícones vetoriais" },
] as const;

export type FigcraftTemplateId = (typeof FIGCRAFT_TEMPLATES)[number]["id"];

export const FIGCRAFT_TEMPLATE_IDS: readonly string[] = FIGCRAFT_TEMPLATES.map((t) => t.id);

export function isFigcraftTemplate(id: unknown): id is FigcraftTemplateId {
  return typeof id === "string" && FIGCRAFT_TEMPLATE_IDS.includes(id);
}

/** Limite de um arquivo de design. Igual ao limite do bucket `design-files` (50 MiB). */
export const DESIGN_FILE_MAX_BYTES = 52_428_800;

/** Troca caracteres de controle (quebras de linha e tabulação inclusas) por espaço. */
export function stripControlChars(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    out += code < 0x20 || code === 0x7f ? " " : ch;
  }
  return out;
}

/** Título de um design: 1 a 120 caracteres, sem quebras de linha. */
export const DESIGN_TITLE_MAX = 120;

const DOC_EXTS = ["figcraft", "json"] as const;
/** Sidecar de variáveis (`*.variables.json`): é exportação, não documento, mesmo com `.json`. */
const VARIABLES_SIDECAR = ".variables.json";

/**
 * Diz se o nome é de um documento do figCraft (o que vira o arquivo do design salvo).
 * Mesma regra de `hostmode::save_as`: `.figcraft` ou `.json`, exceto o sidecar de variáveis.
 */
export function isFigcraftDocumentName(name: string): boolean {
  const lower = name.toLowerCase();
  if (lower.endsWith(VARIABLES_SIDECAR)) return false;
  const dot = lower.lastIndexOf(".");
  if (dot < 0) return false;
  return (DOC_EXTS as readonly string[]).includes(lower.slice(dot + 1));
}

/** Título a partir do nome do arquivo: tira a extensão e limpa espaços e quebras. */
export function designTitleFromFileName(name: string, fallback = "Design sem nome"): string {
  const base = name.replace(/\\/g, "/").split("/").pop() ?? "";
  const withoutExt = base.replace(/\.(figcraft|json)$/i, "");
  const clean = stripControlChars(withoutExt).replace(/\s+/g, " ").trim();
  const title = clean.slice(0, DESIGN_TITLE_MAX).trim();
  return title || fallback;
}

/** Nome do arquivo que o editor recebe ao abrir um design salvo. */
export function designFileName(title: string): string {
  const clean = stripControlChars(title.replace(/[\\/:*?"<>|]+/g, " ")).replace(/\s+/g, " ").trim().slice(0, 100);
  return `${clean || "Design"}.figcraft`;
}

/** Caminho do arquivo no bucket: `<user_id>/<design_id>.figcraft`. A primeira pasta é o dono (RLS). */
export function designStoragePath(userId: string, designId: string): string {
  return `${userId}/${designId}.figcraft`;
}

/** Id de design válido (UUID). */
export function isDesignId(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

/** Tamanho do conteúdo em bytes a partir de base64 (sem decodificar). */
export function base64ByteLength(b64: string): number {
  const clean = b64.replace(/\s+/g, "");
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  return Math.floor((clean.length * 3) / 4) - padding;
}

/** Confere que é base64 válido e cabe no limite. Devolve o motivo ou null. */
export function checkDesignBase64(b64: unknown): string | null {
  if (typeof b64 !== "string" || b64.length === 0) return "conteúdo em base64 vazio";
  const clean = b64.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean) || clean.length % 4 !== 0) return "conteúdo não é base64 válido";
  if (base64ByteLength(clean) > DESIGN_FILE_MAX_BYTES) return "arquivo passa de 50 MB";
  return null;
}

// ─── Comandos do engine (window.figcraft.execute / run_command) ───────────

/** Máximo de comandos por pedido, e de bytes do JSON de parâmetros somados. */
export const FIGCRAFT_MAX_COMMANDS = 40;
export const FIGCRAFT_MAX_COMMAND_JSON = 100_000;

/** Nome de comando do engine: letras, números e pontos (ex.: `node.create`, `file.newFromTemplate`). */
const COMMAND_RE = /^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*){0,3}$/;

export interface FigcraftCommandInput {
  command: string;
  params?: Record<string, unknown>;
}

/** Valida a lista de comandos vinda do agente ou do MCP. Devolve os comandos ou o motivo do erro. */
export function parseFigcraftCommands(raw: unknown): { commands: FigcraftCommandInput[] } | { error: string } {
  if (!Array.isArray(raw) || raw.length === 0) return { error: "informe ao menos um comando" };
  if (raw.length > FIGCRAFT_MAX_COMMANDS) return { error: `no máximo ${FIGCRAFT_MAX_COMMANDS} comandos por pedido` };
  const commands: FigcraftCommandInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return { error: "cada comando é um objeto {command, params}" };
    const c = item as Record<string, unknown>;
    if (typeof c.command !== "string" || !COMMAND_RE.test(c.command)) {
      return { error: `nome de comando inválido: ${String(c.command).slice(0, 80)}` };
    }
    if (c.params !== undefined && (c.params === null || typeof c.params !== "object" || Array.isArray(c.params))) {
      return { error: `params de ${c.command} deve ser um objeto` };
    }
    commands.push(c.params === undefined ? { command: c.command } : { command: c.command, params: c.params as Record<string, unknown> });
  }
  if (JSON.stringify(commands).length > FIGCRAFT_MAX_COMMAND_JSON) return { error: "comandos grandes demais para um pedido" };
  return { commands };
}
