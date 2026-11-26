// Apps do Vertal Fluxos fora do catálogo público (mesma lista de HIDDEN_FLUXOS_APPS em
// src/lib/fluxosConnectors.ts). O motor e os fluxos continuam; nada é apagado.
// - Vertal Chat: não lista esses apps nem abre conexão nova com eles.
// - Quem já tem conexão (fluxos_connections) continua usando normalmente.
// OpenAI/OpenRouter/Azure OpenAI: o Vertal vende a própria IA white-label (26/11/2026). Isto NÃO afeta o
// uso interno desses provedores pelo backend de IA do Vertal.
export const HIDDEN_FLUXOS_APPS: ReadonlySet<string> = new Set(["flickr", "strava", "openai", "openrouter", "azure-openai"]);

export function isHiddenFluxosApp(app: unknown): boolean {
  return typeof app === "string" && HIDDEN_FLUXOS_APPS.has(app.trim().toLowerCase());
}

/** Tira os apps escondidos de uma lista vinda do motor (GET /apps). */
export function withoutHiddenApps<T>(apps: T[]): T[] {
  return apps.filter((a) => !isHiddenFluxosApp((a as { key?: unknown } | null)?.key));
}
