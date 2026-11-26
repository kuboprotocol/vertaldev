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
- O app "Vertal Dev" é do tipo **Empresa** (o diálogo da Meta volta com `is_business_login=1`): nele vale o
  **Facebook Login for Business**, em que a configuração (`config_id`) substitui `scope`. Sem configuração o login
  ainda usa `scope`, o que funciona para quem tem papel no app, mas a Meta recomenda `config_id`.
- Caminho escolhido: **Instagram API with Unified Login** (configuração do Facebook Login for Business criada em
  Casos de uso → "Gerenciar mensagens e conteúdo no Instagram" → "Configuração da API com login unificado").
  O cliente entra com **Instagram ou Facebook**, não precisa de Página, e o token é da empresa (usuário de sistema,
  BISU) trocado com o App ID/Secret da Meta → funciona com `FLUXOS_OAUTH_META_*` + `FLUXOS_OAUTH_INSTAGRAM_CONFIG`.
  O motor também aceita o login do Facebook clássico (token de usuário + Página), usado enquanto não houver configuração.
  Não usamos a "Instagram API with Instagram Login" porque exige um Instagram App ID/Secret separado e outra API
  (`graph.instagram.com`).
- Motor: contas por `/me/assigned_instagram_accounts` (login unificado) e `/me/accounts` (Páginas); DMs em
  `/{ig-id}/conversations|messages` (sem Página) ou `/{page-id}/…` com token da Página; com `config_id` o login
  manda `prompt=login` (mostra as opções Instagram e Facebook).
- Topo da página: `FluxosConnectPanel` do app `instagram` ("Entrar com Instagram"); depois do login volta para
  `/connectors/instagram` (`RETURN_PATH_KEY`, só caminhos internos de /connectors).
- O canal antigo do operador (webhook `virtual-chat-instagram-webhook`, segredos `INSTAGRAM_*`, respostas por IA)
  continua igual, recolhido em "Avançado: canal do operador".
- Escopos (só quando não há configuração): `public_profile, instagram_basic, instagram_content_publish, instagram_manage_insights,
  instagram_manage_messages, pages_show_list, pages_manage_metadata, pages_read_engagement, business_management`.
- Ações (aprovação, 2 créditos): publicar foto, publicar Reel, responder DM (`sendMessage`, só até 24 h depois da
  última mensagem do contato). Buscas: contas, mídias, métricas, conversas de DM, mensagens de uma conversa.
- Para DMs, a conta do Instagram precisa de "Permitir acesso às mensagens" (Configurações → Privacidade → Mensagens →
  Ferramentas conectadas) ligado.

## Auditoria de OAuth e novos clientes (26/11/2026)
- **Limite de 100 segredos** nas Edge Functions do projeto Supabase. Por isso os **IDs públicos** dos clientes
  OAuth (não são secretos) ficam no código: `PUBLIC_OAUTH_CLIENT_IDS` em `_shared/fluxosApps.ts` (GOOGLE,
  MICROSOFT, META, SALESFORCE, DISQUS, GITLAB). O segredo `FLUXOS_OAUTH_<GRUPO>_ID`, se existir, vale mais;
  o `_SECRET` continua obrigatório nos segredos. Para um cliente novo: ID no código + só o `_SECRET` no Supabase.
- **Salesforce**: External Client App "Vertal Dev" (org de desenvolvedor Agentforce), retorno
  `https://vertal.dev/fluxos/oauth/salesforce`, escopos `api`, `refresh_token offline_access`, `id profile email`.
  External Client Apps exigem **PKCE** → motor (fork PR #13) manda `code_challenge` S256 e `code_verifier`.
- **Disqus**: app 8213420 "Vertal Dev", retorno `https://vertal.dev/fluxos/oauth/disqus`, acesso "Read, Write, Manage Forums".
- **GitLab**: app OAuth "Vertal Dev" no gitlab.com (escopos `api`, `read_user`), retorno
  `https://vertal.dev/fluxos/oauth/gitlab`. Com o cliente do Vertal a instância é sempre `https://gitlab.com`.
- **YouTube**: mesmo cliente Google ("Vertal Fluxos"); YouTube Data API v3 ativada, retorno
  `https://vertal.dev/fluxos/oauth/youtube` e escopos do YouTube em Acesso a dados (sensíveis → só testadores
  enquanto o app estiver em Teste).
- Flickr escondido do catálogo (`HIDDEN_FLUXOS_APPS` em `src/lib/fluxosConnectors.ts`); o app continua no motor.
- Bloqueados: Strava (API só para assinantes pagos), Flickr (chave de API só no Flickr Pro), Reddit ("Max clients
  have been reached" — novos clientes da Data API dependem de aprovação do Reddit), HubSpot (apps OAuth só pela
  HubSpot CLI, `hs project create/upload`), Discord (login do portal pede confirmação por e-mail), eBay (conta
  de desenvolvedor em análise), Trello (login Atlassian).

## LinkedIn, X e limpeza do catálogo (26/11/2026)
- **X (Twitter)**: app "Vertal Dev" (ID 33675462) no console do X, Read+write, OAuth 1.0a com retorno
  `https://vertal.dev/fluxos/oauth/twitter` (e `/x`). "Entrar com X (Twitter)" chega à tela "Autorizar o acesso de
  Vertal Dev". A conta do X está no plano **Pay Per Use com US$ 0 de crédito** (o X não tem mais nível grátis): o
  login funciona, mas chamadas da API (postar, ler) falham com 402/403 até alguém comprar créditos no console.
  No catálogo o card agora se chama "X (Twitter)" (mesmo slug `fluxos-twitter`, mesmo app `twitter`).
- **LinkedIn**: app `linkedin` no motor (fork PR #15): OAuth 2.0 + OpenID Connect, escopos
  `openid profile email w_member_social`, retorno `https://vertal.dev/fluxos/oauth/linkedin`; ações "Get my profile",
  "Create post" e "Create post with link" (Posts API `/rest/posts`, cabeçalho `LinkedIn-Version` = mês atual − 2).
  Card `fluxos-linkedin` no catálogo. **Sem cliente do Vertal ainda**: o portal de desenvolvedor exige uma
  LinkedIn Page para criar o app, e a conta kuboprotocol@gmail.com não pode criar Page ("Você não tem conexões
  suficientes"). Enquanto isso o card mostra o formulário de app próprio. Quando houver Page: criar o app "Vertal Dev",
  produtos "Sign In with LinkedIn using OpenID Connect" + "Share on LinkedIn", retorno acima, Client ID em
  `PUBLIC_OAUTH_CLIENT_IDS.LINKEDIN` e só `FLUXOS_OAUTH_LINKEDIN_SECRET` no Supabase.
- **Escondidos** (`HIDDEN_FLUXOS_APPS`, só catálogo; motor, fluxos e dados ficam): Flickr, Strava (API só com
  assinatura paga; fora do público do Vertal Dev). Regra: antes de esconder, conferir `fluxos_connections` — app com
  conexão de usuário continua visível.
- **Marcas de IA de terceiros fora do catálogo** (26/11/2026): OpenAI, OpenRouter e Azure OpenAI também em
  `HIDDEN_FLUXOS_APPS`, porque o Vertal vende a própria IA white-label para devs. O servidor espelha a lista em
  `supabase/functions/_shared/hiddenFluxosApps.ts`: o Vertal Chat não lista esses apps (`list_apps`) nem abre conexão
  nova com eles; quem já tiver conexão continua usando. Não mexe no uso interno desses provedores pelo backend de IA
  do Vertal (vertal-code-ai etc.). Depois (#284) também Anthropic, Mistral AI, Together AI, Perplexity e Helix
  (tryhelix.ai), todos com 0 conexões. Ficam por não serem fornecedores de modelos: Self-hosted LLM (genérico), DeepL,
  LibreTranslate, Remove.bg, Brave Search. Passos MCP dos cards não citam Claude/ChatGPT/Cursor.
- **Lovable** (26/11/2026): sem conector. Os escopos de projeto/workspace do OAuth da Lovable (e tokens de API) exigem
  plano Business/Enterprise; o workspace Kubo Protocol é Pro. Free/Pro só dão openid/profile/email/offline.
- **Pendentes que ficam** (formulário de app próprio enquanto o cliente do Vertal não sai): LinkedIn, eBay (conta em
  análise), Amazon Ads (acesso à Ads API pedido), TikTok Ads, Kwai Ads, Discord, Reddit, HubSpot, Trello.

## Meta: "Remover app" e "Exclusão de dados" (26/11/2026)
Exigidos pela Meta para o app "Vertal Dev" (1145586658064572). Uma Edge Function só (`meta-data-deletion`,
`verify_jwt = false`; limite de funções do plano), lógica em `_shared/metaDataDeletion.ts`. Sem segredo novo:
a assinatura do `signed_request` (HMAC-SHA256) é conferida com `FLUXOS_OAUTH_META_SECRET`.

| Campo no painel da Meta | URL |
| --- | --- |
| Login do Facebook → Configurações → **URL de retorno de chamada para cancelar autorização** (Deauthorize) | `https://sccizjlpwezsgaxkclot.supabase.co/functions/v1/meta-data-deletion/deauthorize` |
| Configurações do app → Básico → **URL de solicitação de exclusão de dados** (Data deletion request) | `https://sccizjlpwezsgaxkclot.supabase.co/functions/v1/meta-data-deletion` |

- O ID do usuário da Meta não fica no Supabase. O motor guarda `formattedData.userId` (`/me`) no login dos apps
  `facebook`, `instagram`, `whatsapp`, `meta-ads`; a rota interna `POST /internal/vertal/connections/find`
  (fork PR #16) devolve as conexões desse usuário. A função apaga cada uma no motor e a linha em
  `fluxos_connections` (igual a "Desconectar") e grava um aviso em `connector_activity_logs`. Nada mais é tocado.
- Cada pedido fica em `meta_data_requests` (só service role): tipo, código de confirmação, HMAC do ID da Meta,
  status (`completed` ou `pending_review` quando o motor não respondeu), quantas conexões saíram.
- Exclusão de dados responde `{url, confirmation_code}`; a página pública `https://vertal.dev/data-deletion?code=…`
  (`DataDeletionPage`, pt-BR) consulta `GET …/meta-data-deletion?code=…`. Sem código, a página explica o que é
  apagado e como pedir.
- `pending_review`: rodar de novo a busca quando o motor voltar (ou apagar à mão) e atualizar o status.
- Não cobre o canal do operador (`virtual-chat-instagram-webhook`, conta do próprio Vertal).

## Cloudflare (26/11/2026)

- A Cloudflare abriu o **OAuth self-managed** para todos os planos (03/06/2026). Cliente **Vertal Dev** criado na conta
  `43233355e2f598902aab32fce90d2edd` (Manage Account → OAuth clients): client ID `00d74ade9c1be1bfb6b998f7d47d46d7`
  (em `PUBLIC_OAUTH_CLIENT_IDS.CLOUDFLARE`), segredo em `FLUXOS_OAUTH_CLOUDFLARE_SECRET`, `client_secret_post`,
  `authorization_code` + `refresh_token`, retorno `https://vertal.dev/fluxos/oauth/cloudflare`.
- Escopos: `user-details.read account-settings.read memberships.read zone.read dns.read dns.write workers-scripts.read
  workers-scripts.write workers-routes.write` + opcionais `workers-kv-storage.write page.write cache.purge` + `offline_access`.
- Visibilidade: clientes novos nascem **private** (só membros da conta autorizam). Para qualquer usuário: verificar o
  domínio do client URL (TXT `cloudflare_oauth_client_publisher=…` em vertal.dev) e promover a **public** (permanente).
- Motor: app `cloudflare` (fork PR #17). Tela: `/connectors/cloudflare/setup` abre com "Entrar com Cloudflare";
  o API token (link com permissões pré-marcadas) fica em "Avançado".

## Auditoria dos conectores sem OAuth (26/11/2026)

Pedido do Laércio: ver cada conector que não conecta por OAuth (chave/token, app próprio, pendente) e decidir se
serve ao público do Vertal Dev (devs que criam apps e automações com IA, Brasil e global); útil fica e ganha logo
oficial; inútil ou sem função real sai do catálogo (só esconde, nada é apagado).

- **Escondidos** (`HIDDEN_FLUXOS_APPS` + `supabase/functions/_shared/hiddenFluxosApps.ts`, 0 conexões de usuário):
  Airbrake (só 1 gatilho, monitoramento de nicho), Flowers Software (BPM alemão, só 1 gatilho), FreeScout (helpdesk
  auto-hospedado, só 1 gatilho), Placetel (telefonia alemã, só 1 gatilho), VirtualQ (fila de ligações alemã),
  Firefly III (finanças pessoais auto-hospedadas, só gatilhos). As páginas /integracoes e as entradas de sitemap
  somem sozinhas (geradas do catálogo); textos e traduções ficam guardados para quando o app voltar.
- **Logos**: todo cartão de marca tem logo próprio em `public/connectors/` (128×128, asset oficial da marca: ícone
  do site oficial, ícone de produto do Google/Microsoft ou a marca oficial em quadrado na cor da marca). Teste em
  `src/test/fluxos-connectors.test.ts` falha se faltar logo, se o arquivo não existir ou se duas marcas dividirem o
  mesmo logo. Sem marca (ícone genérico): Vertal Fluxos, Vertal Agentes, Custom RPC, Web Wallet, Self-hosted LLM, SMTP.

## monday.com, FreeScout, Firefly III, VirtualQ e Airbrake (26/11/2026)

- **monday.com (OAuth)**: app **Vertal Dev** (ID 12877465) no Developer Center da conta `vertal-company-company.monday.com`
  (kuboprotocol@gmail.com), versão v1 **Live** e **Published** com permissão "All accounts" (qualquer conta monday instala
  pelo OAuth; listagem no marketplace é outra revisão, não feita). Client ID `da03aca0085dc80432eeac8ebab9ed85` em
  `PUBLIC_OAUTH_CLIENT_IDS.MONDAY`; segredo em `FLUXOS_OAUTH_MONDAY_SECRET`. Retorno `https://vertal.dev/fluxos/oauth/monday`.
  Escopos: `me:read boards:read boards:write workspaces:read users:read updates:read updates:write`. O motor manda
  `force_install_if_needed=true` (conta sem o app instalado vê a instalação antes do consentimento). Token do OAuth não expira.
  O Developer Center não tem campo de política de privacidade/termos (só no formulário do marketplace).
- **Limite de 100 segredos**: o projeto já estava em 100/100 antes do Monday. Para abrir a vaga, os IDs públicos de
  Pipedrive e Typeform foram para `PUBLIC_OAUTH_CLIENT_IDS` (valores conferidos por SHA-256 com o segredo) e
  `FLUXOS_OAUTH_TYPEFORM_ID` saiu dos segredos depois do deploy. Para um cliente novo: mova outro `_ID` público do mesmo jeito.
- **Modo token ("Avançado")**: campo do motor com `advanced: true` (token pessoal) e `oauthOnly: true` (client id/secret).
  Com o token preenchido, o `start` não usa o cliente do Vertal, tira os campos `oauthOnly` e verifica direto (sem login).
  Tela: `FluxosConnectPanel` mostra "Entrar com …" e, recolhido, "Avançado: usar token pessoal em vez do login".
  Passos por app: `src/lib/fluxos/setupHelp.ts`.
- **Firefly III (OAuth por instância)**: cada usuário cria o cliente na própria instância (Options → Profile → OAuth →
  Create new client, confidencial, retorno `https://vertal.dev/fluxos/oauth/firefly-iii`) e informa URL + client ID/secret;
  tudo fica na conexão dele (nenhum segredo no Supabase). Personal Access Token em "Avançado". Ações: criar transação,
  listar contas; gatilhos de transação criada/alterada/apagada.
- **FreeScout**: sem OAuth oficial (API do módulo API & Webhooks só por chave). Ações: criar conversa, responder/nota,
  mudar status ou responsável, listar conversas; gatilho de eventos por webhook.
- **Airbrake**: sem OAuth (User API key). Ações: listar erros, silenciar/reativar erro (a API v4 não documenta "resolver").
  A chave só vai para hosts `*.airbrake.io` (padrão `https://api.airbrake.io`).
- **VirtualQ**: sem OAuth (token do painel → Contact Center → API Tokens). Ações de fila (entrar, ver, atualizar, sair).
- Os quatro voltaram ao catálogo com logo oficial (128×128) e páginas `/integracoes/<slug>` em 22 idiomas com FAQ de
  nicho ("X tem OAuth?"). Flowers Software e Placetel continuam escondidos.
