// API paga (/api/paid/*), cobrada pelo Monetization Gateway via x402. O
// Worker só chega aqui depois de validar o PAYMENT-CONTEXT (worker/index.ts).
// Entrega em JSON o conteúdo que nas páginas da SPA só aparece depois do
// JavaScript rodar — o que um agente de IA de fato quer consumir.
import { ALTERNATIVES, CATEGORY_LABEL, VERTAL_FEATURES } from '../src/config/alternatives';

export const PAID_API_PREFIX = '/api/paid';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

const RESOURCES = [
  { path: `${PAID_API_PREFIX}/alternatives`, description: 'Comparações Vertal vs outras ferramentas (todas)' },
  { path: `${PAID_API_PREFIX}/alternatives/{slug}`, description: 'Uma comparação pelo slug' },
];

/** Responde uma rota da API paga; 404 para caminhos desconhecidos. */
export function handlePaidApi(request: Request): Response {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json(405, { error: 'method_not_allowed' });
  }
  const path = new URL(request.url).pathname.replace(/\/+$/, '');

  if (path === PAID_API_PREFIX) return json(200, { resources: RESOURCES });

  if (path === `${PAID_API_PREFIX}/alternatives`) {
    return json(200, {
      vertalFeatures: VERTAL_FEATURES,
      categories: CATEGORY_LABEL,
      alternatives: ALTERNATIVES,
    });
  }

  const slug = path.match(/^\/api\/paid\/alternatives\/([a-z0-9-]+)$/)?.[1];
  const alternative = slug && ALTERNATIVES.find((a) => a.slug === slug);
  if (alternative) {
    return json(200, { vertalFeatures: VERTAL_FEATURES, alternative });
  }

  return json(404, { error: 'not_found', resources: RESOURCES });
}
