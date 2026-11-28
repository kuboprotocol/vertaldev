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
 * Vertal Node (Android), independente do SDK: recebe o [NodeSdk] do flavor (cashraven | honeygain | bright).
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
    private val appContext: Context = context.applicationContext
    private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    private val http = OkHttpClient()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var heartbeatJob: Job? = null

    @Volatile
    private var accessToken: String? = null

    /** Id pseudônimo do aparelho (também é o `uid` passado ao SDK). */
    val deviceId: String = loadDeviceId(context)

    val provider: String get() = sdk.id
    val isOptedIn: Boolean get() = sdk.isOptedIn
    val isRunning: Boolean get() = sdk.isRunning
    val lastError: Throwable? get() = sdk.lastError

    /** PAUSAR / DESATIVAR gravam isto: o app não religa sozinho (abrir o app, reiniciar) até o próximo "Ativar". */
    val isPausedByUser: Boolean get() = prefs.getBoolean(KEY_USER_PAUSED, false)

    /**
     * Botão "Ativar" (ou o deep link do "Accept & activate" do vertal.dev, que o usuário já aceitou lá).
     * Abre o consentimento DO SDK se preciso; só inicia depois do aceite. Nunca chama optIn() por conta própria.
     */
    fun activate(activity: Activity?, onDone: (Boolean) -> Unit = {}) {
        if (!sdk.enabled) return onDone(false)
        if (sdk.isOptedIn) {
            onDone(startAfterConsent())
        } else {
            sdk.requestConsent(activity) { accepted ->
                onDone(if (accepted) startAfterConsent() else false)
                sendHeartbeatAsync()
            }
        }
    }

    /** Só com consentimento: inicia o serviço do SDK, lembra a escolha e liga a retomada após reiniciar. */
    private fun startAfterConsent(): Boolean {
        if (!sdk.isOptedIn) return false
        prefs.edit().putBoolean(KEY_USER_PAUSED, false).apply()
        val ok = safeStart()
        if (ok) runCatching { sdk.setStartOnBoot(appContext, true) }
        sendHeartbeatAsync()
        return ok
    }

    /** start() do SDK sem derrubar o app (ex.: Android 12+ recusa serviço em primeiro plano vindo do fundo). */
    private fun safeStart(): Boolean = try {
        if (!sdk.isRunning) sdk.start()
        true
    } catch (e: Exception) {
        Log.w(TAG, "start do SDK falhou", e)
        false
    }

    /** Chamar no onResume da Activity: inicia se o usuário acabou de aceitar. */
    fun onResume() {
        resumeIfConsented()
        sendHeartbeatAsync()
    }

    /** Retoma só se o usuário já aceitou e não pausou. Nunca abre o consentimento sozinho. */
    fun resumeIfConsented() {
        if (sdk.enabled && sdk.isOptedIn && !isPausedByUser && !sdk.isRunning) safeStart()
    }

    /** PAUSAR: para o serviço; o consentimento continua, mas não religa sozinho. */
    fun stop() {
        prefs.edit().putBoolean(KEY_USER_PAUSED, true).apply()
        runCatching { sdk.stop() }.onFailure { Log.w(TAG, "stop falhou", it) }
        sendHeartbeatAsync()
    }

    /** DESATIVAR (opt-out): retira o consentimento, para na hora e desliga a retomada no boot. */
    fun optOut() {
        prefs.edit().putBoolean(KEY_USER_PAUSED, true).apply()
        runCatching { sdk.setStartOnBoot(appContext, false) }
        runCatching { sdk.optOut() }.onFailure { Log.w(TAG, "optOut falhou", it) }
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
        private const val PREFS = "vertal_node"

        /** Id pseudônimo do aparelho, criado uma vez (também é o `uid` passado ao SDK no init). */
        fun loadDeviceId(context: Context): String {
            val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            return p.getString(KEY_DEVICE_ID, null) ?: "andr-${UUID.randomUUID()}".also {
                p.edit().putString(KEY_DEVICE_ID, it).apply()
            }
        }
        private const val KEY_DEVICE_ID = "device_id"
        private const val KEY_USER_PAUSED = "user_paused"
        private const val HEARTBEAT_INTERVAL_MS = 30L * 60L * 1000L
    }
}
