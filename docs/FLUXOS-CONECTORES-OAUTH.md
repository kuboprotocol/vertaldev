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
