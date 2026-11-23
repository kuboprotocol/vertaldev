# Catálogo unificado Vertal Dev ↔ Vertal Fluxos

## Estado (2026-11-23)
- **Compartilhados** (existem nos dois; `fluxosApp` no conector): gmail, spotify, slack, github, stripe, discord.
- **Nativos do Fluxos adicionados ao Vertal Dev** (`src/lib/fluxosConnectors.ts`, slug `fluxos-<app>`, 74 apps): aparecem na página de conectores como "via Vertal Fluxos".
- **Só no Vertal Dev** (viram app "Vertal" no fork do motor): vertal-app, vertal-run, vertal-vibe-pay, automatisch, huginn, figma, mais-retorno, supabase, resend, instagram, whatsapp, render, cloudflare, mongodb, docker, alchemy, infura, custom-rpc, web-wallet.

## Sincronização de credenciais (ativa)
1. **Corretor no creative-router** (sem nova Edge Function): o servidor do Fluxos manda `X-Vertal-Fluxos-Key` (chave `vfk1_<usuário>_<HMAC>`, segredo `FLUXOS_BROKER_SECRET`; trocar o segredo revoga todas). Ops `whoami`, `token {app}` (gmail/spotify/slack/github/stripe/discord; access token de curta duração, refresh e client secret ficam no Vertal; Spotify via Worker `/api/spotify/internal/token` com `NAVIGATOR_INTERNAL_TOKEN`) e `api {request}` (mesma proteção do `api_request`, segredos do Cofre por `{{NOME}}`).
2. **Fork do motor** (`helpers/vertal-broker.js`): conexões com `vertalBroker`+`vertalKey` pedem o token ao corretor antes de cada requisição, só em memória (nunca gravado no banco do Fluxos). Gmail no modo Vertal verifica pelo corretor e lê o perfil pela API do Gmail (sem People API).
3. **Provisionamento**: op `sync_connection` da ferramenta `automatisch`, chamada pelo site ao conectar um app compartilhado; cria/atualiza a conexão "Conta do Vertal" do app e a do app **Vertal** (idempotente por nome).
4. **App Vertal** no fork: ação "Chamar um conector do Vertal" (op `api`).
