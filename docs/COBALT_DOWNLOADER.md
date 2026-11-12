# Downloader (cobalt) — importação por link

O Vertal Clips ("Importar") e o Downloader Universal usam a função
`creative-download`, que chama uma instância **própria** do
[cobalt](https://github.com/imputnet/cobalt) (API v10+).

Por que própria: a API antiga (`api.cobalt.tools/api/json`) foi desligada, e a
instância pública exige Turnstile/JWT — não aceita servidores de terceiros.
Sem `COBALT_API_URL` válido a função responde `503 downloader_not_configured`
**sem cobrar créditos**.

## 1. Subir o cobalt (Railway, Render ou VPS)

Imagem: `ghcr.io/imputnet/cobalt:11` (porta 9000).

| Variável | Valor |
|---|---|
| `API_URL` | URL pública da instância, ex.: `https://cobalt-vertal.up.railway.app/` |
| `API_AUTH_REQUIRED` | `1` |
| `API_KEY_URL` | `file:///keys.json` (ou uma URL https com o JSON) |

`keys.json` (a chave precisa ser um UUID v4):

```json
{ "<uuid-v4>": { "name": "vertal", "limit": 1000 } }
```

YouTube costuma bloquear IPs de datacenter. Se aparecer `platform_blocked`,
configure cookies (`COOKIE_PATH`, ver docs do cobalt) ou use proxy residencial.

## 2. Configurar o Supabase

```bash
supabase secrets set COBALT_API_URL=https://cobalt-vertal.up.railway.app/ COBALT_API_KEY=<uuid-v4>
supabase functions deploy creative-download
```

## Códigos de erro

| Código | Causa |
|---|---|
| `downloader_not_configured` | `COBALT_API_URL` ausente, inválido ou apontando para a instância pública |
| `downloader_auth_failed` | `COBALT_API_KEY` errada/ausente |
| `downloader_unavailable` | instância fora do ar ou timeout (45 s) |
| `unsupported_link` | link inválido ou serviço não suportado |
| `video_unavailable` / `video_too_long` | vídeo privado/removido ou longo demais |
| `platform_blocked` | plataforma bloqueou (login/cookies) |
| `rate_limit_downloader` | limite da chave atingido |

Toda falha devolve os créditos (`withRefundOnFailure`).
