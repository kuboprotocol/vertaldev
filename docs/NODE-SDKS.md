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
| `cashraven` | **ligado (padrão)** | `@cashraven/electron` 4.1.4 (`cr-sdk-electron.zip`) | `io.cashraven:cr-sdk:4.1.4` (Maven Cash Raven) |
| `honeygain` | **aguardando aprovação** — código intacto, fora do padrão; religar por config | `@honeygain/electron-sdk` (.tgz do dashboard) | `hgsdk.aar` do dashboard |
| `bright` | Android implementado, **desligado até a aprovação** (status *Implementation*) | sem SDK Electron (a Bright só tem Windows .NET/C++) → stub desligado | `bright_sdk.aar` (flavor `bright`) |
| `pawns` | stub desligado — aguardando aprovação | doc: https://business.pawns.app/sdk | — |
| `infatica` | stub desligado — aguardando aprovação | doc: https://infatica-sdk.io | — |
| `earnfm` | stub desligado — aguardando aprovação | doc: https://earn.fm/en/business/apps | — |

**Só um provedor ativo por dispositivo**, escolhido por configuração (`NODE_SDK_PROVIDER`):
- desktop: o `main.js` carrega só o pacote do provedor escolhido; os outros nem são `require`-ados;
- Android: um *product flavor* por provedor (`cashraven` padrão, `honeygain`, `bright`) — cada APK leva **um** SDK.

**Religar o Honeygain quando aprovarem** (nada de código): desktop `NODE_SDK_PROVIDER=honeygain`,
Android `-PNODE_SDK_PROVIDER=honeygain`, servidor `VERTAL_NODE_PROVIDERS=cashraven,honeygain` e, se
quiser o rodapé, `VITE_VERTAL_NODE_PARTNER=Honeygain`.

Isso evita dois SDKs disputando a mesma conexão e problemas de exclusividade com parceiros. No
servidor, o dispositivo guarda o provedor atual (`vertal_nodes.provider`); trocar de provedor
sobrescreve, não soma.

### Marca e consentimento
- Toda a UI do Vertal (card do site, painel do app) usa a **marca Vertal Node** e não nomeia o
  fornecedor. O fornecedor aparece **só na tela de consentimento do próprio SDK**, como exigem os termos.
  Exceção opcional: rodapé discreto "Parceiro: …" no card, só se `VITE_VERTAL_NODE_PARTNER` estiver
  definido (padrão vazio = sem rodapé).
- **Consentimento primeiro** (todos): `activate()` abre a tela do SDK e só inicia se o usuário aceitar.
  Nunca abrimos o consentimento sem clique; se já aceitou antes, o app só retoma.
- **Opt-out sempre visível** (todos): interruptor "Compartilhar internet" → `optOut()`.

### Avisos de fornecedor e licenças (só aqui)

**Honeygain SDK** (aguardando aprovação; fora do padrão) — termos: https://developers.honeygain.com/docs/legal
- A tela de consentimento precisa nomear o **"Honeygain SDK"**, explicar que o aparelho vira **exit
  node** e ter **"I accept"**. Usamos a janela **nativa** `requestConsent()`; tela própria só com
  aprovação do Honeygain.
- **Google Play**: não pode ir para apps da Play Store sem acordo com o account manager
  (`sdkhelp@honeygain.com`). Distribuir o APK pelo site até lá.
- Uma API key **por app** no [dashboard](https://sdk.honeygain.com/dashboard) (desktop e Android).

**Cash Raven SDK 4.1.4** (Rayobyte) — docs: https://cashraven.io/docs · termos:
https://cashraven.io/legal/terms-of-use · privacidade: https://cashraven.io/legal/privacy-policy
- API conferida no SDK real 4.1.4 (zip do portal, SHA-256 oficial) em 2026-11-24:
  - **Electron**: `new CashRaven({ developerKey, uid, appId? })` (começa opted-out) →
    `await showConsent(cr, { parent })` (no aceite o SDK chama `optIn()`) → `start()`/`stop()`
    (idempotentes) → `optOut()`; estado por `consentStatus()` (`accepted` vale mesmo pausado),
    `isOptedIn()`, `isRunning()`, `status()` (`STOPPED|CONNECTING|SHARING|PAUSED|ERROR`),
    `authStatus()` (ERROR = chave recusada: `unknown_key`, `key_disabled`, `device_cap`,
    `not_consented`, `app_identity`), eventos por `onEvent()`, **`dispose()` ao sair**. Empacotar com
    `asarUnpack: ["**/node_modules/@cashraven/electron/native/**"]`. Core nativo: Windows x64,
    macOS universal, Linux x64 (glibc 2.36+), Node 18+.
  - **Android**: modo *SDK-managed* — `CashRaven.createManaged(ctx, devKey, uid)` +
    `CashRavenService.configure(cr, Config(ícone))` no `Application.onCreate`;
    `cr.requestConsent(activity, listener)` (`GRANTED|DECLINED|DISMISSED`; não reabre se já decidiu);
    `CashRavenService.start/stop(ctx)` (serviço em primeiro plano do SDK, `dataSync`); opt-out
    `cr.optOut()` + `CashRavenService.stop()`. O app declara `FOREGROUND_SERVICE`,
    `FOREGROUND_SERVICE_DATA_SYNC` e pede `POST_NOTIFICATIONS` (API 33+).
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

**Bright SDK** (Bright Data) — guia: https://docs.bright-sdk.com/integration-guides/android-sdk ·
EULA: https://bright-sdk.com/EULA · privacidade: https://bright-sdk.com/privacy-policy
- Status no painel: *Implementation* → o adapter Android (`BrightNodeSdk`, flavor `bright`) só é criado
  com `-PNODE_SDK_BRIGHT_APPROVED=1`; sem isso o flavor usa o stub desligado.
- **Não publicar na Google Play** um APK com o SDK sem aprovação prévia da Bright.
- API (V2): `Settings(ctx)` com `setSkipConsent(true)` (nunca abrir sem clique), `setLanguage`,
  `setOnStatusChange` (`PEER`=1, `NOT_PEER`=4, `NONE`=0) → `BrightApi.init(ctx, settings)` uma vez;
  `BrightApi.showConsent(activity)` (não existe opt-in direto), `BrightApi.optOut(ctx)`,
  `BrightApi.getConsentChoice(ctx)`, `BrightApi.setTrackingId(uid)` antes do init. O SDK roda em
  processo próprio: a `Application` sai cedo quando `BrightApi.isSvcProcess()`.
- **App ID no Android = packageName** (`dev.vertal.node`); vem do build em `BRIGHT_SDK_APP_ID_ANDROID`
  (nunca no código) e é só conferido contra o packageName. Não há chave no `init`.
- Sem start/stop: com o usuário `PEER` o SDK compartilha sozinho; parar = `optOut()`.
- UI de opt-out exigida: interruptor **"Web Indexing"** com o estado real, texto do benefício e link
  "Learn more" → https://bright-sdk.com/users#learn-more-about-bright-sdk-web-indexing.
- Termos de uso do Vertal precisam do parágrafo da Bright (passo 8 do guia). ProGuard: `-dontnote brdat.sdk.**`.
- O import mostrado pelo guia é `com.android.eapx` (`BrightApi`, `Settings`); o AAR não é público —
  conferir o pacote no primeiro build.
- Desktop: a Bright não tem SDK Electron/Node (só Windows .NET e C/C++) → stub desligado.

**Pawns / Infatica / EarnFM** — aguardando aprovação; adicionar os avisos aqui quando
cada adapter for implementado.

### Chaves
Nunca commitar chaves nem binários de SDK (`vendor/`, `*.tgz`, `*.zip`, `*.aar`, libs nativas estão
no `.gitignore`). Chaves vêm do ambiente (desktop) ou de `~/.gradle/gradle.properties` (Android) e
nunca são impressas em log.

### Heartbeat
Os apps chamam `POST /functions/v1/vertal-node-heartbeat` com o token do usuário
(`Authorization: Bearer <access_token Supabase>`) e
`{ device_id, platform: "desktop"|"android", provider, app_version, opted_in, running }`.
- `provider` ausente = `honeygain` (apps antigos). Provedor fora de `VERTAL_NODE_PROVIDERS` → `403 provider_disabled`
  (com o padrão `cashraven`, heartbeats Honeygain/sem provider são recusados até religar).
- `record_vertal_node_heartbeat` atualiza `vertal_nodes` e, se `opted_in && running`, credita
  `VERTAL_NODE_DAILY_CREDITS` **uma vez por usuário por dia** (chave `vertal_node:<dia SP>`), não
  importa quantos dispositivos ou provedores. Com `VERTAL_NODE_CREDIT_PER_PROVIDER=true` vira 1x por
  provedor por dia (chave `vertal_node:<provedor>:<dia SP>`).
- O provedor vai em `reward_events.metadata.provider` (fonte `vertal_node`) e no metadata do topup.
- `GET ?action=summary` alimenta o card (total, dias ativos, dispositivos com provedor e `consent`, o
  último aceite do site). Tolera as tabelas ainda não criadas (devolve zeros em vez de 500).
- `POST ?action=consent` `{ accept, consent_version, platform: "android"|"desktop"|"ios"|"other" }`
  grava o aceite do botão **Accept & activate** em `vertal_node_consents` (append-only, com versão do
  texto, plataforma, user agent e data = prova de consentimento LGPD). Não liga nada: o app ainda
  mostra a tela de consentimento do SDK do parceiro.

### Botão "Accept & activate" (card em /recompensas)
1. Clique → texto de consentimento (exit node, só banda ociosa, desliga quando quiser, registro LGPD).
2. "I agree, activate" → `action=consent`. Sem login (401) pede para entrar; outro erro não bloqueia.
3. Android → `intent://open?source=recompensas#Intent;scheme=vertalnode;package=dev.vertal.node;S.browser_fallback_url=<APK>;end`
   (abre o app instalado ou baixa o APK). Computador → baixa `VITE_VERTAL_NODE_DESKTOP_URL` (sem URL:
   aviso "not available for download yet"). iPhone/iPad/outros → "not available yet".
4. APK padrão: `DEFAULT_VERTAL_NODE_ANDROID_URL` em `src/lib/vertalNode.ts` (última pré-release
   `vertal-node-android-test-*`), usado quando `VITE_VERTAL_NODE_ANDROID_URL` está vazio.

> O crédito é por dia ativo informado pelo app. Os parceiros pagam por usuário ativo (Cash Raven:
> 60 min/dia UTC). Vale conferir os ganhos nos dashboards contra `reward_events` para calibrar.

---

## Variáveis de ambiente

| Variável | Onde | Padrão | Para quê |
|---|---|---|---|
| `VITE_GAM_REWARDED_AD_UNIT` | build do site | vazio (botão "em breve") | ad unit GAM rewarded |
| `VITE_VERTAL_NODE_DESKTOP_URL` | build do site | vazio (botão some) | download desktop (https) |
| `VITE_VERTAL_NODE_ANDROID_URL` | build do site | APK da última pré-release `vertal-node-android-test-*` | download APK (https) e fallback do intent |
| `VITE_VERTAL_NODE_PARTNER` | build do site | vazio (rodapé some) | rodapé discreto "Parceiro: …" no card |
| `REWARDED_VIDEO_CREDITS` | secret Supabase | 1 | créditos por vídeo (inteiro) |
| `REWARDED_VIDEO_COOLDOWN_SECONDS` | secret Supabase | 60 | espera entre vídeos |
| `REWARDED_VIDEO_DAILY_CAP` | secret Supabase | 10 | vídeos por dia (SP) |
| `REWARDED_VIDEO_NONCE_TTL_SECONDS` | secret Supabase | 1800 | validade do nonce |
| `VERTAL_NODE_DAILY_CREDITS` | secret Supabase | 2 (ou `HONEYGAIN_NODE_DAILY_CREDITS`, nome antigo) | créditos por dia ativo (0 desliga) |
| `VERTAL_NODE_CREDIT_PER_PROVIDER` | secret Supabase | `false` | `true` = 1 crédito/dia **por provedor** (padrão: 1/dia no total) |
| `VERTAL_NODE_PROVIDERS` | secret Supabase | `cashraven` | provedores aceitos no heartbeat (Honeygain: aguardando aprovação) |
| `NODE_SDK_PROVIDER` | build/execução dos apps | `cashraven` | provedor ativo no dispositivo (desktop) / flavor (Android) |
| `CASHRAVEN_API_KEY_DESKTOP` / `CASHRAVEN_API_KEY_ANDROID` | apps (desktop / Android) | — | developer key Cash Raven de cada app |
| `VERTAL_NODE_APP_ID` | app desktop (opcional) | — | Application ID registrado no portal (chave copiada para outro app para de funcionar) |
| `HONEYGAIN_API_KEY` / `HONEYGAIN_API_KEY_ANDROID` | apps (desktop / Android) | — | chave Honeygain de cada app (aguardando aprovação) |
| `BRIGHT_SDK_APP_ID_ANDROID` | app Android (flavor `bright`) | — | App ID do painel Bright (= packageName) |
| `NODE_SDK_BRIGHT_APPROVED` | app Android (flavor `bright`) | `0` | `1` liga o adapter Bright depois da aprovação |
| `VERTAL_SUPABASE_URL`, `VERTAL_SUPABASE_ANON_KEY` | apps nativos | — | chamar a Edge Function |
| `HONEYGAIN_*_SDK_URL`, `CASHRAVEN_*_SDK_URL`, `BRIGHT_ANDROID_SDK_URL` (+ `*_SHA256`) | CI (opcional) | — | `native/node-sdks/scripts/fetch-sdk.sh` baixa o SDK de um link privado |

---

## Deploy (quando aprovar)
1. Migração `20261128020000_vertal_node_providers_and_consent.sql` (aditiva; substitui a arquivada
   `20261124210000`, que renomeava `honeygain_nodes` e tirava `kubo_music` da CHECK do ledger). Entra
   em produção pela integração Supabase ao fazer merge na `main`.
2. Publicar as funções `rewarded-video-claim` e `vertal-node-heartbeat` (com verificação de JWT).
3. Definir as env vars do site e rebuild.

## Pendente
- [ ] Honeygain (fora por enquanto, decisão de 2026-11-24): aguardando resposta/aprovação. Quando
      aprovarem: 2 API keys (desktop, Android), baixar SDKs
      (`native/node-sdks/scripts/fetch-sdk.sh honeygain electron|android <arquivo>`) e religar por config.
- [x] Cash Raven: conta de desenvolvedor criada, apps "Vertal Node Desktop" e "Vertal Android" com
      developer keys (guardadas fora do repo).
- [x] Cash Raven: zips 4.1.4 baixados do portal (SHA-256 conferido) e adapters Electron/Android
      ajustados à API real (AGENTS.md, index.d.ts, classes do AAR).
- [ ] Cash Raven: rodar o adapter Electron com o core nativo real num x64 (o sandbox era arm64) e
      compilar o flavor Android `cashraven`.
- [ ] Cash Raven: registrar o Application ID (desktop `VERTAL_NODE_APP_ID`; Android = packageName) no portal.
- [ ] Cash Raven: subir um build com dispositivo real (passo "Test connectivity" do portal) e enviar
      para compliance (opt-out visível) antes de passar de 100 dispositivos.
- [ ] Bright: aprovação (status *Implementation*) → baixar `bright_sdk.aar`
      (`fetch-sdk.sh bright android <arquivo>`), conferir o pacote `com.android.eapx` no AAR, compilar
      com `-PNODE_SDK_PROVIDER=bright -PNODE_SDK_BRIGHT_APPROVED=1`, fazer o self-check do painel com
      aparelho real, interruptor "Web Indexing" no app e parágrafo da Bright nos termos.
- [ ] Pawns / Infatica / EarnFM: aprovação dos parceiros → implementar o adapter
      (`native/node-sdks/electron/adapters/<id>.js`, flavor Android) e incluir em `VERTAL_NODE_PROVIDERS`.
- [ ] Projeto Electron e projeto Android do Vertal Node (o código aqui é o módulo de integração) + login Supabase nos apps.
- [ ] Assinatura/notarização do instalador desktop e hospedagem dos downloads → `VITE_VERTAL_NODE_*_URL`.
- [ ] Acordo com o Honeygain antes de qualquer publicação na Google Play; Bright também exige aprovação
      antes da Play (Cash Raven: conferir política da Play).
- [ ] Google Ad Manager: conta, aprovação de rewarded web, ad unit → `VITE_GAM_REWARDED_AD_UNIT`.
- [ ] Rodar as migrações e publicar as 2 Edge Functions.
- [ ] Atualizar a política de privacidade do Vertal mencionando os SDKs de banda usados e os anúncios do Google.

---

## vertal.js no Vertal Dev (consentimento reaproveitado)

O app carrega o loader `vertal.js` (Vertal DePIN; snippet e API em `kuboprotocol/vertal-ai-grid`,
`docs/VERTAL-JS.md`) só para quem **já aceitou o Vertal Node**. O painel de recompensas
(`VertalNodeCard`) não muda: `src/lib/vertal-js.ts` apenas **lê** o aceite em
`public.vertal_nodes.opted_in` (gravado pelo `vertal-node-heartbeat` depois da tela de consentimento
do parceiro no app nativo; RLS = só as próprias linhas). Montado uma vez em `src/main.tsx` (`startVertalJs()`, sem UI; acompanha a sessão do Supabase).

| Estado | Efeito |
|---|---|
| `VITE_VERTAL_JS_SRC` (https) ou `VITE_VERTAL_APP_ID` vazio | nada: sem consulta, sem script |
| logado e algum dispositivo com `opted_in = true` | no idle: `Vertal.init({ appId })` + `Vertal.consent.grant()` (o script só baixa aqui) |
| dispositivos só com opt-out, ou logout | `Vertal.consent.revoke()` (ou só apaga `vertal:v1:config` se o script não foi liberado) |
| sem dispositivo registrado | nada |

Esse consentimento cobre só o script (status, recompensas, deep link para o app). Compartilhar banda
continua sendo opt-in explícito no app nativo; o navegador nunca liga nada. Releitura do aceite quando a
aba volta a ficar visível (no máximo a cada 10 min). Sem logs no console. Testes: `src/test/vertal-js.test.ts`.

- [ ] Publicar o gateway com `/sdk/v1/vertal.js` e definir `VITE_VERTAL_JS_SRC` / `VITE_VERTAL_APP_ID` no build.
- [ ] Liberar o domínio do gateway na CSP do site (`script-src` e `connect-src`), se houver CSP.

## Fase 2: SDK embutido no app nativo (Capacitor Android e Electron)

Desligado por padrão. Liga só com `VITE_VERTAL_NODE_EMBEDDED_SDK=true` **no build do app nativo**
(o site normal continua abrindo/baixando o app separado do Vertal Node).

Fluxo (igual nas duas plataformas): o usuário toca em **Accept & activate** no card de `/recompensas`
→ o aceite é gravado em `vertal_node_consents` (`vertal-node-heartbeat?action=consent`) → o app chama o
SDK embutido → aparece a **tela de consentimento da Cash Raven** (nomeia o fornecedor, termos e
privacidade) → só depois do aceite começa a compartilhar. **Pause** e **Turn off** (opt-out, que também
grava a revogação) ficam no card. Nada liga antes do toque; abrir o app só retoma quem já aceitou e não pausou.

### Android (Capacitor) — `native/node-sdks/capacitor` (`@vertal/node-sdk-capacitor`)
- Plugin `VertalNode`: `status()`, `activate()`, `pause()`, `optOut()`. Cash Raven SDK 4.1.4 (modo
  SDK-managed), serviço em primeiro plano `dataSync` com notificação fixa, retomada após reiniciar
  (`setStartOnBoot(true)` só depois do aceite; Pausar/Desativar desligam).
- Chave: `CASHRAVEN_API_KEY_ANDROID` (secret do repositório) entra no `BuildConfig` do plugin **no build**.
  Nunca commitar. Toda chave dentro de um APK pode ser extraída; é o normal nesses SDKs.
- No app Capacitor: `npm i ./native/node-sdks/capacitor && npx cap sync android` e adicionar em
  `android/build.gradle` → `allprojects.repositories`:
  `maven { url "https://cashraven-downloads.nyc3.digitaloceanspaces.com/maven" }`.
- **iOS: não suportado** (a Cash Raven não tem SDK iOS); o card mostra "not available" no iPhone.
- CI: `.github/workflows/vertal-node-capacitor.yml` compila o plugin (AAR) a cada PR.

### Computador (Electron) — `native/node-sdks/electron`
- `scripts/inject-build-config.js` grava `CASHRAVEN_API_KEY_DESKTOP` (e Supabase/App ID) em
  `build-config.json` (gitignored) **no build**; o app instalado lê dali. Nunca imprime valores.
- `tray.js`: ícone na bandeja com estado, **Ativar…** (abre o consentimento do parceiro), **Pausar** e
  **Desativar (opt-out)**. Windows x64, macOS universal e Linux x64 (plataformas do SDK 4.1.4).
- `window.vertalNode` (preload) é a ponte que o card usa dentro do Electron.
- O SDK Electron (`cr-sdk-electron.zip`) não é público: para empacotar no CI, defina
  `CASHRAVEN_ELECTRON_SDK_URL` (URL privada) e rode `scripts/fetch-sdk.sh cashraven electron`.

### Google Play / Play Protect (declarar antes de publicar)
- **Data safety**: declarar o SDK da Cash Raven como coleta/compartilhamento de *Device or other IDs*
  (id pseudônimo do aparelho) e *App info and performance* (diagnóstico); finalidade: funcionalidade do
  app (compartilhamento de banda com consentimento). Dados criptografados em trânsito; o usuário pode
  pedir exclusão (opt-out + revogação gravada).
- **Foreground service** `dataSync` com notificação visível o tempo todo; justificar o tipo no Play Console.
- Descrição da loja e tela do app devem dizer claramente que o app compartilha a internet ociosa como
  ponto de saída de um parceiro, com consentimento e opt-out (política de *Device and Network Abuse* /
  *Mobile Unwanted Software*). Sem ativação silenciosa: cumprido pelo fluxo acima.
- `RECEIVE_BOOT_COMPLETED` só retoma quem aceitou e deixou ligado.
