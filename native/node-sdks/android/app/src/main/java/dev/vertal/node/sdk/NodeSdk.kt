package dev.vertal.node.sdk

import android.app.Activity
import android.app.Application

/**
 * Interface comum dos SDKs de compartilhamento de banda do Vertal Node (Android).
 *
 * Só UM provedor entra em cada APK: o flavor de build escolhe (honeygain | cashraven), via
 * `-PNODE_SDK_PROVIDER` ou `NODE_SDK_PROVIDER`. Assim dois SDKs nunca disputam a mesma conexão
 * e não há conflito de exclusividade com os parceiros. Cada flavor fornece `NodeSdkFactory.create()`
 * em `src/<flavor>/java/dev/vertal/node/sdk/`.
 *
 * Regras comuns: consentimento primeiro (tela DO SDK, que nomeia o fornecedor), opt-out sempre
 * visível, nunca abrir o consentimento sem clique do usuário.
 */
interface NodeSdk {
    /** "honeygain", "cashraven", ... — vai no heartbeat (`provider`). */
    val id: String
    /** Nome do fornecedor; a UI do app usa a marca Vertal, o fornecedor aparece no consentimento do SDK. */
    val vendor: String
    /** false = stub aguardando aprovação do parceiro, ou build sem chave. */
    val enabled: Boolean

    /** Chamar no Application.onCreate. `uid` = id pseudônimo do dispositivo Vertal (sem dado pessoal). */
    fun init(app: Application, apiKey: String, uid: String)

    /**
     * Abre a tela de consentimento do SDK. É assíncrono: o resultado chega em [onConsentResult]
     * (quando o SDK avisa) e é relido em [isOptedIn] no onResume da Activity.
     */
    fun requestConsent(activity: Activity?, onConsentResult: (Boolean) -> Unit = {})

    val isOptedIn: Boolean
    val isRunning: Boolean
    val lastError: Throwable? get() = null

    /** Só depois de isOptedIn == true. */
    fun start()
    fun stop()
    /** Retira o consentimento e para na hora. */
    fun optOut()
}

/** Provedores conhecidos, com a URL da doc. `enabled = false` = aguardando aprovação do parceiro. */
enum class NodeSdkProvider(val id: String, val enabled: Boolean, val docsUrl: String) {
    HONEYGAIN("honeygain", true, "https://developers.honeygain.com/docs/"),
    CASHRAVEN("cashraven", true, "https://cashraven.io/docs"),
    // TODO(pawns): aguardando aprovação do parceiro.
    PAWNS("pawns", false, "https://business.pawns.app/sdk"),
    // TODO(bright): aguardando aprovação do parceiro.
    BRIGHT("bright", false, "https://bright-sdk.com"),
    // TODO(infatica): aguardando aprovação do parceiro.
    INFATICA("infatica", false, "https://infatica-sdk.io"),
    // TODO(earnfm): aguardando aprovação do parceiro.
    EARNFM("earnfm", false, "https://earn.fm/en/business/apps"),
}
