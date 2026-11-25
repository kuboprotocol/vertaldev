package dev.vertal.node.sdk

/** Flavor `honeygain`: este APK só contém o Honeygain SDK. */
object NodeSdkFactory {
    const val PROVIDER = "honeygain"
    fun create(debug: Boolean): NodeSdk = HoneygainNodeSdk(debug)

    /** Este SDK não roda em processo separado. */
    fun isSdkServiceProcess(): Boolean = false
}
