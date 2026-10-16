// Arquivos de verificação de propriedade dos buscadores (Naver, Yandex etc.).
// Servidos pelo Worker, e não de public/, porque a Cloudflare redireciona
// "/arquivo.html" para "/arquivo" (html_handling padrão) e os verificadores
// não seguem o redirect: precisam de 200 exatamente nessa URL.
import { INDEXNOW_KEY } from '../src/config/indexnow';

const FILES: Record<string, string> = {
  // IndexNow (Bing, Yandex, Naver, Seznam): o buscador confere a chave aqui.
  [`/${INDEXNOW_KEY}.txt`]: INDEXNOW_KEY,
  // Naver Search Advisor (Coreia)
  '/naver70c8557d47a2d0e3ce2e687898979c32.html':
    'naver-site-verification: naver70c8557d47a2d0e3ce2e687898979c32.html',
  // Yandex Webmaster (Rússia, Belarus)
  '/yandex_cfa963b04405ac3c.html': `<html>
    <head>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    </head>
    <body>Verification: cfa963b04405ac3c</body>
</html>`,
};

export function siteVerificationResponse(pathname: string): Response | null {
  const body = FILES[pathname];
  if (body === undefined) return null;
  const type = pathname.endsWith('.txt') ? 'text/plain' : 'text/html';
  return new Response(body, {
    headers: { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'public, max-age=3600' },
  });
}
