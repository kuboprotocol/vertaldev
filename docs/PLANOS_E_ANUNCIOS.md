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

**Nenhum anúncio de terceiros fora do Google AdSense roda no site (desde 2026-11-27).** O Google Ads
reprovou o domínio na política "Site comprometido" (redirecionamento malicioso)
porque o bundle carregava a rede Adsterra / TERRA ADS (`effectivecpmnetwork.com`
e o banner `bauval.org` com `atOptions`). Saíram do front-end:

- o intersticial do `AdGate` (`src/hooks/useAdGate.ts`; `src/components/AdGate.tsx` ficou só com o crédito diário),
  que abria o Smartlink TERRA numa aba nova 1,5 s depois de navegar (Free e Starter);
- o banner nativo TERRA (`TerraNativeBanner`, `SponsoredSlot` no Painel Criativo);
- os banners `AdBanner` / `CreativeAdFrame` / `AdFrameSquare` (`bauval.org`);
- o painel "Recompensa por anúncio TERRA ADS" de `/recompensas` (`TerraRewardsPanel`).

O crédito diário do plano continua rodando no `AdGate` (sem anúncio nenhum).

`shouldShowAd()` e `AD_SUPPORTED_PLANS` continuam em `src/lib/planConfig.ts`
(com o teste `src/test/ad-policy.test.ts`) e `public.ad_impressions` continua no
banco. Nenhum plano tem anúncio interruptivo (intersticial, pop-up, nova aba).

### Google AdSense (display, desde 2026-11-27)

Nos lugares onde ficavam os banners TERRA/Adsterra há um bloco de display do
**Google AdSense**, só com o cliente `ca-pub-6320473908706491`
(`src/lib/adsense.ts`, componente `src/components/ads/AdSenseDisplay.tsx`):

- só para **Free e Starter** (`useAdEligibility` → `shouldShowAd` / `AD_SUPPORTED_PLANS`);
  admin, planos pagos, visitante sem login e erro ao ler o plano não veem anúncio;
- bloco responsivo (`data-ad-format="auto"`, `data-full-width-responsive="true"`)
  com o rótulo **"Publicidade"**; nada de pop-up, popunder, `window.open`,
  redirecionamento, intersticial ou outra rede;
- nunca dentro do painel de recompensas (`CreativeRewardsPanel`, `/recompensas`)
  nem colado nos botões do vídeo premiado (política do AdSense contra incentivar cliques);
- o ID do bloco é `ADSENSE_DISPLAY_SLOT_ID` (variável de build
  `VITE_ADSENSE_DISPLAY_SLOT_ID`). **Vazio = nenhum bloco e o script não carrega.**
  Crie um bloco de display responsivo no painel do AdSense e preencha o ID.
- `public/ads.txt` declara `google.com, pub-6320473908706491, DIRECT, f08c47fec0942fa0`.

Lugares: Painel Criativo `/creative` (um bloco acima das abas, no lugar do banner de
topo + SponsoredSlot, e um no rodapé, no lugar do banner de rodapé); Design Premium
(topo, fora do modo Canvas); início do mundo Canvas; topo de cada categoria do
`CreativePanel`; e o fim da página inicial do `CreativePanel` (o lugar antigo, entre o
Design Premium e as categorias, agora é das recompensas).

Além dos blocos de display do Google AdSense (acima), a outra monetização por anúncio é o **vídeo premiado AppLixir**
(`src/lib/applixirRewarded.ts`, `RewardedVideoPanel`, função `rewarded-video-claim`),
que o usuário abre por vontade própria e não redireciona.

### App nativo: Google AdMob (desde 2026-11-27)

O app nativo do Vertal Dev é o **Capacitor** (`capacitor.config.ts`, appId `dev.kubovibe.app`,
`webDir: dist`; abre direto no cliente `/m`, ver `docs/android-build.md` e `docs/ios-build.md`).
As pastas `android/` e `ios/` **não ficam no repositório** (são geradas por `npx cap add`).
O app Android "Vertal Node" em `native/node-sdks/android` é outro app (compartilhamento de banda), sem anúncios.

Dentro do app o AdSense **nunca carrega**; os mesmos lugares (componente `AdSlot`) usam o
**Google AdMob** (`@capacitor-community/admob` 8.4.2, `src/lib/admob.ts`, `src/config/admob.ts`):

| | Site | App (Android/iOS) |
|---|---|---|
| Lugares de display (os 6 acima) | bloco AdSense no lugar | banner adaptativo AdMob fixo embaixo, só enquanto um desses lugares está na tela (some quando sai) |
| Vídeo premiado (`RewardedVideoPanel`) | AppLixir / Google Ad Manager | AdMob premiado quando há bloco premiado configurado; sem bloco, fica o provedor que já existia |

- Mesma regra de plano: só **Free e Starter** (`useAdEligibility`); admin, pagos e visitante não veem.
- **Nunca os dois**: `AdSlot` escolhe AdSense no site e AdMob no app; `AdSenseDisplay` também se desliga no app.
- Banner **nunca** com o painel do vídeo premiado na tela (zona de exclusão no `RewardedVideoPanel`).
- Sem intersticial, sem anúncio na abertura do app, sem pop-up. O SDK só inicializa quando um
  lugar de anúncio aparece para Free/Starter ou no clique do vídeo premiado.
- Consentimento: formulário **UMP** do Google (configure em AdMob → Privacidade e mensagens) e depois
  **ATT** no iOS 14+; sem ATT autorizado → anúncios não personalizados (`npa`). `VITE_ADMOB_NPA=true` força `npa` sempre.
- O servidor `rewarded-video-claim` ainda não conhece o provedor `admob`: grava a sessão como `gam`
  até uma migração ampliar o CHECK de `rewarded_video_sessions.provider`. O crédito segue a mesma regra
  (nonce, tempo mínimo, cooldown, limite diário).

**IDs** (publisher `pub-6320473908706491`). Ainda **não existe** app/bloco do Vertal Dev no AdMob:

| Build | Blocos (JS) | App ID nativo |
|---|---|---|
| `vite` / `--mode development` / `npm run cap:sync:debug` (`VITE_ADMOB_TESTING=true`) | **TESTE** do Google, `isTesting=true` | `npm run cap:admob` sem variáveis = App ID de TESTE |
| `vite build` (produção) | `VITE_ADMOB_ANDROID_BANNER_ID`, `VITE_ADMOB_IOS_BANNER_ID`, `VITE_ADMOB_ANDROID_REWARDED_ID`, `VITE_ADMOB_IOS_REWARDED_ID` (ou `src/config/admob.ts`). **Vazio = sem anúncio** (nunca bloco de teste para usuário real) | `ADMOB_ANDROID_APP_ID=… ADMOB_IOS_APP_ID=… npm run cap:admob` |

O que criar no AdMob (Apps → Adicionar app, plataforma, "não publicado ainda"):
1. App **"Vertal Dev"** Android (pacote `dev.kubovibe.app`) → App ID `ca-app-pub-6320473908706491~…`
2. App **"Vertal Dev"** iOS (bundle `dev.kubovibe.app`) → App ID
3. Em cada app: bloco **Banner** ("Vertal Dev Android - Banner" / "Vertal Dev iOS - Banner")
4. Opcional: bloco **Premiado** ("Vertal Dev Android - Premiado" / "Vertal Dev iOS - Premiado"), recompensa 1 crédito
5. Privacidade e mensagens: mensagem GDPR (UMP) e, para iOS, a mensagem explicativa do IDFA.

`npm run cap:admob` (`scripts/admob-native-config.mjs`) põe o App ID no `AndroidManifest.xml`
(`com.google.android.gms.ads.APPLICATION_ID`) e no `Info.plist` (`GADApplicationIdentifier`,
`NSUserTrackingUsageDescription`, `SKAdNetworkItems`). **Obrigatório** depois de `npx cap add`/`sync`:
sem App ID o app Android fecha na abertura. Outras variáveis: `VITE_ADMOB_ENABLED`, `VITE_ADMOB_BANNER_ENABLED`,
`VITE_ADMOB_REWARDED_ENABLED`, `VITE_ADMOB_TEST_DEVICE_IDS`, `VITE_ADMOB_DEBUG_GEOGRAPHY` (`EEA`/`NOT_EEA`/`US`),
`VITE_ADMOB_TAG_UNDER_AGE_OF_CONSENT`. **Nunca clique nos seus próprios anúncios reais.**

`public/app-ads.txt` (`google.com, pub-6320473908706491, DIRECT, f08c47fec0942fa0`) é servido em
`https://vertal.dev/app-ads.txt`; coloque `https://vertal.dev` como site do desenvolvedor nas fichas da
Google Play e da App Store para o AdMob verificar.

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
