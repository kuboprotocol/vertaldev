# Planos e anúncios

Regras comerciais do Vertal Vibe Dev (KUBO Protocol). A fonte da verdade é o
código listado em cada seção; este documento explica o que ele faz e por quê.

## Planos à venda

Só planos de até **US$ 49,99/mês** são vendidos.

| Plano | Preço/mês | Anual (−20%) | Lifetime (6× o mensal) | Créditos | Anúncios |
|---|---|---|---|---|---|
| Free | US$ 0 | — | — | 5 no cadastro (1×) | A cada 6 h |
| Starter | US$ 4,99 | US$ 47,90 | US$ 29,94 | 5 por dia | A cada 12 h |
| Pro | US$ 19,99 | US$ 191,90 | US$ 119,94 | 5 por dia | Nenhum |
| Premium 1 | US$ 49,99 | US$ 479,90 | US$ 299,94 | 5 por dia | Nenhum |

- **Página:** `src/pages/PricingPage.tsx` (constante `ESSENTIALS`).
- **Checkout:** `supabase/functions/create-checkout/index.ts` (`PLAN_PRICES`).
  Qualquer outro plano responde `400 Unknown plan`, então não é possível
  comprá-lo nem chamando a API direto.
- **Teste de regressão:** `src/test/pricing-cap.test.ts` falha se um plano
  acima de US$ 49,99 voltar à página ou ao checkout.

### Planos fora de venda

Premium 2 (US$ 79,99), Business 1–7 (US$ 99,99 a 699,99) e Enterprise saíram
da página e do checkout. Eles continuam em `src/lib/planConfig.ts` e em
`supabase/functions/stripe-webhook/index.ts` para que **assinaturas já
existentes** sigam funcionando até serem canceladas.

## Anúncios

**Somente Free e Starter (US$ 4,99) exibem anúncio.** Todos os outros planos
ficam travados sem anúncio intersticial: Pro, Premium 1, os planos legados
(Premium 2, Business, Enterprise) e Beta. Não importa se há acordo de parceria.

| Plano | Intersticial |
|---|---|
| Free | A cada 6 h |
| Starter | A cada 12 h |
| Qualquer outro | Nunca |

Como funciona:

- `AD_SUPPORTED_PLANS = ['free', 'starter']` em `src/lib/planConfig.ts`.
  `shouldShowAd()` retorna `false` para qualquer plano fora dessa lista, antes
  de olhar frequência ou parceria.
- `src/hooks/useAdGate.ts` lê o plano do usuário em `subscriptions` e a última
  exibição em `ad_impressions`. Quem não tem assinatura conta como Free.
- `src/components/AdGate.tsx` dispara o anúncio 1,5 s depois de abrir o app.
  Nunca dispara em `/auth`, `/login`, `/shortlinks`, `/pricing`, `/checkout`
  e `/partner-agreement`.
- Admins nunca veem anúncio.
- **Teste:** `src/test/ad-policy.test.ts` cobre cada plano.

### Shortlinks (opcional, todos os planos)

A página `/shortlinks` não é anúncio empurrado: o próprio usuário decide abrir
os shortlinks TERRA ADS para ganhar créditos extras (+0,5 cada, +5 no 10º,
até 10 por dia). Por isso ela continua disponível em todos os planos, inclusive
nos pagos.

## Como mudar

- **Novo plano à venda:** adicione em `PLAN_CONFIG`, em `ESSENTIALS` e em
  `PLAN_PRICES` (valores em centavos). Se passar de US$ 49,99, ajuste também o
  teto em `src/test/pricing-cap.test.ts`, o que deve ser uma decisão explícita.
- **Colocar ou tirar anúncio de um plano:** edite `AD_SUPPORTED_PLANS` e
  `adFrequencyHours` em `src/lib/planConfig.ts` e atualize este documento e
  `src/test/ad-policy.test.ts`.
