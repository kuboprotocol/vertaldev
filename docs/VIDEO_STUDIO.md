# Vertal Video Studio

Transforma de 1 a 10 fotos em vídeo: **clipe musical, meme, anúncio/produto ou story**, com texto por cena, texto principal, trilha sonora e três níveis de qualidade.

Acesso: Painel Criativo → "Criar vídeo com fotos" (`/creative/video_studio`).

## Níveis e preços

| Nível | Motor | Preço ao cliente | Custo Vertal (conservador) | Margem no pacote mais barato (R$0,30/crédito) | Margem no preço padrão (R$0,40/crédito) |
|---|---|---|---|---|---|
| Express | Navegador (Ken Burns + transições) | 2 créditos por vídeo | ~R$0 | ~100% | ~100% |
| Realista | MiniMax Hailuo-02 (fal.ai), 6s/foto, 768p | 12 créditos por foto | US$0,30/foto | 53% | 65% |
| Ultra Realista | Kling 2.1 Pro (fal.ai), 5s/foto | 22 créditos por foto | US$0,55/foto | 53% | 65% |

- Express sai com marca d'água discreta "Feito com vertal.dev" (marketing gratuito e incentivo para subir de nível). Os níveis de IA saem sem marca d'água, liberados para uso comercial.
- As margens são verificadas por teste (`src/config/videoStudio.test.ts`): nenhum nível pode ficar abaixo de 50% no pacote mais barato nem de 60% no preço padrão. Se o custo do provedor mudar, atualize `providerCostUsdPerClip` e os testes avisam se a margem quebrar.
- Fonte única de preços: `supabase/functions/_shared/videoStudioConfig.ts`, usada pelo servidor e pela interface (via `src/config/videoStudio.ts`).

## Arquitetura

```
VideoStudio.tsx (UI)
 ├─ Express: cobra 2 créditos → monta o vídeo no navegador
 └─ IA: envia fotos ao bucket `uploads` → creative-video-studio (submit)
        → fal.ai queue (1 job por foto) → polling (status) a cada 5s
        → clipes copiados para `uploads/<user>/video-studio/` → montagem no navegador
lib/videoComposer.ts: canvas + MediaRecorder → MP4 (Chrome/Edge/Safari) ou WebM
```

A montagem final (texto, música, transições, marca d'água) roda no navegador do cliente, então não há servidor de renderização para pagar.

### Edge function `creative-video-studio`

- `POST {action:"submit", tier, style, aspect, images | image_count, captions?, prompt?}` cobra antes de gerar (com `X-Idempotency-Key`, sem cobrança dupla).
- `POST {action:"status", asset_id}` consulta a fila, re-hospeda os clipes prontos e atualiza `creative_assets` (tool `video_studio`).
- **Reembolso automático por cena que falhar** (envio recusado, erro da IA ou mais de 30 min na fila), via `execute_atomic_credit_topup` com chave idempotente `refund:video_studio:<asset>:<cena>`. Polling repetido nunca reembolsa duas vezes. Admins não são cobrados nem reembolsados.
- Segurança: só aceita imagens do próprio usuário no bucket `uploads` (bloqueia outros usuários, domínios externos e `..`); só consulta URLs `https://queue.fal.run/`; o status só é visível para o dono.

## Ativação (necessário para os níveis de IA)

1. Crie uma chave em fal.ai e configure o secret no Supabase:
   `supabase secrets set FAL_KEY=...`
2. Publique a função: `supabase functions deploy creative-video-studio`
3. Opcional: troque o modelo sem mexer no código com `FAL_MODEL_REALISTIC` / `FAL_MODEL_ULTRA` (ids de modelos image-to-video do fal.ai).

Sem `FAL_KEY`, o Express funciona normalmente e os níveis de IA respondem "IA de vídeo ainda não está ativa" **sem cobrar**.

Antes de lançar, confirme na página de cada modelo no fal.ai o id e o preço atuais. Eles mudam com frequência, e os valores acima são estimativas conservadoras de out/2026.

## Testes

- `npx vitest run src/config/videoStudio.test.ts src/lib/videoComposer.test.ts`: preços, margens, timeline, transições, quebra de texto, formato de saída.
- `deno test --allow-env supabase/functions/creative-video-studio/index_test.ts`: autenticação, validação de URLs, limite de 1 a 10 fotos, cobrança, reembolso por cena sem duplicidade, escopo do dono.

## Limitações conhecidas

- A montagem acontece em tempo real: um vídeo de 30s leva ~30s, e a aba precisa ficar aberta e visível (navegadores pausam animações em abas em segundo plano).
- Firefox grava em WebM (Chrome, Edge e Safari gravam MP4).
- A trilha sonora é enviada pelo cliente, que é responsável pelos direitos de uso (aviso exibido na tela).
