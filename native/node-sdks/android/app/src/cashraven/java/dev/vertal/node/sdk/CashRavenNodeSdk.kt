package dev.vertal.node.sdk

import android.app.Activity
import android.app.Application
import android.content.Context
import io.cashraven.sdk.CashRaven

/**
 * Adapter Cash Raven SDK 4.1.4 (flavor `cashraven`). Docs: https://cashraven.io/docs
 * Dependência: io.cashraven:cr-sdk:4.1.4 (Maven da Cash Raven), minSdk 24, JDK 17, JNA 5.14.0@aar.
 *
 * Regras (termos da Cash Raven): a tela de consentimento é a DO SDK (texto e links fixos; cores e
 * parágrafos extras só pelo portal), compartilhamento só depois do aceite, e um controle de
 * opt-out VISÍVEL que chama optOut() — conferido na revisão de compliance antes de liberar mais
 * de 100 dispositivos. O SDK também faz opt-out sozinho ao bater limites de proteção, então o
 * estado é sempre relido do SDK.
 *
 * TODO(cashraven-android): a doc pública só mostra a fachada `io.cashraven.sdk.CashRaven`, `version()`
 * e `consentScreen()`. As assinaturas abaixo espelham a API Electron documentada
 * (new CashRaven({ developerKey, uid }), showConsent, start, optOut) e PRECISAM ser conferidas no
 * README.md / AGENTS.md do cr-sdk-android.zip antes do primeiro build deste flavor.
 */
class CashRavenNodeSdk : NodeSdk {
    override val id = "cashraven"
    override val vendor = "Cash Raven"
    override val enabled = true

    private var cr: CashRaven? = null
    private lateinit var appContext: Context

    private fun need(): CashRaven = checkNotNull(cr) { "cashraven: chame init() antes" }

    override fun init(app: Application, apiKey: String, uid: String) {
        appContext = app
        cr = CashRaven(app, developerKey = apiKey, uid = uid)
    }

    override fun requestConsent(activity: Activity?, onConsentResult: (Boolean) -> Unit) {
        val c = need()
        if (c.isOptedIn) return onConsentResult(true)
        // Tela de consentimento embutida no SDK (com a marca configurada no portal).
        CashRaven.showConsent(activity ?: appContext, c) { accepted -> onConsentResult(accepted) }
    }

    override val isOptedIn: Boolean get() = cr?.isOptedIn ?: false
    override val isRunning: Boolean get() = cr?.isRunning ?: false

    override fun start() {
        val c = need()
        check(c.isOptedIn) { "sem consentimento: não é permitido iniciar" }
        if (!c.isRunning) c.start()
    }

    override fun stop() = need().stop()
    override fun optOut() = need().optOut()
}
