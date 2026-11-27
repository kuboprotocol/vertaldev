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

**Nenhum anúncio de terceiros roda no site (desde 2026-11-27).** O Google Ads
reprovou o domínio na política "Site comprometido" (redirecionamento malicioso)
porque o bundle carregava a rede Adsterra / TERRA ADS (`effectivecpmnetwork.com`
e o banner `bauval.org` com `atOptions`). Saíram do front-end:

- o intersticial do `AdGate` (`src/components/AdGate.tsx` + `src/hooks/useAdGate.ts`),
  que abria o Smartlink TERRA numa aba nova 1,5 s depois de navegar (Free e Starter);
- o banner nativo TERRA (`TerraNativeBanner`, `SponsoredSlot` no Painel Criativo);
- os banners `AdBanner` / `CreativeAdFrame` / `AdFrameSquare` (`bauval.org`);
- o painel "Recompensa por anúncio TERRA ADS" de `/recompensas` (`TerraRewardsPanel`).

O crédito diário do plano, que rodava dentro do `AdGate`, agora roda em
`src/components/DailyCreditsSync.tsx`.

`shouldShowAd()` e `AD_SUPPORTED_PLANS` continuam em `src/lib/planConfig.ts`
(com o teste `src/test/ad-policy.test.ts`) e `public.ad_impressions` continua no
banco, mas nada no app os usa mais. A coluna "Anúncios" da tabela acima é
histórica: hoje nenhum plano tem anúncio interruptivo.

A única monetização por anúncio que fica é o **vídeo premiado AppLixir**
(`src/lib/applixirRewarded.ts`, `RewardedVideoPanel`, função `rewarded-video-claim`),
que o usuário abre por vontade própria e não redireciona.

### Checklist diário de `/recompensas`

O banco ainda exige o passo "TERRA" no checklist (`daily_reward_checklist`).
Sem o anúncio, o front-end fecha esse passo pelo caminho que já existia para
anúncio indisponível: ao abrir `/recompensas`, chama `daily-rewards?action=terra-unavailable`
(`reason: panel_error`, 1 registro por dia), e o passo conta como feito com
`terra_fallback_videos_required` vídeos premiados no dia (padrão 2). Na tela o
passo aparece como "Assista a 1 vídeo premiado extra".

Pendente no servidor (não feito neste PR): tirar o passo TERRA do checklist por
migração, desligar as ações `ad-status`/`ad-click`/`ad-withdraw` da função
`shortlinks` e a função antiga `terra-ad-reward`, e decidir o que fazer com o saldo
TERRA pendente de quem ainda não chegou ao mínimo de retirada (tabela `ad_rewards`).

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
- **Voltar a ter anúncio:** hoje não há anúncio de terceiros no site (veja
  "Anúncios"). Qualquer rede nova precisa passar pelas políticas do Google Ads
  antes: nada de popunder, smartlink, aba nova ou redirecionamento automático.

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
  `handle_new_user` cria a linha em `referrals` e dá **50 créditos** a quem
  indicou, registrados no extrato (`credit_transactions`, `referral_bonus`).
  Quem se cadastra pelo link ganha **5 créditos por dia**, a cada 24 horas por
  login.
- **Afiliação:** a cada pagamento do indicado (plano, renovação ou compra de
  créditos) o `stripe-webhook` chama `record_affiliate_commission`, que grava
  **5%** do valor em `affiliate_commissions` com status `pending`. Um pagamento
  gera no máximo uma comissão. O afiliado vê o total no Perfil.
- **Pagamento ao afiliado:** ainda manual (marcar `approved`/`paid`). Definir
  a forma de saque (Pix/Stripe Connect ou crédito na plataforma) antes de
  divulgar o programa.
