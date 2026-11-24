# Vertal Node — Honeygain SDK (desktop e Android)

Integração do [Honeygain SDK](https://developers.honeygain.com/docs/) no Vertal Node. O usuário
ganha créditos no Vertal Dev por **dia ativo** (consentimento dado + SDK rodando), via a Edge
Function `honeygain-node-heartbeat`. Documentação completa: [`docs/HONEYGAIN.md`](../../docs/HONEYGAIN.md).

```
native/honeygain/
├── electron/            # processo principal, preload e painel do renderer (guia oficial Electron)
│   ├── config.js        # HONEYGAIN_API_KEY, VERTAL_SUPABASE_URL, VERTAL_SUPABASE_ANON_KEY
│   ├── main.js          # setupVertalNode({ app, ipcMain, getWindow }) + heartbeat
│   ├── preload.js       # window.hgSdk (guia) + window.vertalNode (ativar, token, status)
│   └── renderer/vertalNodePanel.js
├── android/
│   ├── app/build.gradle.kts.snippet          # deps + minSdk 21 + BuildConfig da chave
│   ├── app/src/main/AndroidManifest.snippet.xml  # INTERNET + FOREGROUND_SERVICE(_SPECIAL_USE)
│   └── app/src/main/java/dev/vertal/node/    # VertalNodeApp (Application), HoneygainManager, exemplo de Activity
└── scripts/fetch-sdk.sh # coloca o .tgz / .aar baixados do dashboard no lugar (gitignored)
```

## Passos

1. Dashboard Honeygain → criar **dois apps** (desktop e Android) → uma API key para cada.
2. Baixar os SDKs e rodar `scripts/fetch-sdk.sh electron <tgz>` / `scripts/fetch-sdk.sh android <aar>`.
3. Desktop: `cd electron && npm install ./vendor/honeygain-electron-sdk.tgz`; no seu `main` chame
   `setupVertalNode(...)`, use `preload.js` com `contextIsolation: true` e, após o login,
   `window.vertalNode.setAccessToken(session.access_token)`.
4. Android: copie os trechos de gradle/manifest, defina `HONEYGAIN_API_KEY`,
   `VERTAL_SUPABASE_URL` e `VERTAL_SUPABASE_ANON_KEY` em `~/.gradle/gradle.properties` (ou env) e
   chame `node.setAccessToken(...)` após o login.

## Regras que o código já segue

- **Consentimento primeiro**: usa a janela nativa `requestConsent()` do SDK (nomeia o Honeygain SDK,
  explica o exit node, botão "I accept"). Tela própria exige aprovação do Honeygain.
- **Opt-out fácil**: interruptor "Compartilhar internet" sempre visível → `optOut()`.
- **Nunca commitar** o `.tgz`/`.aar` nem as API keys.
- **Google Play**: o SDK não pode ir para apps da Play Store sem acordo com o account manager do
  Honeygain. Distribua o APK pelo site até lá.
