package dev.vertal.node.sdk

import android.app.Activity
import android.app.Application

/**
 * Stub para provedor desligado (aguardando aprovação do parceiro) ou build sem chave.
 * Não carrega SDK nenhum e nunca inicia.
 */
class DisabledNodeSdk(
    override val id: String,
    override val vendor: String,
    private val reason: String,
) : NodeSdk {
    override val enabled = false
    override val isOptedIn = false
    override val isRunning = false
    override val lastError: Throwable = IllegalStateException(reason)

    override fun init(app: Application, apiKey: String, uid: String) = Unit
    override fun requestConsent(activity: Activity?, onConsentResult: (Boolean) -> Unit) = onConsentResult(false)
    override fun start() = Unit
    override fun stop() = Unit
    override fun optOut() = Unit
}
