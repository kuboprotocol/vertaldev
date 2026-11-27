#!/usr/bin/env node
/**
 * Coloca o App ID do Google AdMob nos projetos nativos do Capacitor (android/ e ios/ não ficam
 * no repositório: são gerados por `npx cap add android|ios`).
 *
 * O plugin @capacitor-community/admob EXIGE o App ID no nativo — sem ele o app Android fecha
 * na abertura. Rode depois de `npx cap add` / `npx cap sync`:
 *
 *   npm run cap:admob                                    # App IDs de TESTE do Google (debug)
 *   ADMOB_ANDROID_APP_ID=ca-app-pub-6320473908706491~… \
 *   ADMOB_IOS_APP_ID=ca-app-pub-6320473908706491~… npm run cap:admob   # release
 *
 * Android: <meta-data com.google.android.gms.ads.APPLICATION_ID> no AndroidManifest.xml.
 * iOS: GADApplicationIdentifier, NSUserTrackingUsageDescription (ATT) e SKAdNetworkItems no Info.plist.
 * Idempotente: rodar de novo só troca o App ID.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** App IDs oficiais de TESTE do Google (developers.google.com/admob/android|ios/test-ads). */
export const ADMOB_TEST_APP_IDS = {
  android: 'ca-app-pub-3940256099942544~3347511713',
  ios: 'ca-app-pub-3940256099942544~1458002511',
}

export const ATT_TEXT =
  'O Vertal Dev usa esse identificador para mostrar anúncios mais relevantes para você. Os anúncios mantêm os planos Free e Starter acessíveis.'

/** SKAdNetwork: Google (cstr6suwn9) + compradores terceiros da lista oficial (developers.google.com/admob/ios/quick-start, nov/2026). */
export const SKADNETWORK_IDS = [
  'cstr6suwn9', '4fzdc2evr5', '2fnua5tdw4', 'ydx93a7ass', 'p78axxw29g', 'v72qych5uu', 'ludvb6z3bs', 'cp8zw746q7',
  '3sh42y64q3', 'c6k4g5qg8m', 's39g8k73mm', 'wg4vff78zm', '3qy4746246', 'f38h382jlk', 'hs6bdukanm', 'mlmmfzh3r3',
  'v4nxqhlyqp', 'wzmmz9fp6w', 'su67r6k2v3', 'yclnxrl5pm', 't38b2kh725', '7ug5zh24hu', 'gta9lk7p23', 'vutu7akeur',
  'y5ghdn5j9k', 'v9wttpbfk9', 'n38lu8286q', '47vhws6wlr', 'kbd757ywx3', '9t245vhmpl', 'a2p9lx4jpn', '22mmun2rn5',
  '44jx6755aq', 'k674qkevps', '4468km3ulz', '2u9pt9hc89', '8s468mfl3y', 'klf5c3l5u5', 'ppxm28t8ap', 'kbmxgpxpgc',
  'uw77j35x4d', '578prtvx9j', '4dzt52r2t5', 'tl55sbb4fm', 'c3frkrj4fj', 'e5fvkxwrpn', '8c4e2ghe7u', '3rd42ekr43',
  '97r2b46745', '3qcr597p9d',
].map((id) => `${id}.skadnetwork`)

const APP_ID_RE = /^ca-app-pub-\d{16}~\d{10}$/

export function isAdMobAppId(id) {
  return typeof id === 'string' && APP_ID_RE.test(id)
}

const META_NAME = 'com.google.android.gms.ads.APPLICATION_ID'

/** Põe/atualiza o App ID no AndroidManifest.xml (puro). */
export function patchAndroidManifest(xml, appId) {
  if (!isAdMobAppId(appId)) throw new Error(`App ID do AdMob inválido: ${appId}`)
  const existing = new RegExp(`(<meta-data[^>]*android:name="${META_NAME.replace(/\./g, '\\.')}"[^>]*android:value=")[^"]*(")`)
  if (existing.test(xml)) return xml.replace(existing, `$1${appId}$2`)
  const reversed = new RegExp(`(<meta-data[^>]*android:value=")[^"]*("[^>]*android:name="${META_NAME.replace(/\./g, '\\.')}")`)
  if (reversed.test(xml)) return xml.replace(reversed, `$1${appId}$2`)
  const appOpen = xml.match(/<application\b[^>]*>/)
  if (!appOpen) throw new Error('AndroidManifest.xml sem <application>')
  const tag = `\n        <!-- Google AdMob (scripts/admob-native-config.mjs) -->\n        <meta-data\n            android:name="${META_NAME}"\n            android:value="${appId}" />`
  const at = appOpen.index + appOpen[0].length
  return xml.slice(0, at) + tag + xml.slice(at)
}

function plistString(key, value) {
  return `\t<key>${key}</key>\n\t<string>${value}</string>\n`
}

/** Põe/atualiza GADApplicationIdentifier, texto do ATT e SKAdNetworkItems no Info.plist (puro). */
export function patchInfoPlist(plist, appId, attText = ATT_TEXT) {
  if (!isAdMobAppId(appId)) throw new Error(`App ID do AdMob inválido: ${appId}`)
  let out = plist
  const setString = (key, value) => {
    const re = new RegExp(`(<key>${key}</key>\\s*<string>)[^<]*(</string>)`)
    if (re.test(out)) {
      out = out.replace(re, `$1${value}$2`)
      return
    }
    const end = out.lastIndexOf('</dict>')
    if (end < 0) throw new Error('Info.plist sem </dict>')
    out = out.slice(0, end) + plistString(key, value) + out.slice(end)
  }
  setString('GADApplicationIdentifier', appId)
  setString('NSUserTrackingUsageDescription', attText)
  if (!out.includes('<key>SKAdNetworkItems</key>')) {
    const items = SKADNETWORK_IDS.map(
      (id) => `\t\t<dict>\n\t\t\t<key>SKAdNetworkIdentifier</key>\n\t\t\t<string>${id}</string>\n\t\t</dict>\n`,
    ).join('')
    const end = out.lastIndexOf('</dict>')
    out = out.slice(0, end) + `\t<key>SKAdNetworkItems</key>\n\t<array>\n${items}\t</array>\n` + out.slice(end)
  }
  return out
}

function main() {
  const root = process.cwd()
  // Release (ADMOB_RELEASE=1) usa os App IDs reais do Vertal Dev; debug usa os de teste do Google.
  const release = process.env.ADMOB_RELEASE === '1' || process.env.ADMOB_RELEASE === 'true'
  const prodIds = { android: 'ca-app-pub-6320473908706491~9745062762', ios: 'ca-app-pub-6320473908706491~9996344205' }
  const androidId = process.env.ADMOB_ANDROID_APP_ID?.trim() || (release ? prodIds.android : ADMOB_TEST_APP_IDS.android)
  const iosId = process.env.ADMOB_IOS_APP_ID?.trim() || (release ? prodIds.ios : ADMOB_TEST_APP_IDS.ios)
  let touched = 0

  const manifest = resolve(root, 'android/app/src/main/AndroidManifest.xml')
  if (existsSync(manifest)) {
    writeFileSync(manifest, patchAndroidManifest(readFileSync(manifest, 'utf8'), androidId))
    console.log(`[admob] Android: APPLICATION_ID = ${androidId}${androidId === ADMOB_TEST_APP_IDS.android ? ' (TESTE)' : ''}`)
    touched++
  }
  const plist = resolve(root, 'ios/App/App/Info.plist')
  if (existsSync(plist)) {
    writeFileSync(plist, patchInfoPlist(readFileSync(plist, 'utf8'), iosId))
    console.log(`[admob] iOS: GADApplicationIdentifier = ${iosId}${iosId === ADMOB_TEST_APP_IDS.ios ? ' (TESTE)' : ''}`)
    touched++
  }
  if (!touched) {
    console.log('[admob] Nenhum projeto nativo encontrado. Rode antes `npx cap add android` e/ou `npx cap add ios`.')
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
