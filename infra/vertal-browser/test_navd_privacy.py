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
