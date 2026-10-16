// Arquivos de verificação de propriedade dos buscadores (Naver etc.).
// Servidos pelo Worker, e não de public/, porque a Cloudflare redireciona
// "/arquivo.html" para "/arquivo" (html_handling padrão) e os verificadores
// não seguem o redirect: precisam de 200 exatamente nessa URL.
const FILES: Record<string, string> = {
  // Naver Search Advisor (Coreia)
  '/naver70c8557d47a2d0e3ce2e687898979c32.html':
    'naver-site-verification: naver70c8557d47a2d0e3ce2e687898979c32.html',
};

export function siteVerificationResponse(pathname: string): Response | null {
  const body = FILES[pathname];
  if (body === undefined) return null;
  return new Response(body, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
}
