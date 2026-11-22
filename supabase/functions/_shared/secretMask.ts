// Máscara de valores sensíveis do Vertal Navigator (sem dependências: Worker, front, edge, Vitest).
// Espelho em Python: mask_secret_like no navd.py; casos em infra/vertal-browser/auth_cases.json.
//
// Incidente 22/11: um resultado do Navigator mostrou no chat o valor bruto de um
// segredo de 32 caracteres. Tudo que sai do navegador para o chat, o histórico, a
// auditoria ou os logs passa por maskSecretLike (forma de chave/token) e, no navd,
// também pela máscara de valores exatos entregues nesta sessão.
export const SECRET_MASK = "[segredo oculto]";

const JWT_RE = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;
const PREFIXED_KEY_RE = /\b(?:sk|pk|rk|ghp|gho|ghs|ghu|github_pat|xox[abprs]|glpat|shpat|whsec)[-_][A-Za-z0-9_-]{12,}|\bAKIA[A-Z0-9]{16}\b|\bAIza[A-Za-z0-9_-]{30,}/g;
const TOKEN_RE = /[A-Za-z0-9_+=-]{20,}/g;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Parece chave/token/senha gerada? (hex longo, ou maiúscula+minúscula+dígito bem misturados; nunca UUID.) */
export function isSecretLikeToken(tok: string): boolean {
  if (tok.length < 20 || UUID_RE.test(tok)) return false;
  if (/^[0-9a-f]{32,}$/i.test(tok) && /\d/.test(tok) && /[a-f]/i.test(tok)) return true;
  if (!(/[a-z]/.test(tok) && /[A-Z]/.test(tok) && /\d/.test(tok))) return false;
  // Identificadores em CamelCase com número (ex.: "NavigatorPanelV2Component") não são segredo:
  // exige mistura — pelo menos 4 trocas entre letra e dígito.
  let switches = 0;
  for (let i = 1; i < tok.length; i++) {
    if (/\d/.test(tok[i]) !== /\d/.test(tok[i - 1])) switches++;
  }
  return switches >= 4;
}

/** Troca chaves/tokens/JWT por [segredo oculto]. Imagens em data URL passam intactas. */
export function maskSecretLike(text: unknown): string {
  const s = String(text ?? "");
  if (!s || s.startsWith("data:image/")) return s;
  return s
    .replace(JWT_RE, SECRET_MASK)
    .replace(PREFIXED_KEY_RE, SECRET_MASK)
    .replace(TOKEN_RE, (tok) => (isSecretLikeToken(tok) ? SECRET_MASK : tok));
}

/** Troca valores exatos conhecidos (ex.: o que o usuário acabou de digitar no cartão). */
export function maskKnownValues(text: unknown, values: Iterable<string>): string {
  let s = String(text ?? "");
  const list = [...values].filter((v) => typeof v === "string" && v.length >= 4).sort((a, b) => b.length - a.length);
  for (const v of list) s = s.split(v).join(SECRET_MASK);
  return s;
}

/** Aplica maskSecretLike em todo texto de um objeto (eventos, resultados). */
export function maskDeep<T>(value: T): T {
  if (typeof value === "string") return maskSecretLike(value) as T;
  if (Array.isArray(value)) return value.map((v) => maskDeep(v)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = maskDeep(v);
    return out as T;
  }
  return value;
}
