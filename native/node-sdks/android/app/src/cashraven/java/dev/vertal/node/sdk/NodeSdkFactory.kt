package dev.vertal.node.sdk

/** Flavor `cashraven`: este APK só contém o Cash Raven SDK. */
object NodeSdkFactory {
    const val PROVIDER = "cashraven"
    fun create(@Suppress("UNUSED_PARAMETER") debug: Boolean): NodeSdk = CashRavenNodeSdk()

    /** Este SDK não roda em processo separado. */
    fun isSdkServiceProcess(): Boolean = false
}
