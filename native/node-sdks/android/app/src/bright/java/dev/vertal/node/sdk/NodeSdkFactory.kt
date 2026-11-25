package dev.vertal.node.sdk

import com.android.eapx.BrightApi
import dev.vertal.node.BuildConfig

/**
 * Flavor `bright`: este APK só contém o Bright SDK. Desligado até a Bright aprovar o app
 * (status Implementation): só cria o adapter real com -PNODE_SDK_BRIGHT_APPROVED=1.
 */
object NodeSdkFactory {
    const val PROVIDER = "bright"

    fun create(@Suppress("UNUSED_PARAMETER") debug: Boolean): NodeSdk =
        if (BuildConfig.NODE_SDK_BRIGHT_APPROVED) {
            BrightNodeSdk()
        } else {
            DisabledNodeSdk(PROVIDER, "Bright SDK", "awaiting_partner_approval")
        }

    /** O Bright SDK roda num processo próprio; a Application não deve inicializar nada nele. */
    fun isSdkServiceProcess(): Boolean = BrightApi.isSvcProcess()
}
