package dev.vertal.node.sdk

import android.app.Activity
import android.app.Application
import android.util.Log
import com.honeygain.hgsdk.HgSdk

/**
 * Adapter Honeygain SDK (flavor `honeygain`). Guia: https://developers.honeygain.com/docs/
 * Consentimento: tela NATIVA do SDK (HgSdk.requestConsent()), que nomeia o Honeygain SDK, explica o
 * exit node e tem "I accept". Tela própria só com aprovação do Honeygain.
 */
class HoneygainNodeSdk(private val debug: Boolean) : NodeSdk {
    override val id = "honeygain"
    override val vendor = "Honeygain"
    override val enabled = true

    override fun init(app: Application, apiKey: String, uid: String) {
        HgSdk.initialize(app, apiKey)
        // Configuração ANTES de start()
        HgSdk.isBackground = true // exige FOREGROUND_SERVICE + FOREGROUND_SERVICE_SPECIAL_USE (manifest do flavor)
        HgSdk.launchOnBoot = false // só liga quando o usuário abre o app e já aceitou
        HgSdk.enableLogging = debug
        HgSdk.onError = { t -> Log.e(TAG, "Honeygain SDK parou", t) }
    }

    /** O resultado é relido em isOptedIn no onResume (a tela do SDK é uma Activity própria). */
    override fun requestConsent(activity: Activity?, onConsentResult: (Boolean) -> Unit) {
        if (HgSdk.isOptedIn) onConsentResult(true) else HgSdk.requestConsent()
    }

    override val isOptedIn: Boolean get() = HgSdk.isOptedIn
    override val isRunning: Boolean get() = HgSdk.isRunning
    override val lastError: Throwable? get() = HgSdk.lastError

    override fun start() {
        check(HgSdk.isOptedIn) { "sem consentimento: não é permitido iniciar" }
        if (!HgSdk.isRunning) HgSdk.start()
    }

    override fun stop() = HgSdk.stop()
    override fun optOut() = HgSdk.optOut()

    private companion object {
        const val TAG = "VertalNode"
    }
}
