// Formulário "Autenticador (TOTP)" do Vertal Navigator: transforma o site digitado
// pelo usuário no slug `bound_to` do cofre e no nome do segredo (*_TOTP).
import { isTotpSecretName, totpSeedError } from '../../../supabase/functions/_shared/totp';

/** "https://www.GitHub.com/login" → "github-com" (casa github.com e subdomínios). null se inválido. */
export function totpBoundSlug(site: string): string | null {
  let host = site.trim().toLowerCase();
  if (!host) return null;
  try {
    host = new URL(/^[a-z]+:\/\//.test(host) ? host : `https://${host}`).hostname;
  } catch {
    return null;
  }
  host = host.replace(/^www\./, '').replace(/\.$/, '');
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) return null;
  const slug = host.replace(/\./g, '-');
  return slug.length <= 64 ? slug : null;
}

/** "github-com" → "GITHUB_COM_TOTP". */
export function totpEnvKey(slug: string): string {
  return `${slug.toUpperCase().replace(/[^A-Z0-9]/g, '_').replace(/^[^A-Z]+/, '').slice(0, 58)}_TOTP`;
}

export interface TotpFormResult {
  ok: boolean;
  error?: string;
  boundTo?: string;
  envKey?: string;
}

/** Valida o formulário inteiro. O consentimento explícito é obrigatório. */
export function validateTotpForm(input: { site: string; seed: string; consent: boolean }): TotpFormResult {
  const boundTo = totpBoundSlug(input.site);
  if (!boundTo) return { ok: false, error: 'Informe o site, por exemplo github.com.' };
  const seedErr = totpSeedError(input.seed);
  if (seedErr) return { ok: false, error: seedErr };
  if (!input.consent) return { ok: false, error: 'Marque a autorização para a Vertal gerar os códigos deste site.' };
  const envKey = totpEnvKey(boundTo);
  if (!isTotpSecretName(envKey)) return { ok: false, error: 'Não consegui montar o nome do segredo para esse site.' };
  return { ok: true, boundTo, envKey };
}
