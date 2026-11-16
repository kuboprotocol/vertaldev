// Classificador de complexidade do pedido (flash x pro), parte pura.
// Sem Deno/DOM: usado pelo roteador DeepSeek, pelo gateway e pelo orquestrador do Vertal Chat.

const COMPLEX_KEYWORDS = [
  "refator", "refactor", "arquitetur", "architecture", "migrar", "migration",
  "redesenh", "redesign", "multi-arquivo", "multi-file", "debug profundo",
  "deep debug", "performance crítica", "security audit", "auditoria de segurança",
  "reescrever", "rewrite", "estrutura de dados", "database schema",
];

/** Heurística simples de classificação — MVP; refinar com telemetria de uso real depois. */
export function classifyComplexity(text: string): "flash" | "pro" {
  const normalized = text.toLowerCase();
  const hasComplexKeyword = COMPLEX_KEYWORDS.some((k) => normalized.includes(k));
  const isLong = text.length > 1200;
  return hasComplexKeyword || isLong ? "pro" : "flash";
}
