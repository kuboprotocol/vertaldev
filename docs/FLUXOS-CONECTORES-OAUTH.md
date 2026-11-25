# Conectores do Vertal Fluxos: conexão por usuário e ações no Vertal Chat

Os 74 apps do catálogo "via Vertal Fluxos" (slug `fluxos-<app>`) agora se conectam
direto no Vertal Dev e o Vertal Chat usa as ações e buscas deles.

## Peças
- **Motor (fork, `packages/backend/src/routes/vertal.js`)**: API interna `/internal/vertal`
  protegida por `VERTAL_INTERNAL_KEY` (Railway, automatisch-main e worker). Cria/verifica/apaga
  conexões em nome de um usuário de serviço (admin mais antigo, ou `VERTAL_SERVICE_USER_EMAIL`),
  gera a URL do OAuth, roda ação ou busca (gatilho de consulta, até 20 itens) e dados dinâmicos.
  `VERTAL_OAUTH_REDIRECT_TEMPLATE=https://vertal.dev/fluxos/oauth/{APP_KEY}` faz o retorno do
  OAuth cair no Vertal Dev (white-label).
- **Supabase**: tabela `fluxos_connections` (usuário ↔ conexão no motor, estado), RLS só leitura
  do dono. Segredos: `FLUXOS_INTERNAL_URL`, `FLUXOS_INTERNAL_KEY` e os clientes OAuth
  `FLUXOS_OAUTH_<APP>_ID` / `_SECRET` (apps Google usam `FLUXOS_OAUTH_GOOGLE_*`; Discord também
  `FLUXOS_OAUTH_DISCORD_BOT`).
- **creative-router** (`tool: "fluxos_apps"`, `_shared/fluxosAppsHandler.ts`): ops `status`,
  `describe`, `start`, `complete`, `disconnect`, `run`, `options`. `run` vindo do chat cobra
  2 créditos (`chatCharge` = idempotência) e devolve se falhar.
- **Front**: `/connectors/fluxos-<app>/setup` mostra `FluxosConnectPanel` (botão "Entrar com <App>"
  quando o Vertal tem cliente OAuth; senão o formulário de campos do app, incluindo client id/secret
  do próprio usuário). Retorno em `/fluxos/oauth/:app` (`FluxosOAuthCallbackPage`).
- **Chat**: ferramenta `fluxos` (`actions` | `options` | `run`), só no prompt quando a conversa
  cita um app conectado. Ação que muda algo passa pelo cartão de aprovação.

## Cadastrar um cliente OAuth novo
1. Criar o app no provedor com retorno `https://vertal.dev/fluxos/oauth/<app>`.
2. Salvar `FLUXOS_OAUTH_<APP>_ID` e `_SECRET` nos segredos das Edge Functions. Não precisa deploy.

## Anúncios, redes sociais e eBay (nov/2026)
Apps novos no motor (fork): `facebook`, `instagram`, `whatsapp`, `meta-ads`, `tiktok-ads`,
`amazon-ads`, `ebay`, `kwai-ads`. Retorno sempre `https://vertal.dev/fluxos/oauth/<app>`
(eBay: pelo RuName, cujo "auth accepted URL" é essa mesma URL).

| Conector | Segredos (Edge Functions) | Ações (pedem aprovação, 2 créditos) | Buscas |
| --- | --- | --- | --- |
| Facebook Páginas | `FLUXOS_OAUTH_META_ID/_SECRET` (+ `FLUXOS_OAUTH_FACEBOOK_CONFIG` opcional) | post, post com foto | páginas, posts, insights |
| Instagram Business | idem Meta (+ `_INSTAGRAM_CONFIG`) | publicar foto, publicar Reel | contas, mídias, insights |
| WhatsApp Business | idem Meta (+ `_WHATSAPP_CONFIG`) | enviar template, enviar texto (janela 24 h) | números, templates |
| Meta Ads | idem Meta (+ `_META_ADS_CONFIG`) | criar campanha (PAUSADA), pausar/ativar | contas, campanhas, relatório |
| TikTok Ads | `FLUXOS_OAUTH_TIKTOK_ADS_ID/_SECRET` (App ID/Secret) | criar campanha (desligada), ligar/desligar | contas, campanhas, relatório |
| Amazon Ads | `FLUXOS_OAUTH_AMAZON_ADS_ID/_SECRET` (Login with Amazon) | criar campanha SP (PAUSADA), pausar/ativar, pedir relatório | perfis, campanhas, status do relatório |
| eBay | `FLUXOS_OAUTH_EBAY_ID/_SECRET/_RUNAME` (produção) ou `FLUXOS_OAUTH_EBAY_SANDBOX_ID/_SECRET/_RUNAME` | criar/atualizar item, local de estoque, criar oferta, publicar oferta, rastreio | pedidos, itens, ofertas, políticas |
| Kwai Ads | `FLUXOS_OAUTH_KWAI_ADS_ID/_SECRET` | — (escrita depende de liberação da Kwai) | contas, consulta de relatório |

- Todos ganham também a ação genérica "API request" do motor.
- Os quatro da Meta usam o mesmo app da Meta ("Vertal Dev"). `*_CONFIG` = ID de configuração do
  Facebook Login for Business; sem ele o login usa a lista de permissões (`scope`).
- Kwai (login de usuário/postagem): não existe plataforma pública fora da China — não implementado.
- Exclusão de conta do eBay (exigida no keyset de produção): Edge Function `ebay-account-deletion`
  (sem JWT), segredos `EBAY_VERIFICATION_TOKEN` e `EBAY_DELETION_ENDPOINT`. O vertal.dev fica atrás do
  Bot Fight Mode da Cloudflare, por isso o endpoint fica no Supabase.
- Liberação pública depende das revisões dos provedores (App Review/Business Verification da Meta,
  revisão de desenvolvedor do TikTok, acesso à Amazon Ads API, aprovação da conta eBay Developers,
  acesso de desenvolvedor no Kwai Business Center).
