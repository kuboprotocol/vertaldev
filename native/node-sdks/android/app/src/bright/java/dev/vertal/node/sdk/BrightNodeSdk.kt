package dev.vertal.node.sdk

import android.app.Activity
import android.app.Application
import android.content.Context
import android.util.Log
import com.android.eapx.BrightApi
import com.android.eapx.Settings

/**
 * Adapter Bright SDK (Bright Data) para Android — flavor `bright`.
 * Status no painel da Bright: **Implementation** (aguardando aprovação). Fica DESLIGADO até a Bright
 * aprovar: o NodeSdkFactory deste flavor só cria este adapter com NODE_SDK_BRIGHT_APPROVED=1.
 * A Bright pede para NÃO publicar na Google Play um APK com o SDK sem aprovação prévia.
 *
 * Feito a partir do guia oficial "Bright SDK for Android - Integration Guide" (API V2,
 * https://docs.bright-sdk.com/integration-guides/android-sdk, lido em 2026-11-24):
 *   - SDK: bright_sdk.aar em app/libs/bright/ (Bright SDK Downloader ou plugin Gradle; não commitado);
 *     o guia mostra o import `com.android.eapx` (BrightApi, Settings). Conferir o pacote exato no AAR
 *     no primeiro build — o AAR não é público e não foi baixado aqui;
 *   - Settings(context): setSkipConsent(true) (nunca abrir consentimento sem clique),
 *     setLanguage, setOnStatusChange(choice -> PEER | NOT_PEER | NONE); BrightApi.init(context, settings)
 *     uma vez só; BrightApi.setTrackingId(id) antes do init;
 *   - consentimento: BrightApi.showConsent(activity) (tela da Bright; o opt-in acontece só se o
 *     usuário aceitar — não existe opt-in direto);
 *   - opt-out: BrightApi.optOut(context); estado: BrightApi.getConsentChoice(context) (true/false/null);
 *   - o SDK roda em processo próprio (sufixo srvh/srvj): a Application sai cedo quando
 *     BrightApi.isSvcProcess() (ver NodeSdkFactory.isSdkServiceProcess());
 *   - App ID no Android = packageName do app (ApplicationInfo.packageName, `dev.vertal.node`);
 *     não vai chave no init. O valor cadastrado no painel vem do build (BRIGHT_SDK_APP_ID_ANDROID) e
 *     aqui só é conferido contra o packageName.
 * Exigências de UI da Bright (opt-out): interruptor chamado "Web Indexing" mostrando o estado real,
 * texto do benefício abaixo e link "Learn more" para
 * https://bright-sdk.com/users#learn-more-about-bright-sdk-web-indexing. ProGuard: -dontnote brdat.sdk.**
 *
 * A Bright não tem start/stop: com o usuário PEER o próprio SDK compartilha em segundo plano.
 * Por isso start() só confere o consentimento e stop() não pausa — parar de verdade = optOut().
 */
class BrightNodeSdk : NodeSdk {
    override val id = "bright"
    override val vendor = "Bright SDK"
    override val enabled = true

    private lateinit var appContext: Context
    private var initialized = false
    private var pendingConsent: ((Boolean) -> Unit)? = null

    private fun need(): Context {
        check(initialized) { "bright: chame init() antes" }
        return appContext
    }

    override fun init(app: Application, apiKey: String, uid: String) {
        if (initialized) return // a Bright exige init uma vez só
        appContext = app.applicationContext
        if (apiKey != app.packageName) {
            // Só o nome da variável e o packageName (não é segredo) vão para o log.
            Log.w(TAG, "BRIGHT_SDK_APP_ID_ANDROID diferente do packageName (${app.packageName}); a Bright conta pelo packageName.")
        }
        BrightApi.setTrackingId(uid) // id pseudônimo do dispositivo Vertal (sem dado pessoal)
        val settings = Settings(appContext).apply {
            setSkipConsent(true)
            setLanguage(Settings.ConsentLanguage.pt)
            setOnStatusChange { choice ->
                val cb = pendingConsent
                pendingConsent = null
                when (choice) {
                    BrightApi.Choice.PEER -> cb?.invoke(true)
                    BrightApi.Choice.NOT_PEER -> cb?.invoke(false)
                    else -> cb?.invoke(false) // NONE: ainda sem escolha
                }
            }
        }
        BrightApi.init(appContext, settings)
        initialized = true
    }

    override fun requestConsent(activity: Activity?, onConsentResult: (Boolean) -> Unit) {
        val ctx = need()
        if (BrightApi.getConsentChoice(ctx) == true) return onConsentResult(true)
        if (activity == null) return onConsentResult(false) // showConsent precisa de Activity
        pendingConsent = onConsentResult
        BrightApi.showConsent(activity)
    }

    override val isOptedIn: Boolean
        get() = initialized && BrightApi.getConsentChoice(appContext) == true

    /** Sem API de status na Bright: com consentimento, o SDK roda sozinho no serviço dele. */
    override val isRunning: Boolean get() = isOptedIn

    override fun start() {
        check(BrightApi.getConsentChoice(need()) == true) { "sem consentimento: não é permitido iniciar" }
    }

    override fun stop() {
        need() // a Bright não tem pausa; parar de verdade = optOut()
    }

    override fun optOut() {
        BrightApi.optOut(need())
    }

    companion object {
        private const val TAG = "VertalNode"
    }
}
