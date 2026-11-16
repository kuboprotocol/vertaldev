# Conector Spotify (Vertal Chat)

Permite pedir músicas no chat ("toca Evidências", "coloca na fila…") e ouvir aqui mesmo.
Base: `NousResearch/hermes-official-plugins/spotify` (MIT), adaptado para o modelo do Vertal:
OAuth no servidor, refresh token criptografado (AES-GCM, `CONNECTOR_ENC_KEY`), ações do chat.

## O que existe

| Parte | Arquivo |
|---|---|
| Núcleo puro (URL OAuth, IDs, mapeamento, erros) | `supabase/functions/_shared/spotifyCore.ts` |
| Cliente servidor (renova token, retry 401) | `supabase/functions/_shared/spotifyApi.ts` |
| Início do OAuth | `supabase/functions/spotify-oauth-start` |
| Callback do OAuth (sem JWT) | `supabase/functions/spotify-oauth-callback` |
| Ações: status, search, play, queue, pause, next, previous, now_playing, devices, disconnect | `supabase/functions/spotify-action` |
| Tabelas (service role apenas) | `supabase/migrations/20261116140000_spotify_accounts.sql` |
| Ação `spotify` no agente | `_shared/chatAgent.ts`, `src/lib/chatAgent/runAction.ts` |
| Artefato com player embutido | `src/components/vertal-chat/ArtifactViews.tsx` (kind `spotify`) |
| Tela de conexão | `src/pages/ConnectorSpotifyPage.tsx` → `/connectors/spotify` |
| Catálogo do hub | `src/lib/connectorsConfig.ts` (entrada `spotify`) |

## Limites do Spotify (verifique no dashboard antes de prometer)

- **Busca e player embutido** (`open.spotify.com/embed`) funcionam sem Premium: é o "ouvir no chat".
- **Tocar, pausar, pular, fila e volume** usam o aparelho Spotify Connect ativo e exigem **Premium**.
- Apps novos ficam em **modo de desenvolvimento**, com limite de usuários autorizados. Confira
  as regras atuais em developer.spotify.com antes de liberar para todos.
- Os endpoints de recomendação e de atributos de áudio não são usados aqui.

## Configuração (uma vez)

1. Em developer.spotify.com/dashboard, crie um app (Web API).
2. Em **Redirect URIs**, cadastre exatamente:
   `https://<project-ref>.supabase.co/functions/v1/spotify-oauth-callback`
3. Defina os segredos das edge functions (nunca no front-end):
   - `SPOTIFY_CLIENT_ID`
   - `SPOTIFY_CLIENT_SECRET`
   - `SPOTIFY_REDIRECT_URI` (opcional; só se for diferente da linha acima)
   - `CONNECTOR_ENC_KEY` já existe para os outros conectores (32 bytes em base64).
4. Aplique a migration `20261116140000_spotify_accounts.sql`.
5. Faça deploy de `spotify-oauth-start`, `spotify-oauth-callback` e `spotify-action`.
   O `config.toml` já desliga o JWT só no callback.

## Como testar

- Abra `/connectors/spotify`, clique em **Conectar Spotify** e autorize.
- Pesquise uma música: as faixas aparecem com o player embutido.
- No chat, peça "toca <música>". Sem conexão, o chat abre o painel de conectores.
- Para controlar o aparelho, abra o Spotify em um celular ou computador com Premium.

## Não feito nesta entrega

- Não há PKCE: o fluxo usa client secret no servidor, que é o recomendado para app web.
- Não há Web Playback SDK (tocar dentro do navegador como player próprio). O player embutido
  cobre "ouvir no chat"; o SDK exigiria Premium e um script externo.
- Aplicar a migration, definir os segredos e fazer o deploy são ações no projeto Supabase
  compartilhado e não foram executadas por esta sessão.
