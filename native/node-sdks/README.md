# Vertal Node — camada de SDKs de compartilhamento de banda (desktop e Android)

Módulo de integração do Vertal Node. O usuário ganha créditos no Vertal Dev por **dia ativo**
(consentimento dado + SDK rodando) via a Edge Function `vertal-node-heartbeat`.
Provedores, regras de consentimento, avisos dos fornecedores e licenças: **[`docs/NODE-SDKS.md`](../../docs/NODE-SDKS.md)**
(único lugar com os avisos de cada fornecedor).

```
native/node-sdks/
├── electron/
│   ├── adapters/        # index.js (registro + interface), honeygain.js, cashraven.js, disabled.js (stubs)
│   ├── config.js        # NODE_SDK_PROVIDER, chave do provedor, VERTAL_SUPABASE_URL/ANON_KEY
│   ├── main.js          # setupVertalNode({ app, ipcMain, getWindow }) — um provedor só + heartbeat
│   ├── deeplink.js      # setupDeepLink({ app, ipcMain, getWindow }) — vertalnode://open
│   ├── preload.js       # window.vertalNode (ativar, opt-out, status, token, onDeepLink)
│   ├── renderer/vertalNodePanel.js
│   └── vendor/          # SDKs baixados (gitignored)
├── android/
│   └── app/
│       ├── build.gradle.kts                   # um flavor por provedor (cashraven | honeygain | bright)
│       ├── libs/                              # .aar baixados (gitignored)
│       └── src/
│           ├── main/…/dev/vertal/node/        # VertalNodeApp, VertalNodeManager, sdk/NodeSdk (interface)
│           ├── cashraven/…/sdk/               # CashRavenNodeSdk + NodeSdkFactory (padrão)
│           ├── honeygain/…/sdk/               # HoneygainNodeSdk + NodeSdkFactory (aguardando aprovação)
│           └── bright/…/sdk/                  # BrightNodeSdk + NodeSdkFactory (desligado até a aprovação)
└── scripts/fetch-sdk.sh # coloca os SDKs baixados dos portais no lugar (gitignored)
```

## Interface comum

`init(apiKey)` · `requestConsent()` · `isOptedIn()` · `start()` · `stop()` · `optOut()` · `isRunning()`

**Um provedor ativo por dispositivo**: `NODE_SDK_PROVIDER=cashraven` (padrão) | `honeygain`
(aguardando aprovação, religável por config) | `bright` (só Android; adapter desligado até
`NODE_SDK_BRIGHT_APPROVED=1`). Desktop carrega só esse pacote; Android monta só esse flavor.
`pawns`, `infatica`, `earnfm` (e `bright` no desktop, que não tem SDK Electron) são stubs desligados.

## Passos

1. Pegue a chave do app (desktop ≠ Android) no portal do provedor e exporte no ambiente /
   `~/.gradle/gradle.properties` (ver `.env.example`). Nunca commitar chaves nem SDKs.
2. `bash scripts/fetch-sdk.sh <cashraven|honeygain> <electron|android> <arquivo-baixado>`
   (ou `bright android <arquivo>`).
3. Desktop: `cd electron && npm run sdk:<provedor>`; no seu `main` chame `setupVertalNode(...)`,
   use `preload.js` com `contextIsolation: true` e, após o login,
   `window.vertalNode.setAccessToken(session.access_token)`.
4. Android: `native/node-sdks/android` é um projeto Gradle mínimo (app de teste, uma tela).
   `gradle assembleCashravenDebug` (Gradle 8.7, JDK 17) ou `-PNODE_SDK_PROVIDER=<provedor>`.
   APK de teste no CI: workflow `.github/workflows/vertal-node-android.yml` (artifact
   `vertal-node-android-test` + pré-release). Chame `node.setAccessToken(...)` após o login.

## Regras que o código segue (todos os provedores)

- **Consentimento primeiro**: a tela de consentimento é a do SDK; nada inicia sem aceite.
- **Opt-out fácil**: interruptor "Compartilhar internet" sempre visível → `optOut()`.
- **Marca Vertal** em toda a UI; o fornecedor só aparece na tela de consentimento do SDK.

## Deep link `vertalnode://open` (site → app)

O loader `vertal.js` (repo vertal-ai-grid, `Vertal.node.openApp()`) abre o app com
`vertalnode://open?appId=…&source=vertal-js[&ref=…]`. O link **só abre/foca a tela**; nunca liga o
compartilhamento (continua exigindo "Ativar" + consentimento do parceiro). Parâmetros: lista branca
`appId`/`app_id`, `ref`, `source`, valores `[A-Za-z0-9._-]{1,64}`.

- **Android**: intent-filter na `MainActivity` (`DeepLink.kt`).
- **Desktop (Electron)**: no `main`, antes de `ready`:
  ```js
  const { setupDeepLink } = require("./node-sdks/electron/deeplink");
  if (!setupDeepLink({ app, ipcMain, getWindow: () => mainWindow }).primary) return;
  ```
  Usa `requestSingleInstanceLock`, `setAsDefaultProtocolClient("vertalnode")`, `second-instance`
  (Windows/Linux) e `open-url` (macOS). O renderer recebe `window.vertalNode.onDeepLink(cb)` e
  `window.vertalNode.pendingDeepLink()` (link que chegou antes da janela).
- **Registro no sistema** (instalador). electron-builder:
  ```json
  "protocols": [{ "name": "Vertal Node", "schemes": ["vertalnode"] }]
  ```
  - Windows: NSIS grava `HKCU\Software\Classes\vertalnode` (`URL Protocol` = "", `shell\open\command`
    = `"…\Vertal Node.exe" "%1"`); `setAsDefaultProtocolClient` também grava em tempo de execução.
  - macOS: vira `CFBundleURLTypes` → `CFBundleURLSchemes = ["vertalnode"]` no `Info.plist`; só vale
    com o app em /Applications (empacotado).
  - Linux: `.desktop` com `MimeType=x-scheme-handler/vertalnode;` e `Exec=… %u` (deb/rpm); AppImage
    precisa de integração com o desktop (ex.: AppImageLauncher) ou `xdg-mime default`.
- **iOS**: não existe app; o vertal.js manda o iPhone/iPad para `ios_url`.
