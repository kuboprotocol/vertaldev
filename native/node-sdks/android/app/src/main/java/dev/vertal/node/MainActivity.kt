package dev.vertal.node

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.TextView

/**
 * Tela única do app de teste do Vertal Node (marca Vertal). O fornecedor só aparece na tela de
 * consentimento do próprio SDK. Heartbeat fica desligado enquanto VERTAL_SUPABASE_URL estiver vazio.
 *
 * ANR (0.1.0-test+b7d04f2): sem chave, cada toque em ATIVAR enfileirava um Toast LONG. No Android 12+
 * o texto do Toast é desenhado pela IU do sistema (SystemUI); toques repetidos enchiam essa fila e,
 * no Realme UI, a IU do sistema parou de responder. Agora não há Toast: o motivo aparece na própria
 * tela, o botão fica desligado quando o SDK está indisponível, e há trava contra toques repetidos.
 * A permissão de notificação e a tela de consentimento do parceiro também não abrem mais ao mesmo tempo.
 */
class MainActivity : Activity() {
    private val node get() = (application as VertalNodeApp).node
    private val ui = Handler(Looper.getMainLooper())
    private val refreshLater = Runnable { refresh() }

    /** Fluxo de ativação em andamento (permissão → consentimento do parceiro → start). */
    private var activating = false
    private var lastTapAt = 0L

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        findViewById<TextView>(R.id.build_info).text =
            "Build de teste ${BuildConfig.VERSION_NAME} · ${BuildConfig.FLAVOR}"

        findViewById<TextView>(R.id.disclosure).text =
            "Com a sua permissão, o Vertal Node compartilha uma parte da sua internet não usada por meio " +
            "de um parceiro de rede (este aparelho vira um ponto de saída). Antes de ligar, você vê a tela " +
            "de consentimento do parceiro, com os termos e a política de privacidade. Enquanto estiver " +
            "ligado, fica uma notificação fixa. Dá para pausar ou desativar quando quiser."

        findViewById<EditText>(R.id.device_id).setText(node.deviceId)

        findViewById<Button>(R.id.activate).setOnClickListener { onActivateTapped() }
        findViewById<Button>(R.id.pause).setOnClickListener {
            if (node.sdk.enabled) node.stop()
            refresh()
        }
        // Opt-out sempre visível (exigido pelos parceiros)
        findViewById<Button>(R.id.opt_out).setOnClickListener {
            if (node.sdk.enabled) node.optOut()
            refresh()
        }

        // Recriação (girar a tela etc.) não repete o link já tratado.
        handleIntent(intent, firstTime = savedInstanceState == null)
    }

    // launchMode="singleTop": um link novo com a tela já aberta chega aqui, não em onCreate.
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent, firstTime = true)
    }

    /**
     * Deep link vertalnode://open. Com source=recompensas (Accept & activate no vertal.dev, aceite já
     * gravado lá) segue para o fluxo de ativação — a tela de consentimento DO PARCEIRO ainda aparece se
     * o SDK não tiver a decisão. Qualquer outra origem só mostra a linha discreta.
     */
    private fun handleIntent(intent: Intent?, firstTime: Boolean) {
        val line = findViewById<TextView>(R.id.link_info)
        val link = if (intent?.action == Intent.ACTION_VIEW) DeepLink.parse(intent.dataString) else null
        if (link == null) {
            line.visibility = View.GONE
            return
        }
        val autoActivate = link.fromAcceptActivate && node.sdk.enabled
        line.text = link.statusLine() +
            if (autoActivate) " · ativando (o parceiro pede seu consentimento)" else " · nada é ligado sem tocar em Ativar"
        line.visibility = View.VISIBLE
        if (autoActivate && firstTime && !intent!!.getBooleanExtra(EXTRA_HANDLED, false)) {
            intent.putExtra(EXTRA_HANDLED, true)
            // Depois do primeiro desenho da tela: a tela do parceiro abre por cima desta.
            ui.post { startActivation() }
        }
    }

    private fun onActivateTapped() {
        val now = SystemClock.elapsedRealtime()
        if (now - lastTapAt < TAP_DEBOUNCE_MS) return // toques repetidos
        lastTapAt = now
        if (!node.sdk.enabled) { refresh(); return } // motivo já está na tela; sem Toast
        startActivation()
    }

    /** Passo 1: permissão de notificação (Android 13+), só se faltar. Passo 2 vem no resultado. */
    private fun startActivation() {
        if (activating || !node.sdk.enabled) return
        activating = true
        setBusy(true)
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), REQ_NOTIF)
        } else {
            continueActivation()
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        // Negar a notificação não impede: o serviço roda, só a notificação fica escondida (Android 13+).
        if (requestCode == REQ_NOTIF && activating) continueActivation()
    }

    /** Passo 2: consentimento do parceiro (tela do SDK) e start só depois do aceite. */
    private fun continueActivation() {
        node.activate(this) { _ ->
            ui.post {
                activating = false
                setBusy(false)
                refresh()
                scheduleRefresh()
            }
        }
    }

    override fun onResume() {
        super.onResume()
        node.onResume()
        refresh()
        scheduleRefresh() // o serviço sobe em segundo plano: relê o status logo depois
    }

    override fun onPause() {
        super.onPause()
        ui.removeCallbacks(refreshLater)
    }

    private fun scheduleRefresh() {
        ui.removeCallbacks(refreshLater)
        ui.postDelayed(refreshLater, 1500)
    }

    private fun setBusy(busy: Boolean) {
        findViewById<Button>(R.id.activate).isEnabled = !busy && node.sdk.enabled
    }

    private fun statusText(): String {
        val sdk = node.sdk
        val reason = sdk.lastError?.message
        return when {
            !sdk.enabled && reason == "api_key_missing" ->
                "Chave não configurada — este build não tem a chave do SDK."
            !sdk.enabled && reason == "sdk_init_failed" -> "O SDK do parceiro não iniciou neste aparelho."
            !sdk.enabled -> "Indisponível nesta versão."
            node.lastError != null -> "Erro: ${node.lastError?.message}"
            activating -> "Ativando…"
            !node.isOptedIn -> "Sem consentimento — nada está sendo compartilhado."
            node.isRunning -> "Compartilhando agora"
            else -> "Pausado"
        }
    }

    private fun refresh() {
        findViewById<TextView>(R.id.status).text = statusText()
        findViewById<Button>(R.id.activate).isEnabled = node.sdk.enabled && !activating
    }

    companion object {
        private const val REQ_NOTIF = 1001
        private const val TAP_DEBOUNCE_MS = 800L
        private const val EXTRA_HANDLED = "dev.vertal.node.LINK_HANDLED"
    }
}
