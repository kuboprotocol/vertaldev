// Redirecionamentos permanentes (301) das rotas antigas do Vertal Vibe Pay
// (antes "Vertal Vibe Bank" / "VERTAL Bank" / "Carteira"). O nome mudou por
// causa da Resolução Conjunta CMN/BCB nº 17/2025 (sem "banco"/"bank" para
// quem não tem licença bancária). Usado pelo Worker antes de servir assets;
// o React Router tem os mesmos aliases para navegação interna e `vite dev`.
import { splitLocalePath } from '../src/config/locales';

/** Landing pública: aceita prefixo de idioma (`/es/vibe-bank` → `/es/vibe-pay`). */
const LANDING: Record<string, string> = {
  '/vibe-bank': '/vibe-pay',
  '/vertal-vibe-bank': '/vibe-pay',
  '/vertal-vibe-pay': '/vibe-pay',
};

/** App logado (sem prefixo de idioma). */
const APP: Record<string, string> = {
  '/bank': '/pay',
  '/vertal-bank': '/pay',
  '/wallet': '/pay',
  '/carteira': '/pay',
};

/** Caminho novo para uma rota antiga, ou null. Query e hash ficam com quem chama. */
export function legacyRedirectPath(pathname: string): string | null {
  const clean = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  if (APP[clean]) return APP[clean];
  // Imagens antigas (OG em cache de redes sociais): /vibe-bank/og-image.jpg → /vibe-pay/og-image.jpg.
  if (clean.startsWith('/vibe-bank/')) return `/vibe-pay/${clean.slice('/vibe-bank/'.length)}`;
  const [code, path] = splitLocalePath(clean);
  const target = LANDING[path];
  if (!target) return null;
  return code ? `/${code}${target}` : target;
}

/** Resposta 301 para a URL antiga (mantém a query string), ou null. */
export function legacyRedirect(url: URL): Response | null {
  const path = legacyRedirectPath(url.pathname);
  if (!path) return null;
  return new Response(null, {
    status: 301,
    headers: { Location: `${url.origin}${path}${url.search}`, 'Cache-Control': 'public, max-age=86400' },
  });
}
