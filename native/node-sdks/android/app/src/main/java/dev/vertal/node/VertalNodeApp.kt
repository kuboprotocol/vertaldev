package dev.vertal.node

import android.app.Application
import android.util.Log
import dev.vertal.node.sdk.DisabledNodeSdk
import dev.vertal.node.sdk.NodeSdkFactory

/**
 * Application do Vertal Node. O SDK do flavor (honeygain | cashraven) é inicializado aqui, no escopo
 * da Application, como os guias dos dois parceiros recomendam. Só um SDK existe em cada APK.
 */
class VertalNodeApp : Application() {

    lateinit var node: VertalNodeManager
        private set

    override fun onCreate() {
        super.onCreate()
        val apiKey = BuildConfig.NODE_SDK_API_KEY // chave do app ANDROID do provedor do flavor; nunca logar
        val sdk = if (apiKey.isBlank()) {
            Log.w(TAG, "Chave do SDK ${NodeSdkFactory.PROVIDER} ausente: o Vertal Node fica desligado neste build.")
            DisabledNodeSdk(NodeSdkFactory.PROVIDER, NodeSdkFactory.PROVIDER, "api_key_missing")
        } else {
            NodeSdkFactory.create(BuildConfig.DEBUG)
        }

        node = VertalNodeManager(
            context = this,
            sdk = sdk,
            supabaseUrl = BuildConfig.VERTAL_SUPABASE_URL,
            supabaseAnonKey = BuildConfig.VERTAL_SUPABASE_ANON_KEY,
            appVersion = BuildConfig.VERSION_NAME,
        )
        if (sdk.enabled) sdk.init(this, apiKey, uid = node.deviceId)
        // Se o usuário já aceitou antes, retoma. Nunca abre o consentimento sozinho.
        node.resumeIfConsented()
    }

    companion object {
        private const val TAG = "VertalNode"
    }
}
