import { describe, it, expect } from 'vitest';
import worker from './index';

const env = { ASSETS: { fetch: async () => new Response('asset') } };

describe('verificação de propriedade dos buscadores', () => {
  it('serve o arquivo do Naver com 200 e o conteúdo exato, sem redirect', async () => {
    const res = await worker.fetch(new Request('https://vertal.dev/naver70c8557d47a2d0e3ce2e687898979c32.html'), env);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('naver-site-verification: naver70c8557d47a2d0e3ce2e687898979c32.html');
  });

  it('serve o arquivo do Yandex com o código de verificação', async () => {
    const res = await worker.fetch(new Request('https://vertal.dev/yandex_cfa963b04405ac3c.html'), env);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<body>Verification: cfa963b04405ac3c</body>');
  });

  it('outros caminhos continuam indo para os assets', async () => {
    const res = await worker.fetch(new Request('https://vertal.dev/naver-outro.html'), env);
    expect(await res.text()).toBe('asset');
  });
});
