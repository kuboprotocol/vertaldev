# Catálogo unificado Vertal Dev ↔ Vertal Fluxos

## Estado (2026-11-23)
- **Compartilhados** (existem nos dois; `fluxosApp` no conector): gmail, spotify, slack, github, stripe, discord.
- **Nativos do Fluxos adicionados ao Vertal Dev** (`src/lib/fluxosConnectors.ts`, slug `fluxos-<app>`, 74 apps): aparecem na página de conectores como "via Vertal Fluxos".
- **Só no Vertal Dev** (viram app "Vertal" no fork do motor): vertal-app, vertal-run, vertal-vibe-pay, automatisch, huginn, figma, mais-retorno, supabase, resend, instagram, whatsapp, render, cloudflare, mongodb, docker, alchemy, infura, custom-rpc, web-wallet.

## Sincronização de credenciais (desenho; ativação pendente)
Objetivo: conectou no Vertal Dev → usável no Fluxos sem reconectar.

1. **Corretor de tokens no creative-router** (sem nova Edge Function): `tool: "connector_token"`, autenticado por uma chave de serviço por usuário (`VERTAL_FLUXOS_KEY`, guardada no Cofre e na conexão do Fluxos). Devolve só um access token de curta duração do conector pedido (gmail/spotify/slack/github/stripe/discord), renovado no servidor com o refresh token cifrado. O client secret OAuth do Vertal nunca sai do Vertal.
2. **Fork do motor**: nos apps compartilhados, um modo de conexão "Conta do Vertal" (campos `vertalBroker=true`, `vertalKey`). `auth.refreshToken`/`isStillVerified` chamam o corretor em vez do provedor. Hoje o `isStillVerified` do Gmail usa a People API, que o escopo do Vertal (gmail.readonly + gmail.send) não cobre — o modo Vertal verifica pelo corretor.
3. **Provisionamento**: ao conectar um conector compartilhado, o creative-router (tool `automatisch`, nova op `sync_connection`) faz login no Fluxos do usuário e cria/atualiza a conexão (`POST /internal/api/v1/apps/<app>/connections`, `formattedData` com `vertalBroker`/`vertalKey`, nunca o token do provedor). Idempotente por `screenName`.
4. **App "Vertal" no fork** (`packages/backend/src/apps/vertal`): ações que chamam o creative-router com `VERTAL_FLUXOS_KEY` (deploy, rodar código, cobrar, Agentes, Figma, Supabase, Resend, Instagram/WhatsApp, Render, Cloudflare, MongoDB, Docker, RPC Web3), usando os segredos do Cofre no servidor.

## Bloqueio para ativar
Sem login válido de administrador da instância do Fluxos (o login kuboprotocol@gmail.com foi recusado; AUTOMATISCH_URL/EMAIL/PASSWORD não estão no Cofre), não dá para criar conexões nem testar o app do fork de ponta a ponta. Redeploy do fork sem esse teste não foi feito para não arriscar fluxos e conexões existentes.
