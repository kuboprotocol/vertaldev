import { describe, expect, it } from 'vitest'
import {
  ADMOB_TEST_APP_IDS,
  SKADNETWORK_IDS,
  isAdMobAppId,
  patchAndroidManifest,
  patchInfoPlist,
} from '../../scripts/admob-native-config.mjs'

const MANIFEST = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application
        android:allowBackup="true"
        android:label="@string/app_name">
        <activity android:name=".MainActivity" />
    </application>
</manifest>
`

const PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
\t<key>CFBundleName</key>
\t<string>kubovibe</string>
</dict>
</plist>
`

const REAL = 'ca-app-pub-6320473908706491~1234567890'

describe('scripts/admob-native-config.mjs (App ID do AdMob no Android/iOS do Capacitor)', () => {
  it('valida o formato do App ID', () => {
    expect(isAdMobAppId(ADMOB_TEST_APP_IDS.android)).toBe(true)
    expect(isAdMobAppId(ADMOB_TEST_APP_IDS.ios)).toBe(true)
    expect(isAdMobAppId('ca-app-pub-6320473908706491/1234567890')).toBe(false) // isso é bloco, não app
    expect(() => patchAndroidManifest(MANIFEST, 'x')).toThrow()
  })

  it('Android: põe o meta-data dentro de <application> e é idempotente', () => {
    const once = patchAndroidManifest(MANIFEST, ADMOB_TEST_APP_IDS.android)
    expect(once).toContain('android:name="com.google.android.gms.ads.APPLICATION_ID"')
    expect(once).toContain(`android:value="${ADMOB_TEST_APP_IDS.android}"`)
    expect(once.indexOf('APPLICATION_ID')).toBeGreaterThan(once.indexOf('<application'))
    expect(once.indexOf('APPLICATION_ID')).toBeLessThan(once.indexOf('</application>'))
    const twice = patchAndroidManifest(once, REAL)
    expect(twice.match(/APPLICATION_ID/g)).toHaveLength(1)
    expect(twice).toContain(`android:value="${REAL}"`)
    expect(twice).not.toContain(ADMOB_TEST_APP_IDS.android)
  })

  it('iOS: GADApplicationIdentifier, texto do ATT e SKAdNetwork do Google, idempotente', () => {
    const once = patchInfoPlist(PLIST, ADMOB_TEST_APP_IDS.ios)
    expect(once).toContain(`<key>GADApplicationIdentifier</key>\n\t<string>${ADMOB_TEST_APP_IDS.ios}</string>`)
    expect(once).toContain('<key>NSUserTrackingUsageDescription</key>')
    expect(once).toContain('cstr6suwn9.skadnetwork')
    expect(SKADNETWORK_IDS[0]).toBe('cstr6suwn9.skadnetwork')
    const twice = patchInfoPlist(once, REAL)
    expect(twice.match(/GADApplicationIdentifier/g)).toHaveLength(1)
    expect(twice.match(/SKAdNetworkItems/g)).toHaveLength(1)
    expect(twice).toContain(`<string>${REAL}</string>`)
    expect(twice.trimEnd().endsWith('</plist>')).toBe(true)
  })
})
