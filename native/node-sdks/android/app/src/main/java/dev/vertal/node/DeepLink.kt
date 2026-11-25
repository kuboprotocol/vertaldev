package dev.vertal.node

import java.net.URI
import java.net.URLDecoder

/**
 * Deep link que abre o Vertal Node a partir de um site (loader vertal.js, `Vertal.node.openApp()`).
 *
 * Formato aceito: `vertalnode://open[?appId=…&ref=…&source=…]`. O vertal.js navega para
 * `intent://open#Intent;scheme=vertalnode;package=dev.vertal.node;[S.browser_fallback_url=…;]end`,
 * que o Chrome entrega como ACTION_VIEW + BROWSABLE com data `vertalnode://open`.
 *
 * O link SÓ abre a tela. Nunca liga o compartilhamento: isso continua exigindo o toque em
 * "Ativar" e o consentimento do parceiro. Os parâmetros são informativos (linha discreta na tela),
 * passam por lista branca e validação; qualquer outro parâmetro ou valor inválido é ignorado.
 */
data class DeepLink(
    val appId: String? = null,
    val ref: String? = null,
    val source: String? = null,
) {
    /** Linha discreta para a tela. */
    fun statusLine(): String {
        val parts = mutableListOf("Aberto por link")
        source?.let { parts += "origem: $it" }
        appId?.let { parts += "app: $it" }
        ref?.let { parts += "ref: $it" }
        return parts.joinToString(" · ")
    }

    companion object {
        const val SCHEME = "vertalnode"
        const val HOST = "open"

        private const val MAX_QUERY = 1024
        private val SAFE_VALUE = Regex("^[A-Za-z0-9._-]{1,64}$")

        /** Nome aceito no link → campo. `app_id` é sinônimo de `appId`. */
        private val KEYS = mapOf("appId" to "appId", "app_id" to "appId", "ref" to "ref", "source" to "source")

        /** Devolve o link se for `vertalnode://open`; null para qualquer outra coisa. Nunca lança. */
        fun parse(raw: String?): DeepLink? {
            if (raw.isNullOrBlank() || raw.length > 2048) return null
            val uri = try { URI(raw.trim()) } catch (_: Exception) { return null }
            if (!SCHEME.equals(uri.scheme, ignoreCase = true)) return null
            if (!HOST.equals(uri.host, ignoreCase = true)) return null
            val path = uri.rawPath.orEmpty()
            if (path.isNotEmpty() && path != "/") return null

            val values = mutableMapOf<String, String>()
            val query = uri.rawQuery.orEmpty()
            if (query.length <= MAX_QUERY) {
                for (pair in query.split('&')) {
                    if (pair.isEmpty()) continue
                    val eq = pair.indexOf('=')
                    if (eq <= 0) continue
                    val field = KEYS[decode(pair.substring(0, eq)) ?: continue] ?: continue // desconhecido: ignora
                    val value = decode(pair.substring(eq + 1))?.trim() ?: continue
                    if (!SAFE_VALUE.matches(value)) continue // inválido: ignora
                    values.putIfAbsent(field, value) // repetido: vale o primeiro
                }
            }
            return DeepLink(appId = values["appId"], ref = values["ref"], source = values["source"])
        }

        private fun decode(s: String): String? =
            try { URLDecoder.decode(s, "UTF-8") } catch (_: Exception) { null }
    }
}
