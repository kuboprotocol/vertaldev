package dev.vertal.node

import android.app.Application
import android.util.Log
import dev.vertal.node.sdk.DisabledNodeSdk
import dev.vertal.node.sdk.NodeSdkFactory

/**
 * Application do Vertal Node. O SDK do flavor (cashraven, padrão | honeygain, aguardando aprovação |
 * bright, desligado até a aprovação) é inicializado aqui, no escopo da Application, como os guias dos
 * parceiros recomendam. Só um SDK existe em cada APK.
 */
class VertalNodeApp : Application() {

    lateinit var node: VertalNodeManager
        private set

    override fun onCreate() {
        super.onCreate()
        // SDKs que rodam em processo próprio (Bright): nada do app roda nesse processo.
        if (NodeSdkFactory.isSdkServiceProcess()) return
        val apiKey = BuildConfig.NODE_SDK_API_KEY // chave do app ANDROID do provedor do flavor; nunca logar
        val deviceId = VertalNodeManager.loadDeviceId(this)
        val sdk = when {
            apiKey.isBlank() -> {
                Log.w(TAG, "Chave do SDK ${NodeSdkFactory.PROVIDER} ausente: o Vertal Node fica desligado neste build.")
                DisabledNodeSdk(NodeSdkFactory.PROVIDER, NodeSdkFactory.PROVIDER, "api_key_missing")
            }
            else -> try {
                NodeSdkFactory.create(BuildConfig.DEBUG).also { if (it.enabled) it.init(this, apiKey, uid = deviceId) }
            } catch (e: Throwable) {
                // Init do SDK não pode derrubar o app: fica desligado e a tela mostra o motivo.
                Log.e(TAG, "init do SDK ${NodeSdkFactory.PROVIDER} falhou", e)
                DisabledNodeSdk(NodeSdkFactory.PROVIDER, NodeSdkFactory.PROVIDER, "sdk_init_failed")
            }
        }

        node = VertalNodeManager(
            context = this,
            sdk = sdk,
            supabaseUrl = BuildConfig.VERTAL_SUPABASE_URL,
            supabaseAnonKey = BuildConfig.VERTAL_SUPABASE_ANON_KEY,
            appVersion = BuildConfig.VERSION_NAME,
        )
        // Se o usuário já aceitou e não pausou, retoma. Nunca abre o consentimento sozinho.
        node.resumeIfConsented()
    }

    companion object {
        private const val TAG = "VertalNode"
    }
}
