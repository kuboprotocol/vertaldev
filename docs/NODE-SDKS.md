# Recompensas: vídeo premiado (Google Ad Manager) e Vertal Node (SDKs de banda)

Duas novas formas de ganhar créditos na página **/shortlinks**, ao lado do painel TERRA ADS:

| Recurso | Onde | Crédito (padrão) | Regras |
|---|---|---|---|
| **Vídeo premiado** ("Assistir vídeo e ganhar créditos") | `RewardedVideoPanel` → Edge Function `rewarded-video-claim` | 1 crédito por vídeo | nonce de uso único, cooldown 60 s, até 10/dia |
| **Vertal Node** ("Ganhe compartilhando internet") | `VertalNodeCard` + apps em `native/node-sdks/` → Edge Function `vertal-node-heartbeat` | 2 créditos por dia ativo | só com consentimento dado **e** SDK rodando; 1x por usuário por dia (qualquer provedor) |

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

## 2. Vertal Node — SDKs de compartilhamento de banda (multi-provedor)

O Vertal Node é **um app só** (desktop Electron e Android) com uma **camada de provedores** em
`native/node-sdks/`. Cada SDK de banda é um *adapter* com a mesma interface
(`init(apiKey)`, `requestConsent`, `isOptedIn`, `start`, `stop`, `optOut`, `isRunning`):

| Provedor | Estado | Desktop (Electron/Node) | Android |
|---|---|---|---|
| `honeygain` | ligado (padrão) | `@honeygain/electron-sdk` (.tgz do dashboard) | `hgsdk.aar` do dashboard |
| `cashraven` | ligado | `@cashraven/electron` 4.1.4 (`cr-sdk-electron.zip`) | `io.cashraven:cr-sdk:4.1.4` (Maven Cash Raven) |
| `pawns` | stub desligado — aguardando aprovação | doc: https://business.pawns.app/sdk | — |
| `bright` | stub desligado — aguardando aprovação | doc: https://bright-sdk.com | — |
| `infatica` | stub desligado — aguardando aprovação | doc: https://infatica-sdk.io | — |
| `earnfm` | stub desligado — aguardando aprovação | doc: https://earn.fm/en/business/apps | — |

**Só um provedor ativo por dispositivo**, escolhido por configuração (`NODE_SDK_PROVIDER`):
- desktop: o `main.js` carrega só o pacote do provedor escolhido; os outros nem são `require`-ados;
- Android: um *product flavor* por provedor (`honeygain`, `cashraven`) — cada APK leva **um** SDK.

Isso evita dois SDKs disputando a mesma conexão e problemas de exclusividade com parceiros. No
servidor, o dispositivo guarda o provedor atual (`vertal_nodes.provider`); trocar de provedor
sobrescreve, não soma.

### Marca e consentimento
- Toda a UI do Vertal (card do site, painel do app) usa a **marca Vertal Node** e não nomeia o
  fornecedor. O fornecedor aparece **só na tela de consentimento do próprio SDK**, como exigem os termos.
- **Consentimento primeiro** (todos): `activate()` abre a tela do SDK e só inicia se o usuário aceitar.
  Nunca abrimos o consentimento sem clique; se já aceitou antes, o app só retoma.
- **Opt-out sempre visível** (todos): interruptor "Compartilhar internet" → `optOut()`.

### Avisos de fornecedor e licenças (só aqui)

**Honeygain SDK** — termos: https://developers.honeygain.com/docs/legal
- A tela de consentimento precisa nomear o **"Honeygain SDK"**, explicar que o aparelho vira **exit
  node** e ter **"I accept"**. Usamos a janela **nativa** `requestConsent()`; tela própria só com
  aprovação do Honeygain.
- **Google Play**: não pode ir para apps da Play Store sem acordo com o account manager
  (`sdkhelp@honeygain.com`). Distribuir o APK pelo site até lá.
- Uma API key **por app** no [dashboard](https://sdk.honeygain.com/dashboard) (desktop e Android).

**Cash Raven SDK 4.1.4** (Rayobyte) — docs: https://cashraven.io/docs · termos:
https://cashraven.io/legal/terms-of-use · privacidade: https://cashraven.io/legal/privacy-policy
- Consentimento **embutido no SDK** (`showConsent`); o texto do acordo e os links são da Cash Raven
  (só cores, nome do app, rótulos e parágrafos extras pelo painel *Consent screen* do portal, sem rebuild).
  Tela própria (JAR headless no Android) só com aprovação de compliance por app.
- Caixa de 18+/consentimento do responsável, nunca pré-marcada (o SDK cuida).
- **Opt-out visível que chama `optOut()` é obrigatório** e é conferido na revisão de compliance.
- O SDK faz opt-out sozinho ao bater limites de proteção (dados, CPU/RAM) — o estado é relido do SDK.
- Primeiros **100 dispositivos** liberados sem aprovação; acima disso, `partnerships@cashraven.io`
  define o preço e a compliance aprova o build.
- Licença não exclusiva; lei de Nebraska (EUA); público 18+.
- Pagamento por usuário/mês por país, ganho por dia: o dia conta depois de **60 min compartilhando
  (dia UTC)**, 1x por conexão de rede; IPs de datacenter/VPN não contam. KYC (Sumsub) antes do saque.
- Uma developer key **por app** no portal (apps "Vertal Node Desktop" e "Vertal Android").
- Requisitos Android: minSdk 24, compile/targetSdk 34, JDK 17, JNA 5.14.0@aar, AGP 8.2–8.6.

**Pawns / Bright / Infatica / EarnFM** — aguardando aprovação; adicionar os avisos aqui quando
cada adapter for implementado.

### Chaves
Nunca commitar chaves nem binários de SDK (`vendor/`, `*.tgz`, `*.zip`, `*.aar`, libs nativas estão
no `.gitignore`). Chaves vêm do ambiente (desktop) ou de `~/.gradle/gradle.properties` (Android) e
nunca são impressas em log.

### Heartbeat
Os apps chamam `POST /functions/v1/vertal-node-heartbeat` com o token do usuário
(`Authorization: Bearer <access_token Supabase>`) e
`{ device_id, platform: "desktop"|"android", provider, app_version, opted_in, running }`.
- `provider` ausente = `honeygain` (apps antigos). Provedor fora de `VERTAL_NODE_PROVIDERS` → `403 provider_disabled`.
- `record_vertal_node_heartbeat` atualiza `vertal_nodes` e, se `opted_in && running`, credita
  `VERTAL_NODE_DAILY_CREDITS` **uma vez por usuário por dia** (chave `vertal_node:<dia SP>`), não
  importa quantos dispositivos ou provedores. Com `VERTAL_NODE_CREDIT_PER_PROVIDER=true` vira 1x por
  provedor por dia (chave `vertal_node:<provedor>:<dia SP>`).
- O provedor vai em `reward_events.metadata.provider` (fonte `vertal_node`) e no metadata do topup.
- `GET ?action=summary` alimenta o card (total, dias ativos, dispositivos com provedor).

> O crédito é por dia ativo informado pelo app. Os parceiros pagam por usuário ativo (Cash Raven:
> 60 min/dia UTC). Vale conferir os ganhos nos dashboards contra `reward_events` para calibrar.

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
| `VERTAL_NODE_DAILY_CREDITS` | secret Supabase | 2 (ou `HONEYGAIN_NODE_DAILY_CREDITS`, nome antigo) | créditos por dia ativo (0 desliga) |
| `VERTAL_NODE_CREDIT_PER_PROVIDER` | secret Supabase | `false` | `true` = 1 crédito/dia **por provedor** (padrão: 1/dia no total) |
| `VERTAL_NODE_PROVIDERS` | secret Supabase | `honeygain,cashraven` | provedores aceitos no heartbeat |
| `NODE_SDK_PROVIDER` | build/execução dos apps | `honeygain` | provedor ativo no dispositivo (desktop) / flavor (Android) |
| `HONEYGAIN_API_KEY` / `HONEYGAIN_API_KEY_ANDROID` | apps (desktop / Android) | — | chave Honeygain de cada app |
| `CASHRAVEN_API_KEY_DESKTOP` / `CASHRAVEN_API_KEY_ANDROID` | apps (desktop / Android) | — | developer key Cash Raven de cada app |
| `VERTAL_SUPABASE_URL`, `VERTAL_SUPABASE_ANON_KEY` | apps nativos | — | chamar a Edge Function |
| `HONEYGAIN_*_SDK_URL`, `CASHRAVEN_*_SDK_URL` (+ `*_SHA256`) | CI (opcional) | — | `native/node-sdks/scripts/fetch-sdk.sh` baixa o SDK de um link privado |

---

## Deploy (quando aprovar)
1. Aplicar as migrações `20261124170000_rewarded_video_and_honeygain.sql` e
   `20261124210000_vertal_node_providers.sql` (nessa ordem).
2. Publicar as funções `rewarded-video-claim` e `vertal-node-heartbeat` (com verificação de JWT).
3. Definir as env vars do site e rebuild.

## Pendente
- [ ] Honeygain: conta SDK aprovada (KYC) + 2 API keys (desktop, Android); baixar SDKs
      (`native/node-sdks/scripts/fetch-sdk.sh honeygain electron|android <arquivo>`).
- [x] Cash Raven: conta de desenvolvedor criada, apps "Vertal Node Desktop" e "Vertal Android" com
      developer keys (guardadas fora do repo).
- [ ] Cash Raven: baixar `cr-sdk-electron.zip` (e, para build offline, `cr-sdk-android.zip`) do portal,
      rodar `fetch-sdk.sh cashraven …` e **conferir as assinaturas** marcadas com `TODO(cashraven)` /
      `TODO(cashraven-android)` contra o `README.md`/`AGENTS.md` do zip.
- [ ] Cash Raven: subir um build com dispositivo real (passo "Test connectivity" do portal) e enviar
      para compliance (opt-out visível) antes de passar de 100 dispositivos.
- [ ] Pawns / Bright / Infatica / EarnFM: aprovação dos parceiros → implementar o adapter
      (`native/node-sdks/electron/adapters/<id>.js`, flavor Android) e incluir em `VERTAL_NODE_PROVIDERS`.
- [ ] Projeto Electron e projeto Android do Vertal Node (o código aqui é o módulo de integração) + login Supabase nos apps.
- [ ] Assinatura/notarização do instalador desktop e hospedagem dos downloads → `VITE_VERTAL_NODE_*_URL`.
- [ ] Acordo com o Honeygain antes de qualquer publicação na Google Play (Cash Raven: conferir política da Play).
- [ ] Google Ad Manager: conta, aprovação de rewarded web, ad unit → `VITE_GAM_REWARDED_AD_UNIT`.
- [ ] Rodar as migrações e publicar as 2 Edge Functions.
- [ ] Atualizar a política de privacidade do Vertal mencionando os SDKs de banda usados e os anúncios do Google.
