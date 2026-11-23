"""Testes do navd: detecção de senha na tarefa (mesmos casos do TS) e anti-telemetria.

  python3 -m unittest infra/vertal-browser/test_navd_privacy.py   (precisa de aiohttp)
"""
import importlib.util
import json
import os
import pathlib
import unittest

HERE = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("navd", HERE / "navd.py")
navd = importlib.util.module_from_spec(spec)
spec.loader.exec_module(navd)  # type: ignore[union-attr]
CASES = json.loads((HERE / "credential_cases.json").read_text(encoding="utf-8"))


class CredentialTests(unittest.TestCase):
    def test_refuse(self):
        for t in CASES["refuse"]:
            self.assertTrue(navd.looks_like_credentials(t), t)

    def test_allow(self):
        for t in CASES["allow"]:
            self.assertFalse(navd.looks_like_credentials(t), t)

    def test_redact(self):
        for src, want in CASES["redact"]:
            self.assertEqual(navd.redact_credentials(src), want)

    def test_events_are_redacted(self):
        ev = navd.S.emit("step", goal="digitar senha: Abc123!", actions=[{"name": "input", "params": {"text": "PIN 1234"}}])
        self.assertNotIn("Abc123!", json.dumps(ev))
        self.assertNotIn("1234", json.dumps(ev["actions"]))

    def test_redact_for_log_strips_url_tokens(self):
        out = navd.redact_for_log("falhou em https://site.com/reset?token=abc123#x com senha: Abc123!")
        self.assertNotIn("abc123", out)
        self.assertNotIn("Abc123!", out)
        self.assertIn("https://site.com/reset?[…]", out)


class TelemetryTests(unittest.TestCase):
    def test_browser_use_telemetry_env_forced_off(self):
        for k in ("ANONYMIZED_TELEMETRY", "BROWSER_USE_CLOUD_SYNC", "BROWSER_USE_VERSION_CHECK", "BROWSER_USE_CLOUD_HINTS", "BROWSER_USE_CALCULATE_COST"):
            self.assertEqual(os.environ.get(k), "false", k)

    def test_chromium_flags(self):
        flags = navd.CHROMIUM_PRIVACY_FLAGS
        self.assertIn("--metrics-recording-only", flags)
        self.assertIn("--disable-field-trial-config", flags)
        self.assertIn("--no-pings", flags)
        feats = next(f for f in flags if f.startswith("--disable-features="))
        for f in ("Translate", "OptimizationHints", "AutofillServerCommunication"):
            self.assertIn(f, feats)

    def test_openrouter_data_collection_deny(self):
        self.assertEqual(navd.openrouter_provider_prefs(None), {"data_collection": "deny"})
        self.assertEqual(navd.openrouter_provider_prefs({"data_collection": "allow"}), {"data_collection": "allow"})
        self.assertEqual(navd.openrouter_provider_prefs({"zdr": True}), {"data_collection": "deny", "zdr": True})

    def test_chromium_policy(self):
        pol = json.loads((HERE / "chromium-policy.json").read_text(encoding="utf-8"))
        want = {
            "MetricsReportingEnabled": False, "UrlKeyedAnonymizedDataCollectionEnabled": False,
            "SafeBrowsingExtendedReportingEnabled": False, "SpellCheckServiceEnabled": False, "SearchSuggestEnabled": False,
            "BrowserSignin": 0, "SyncDisabled": True, "PasswordManagerEnabled": False, "AutofillAddressEnabled": False,
            "AutofillCreditCardEnabled": False,
        }
        for k, v in want.items():
            self.assertEqual(pol.get(k), v, k)


if __name__ == "__main__":
    unittest.main()


AUTH = json.loads((HERE / "auth_cases.json").read_text(encoding="utf-8"))


class SecureFormsTests(unittest.TestCase):
    """Formulários seguros (bloquinhos) e máscara de segredos — mesmos casos do TS."""

    def test_mask(self):
        for src, want in AUTH["mask"]:
            self.assertEqual(navd.mask_secret_like(src), want, src)

    def test_keep(self):
        for t in AUTH["keep"]:
            self.assertEqual(navd.mask_secret_like(t), t)

    def test_slug(self):
        for host, want in AUTH["slug"]:
            self.assertEqual(navd.site_slug_for_host(host), want, host)

    def test_connector(self):
        for host, url, task, want in AUTH["connector"]:
            self.assertEqual(navd.connector_for_login(host, url, task), want, (host, task))

    def test_known_values_masked_in_events(self):
        navd.KNOWN.add("minhaSenhaForte")
        ev = navd.S.emit("done", result="Entrei com minhaSenhaForte no site")
        self.assertNotIn("minhaSenhaForte", json.dumps(ev))
        self.assertIn("[segredo oculto]", ev["result"])

    def test_leaked_value_never_in_result(self):
        ev = navd.S.emit("done", result="Erro: segredo Zq8mT2vX9pL4kR7wN1bY6cH3jF5dG0sA recusado em accounts.google.com")
        self.assertNotIn("Zq8mT2vX9pL4kR7wN1bY6cH3jF5dG0sA", json.dumps(ev))

    def test_ask_user_redirects_credentials(self):
        self.assertEqual(navd.credential_question_tool("Qual é a sua senha do Gmail?"), "request_login")
        self.assertEqual(navd.credential_question_tool("Qual o código 2FA que chegou?"), "request_user_code")
        self.assertEqual(navd.credential_question_tool("Qual telefone usar para o SMS?"), "request_phone")
        self.assertIsNone(navd.credential_question_tool("Qual das duas contas devo escolher?"))

    def test_otp_kind(self):
        self.assertEqual(navd.otp_kind_of("", "Digite o código do app autenticador"), "totp")
        self.assertEqual(navd.otp_kind_of("sms", ""), "sms")
        self.assertEqual(navd.otp_kind_of("", "Enviamos um código para seu e-mail"), "email")

    def test_login_event_types(self):
        loop = navd.asyncio.new_event_loop()
        try:
            async def run():
                t = navd.asyncio.ensure_future(navd.ask("login", host="accounts.google.com", fields=["password"]))
                await navd.asyncio.sleep(0)
                ev = navd.S.events[-1]
                self.assertEqual(ev["type"], "needs_password")
                pid = ev["id"]
                navd.S.pending[pid]["future"].set_result({"password": "x"})
                return await t
            self.assertEqual(loop.run_until_complete(run()), {"password": "x"})
        finally:
            loop.close()


class PaymentGateTests(unittest.TestCase):
    """Gate de pagamento: sem aprovação não clica; total que muda pergunta de novo."""

    def setUp(self):
        navd.S.pending.clear()
        navd.S.events.clear()
        navd.S.card_filled = None
        self._orig = (navd.capture_screenshot, navd.page_text)

        async def no_shot():
            return None

        async def text():
            return "Total do pedido: R$ 19,90"
        navd.capture_screenshot = no_shot
        navd.page_text = text

    def tearDown(self):
        navd.capture_screenshot, navd.page_text = self._orig

    def run_gate(self, answers):
        """answers: lista de respostas para cada pedido, na ordem (o 'usuário' e o 'Worker')."""
        loop = navd.asyncio.new_event_loop()
        seen = []

        async def go():
            task = navd.asyncio.ensure_future(navd.payment_gate("click", "Pagar R$ 19,90", "https://loja.com.br/checkout", "Checkout", "pagar"))
            for ans in answers:
                for _ in range(50):
                    await navd.asyncio.sleep(0)
                    if navd.S.pending:
                        break
                p = next(iter(navd.S.pending.values()))
                seen.append(p["kind"])
                p["future"].set_result(ans)
            return await task
        try:
            return loop.run_until_complete(go()), seen
        finally:
            loop.close()

    def test_no_approval_no_click(self):
        err, seen = self.run_gate([False])
        self.assertIn("NÃO aprovou", err)
        self.assertEqual(seen, ["approval"])

    def test_timeout_none_is_denial(self):
        err, _ = self.run_gate([None])
        self.assertIsNotNone(err)

    def test_same_total_clicks(self):
        err, seen = self.run_gate([{"approve": True, "totalCents": 1990, "currency": "BRL", "store": "loja.com.br"}, True])
        self.assertIsNone(err)
        self.assertEqual(seen, ["approval", "payment_check"])

    def test_total_changed_asks_again(self):
        ok = {"approve": True, "totalCents": 1990, "currency": "BRL"}
        err, seen = self.run_gate([ok, False, {"approve": True, "totalCents": 2490, "currency": "BRL"}, True])
        self.assertIsNone(err)
        self.assertEqual(seen, ["approval", "payment_check", "approval", "payment_check"])
        self.assertTrue(any(e["type"] == "payment_total_changed" for e in navd.S.events))

    def test_total_changed_and_denied_does_not_pay(self):
        err, seen = self.run_gate([{"approve": True, "totalCents": 1990, "currency": "BRL"}, False, False])
        self.assertIn("não aprovou o novo valor", err)
        self.assertEqual(seen, ["approval", "payment_check", "approval"])

    def test_card_guard_and_luhn(self):
        self.assertTrue(navd.luhn_ok("4111 1111 1111 1111"))
        self.assertFalse(navd.luhn_ok("4111 1111 1111 1112"))
        self.assertTrue(navd.looks_like_card_number("cartão 4111-1111-1111-1111 ok"))
        self.assertFalse(navd.looks_like_card_number("pedido 20261122 total 1990"))
        self.assertEqual(navd.approved_amount({"approve": True, "totalCents": 1990, "currency": "BRL"})["cents"], 1990)
        self.assertIsNone(navd.approved_amount(True))
