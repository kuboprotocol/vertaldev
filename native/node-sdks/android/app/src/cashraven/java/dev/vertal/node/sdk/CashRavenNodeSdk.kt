package dev.vertal.node.sdk

import android.app.Activity
import android.app.Application
import android.content.Context
import io.cashraven.sdk.CashRaven
import io.cashraven.sdk.CashRavenService
import io.cashraven.sdk.CrAuthState
import io.cashraven.sdk.CrConsentListener
import io.cashraven.sdk.CrConsentResult

/**
 * Adapter Cash Raven SDK 4.1.4 (flavor `cashraven`). Docs: https://cashraven.io/docs
 * Dependência: io.cashraven:cr-sdk:4.1.4 (Maven da Cash Raven, JNA 5.14.0 transitivo),
 * minSdk 24, compile/targetSdk 34, JDK 17.
 *
 * API conferida em 2026-11-24 no cr-sdk-android.zip 4.1.4 (SHA-256 310347bc…ce73): AGENTS.md e as
 * assinaturas públicas de io.cashraven.sdk.CashRaven / CashRavenService no classes.jar do AAR.
 * Usa o modo SDK-managed (recomendado pela Cash Raven):
 *   - Application.onCreate: CashRaven.createManaged(ctx, devKey, uid) + CashRavenService.configure(...)
 *     (configure é estático: tem que ser na Application para o serviço existir depois de um boot);
 *   - Activity: cr.requestConsent(activity) { GRANTED | DECLINED | DISMISSED } — a tela é do SDK, com o
 *     texto da Cash Raven; no aceite o próprio SDK chama optIn() (nunca chamamos optIn()).
 *     Não mostra nada se a decisão já foi gravada;
 *   - compartilhar no serviço em primeiro plano do SDK: CashRavenService.start/stop(context);
 *   - opt-out visível (OBRIGATÓRIO, conferido pela compliance): cr.optOut() + CashRavenService.stop().
 * O estado de consentimento é do SDK (persistido por ele); isOptedIn() = consentiu E ligado.
 * Status ERROR / authStatus REJECTED = developer key recusada (erro de configuração, não de rede).
 */
class CashRavenNodeSdk : NodeSdk {
    override val id = "cashraven"
    override val vendor = "Cash Raven"
    override val enabled = true

    private var cr: CashRaven? = null
    private lateinit var appContext: Context

    private fun need(): CashRaven = checkNotNull(cr) { "cashraven: chame init() antes" }

    override fun init(app: Application, apiKey: String, uid: String) {
        appContext = app.applicationContext
        // Começa OPTED-OUT. O SDK informa o packageName (Application ID) sozinho.
        val client = CashRaven.createManaged(app, apiKey, uid)
        // Ícone (monocromático) da notificação do serviço em primeiro plano.
        CashRavenService.configure(client, CashRavenService.Config(dev.vertal.node.R.drawable.ic_vertal_node))
        cr = client
    }

    override fun requestConsent(activity: Activity?, onConsentResult: (Boolean) -> Unit) {
        val c = need()
        if (c.isOptedIn()) return onConsentResult(true)
        // requestConsent precisa de uma Activity real (a tela é do SDK).
        if (activity == null) return onConsentResult(false)
        // Assinatura 4.1.4: requestConsent(activity, <Boolean com default>, listener) (@JvmOverloads);
        // em Kotlin o listener vai nomeado para usar o default do Boolean.
        c.requestConsent(
            activity,
            listener = object : CrConsentListener {
                override fun onConsent(result: CrConsentResult) = onConsentResult(result == CrConsentResult.GRANTED)
            },
        )
    }

    override val isOptedIn: Boolean get() = cr?.isOptedIn() ?: false
    override val isRunning: Boolean get() = cr?.isRunning() ?: false

    /** Só para diagnóstico do desenvolvedor: developer key recusada pelo backend. */
    override val lastError: Throwable?
        get() {
            val auth = cr?.authStatus() ?: return null
            return if (auth.state == CrAuthState.REJECTED) {
                IllegalStateException("cashraven auth_rejected: ${auth.code}")
            } else {
                null
            }
        }

    override fun start() {
        check(need().isOptedIn()) { "sem consentimento: não é permitido iniciar" }
        CashRavenService.start(appContext) // idempotente; o serviço chama cr.start()
    }

    override fun stop() {
        need()
        CashRavenService.stop(appContext) // consentimento e device id continuam
    }

    override fun optOut() {
        need().optOut() // retira o consentimento
        CashRavenService.stop(appContext)
    }

    /** cr.setStartOnBoot liga/desliga o CrBootReceiver do SDK (exige RECEIVE_BOOT_COMPLETED no manifest). */
    override fun setStartOnBoot(context: Context, enabled: Boolean) {
        cr?.setStartOnBoot(context, enabled)
    }
}
