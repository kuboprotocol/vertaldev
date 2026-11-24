package dev.vertal.node

import android.app.Application
import android.util.Log
import com.honeygain.hgsdk.HgSdk

/**
 * Application do Vertal Node. O guia do Honeygain recomenda inicializar no escopo da Application,
 * principalmente com HgSdk.isBackground = true.
 */
class VertalNodeApp : Application() {

    lateinit var node: HoneygainManager
        private set

    override fun onCreate() {
        super.onCreate()
        val apiKey = BuildConfig.HONEYGAIN_API_KEY
        if (apiKey.isBlank()) {
            Log.w(TAG, "HONEYGAIN_API_KEY ausente: o Vertal Node fica desligado neste build.")
        }
        HgSdk.initialize(this, apiKey)
        // Configuração ANTES de start()
        HgSdk.isBackground = true // exige FOREGROUND_SERVICE + FOREGROUND_SERVICE_SPECIAL_USE no manifest
        HgSdk.launchOnBoot = false // só liga quando o usuário abre o app e aceitou
        HgSdk.enableLogging = BuildConfig.DEBUG
        HgSdk.onError = { t -> Log.e(TAG, "Honeygain SDK parou", t) }

        node = HoneygainManager(
            context = this,
            supabaseUrl = BuildConfig.VERTAL_SUPABASE_URL,
            supabaseAnonKey = BuildConfig.VERTAL_SUPABASE_ANON_KEY,
            appVersion = BuildConfig.VERSION_NAME,
        )
        // Se o usuário já aceitou antes, retoma. Nunca abre o consentimento sozinho.
        node.resumeIfConsented()
    }

    companion object {
        private const val TAG = "VertalNode"
    }
}
