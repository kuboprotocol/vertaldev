// Registro de trocas feitas no próprio chat do Vibe Code (fase 4 do Navigator):
// "/navegar", "/github" e o navegador pedido pelo agente rodam no navegador do
// usuário, fora do loop do vibe-code-agent. Para a conversa existir e o cartão
// sobreviver ao recarregar, o cliente manda {record:{...}} ao vibe-code-agent,
// que só grava (sem modelo, sem créditos). Lógica pura: testada com vitest.

export const VIBE_RECORD_LIMITS = {
  maxPromptChars: 4_000,
  maxReplyChars: 8_000,
  maxSteps: 6,
  maxStepText: 4_000,
  maxStepLines: 30,
  /** Captura final do navegador (data:image/jpeg) guardada no histórico. */
  maxScreenshotChars: 160_000,
} as const;

/** Tipos de passo que o cliente pode gravar por esta via. */
export const RECORDABLE_STEP_KINDS = ["navigator", "delegate", "message", "error"] as const;
type RecordableKind = (typeof RECORDABLE_STEP_KINDS)[number];

const STATUSES = new Set(["running", "success", "failed", "skipped"]);
const NAV_STATES = new Set(["requested", "running", "done", "failed", "cancelled"]);

export interface VibeRecordInput {
  prompt?: string;
  reply: string;
  steps: Array<Record<string, unknown>>;
}

const clip = (v: unknown, max: number): string | undefined => (typeof v === "string" && v.trim() ? v.slice(0, max) : undefined);

function cleanNavigator(raw: unknown): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const n = raw as Record<string, unknown>;
  const task = clip(n.task, 2_000);
  if (!task) return undefined;
  const state = typeof n.state === "string" && NAV_STATES.has(n.state) ? n.state : "done";
  const out: Record<string, unknown> = { task, state };
  for (const k of ["taskId", "url", "finalUrl", "plan", "origin", "kind"] as const) {
    const v = clip(n[k], k === "plan" ? 600 : 500);
    if (v) out[k] = v;
  }
  const answer = clip(n.answer, VIBE_RECORD_LIMITS.maxStepText);
  if (answer) out.answer = answer;
  for (const k of ["startedAt", "finishedAt", "stepsCount", "minutes"] as const) {
    if (typeof n[k] === "number" && Number.isFinite(n[k])) out[k] = Math.round(n[k] as number);
  }
  if (typeof n.ok === "boolean") out.ok = n.ok;
  if (Array.isArray(n.steps)) {
    out.steps = n.steps.filter((l): l is string => typeof l === "string").slice(0, VIBE_RECORD_LIMITS.maxStepLines).map((l) => l.slice(0, 300));
  }
  // Só JPEG em data URL e com tamanho limitado (nada de URL externa no histórico).
  if (typeof n.screenshot === "string" && n.screenshot.startsWith("data:image/jpeg;base64,") && n.screenshot.length <= VIBE_RECORD_LIMITS.maxScreenshotChars) {
    out.screenshot = n.screenshot;
  }
  return out;
}

/** Botão de ação do passo: só rotas internas (ex.: /connectors/github). */
function cleanLink(raw: unknown): { href: string; label: string } | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const l = raw as Record<string, unknown>;
  const href = clip(l.href, 300);
  if (!href || !/^\/[a-z0-9/_-]*$/i.test(href)) return undefined;
  return { href, label: clip(l.label, 80) ?? "Abrir" };
}

/** Valida e limpa o corpo {record}. null = inválido. */
export function parseVibeRecord(raw: unknown): VibeRecordInput | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const reply = clip(r.reply, VIBE_RECORD_LIMITS.maxReplyChars) ?? "";
  const prompt = clip(r.prompt, VIBE_RECORD_LIMITS.maxPromptChars);
  const steps: Array<Record<string, unknown>> = [];
  for (const s of Array.isArray(r.steps) ? r.steps.slice(0, VIBE_RECORD_LIMITS.maxSteps) : []) {
    if (!s || typeof s !== "object") continue;
    const step = s as Record<string, unknown>;
    if (!RECORDABLE_STEP_KINDS.includes(step.kind as RecordableKind)) continue;
    const out: Record<string, unknown> = {
      kind: step.kind,
      status: typeof step.status === "string" && STATUSES.has(step.status) ? step.status : "success",
      title: clip(step.title, 300) ?? "",
    };
    const detail = clip(step.detail, VIBE_RECORD_LIMITS.maxStepText);
    if (detail) out.detail = detail;
    const link = cleanLink(step.link);
    if (link) out.link = link;
    if (step.kind === "navigator") {
      const nav = cleanNavigator(step.navigator);
      if (!nav) continue;
      out.navigator = nav;
    }
    if (step.kind === "delegate" && step.delegate && typeof step.delegate === "object") {
      const d = step.delegate as Record<string, unknown>;
      const answer = clip(d.answer, VIBE_RECORD_LIMITS.maxStepText);
      if (answer) {
        out.delegate = {
          target: clip(d.target, 40) ?? "vertal_chat",
          question: clip(d.question, 1_000) ?? "",
          answer,
          ok: d.ok !== false,
          tools: Array.isArray(d.tools) ? d.tools.slice(0, 5).filter((t) => t && typeof t === "object").map((t) => ({ tool: String((t as Record<string, unknown>).tool ?? "").slice(0, 40), ok: (t as Record<string, unknown>).ok === true })) : [],
          images: [],
          refused: [],
        };
      }
    }
    steps.push(out);
  }
  if (!reply && !prompt && steps.length === 0) return null;
  return { ...(prompt ? { prompt } : {}), reply, steps };
}
