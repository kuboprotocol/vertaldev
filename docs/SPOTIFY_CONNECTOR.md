# Conector Spotify (Vertal Chat)

Permite pedir músicas no chat ("toca Evidências", "coloca na fila…") e ouvir aqui mesmo.
Base: `NousResearch/hermes-official-plugins/spotify` (MIT), adaptado para o modelo do Vertal:
OAuth no servidor, tokens criptografados (AES-256-GCM), ações do chat.

## Onde roda

A API do Spotify roda no **Worker do vertal.dev** (Cloudflare), não em edge functions do
Supabase. O projeto Supabase está no limite de funções do plano (criar uma nova dá
`402 Max number of functions reached`), e o Worker já atende o domínio sem esse limite.
O banco continua sendo o Supabase: o Worker grava nas mesmas tabelas pela API REST, com a
chave secreta.

| Rota | O que faz |
|---|---|
| `POST /api/spotify/start` | Valida a sessão, grava o state anti-CSRF e devolve a URL de consentimento |
| `GET /api/spotify/callback` | Consome o state (uso único, atômico), troca o code e guarda os tokens criptografados |
| `POST /api/spotify/action` | `status`, `search`, `play`, `queue`, `pause`, `next`, `previous`, `now_playing`, `devices`, `disconnect` |

As rotas exigem `Authorization: Bearer <JWT da sessão do Supabase>` (menos o callback).
O CORS libera só as origens do ecossistema (vertal.dev, vertal.app, previews e localhost).

## O que existe

| Parte | Arquivo |
|---|---|
| Núcleo puro (URL OAuth, IDs, mapeamento, erros) | `src/lib/spotify/spotifyCore.ts` |
| Rotas da API | `worker/spotifyRoutes.ts` (ligadas em `worker/index.ts`) |
| Cliente Spotify (renova token, retry 401/429) | `worker/spotifyApi.ts` |
| Acesso ao Supabase (Auth + PostgREST) | `worker/supabaseRest.ts` |
| Criptografia dos tokens | `worker/tokenCrypto.ts` |
| Testes | `worker/spotify.test.ts`, `src/lib/spotify/*.test.ts` |
| Cliente do front-end | `src/lib/spotify/client.ts` |
| Tabelas (service role apenas) | `supabase/migrations/20261116140000_spotify_accounts.sql` e `…150000_spotify_access_token_encrypted.sql` |
| Ação `spotify` no agente | `_shared/chatAgent.ts`, `src/lib/chatAgent/runAction.ts` |
| Artefato com player embutido | `src/components/vertal-chat/ArtifactViews.tsx` (kind `spotify`) |
| Tela de conexão | `src/pages/ConnectorSpotifyPage.tsx` → `/connectors/spotify` |

Fora do vertal.dev (localhost, previews, app nativo) o front chama `https://vertal.dev/api/spotify`.
Para apontar para outro Worker, defina `VITE_SPOTIFY_API_BASE` (ex.: `http://127.0.0.1:8787/api/spotify`).

## Limites do Spotify (verifique no dashboard antes de prometer)

- **Busca e player embutido** (`open.spotify.com/embed`) funcionam sem Premium: é o "ouvir no chat".
- **Tocar, pausar, pular, fila e volume** usam o aparelho Spotify Connect ativo e exigem **Premium**.
- Apps novos ficam em **modo de desenvolvimento**: só as contas cadastradas em *User Management*
  conseguem conectar. Para abrir ao público é preciso pedir a liberação ao Spotify.
- Os endpoints de recomendação e de atributos de áudio não são usados aqui.

## Configuração

1. Em developer.spotify.com/dashboard, no app **Vertal**, cadastre em **Redirect URIs**:
   `https://vertal.dev/api/spotify/callback`
2. Variáveis públicas: ficam em `wrangler.jsonc` (`APP_ORIGIN`, `SUPABASE_URL`,
   `SUPABASE_PUBLISHABLE_KEY`, `SPOTIFY_CLIENT_ID`).
3. Segredos do Worker `vertaldev` (Cloudflare → Workers → vertaldev → Settings → Variables and Secrets,
   ou `npx wrangler secret put <NOME>`):
   - `SPOTIFY_CLIENT_SECRET`
   - `SPOTIFY_TOKEN_ENC_KEY`: 32 bytes em base64 (`openssl rand -base64 32`). **Não troque** sem
     necessidade: tokens gravados com a chave antiga deixam de abrir e os usuários precisam reconectar.
   - `SUPABASE_SECRET_KEY`: chave secreta (`sb_secret_…`) do projeto Supabase.
   - `SPOTIFY_REDIRECT_URI` (opcional; só se o callback não for `https://vertal.dev/api/spotify/callback`).
4. O deploy é o de sempre: push na `main` → Workers Builds → `wrangler deploy`.

## Como testar

- Abra `/connectors/spotify`, clique em **Conectar Spotify** e autorize.
- Pesquise uma música: as faixas aparecem com o player embutido.
- No chat, peça "toca <música>". Sem conexão, o chat abre o painel de conectores.
- Para controlar o aparelho, abra o Spotify em um celular ou computador com Premium.
- Testes automáticos: `npx vitest run worker src/lib/spotify`.

## Não feito nesta entrega

- Não há PKCE: o fluxo usa client secret no servidor, que é o recomendado para app web.
- Não há Web Playback SDK (tocar dentro do navegador como player próprio). O player embutido
  cobre "ouvir no chat"; o SDK exigiria Premium e um script externo.
