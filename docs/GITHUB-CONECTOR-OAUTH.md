# Conector GitHub: "Entrar com GitHub" (OAuth por usuário)

Desde nov/2026 o conector GitHub (`/connectors/github`) conecta por OAuth. O token pessoal
(PAT) continua como opção **Avançado: usar token** em `/connectors/github/setup`, e conexões
antigas feitas por token seguem funcionando (mesma tabela, `scope = 'pat'`).

## Fluxo
1. Front (`src/lib/github/oauth.ts`) chama a edge function `github-auth` com `returnUrl`.
2. `github-auth` grava um nonce em `github_oauth_states` (vale 10 min, uso único) e devolve a URL
   `https://github.com/login/oauth/authorize` com escopos `repo read:user user:email`.
3. O GitHub volta em `https://<projeto>.supabase.co/functions/v1/github-callback`
   (`verify_jwt = false` no `config.toml`; a função valida o nonce). A função troca o código,
   cifra o token (AES-256-GCM, `CONNECTOR_ENC_KEY`) e faz upsert em `github_connections`
   (por usuário; substitui uma conexão por token). Redireciona para `/connectors/github?success=true`.
4. Quem usa o token (github-repos, git, vibe-code-agent, vibe-agents, github-ipfs-deploy) lê
   `github_connections` como antes: nada muda para OAuth vs. token.

## App OAuth
App OAuth do GitHub "vertaldev" (conta kuboprotocol), segredos `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`
(o mesmo app do login com GitHub). Retornos cadastrados: `.../functions/v1/github-signin-callback` e
`.../functions/v1/github-callback`. O app "Vertal Fluxos" (`FLUXOS_OAUTH_GITHUB_*`) é separado e serve
só o conector GitHub do Vertal Fluxos.

Sem escopo `workflow`: o agente nunca edita `.github/workflows`.
