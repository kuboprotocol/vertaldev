// Apps do Vertal Fluxos fora do catálogo público (mesma lista de HIDDEN_FLUXOS_APPS em
// src/lib/fluxosConnectors.ts). O motor e os fluxos continuam; nada é apagado.
// - Vertal Chat: não lista esses apps nem abre conexão nova com eles.
// - Quem já tem conexão (fluxos_connections) continua usando normalmente.
// OpenAI/OpenRouter/Azure OpenAI/Anthropic/Mistral AI/Together AI/Perplexity/Helix: o Vertal vende a própria IA white-label (26/11/2026). Isto NÃO afeta o
// uso interno desses provedores pelo backend de IA do Vertal.
export const HIDDEN_FLUXOS_APPS: ReadonlySet<string> = new Set([
  "flickr", "strava",
  // Sem uso para o público do Vertal Dev ou sem função real (auditoria de conectores sem OAuth, 26/11/2026):
  "airbrake", "flowers-software", "freescout", "placetel", "virtualq", "firefly-iii",
  // Fornecedores de modelos de IA (white-label):
  "openai", "openrouter", "azure-openai", "anthropic", "mistral-ai", "together-ai", "perplexity", "helix",
]);

export function isHiddenFluxosApp(app: unknown): boolean {
  return typeof app === "string" && HIDDEN_FLUXOS_APPS.has(app.trim().toLowerCase());
}

/** Tira os apps escondidos de uma lista vinda do motor (GET /apps). */
export function withoutHiddenApps<T>(apps: T[]): T[] {
  return apps.filter((a) => !isHiddenFluxosApp((a as { key?: unknown } | null)?.key));
}
