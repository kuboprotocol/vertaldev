package dev.vertal.node

import android.content.Context
import android.util.Log
import com.honeygain.hgsdk.HgSdk
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.UUID

/**
 * Encapsula o Honeygain SDK no Vertal Node (Android):
 *  - consentimento primeiro: activate() abre a tela NATIVA do SDK (HgSdk.requestConsent()), que
 *    nomeia o Honeygain SDK, explica o exit node e tem o botão "I accept". Tela própria só com
 *    aprovação do Honeygain;
 *  - opt-out fácil: optOut() (ligue a um interruptor sempre visível na tela principal);
 *  - status: isOptedIn / isRunning / lastError;
 *  - heartbeat para a Edge Function honeygain-node-heartbeat (crédito 1x por dia, no servidor).
 *
 * Chame onResume() no onResume da Activity principal (o guia do Honeygain verifica o consentimento
 * ali, depois que a tela de consentimento fecha).
 */
class HoneygainManager(
    context: Context,
    private val supabaseUrl: String,
    private val supabaseAnonKey: String,
    private val appVersion: String?,
) {
    private val prefs = context.getSharedPreferences("vertal_node", Context.MODE_PRIVATE)
    private val http = OkHttpClient()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var heartbeatJob: Job? = null

    @Volatile
    private var accessToken: String? = null

    val deviceId: String = prefs.getString(KEY_DEVICE_ID, null) ?: "andr-${UUID.randomUUID()}".also {
        prefs.edit().putString(KEY_DEVICE_ID, it).apply()
    }

    val isOptedIn: Boolean get() = HgSdk.isOptedIn
    val isRunning: Boolean get() = HgSdk.isRunning
    val lastError: Throwable? get() = HgSdk.lastError

    /** Botão "Ativar": abre o consentimento se preciso; se já aceitou, inicia. */
    fun activate() {
        if (HgSdk.isOptedIn) {
            HgSdk.start()
            sendHeartbeatAsync()
        } else {
            HgSdk.requestConsent()
        }
    }

    /** Chamar no onResume da Activity: inicia se o usuário acabou de aceitar. */
    fun onResume() {
        if (HgSdk.isOptedIn && !HgSdk.isRunning) HgSdk.start()
        sendHeartbeatAsync()
    }

    fun resumeIfConsented() {
        if (HgSdk.isOptedIn && !HgSdk.isRunning) HgSdk.start()
    }

    fun stop() {
        HgSdk.stop()
        sendHeartbeatAsync()
    }

    /** Opt-out: retira o consentimento e para o SDK imediatamente. */
    fun optOut() {
        HgSdk.optOut()
        sendHeartbeatAsync()
    }

    /** Depois do login no app (sessão Supabase). Passe null ao sair. */
    fun setAccessToken(token: String?) {
        accessToken = token?.takeIf { it.isNotBlank() }
        heartbeatJob?.cancel()
        if (accessToken == null) return
        heartbeatJob = scope.launch {
            while (isActive) {
                sendHeartbeat()
                delay(HEARTBEAT_INTERVAL_MS)
            }
        }
    }

    fun sendHeartbeatAsync() {
        scope.launch { sendHeartbeat() }
    }

    /** POST /functions/v1/honeygain-node-heartbeat. Retorna o JSON da resposta ou null. */
    fun sendHeartbeat(): JSONObject? {
        val token = accessToken ?: return null
        if (supabaseUrl.isBlank()) return null
        val body = JSONObject()
            .put("device_id", deviceId)
            .put("platform", "android")
            .put("app_version", appVersion)
            .put("opted_in", HgSdk.isOptedIn)
            .put("running", HgSdk.isRunning)
            .toString()
            .toRequestBody("application/json".toMediaType())
        val request = Request.Builder()
            .url("$supabaseUrl/functions/v1/honeygain-node-heartbeat")
            .header("apikey", supabaseAnonKey)
            .header("Authorization", "Bearer $token")
            .post(body)
            .build()
        return try {
            http.newCall(request).execute().use { res ->
                val text = res.body?.string().orEmpty()
                if (!res.isSuccessful) Log.w(TAG, "heartbeat ${res.code}: $text")
                runCatching { JSONObject(text) }.getOrNull()
            }
        } catch (e: Exception) {
            Log.w(TAG, "heartbeat falhou", e)
            null
        }
    }

    companion object {
        private const val TAG = "VertalNode"
        private const val KEY_DEVICE_ID = "device_id"
        private const val HEARTBEAT_INTERVAL_MS = 30L * 60L * 1000L
    }
}
