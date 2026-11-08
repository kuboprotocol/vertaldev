// Links para o Cofre de segredos (/secrets) já com o formulário preenchido.
// Usados pelo agente do Vibe Code quando uma API precisa de chave.

export const SECRETS_PATH = "/secrets";

/** /secrets?env_key=ACME_API_KEY&name=API%20Acme — abre "Novo segredo" preenchido. */
export function newSecretPath(envKey?: string | null, name?: string | null): string {
  const params = new URLSearchParams();
  if (envKey) params.set("env_key", envKey);
  if (name) params.set("name", name);
  const qs = params.toString();
  return qs ? `${SECRETS_PATH}?${qs}` : SECRETS_PATH;
}
