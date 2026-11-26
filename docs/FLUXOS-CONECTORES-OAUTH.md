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

## Microsoft: Outlook, Microsoft 365 e Teams (nov/2026)
Apps no motor (fork): `microsoft-outlook`, `microsoft-365`, `microsoft-teams` (helper
`helpers/microsoft-graph.js`). Um app só no Microsoft Entra ("Vertal Dev", contas de qualquer
organização + contas Microsoft pessoais), segredos `FLUXOS_OAUTH_MICROSOFT_ID` / `_SECRET`.
Retornos (Web): `https://vertal.dev/fluxos/oauth/microsoft-outlook`, `/microsoft-365`, `/microsoft-teams`.

| Conector | Login | Escopos (delegados, sem consentimento de admin) | Ações (aprovação, 2 créditos) | Buscas |
| --- | --- | --- | --- | --- |
| Outlook | `common` (pessoal + trabalho) | Mail.ReadWrite, Mail.Send, Calendars.ReadWrite | enviar e-mail, criar rascunho, responder, criar evento | e-mails (lista/busca), ler e-mail, eventos dos próximos dias, pastas, calendários |
| Microsoft 365 | `common` | Files.ReadWrite, Tasks.ReadWrite | enviar arquivo ao OneDrive (até 4 MB, texto ou URL), criar pasta, criar tarefa no To Do, concluir tarefa | arquivos (pasta), busca no OneDrive, listas e tarefas do To Do |
| Microsoft Teams | `organizations` (só trabalho/escola) | Team.ReadBasic.All, Channel.ReadBasic.All, ChannelMessage.Send, Chat.ReadWrite | mensagem em canal, mensagem em chat | equipes, canais, chats |

Todos pedem também `openid profile email offline_access User.Read` e ganham a ação "API request".
- Sem verificação de editor (Microsoft Partner Network), a tela de consentimento mostra o app como
  "não verificado"; em muitas organizações o usuário comum não consegue consentir apps multilocatário
  não verificados (o admin precisa aprovar). Contas pessoais conseguem.
- Teams não funciona com conta Microsoft pessoal (a API do Teams é só de trabalho/escola).

## Google Ads, AdMob e AdSense (nov/2026)
Apps no motor (fork): `google-ads`, `google-admob`, `google-adsense` (helper `helpers/google-oauth.js`); fork PR #9, vertaldev PR #252.
Mesmo cliente OAuth dos apps Google ("Vertal Fluxos", projeto Cloud `parabolic-eon-462823-g2`), segredos
`FLUXOS_OAUTH_GOOGLE_ID` / `_SECRET`. Retornos: `https://vertal.dev/fluxos/oauth/google-ads`, `/google-admob`, `/google-adsense`.
APIs ativadas no projeto: Google Ads API, AdMob API, AdSense Management API.

| Conector | Escopos | Ações (aprovação, 2 créditos) | Buscas |
| --- | --- | --- | --- |
| Google Ads (API v26) | `adwords` (sensível) | pausar/ativar campanha | contas acessíveis, campanhas, desempenho por campanha, consulta GAQL (só SELECT) |
| Google AdMob (v1) | `admob.readonly`, `admob.report` | — (só leitura) | contas, apps, blocos de anúncio, relatório de rede, relatório de mediação |
| Google AdSense (v2) | `adsense.readonly` | — (só leitura) | contas, sites, unidades de anúncio, pagamentos, relatório de ganhos |

- Google Ads: o Google aposentou o developer token em 09/09/2026; o nível de acesso agora é do projeto do Google
  Cloud dono do cliente OAuth (Console → Google Ads API → Visão geral). Nível **Teste** só alcança contas de teste;
  contas reais dão `CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION` até o projeto ter acesso **Explorer** (ou Basic).
  `FLUXOS_OAUTH_GOOGLE_ADS_DEVELOPER_TOKEN` e `FLUXOS_OAUTH_GOOGLE_ADS_LOGIN_CUSTOMER_ID` são opcionais.
- Enquanto a tela de consentimento estiver em "Teste", só os usuários de teste conseguem conectar (limite de 100);
  `adwords` é escopo sensível e pede verificação do app para publicar.

## WhatsApp por token (nov/2026) — caminho fácil até o OAuth da Meta
App no motor (fork PR #10): `whatsapp-cloud` (WhatsApp Business Cloud API oficial, Graph v23.0), sem OAuth.
O app `whatsapp` (login pelo Facebook / Embedded Signup) continua no motor, mas a aba "Entrar com Facebook"
fica desabilitada com "Em breve" até existirem `FLUXOS_OAUTH_META_ID/_SECRET` (describe → `platformClient`).

- Tela: `/connectors/fluxos-whatsapp/setup` e topo de `/connectors/whatsapp` (`WhatsAppConnectPanel`),
  textos em pt-BR/en/es (Ajustes → idioma, ou `?lang=`). Campos: token de acesso (token permanente do
  usuário do sistema), ID do número, ID da conta WhatsApp Business (opcional, para listar templates/números).
- "Testar conexão": op `test` do `fluxos_apps` → `GET https://graph.facebook.com/v23.0/{phone-number-id}`
  (e `/{waba-id}`), nada é salvo; mostra nome verificado e número. Erros 190/10/200/100 viram dica.
- "Salvar e conectar": op `start` (app `whatsapp-cloud`); o motor guarda o token criptografado e o
  `verifyCredentials` confere o número; `screen_name` = "WhatsApp · <nome> · <número>".
- Chat: aparece como "WhatsApp"; ações `sendText` (janela de 24 h) e `sendTemplate` (nome + idioma +
  variáveis) passam pelo cartão de aprovação (2 créditos). Buscas: número, números e templates da conta.
- Número de teste grátis da Meta: só envia para até 5 destinatários cadastrados em "To" até a empresa ser
  verificada / um número próprio ser adicionado (erro 131030 explica isso).
- Próximo passo (não feito): gatilho "nova mensagem recebida" por cliente. O webhook existente
  (`virtual-chat-webhook`) é do número do operador (segredos `WHATSAPP_*`), não por cliente. Precisa:
  rotear por `metadata.phone_number_id` → usuário, guardar o App Secret de cada cliente para a assinatura
  HMAC (ou usar o app da Meta do Vertal depois do OAuth) e expor um gatilho webhook no motor.
- OAuth real (Embedded Signup): app da Meta do Vertal + verificação da empresa + App Review de
  `whatsapp_business_management`/`whatsapp_business_messaging` + configuração do Facebook Login for
  Business (`FLUXOS_OAUTH_WHATSAPP_CONFIG`). Com os segredos salvos, a aba "Entrar com Facebook" liga sozinha.

## App da Meta "Vertal Dev" e Instagram por usuário (nov/2026)
App da Meta **Vertal Dev**, App ID `1145586658064572` (modo Desenvolvimento), segredos
`FLUXOS_OAUTH_META_ID` / `_SECRET` nas Edge Functions (desde 25/11/2026). Serve os quatro apps da Meta
(`facebook`, `instagram`, `whatsapp`, `meta-ads`). URIs de redirecionamento válidos no app:
`https://vertal.dev/fluxos/oauth/facebook`, `/instagram`, `/whatsapp`, `/meta-ads`.

- O botão "Entrar com …" de cada um abre `https://www.facebook.com/v23.0/dialog/oauth` com esse App ID,
  o retorno do conector e a lista de escopos (ou `config_id`, se existir `FLUXOS_OAUTH_<APP>_CONFIG`).
  O usuário final não vê App ID, App Secret nem o ID de configuração.
- Em modo Desenvolvimento só quem tem papel no app (admin, desenvolvedor, testador) consegue autorizar;
  cada permissão pedida precisa estar no caso de uso do app, senão a Meta responde "Invalid Scopes".
  Para clientes reais: verificação da empresa + App Review (acesso avançado) de cada permissão + modo Ao vivo.

### Instagram (`/connectors/instagram`)
- Caminho escolhido: **Instagram API com login do Facebook** (Instagram Graph API + Messenger Platform),
  pelo mesmo app da Meta. Motivo: funciona com os segredos META já salvos (nenhum segredo novo), usa a mesma
  revisão de app dos outros conectores da Meta e cobre publicação, métricas e DMs. Exige conta profissional
  ligada a uma Página do Facebook. A alternativa "Instagram API com login do Instagram" (sem Página) usa um
  Instagram App ID/Secret separado e outra API (`graph.instagram.com`); fica como evolução futura.
- Topo da página: `FluxosConnectPanel` do app `instagram` ("Entrar com Instagram"); depois do login volta para
  `/connectors/instagram` (`RETURN_PATH_KEY`, só caminhos internos de /connectors).
- O canal antigo do operador (webhook `virtual-chat-instagram-webhook`, segredos `INSTAGRAM_*`, respostas por IA)
  continua igual, recolhido em "Avançado: canal do operador".
- Escopos: `public_profile, instagram_basic, instagram_content_publish, instagram_manage_insights,
  instagram_manage_messages, pages_show_list, pages_manage_metadata, pages_read_engagement, business_management`.
- Ações (aprovação, 2 créditos): publicar foto, publicar Reel, responder DM (`sendMessage`, só até 24 h depois da
  última mensagem do contato). Buscas: contas, mídias, métricas, conversas de DM, mensagens de uma conversa.
- Para DMs, a conta do Instagram precisa de "Permitir acesso às mensagens" (Configurações → Privacidade → Mensagens →
  Ferramentas conectadas) ligado.
