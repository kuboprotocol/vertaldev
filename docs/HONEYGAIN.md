# Recompensas: vídeo premiado (Google Ad Manager) e Vertal Node (Honeygain SDK)

Duas novas formas de ganhar créditos na página **/shortlinks**, ao lado do painel TERRA ADS:

| Recurso | Onde | Crédito (padrão) | Regras |
|---|---|---|---|
| **Vídeo premiado** ("Assistir vídeo e ganhar créditos") | `RewardedVideoPanel` → Edge Function `rewarded-video-claim` | 1 crédito por vídeo | nonce de uso único, cooldown 60 s, até 10/dia |
| **Vertal Node** ("Ganhe compartilhando internet") | `HoneygainNodeCard` + apps em `native/honeygain/` → Edge Function `honeygain-node-heartbeat` | 2 créditos por dia ativo | só com consentimento dado **e** SDK rodando; 1x por usuário por dia |

"Dia" é sempre o dia civil em **America/Sao_Paulo**. Todo crédito sai por
`public.execute_atomic_credit_topup` (soma em `subscriptions.edits_limit` e grava em
`credit_transactions` com chave de idempotência) e fica registrado em `public.reward_events`.

---

## 1. Vídeo premiado (GAM rewarded web)

Fluxo do clique:

1. `POST rewarded-video-claim?action=start` → servidor confere cooldown/limite e devolve um **nonce**
   (64 hex, guardado em `rewarded_video_sessions`, expira em 30 min).
2. O front pede o anúncio: `googletag.defineOutOfPageSlot(adUnit, OutOfPageFormat.REWARDED)` →
   `rewardedSlotReady` → `makeRewardedVisible()`.
3. `rewardedSlotGranted` → `POST rewarded-video-claim?action=claim { nonce }`. A função SQL
   `claim_rewarded_video` trava o usuário (advisory lock), confere nonce/expiração/cooldown/limite,
   marca o nonce como usado e credita — tudo na mesma transação. Repetir o mesmo nonce → `409 nonce_already_used`.
4. `rewardedSlotClosed` → `destroySlots`.
5. Sem anúncio (`slotRenderEnded.isEmpty` ou 15 s sem `rewardedSlotReady`) → aviso "Nenhum vídeo disponível";
   o nonce só expira, nada é creditado. Navegador sem suporte (`defineOutOfPageSlot` = `null`) também é tratado.

### O que o Laércio precisa fazer
- Conta **Google Ad Manager** (não é AdSense) com o domínio aprovado; criar um **ad unit** e ativar
  **rewarded ads para web** (o formato é por aprovação/disponibilidade de demanda — confirmar com o
  Google/parceiro). Rewarded web exige página com HTTPS e o GPT não roda em iframe.
- Definir `VITE_GAM_REWARDED_AD_UNIT` (ex.: `/1234567/vertal_rewarded_web`) e rebuild.
- (Opcional) Ajustar no Supabase → Edge Functions → Secrets:
  `REWARDED_VIDEO_CREDITS`, `REWARDED_VIDEO_COOLDOWN_SECONDS`, `REWARDED_VIDEO_DAILY_CAP`,
  `REWARDED_VIDEO_NONCE_TTL_SECONDS`.
- Conferir se a CSP do site (se houver) libera `securepubads.g.doubleclick.net` e domínios do GAM.

> Limite conhecido: o `rewardedSlotGranted` acontece no navegador; o servidor não recebe confirmação
> server-side do Google (GAM web não tem SSV como o AdMob). O nonce + cooldown + limite diário limitam o abuso.

---

## 2. Vertal Node (Honeygain SDK)

### Regras legais do Honeygain (obrigatórias)
- **Consentimento antes de iniciar.** A tela precisa nomear o **"Honeygain SDK"**, explicar que o
  aparelho vira um **exit node** e ter o botão **"I accept"**. O código usa a janela **nativa**
  `requestConsent()` do SDK, que já cumpre isso. **Tela própria só com aprovação do Honeygain.**
- **Opt-out fácil de achar**: interruptor "Compartilhar internet" sempre visível → `optOut()`.
- No site, o card diz "Vertal Node", mas explica que usa o Honeygain SDK (texto em `HoneygainNodeCard`).
- **Google Play**: o SDK **não** pode ir para apps distribuídos pela Play Store sem acordo com o
  account manager do Honeygain (`sdkhelp@honeygain.com`). Distribuir o APK pelo site até lá.

### Chaves
Uma API key **por app** no [dashboard](https://sdk.honeygain.com/dashboard): **2 chaves** (desktop e
Android). Nunca commitar chaves nem os binários do SDK (`.tgz` / `.aar` estão no `.gitignore`).

### Heartbeat
Os apps chamam `POST /functions/v1/honeygain-node-heartbeat` com o token do usuário
(`Authorization: Bearer <access_token Supabase>`) e
`{ device_id, platform: "desktop"|"android", app_version, opted_in, running }`.
`record_honeygain_heartbeat` atualiza `honeygain_nodes` e, se `opted_in && running`, credita
`HONEYGAIN_NODE_DAILY_CREDITS` uma vez por usuário por dia (`reward_events` com chave
`honeygain_node:<dia SP>`). `GET ?action=summary` alimenta o card (total, dias ativos, dispositivos).

> O crédito é por dia ativo informado pelo app; o Honeygain paga por usuário ativo diário. Vale
> conferir periodicamente os ganhos no dashboard contra `reward_events` para calibrar o valor.

---

## Variáveis de ambiente

| Variável | Onde | Padrão | Para quê |
|---|---|---|---|
| `VITE_GAM_REWARDED_AD_UNIT` | build do site | vazio (botão "em breve") | ad unit GAM rewarded |
| `VITE_VERTAL_NODE_DESKTOP_URL` | build do site | vazio (botão some) | download desktop (https) |
| `VITE_VERTAL_NODE_ANDROID_URL` | build do site | vazio (botão some) | download APK (https) |
| `REWARDED_VIDEO_CREDITS` | secret Supabase | 1 | créditos por vídeo (inteiro) |
| `REWARDED_VIDEO_COOLDOWN_SECONDS` | secret Supabase | 60 | espera entre vídeos |
| `REWARDED_VIDEO_DAILY_CAP` | secret Supabase | 10 | vídeos por dia (SP) |
| `REWARDED_VIDEO_NONCE_TTL_SECONDS` | secret Supabase | 1800 | validade do nonce |
| `HONEYGAIN_NODE_DAILY_CREDITS` | secret Supabase | 2 | créditos por dia ativo (0 desliga) |
| `HONEYGAIN_API_KEY` | build/execução de cada app | — | chave do app (desktop ≠ Android) |
| `VERTAL_SUPABASE_URL`, `VERTAL_SUPABASE_ANON_KEY` | apps nativos | — | chamar a Edge Function |
| `HONEYGAIN_ELECTRON_SDK_URL`, `HONEYGAIN_ANDROID_SDK_URL` | CI (opcional) | — | `scripts/fetch-sdk.sh` baixa o SDK de um link privado |

---

## Deploy (quando aprovar)
1. Aplicar a migração `supabase/migrations/20261124170000_rewarded_video_and_honeygain.sql`.
2. Publicar as funções `rewarded-video-claim` e `honeygain-node-heartbeat` (com verificação de JWT).
3. Definir as env vars do site e rebuild.

## Pendente
- [ ] Conta Honeygain SDK aprovada (KYC) + 2 API keys (desktop, Android).
- [ ] Baixar SDKs do dashboard e rodar `native/honeygain/scripts/fetch-sdk.sh`.
- [ ] Projeto Electron e projeto Android do Vertal Node (o código aqui é o módulo de integração:
      `main`/`preload`/`renderer` e `Application`/manager/manifest/gradle) + login Supabase nos apps.
- [ ] Assinatura/notarização do instalador desktop e hospedagem dos downloads → `VITE_VERTAL_NODE_*_URL`.
- [ ] Acordo com o Honeygain antes de qualquer publicação na Google Play.
- [ ] Tela de consentimento própria (se desejada) → enviar para aprovação do Honeygain.
- [ ] Google Ad Manager: conta, aprovação de rewarded web, ad unit → `VITE_GAM_REWARDED_AD_UNIT`.
- [ ] Rodar a migração e publicar as 2 Edge Functions.
- [ ] Atualizar a política de privacidade do Vertal mencionando o Honeygain SDK e os anúncios do Google.
