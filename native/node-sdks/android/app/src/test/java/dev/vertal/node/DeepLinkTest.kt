package dev.vertal.node

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class DeepLinkTest {
    @Test fun linkDoVertalJsSemParametros() {
        assertEquals(DeepLink(), DeepLink.parse("vertalnode://open"))
        assertEquals(DeepLink(), DeepLink.parse("vertalnode://open/"))
        assertEquals("Aberto por link", DeepLink.parse("vertalnode://open")!!.statusLine())
    }

    @Test fun parametrosConhecidos() {
        val l = DeepLink.parse("vertalnode://open?appId=site-123&ref=abc_9&source=vertal-js")
        assertEquals(DeepLink(appId = "site-123", ref = "abc_9", source = "vertal-js"), l)
        assertEquals("Aberto por link · origem: vertal-js · app: site-123 · ref: abc_9", l!!.statusLine())
        assertEquals("x", DeepLink.parse("vertalnode://open?app_id=x")!!.appId)
    }

    @Test fun ignoraDesconhecidosEInvalidos() {
        val l = DeepLink.parse("vertalnode://open?activate=1&autostart=true&ref=%3Cscript%3E&source=" + "a".repeat(65) + "&appId=ok&appId=segundo")
        assertEquals(DeepLink(appId = "ok"), l)
        assertEquals(DeepLink(), DeepLink.parse("vertalnode://open?ref=%E0%A4&=x&ref&source="))
        // URI malformada: não é tratada como link (a tela abre normalmente, sem a linha)
        assertNull(DeepLink.parse("vertalnode://open?ref=a%ZZ"))
    }

    @Test fun recusaOutrosLinks() {
        assertNull(DeepLink.parse(null))
        assertNull(DeepLink.parse(""))
        assertNull(DeepLink.parse("https://vertal.dev/open"))
        assertNull(DeepLink.parse("vertalnode://activate"))
        assertNull(DeepLink.parse("vertalnode://open/activate"))
        assertNull(DeepLink.parse("vertalnode:open"))
        assertNull(DeepLink.parse("not a uri"))
    }
}
