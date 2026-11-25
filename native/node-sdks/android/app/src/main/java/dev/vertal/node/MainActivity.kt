package dev.vertal.node

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast

/**
 * Tela única do app de teste do Vertal Node (marca Vertal). O fornecedor só aparece na tela de
 * consentimento do próprio SDK. Heartbeat fica desligado enquanto VERTAL_SUPABASE_URL estiver vazio
 * (build de teste; ainda não há deploy da Edge Function vertal-node-heartbeat).
 */
class MainActivity : Activity() {
    private val node get() = (application as VertalNodeApp).node

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        findViewById<TextView>(R.id.build_info).text =
            "Build de teste ${BuildConfig.VERSION_NAME} · ${BuildConfig.FLAVOR}"

        findViewById<TextView>(R.id.disclosure).text =
            "Com a sua permissão, o Vertal Node compartilha uma parte da sua internet não usada por meio " +
            "de um parceiro de rede (este aparelho vira um ponto de saída). Antes de ligar, você vê a tela " +
            "de consentimento do parceiro, com os termos e a política de privacidade. Dá para pausar ou " +
            "desativar quando quiser."

        findViewById<EditText>(R.id.device_id).setText(node.deviceId)

        showLink(intent)

        findViewById<Button>(R.id.activate).setOnClickListener {
            if (!node.sdk.enabled) {
                Toast.makeText(this, statusText(), Toast.LENGTH_LONG).show()
                return@setOnClickListener
            }
            askNotificationPermission()
            node.activate(this)
            refresh()
        }
        findViewById<Button>(R.id.pause).setOnClickListener {
            if (node.sdk.enabled) node.stop()
            refresh()
        }
        // Opt-out sempre visível (exigido pelos parceiros)
        findViewById<Button>(R.id.opt_out).setOnClickListener {
            if (node.sdk.enabled) node.optOut()
            refresh()
        }
    }

    // launchMode="singleTop": um link novo com a tela já aberta chega aqui, não em onCreate.
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        showLink(intent)
    }

    /**
     * Deep link do vertal.js (vertalnode://open). Só mostra uma linha discreta: NÃO chama
     * node.activate(). Compartilhar continua exigindo o toque em "Ativar" e o consentimento do parceiro.
     */
    private fun showLink(intent: Intent?) {
        val line = findViewById<TextView>(R.id.link_info)
        val link = if (intent?.action == Intent.ACTION_VIEW) DeepLink.parse(intent.dataString) else null
        if (link == null) {
            line.visibility = View.GONE
            return
        }
        line.text = link.statusLine() + " · nada é ligado sem tocar em Ativar"
        line.visibility = View.VISIBLE
    }

    override fun onResume() {
        super.onResume()
        node.onResume()
        refresh()
        // O serviço sobe em segundo plano: relê o status logo depois.
        window.decorView.postDelayed({ refresh() }, 1500)
    }

    private fun askNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), REQ_NOTIF)
        }
    }

    private fun statusText(): String {
        val sdk = node.sdk
        return when {
            !sdk.enabled && sdk.lastError?.message == "api_key_missing" ->
                "Chave não configurada — este build não tem a chave do SDK."
            !sdk.enabled -> "Indisponível nesta versão."
            node.lastError != null -> "Erro: ${node.lastError?.message}"
            !node.isOptedIn -> "Sem consentimento — nada está sendo compartilhado."
            node.isRunning -> "Compartilhando agora"
            else -> "Pausado"
        }
    }

    private fun refresh() {
        findViewById<TextView>(R.id.status).text = statusText()
    }

    companion object {
        private const val REQ_NOTIF = 1001
    }
}
