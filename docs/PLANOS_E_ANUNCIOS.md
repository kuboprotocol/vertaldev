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

## Banco de dados (Supabase)

A tabela `public.plan_config` espelha as mesmas regras
(migração `supabase/migrations/20260926200000_plan_config_ads_and_sale.sql`):

| Coluna | Regra |
|---|---|
| `ads_enabled` | `true` só para `free` e `starter` |
| `ad_frequency_hours` | 6 (Free), 12 (Starter), `NULL` nos demais |
| `is_for_sale` | `true` só para Free, Starter, Pro e Premium 1 |

Duas `CHECK constraints` impedem regressões direto no banco:

- `plan_config_ads_only_free_starter`: nenhum plano além de Free e Starter
  pode ter anúncio ligado.
- `plan_config_sale_price_cap`: nenhum plano acima de US$ 49,99 pode ser
  marcado como à venda.

O checkout em produção (`create-checkout`, versão 6) já recusa planos fora
da venda.

## Como mudar

- **Novo plano à venda:** adicione em `PLAN_CONFIG`, em `ESSENTIALS` e em
  `PLAN_PRICES` (valores em centavos). Se passar de US$ 49,99, ajuste também o
  teto em `src/test/pricing-cap.test.ts`, o que deve ser uma decisão explícita.
- **Colocar ou tirar anúncio de um plano:** edite `AD_SUPPORTED_PLANS` e
  `adFrequencyHours` em `src/lib/planConfig.ts`. Faça também uma migração
  alterando `plan_config` e a constraint `plan_config_ads_only_free_starter`.
  Depois atualize este documento e `src/test/ad-policy.test.ts`.

## Créditos no jogo Living Worlds

O jogo **não tem apostas** e não movimenta créditos KUBO. A ação "trocar"
dos NPCs usa só **moedas do jogo** (1 a 50, limitadas em `src/game/actions.ts`),
que não valem dinheiro nem créditos. O prompt do NPC (`game-npc-ai`) também
proíbe falar em créditos ou apostas. Qualquer mudança nisso (ex.: gastar
créditos dentro do jogo) precisa de decisão explícita de produto e revisão
jurídica antes de ir ao código.

## Indicação e afiliação (5%)

- **Link:** cada usuário tem um link `https://vertal.dev/auth?ref=CODIGO`
  (Perfil e Dashboard). O código é gravado no cadastro por e-mail e também no
  login com GitHub (contas novas).
- **Indicação:** quando alguém se cadastra pelo link, o trigger
  `handle_new_user` cria a linha em `referrals` (sem créditos). Os **+100
  créditos** de quem indicou saem só no **primeiro pagamento** do indicado,
  uma vez, registrados no extrato (`credit_transactions`, `referral_bonus`).
  Isso impede ganhar créditos criando contas falsas.
- **Afiliação:** a cada pagamento do indicado (plano, renovação ou compra de
  créditos) o `stripe-webhook` chama `record_affiliate_commission`, que grava
  **5%** do valor em `affiliate_commissions` com status `pending`. Um pagamento
  gera no máximo uma comissão. O afiliado vê o total no Perfil.
- **Pagamento ao afiliado:** ainda manual (marcar `approved`/`paid`). Definir
  a forma de saque (Pix/Stripe Connect ou crédito na plataforma) antes de
  divulgar o programa.
