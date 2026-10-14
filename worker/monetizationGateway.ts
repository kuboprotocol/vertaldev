// Monetization Gateway (Cloudflare, x402): a Cloudflare cobra o agente na
// borda e só repassa a requisição paga com `PAYMENT-CONTEXT`, um JWT Ed25519
// assinado por ela. A origem tem de validar o JWT antes de servir o recurso.
// https://developers.cloudflare.com/monetization-gateway/configuration/payment-validation/
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';

/** JWKS fixado pela Cloudflare — nunca aceitar chave de outra origem. */
export const PAYMENTS_JWKS_URL = 'https://payments.cloudflare.com/certs';

// Fica no escopo do módulo para o cache das chaves durar entre requisições
// do mesmo isolate.
const cloudflareJWKS = createRemoteJWKSet(new URL(PAYMENTS_JWKS_URL));

export type PaymentClaims = JWTPayload & { scheme?: 'exact' | 'upto'; amount?: string };

export type PaymentCheck =
  | { ok: true; claims: PaymentClaims }
  | { ok: false; reason: string };

/** Lê a lista de prefixos pagos de `MONETIZATION_GATEWAY_PATHS` ("/api/paid, /data"). */
export function parsePaidPrefixes(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((p) => p.trim().replace(/\/+$/, ''))
    .filter((p) => p.startsWith('/') && p.length > 1);
}

export function isPaidPath(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Valida o `PAYMENT-CONTEXT`: assinatura Ed25519 do JWKS da Cloudflare,
 * validade (exp/nbf) e audiência igual à URL pedida.
 */
export async function verifyPaymentContext(
  request: Request,
  keys: JWTVerifyGetKey = cloudflareJWKS,
): Promise<PaymentCheck> {
  const token = request.headers.get('payment-context');
  if (!token) return { ok: false, reason: 'missing PAYMENT-CONTEXT' };

  const url = new URL(request.url);
  try {
    const { payload } = await jwtVerify(token, keys, {
      algorithms: ['EdDSA', 'Ed25519'],
      audience: [`${url.origin}${url.pathname}`, url.href],
    });
    return { ok: true, claims: payload as PaymentClaims };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'invalid PAYMENT-CONTEXT' };
  }
}
