// Lógica pura do blueprint gerado ao criar um game: monta o pitch enviado ao
// game-ai-architect e junta o resultado ao `config` do jogo sem apagar o que o
// builder já salvou (cada builder grava suas próprias chaves em `config`).

export const BLUEPRINT_PROMPT_MIN = 4;
export const BLUEPRINT_PROMPT_MAX = 4000;

export interface BlueprintInput {
  title: string;
  description?: string;
  game_type: string;
  engine: string;
}

/** Pitch enviado ao game-ai-architect, dentro dos limites aceitos pela função. */
export function buildBlueprintPrompt(input: BlueprintInput): string | null {
  const title = input.title.trim();
  if (!title) return null;
  const lines = [
    `Título: ${title}`,
    input.description?.trim() ? `Descrição: ${input.description.trim()}` : null,
    `Tipo: ${input.game_type}`,
    `Engine: ${input.engine}`,
  ].filter((l): l is string => Boolean(l));
  const prompt = lines.join('\n').slice(0, BLUEPRINT_PROMPT_MAX);
  return prompt.length >= BLUEPRINT_PROMPT_MIN ? prompt : null;
}

export interface BlueprintResult {
  blueprint: Record<string, unknown>;
  designDoc?: string;
  model?: string;
  /** Resultado de validateBlueprint: salvo junto para o usuário ver os avisos. */
  quality?: unknown;
}

/** Acrescenta o blueprint ao config existente, preservando as chaves do builder. */
export function mergeBlueprintIntoConfig(
  current: unknown,
  result: BlueprintResult,
  now: Date = new Date(),
): Record<string, unknown> {
  const base = current && typeof current === 'object' && !Array.isArray(current)
    ? (current as Record<string, unknown>)
    : {};
  return {
    ...base,
    blueprint: result.blueprint,
    designDoc: result.designDoc ?? '',
    blueprintModel: result.model ?? null,
    blueprintQuality: result.quality ?? null,
    blueprintAt: now.toISOString(),
  };
}

/** True quando a resposta da função traz um blueprint com título utilizável. */
export function isUsableBlueprint(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value as object).length > 0;
}
