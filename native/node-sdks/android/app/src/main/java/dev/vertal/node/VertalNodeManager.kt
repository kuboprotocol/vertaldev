package dev.vertal.node

import android.app.Activity
import android.content.Context
import android.util.Log
import dev.vertal.node.sdk.NodeSdk
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
 * Vertal Node (Android), independente do SDK: recebe o [NodeSdk] do flavor (honeygain | cashraven).
 *  - consentimento primeiro: activate() abre a tela de consentimento DO SDK (que nomeia o fornecedor);
 *  - opt-out fácil: optOut() (ligue a um interruptor sempre visível na tela principal);
 *  - heartbeat para a Edge Function vertal-node-heartbeat com o `provider` (crédito 1x/dia, no servidor).
 *
 * Chame onResume() no onResume da Activity principal (a tela de consentimento é outra Activity).
 */
class VertalNodeManager(
    context: Context,
    val sdk: NodeSdk,
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

    /** Id pseudônimo do aparelho (também é o `uid` passado ao SDK). */
    val deviceId: String = prefs.getString(KEY_DEVICE_ID, null) ?: "andr-${UUID.randomUUID()}".also {
        prefs.edit().putString(KEY_DEVICE_ID, it).apply()
    }

    val provider: String get() = sdk.id
    val isOptedIn: Boolean get() = sdk.isOptedIn
    val isRunning: Boolean get() = sdk.isRunning
    val lastError: Throwable? get() = sdk.lastError

    /** Botão "Ativar": abre o consentimento do SDK se preciso; se já aceitou, inicia. */
    fun activate(activity: Activity?) {
        if (!sdk.enabled) return
        if (sdk.isOptedIn) {
            sdk.start()
            sendHeartbeatAsync()
        } else {
            sdk.requestConsent(activity) { accepted ->
                if (accepted && !sdk.isRunning) sdk.start()
                sendHeartbeatAsync()
            }
        }
    }

    /** Chamar no onResume da Activity: inicia se o usuário acabou de aceitar. */
    fun onResume() {
        resumeIfConsented()
        sendHeartbeatAsync()
    }

    /** Retoma só se o usuário já aceitou antes. Nunca abre o consentimento sozinho. */
    fun resumeIfConsented() {
        if (sdk.enabled && sdk.isOptedIn && !sdk.isRunning) sdk.start()
    }

    fun stop() {
        sdk.stop()
        sendHeartbeatAsync()
    }

    /** Opt-out: retira o consentimento e para o SDK imediatamente. */
    fun optOut() {
        sdk.optOut()
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

    /** POST /functions/v1/vertal-node-heartbeat. Retorna o JSON da resposta ou null. */
    fun sendHeartbeat(): JSONObject? {
        val token = accessToken ?: return null
        if (supabaseUrl.isBlank()) return null
        val body = JSONObject()
            .put("device_id", deviceId)
            .put("platform", "android")
            .put("provider", sdk.id)
            .put("app_version", appVersion)
            .put("opted_in", sdk.isOptedIn)
            .put("running", sdk.isRunning)
            .toString()
            .toRequestBody("application/json".toMediaType())
        val request = Request.Builder()
            .url("$supabaseUrl/functions/v1/vertal-node-heartbeat")
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
