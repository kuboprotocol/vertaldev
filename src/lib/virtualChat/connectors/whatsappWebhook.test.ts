import { describe, expect, it } from "vitest";
import {
  verifyWhatsAppSignature,
  verifyWhatsAppSubscription,
} from "./whatsapp";

const SECRET = "app-secret-test";
const BODY = JSON.stringify({ object: "whatsapp_business_account", entry: [] });

async function sign(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return "sha256=" + Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, "0")).join("");
}

describe("verifyWhatsAppSignature", () => {
  it("aceita assinatura correta", async () => {
    expect(await verifyWhatsAppSignature(BODY, await sign(BODY, SECRET), SECRET)).toBe(true);
  });

  it("rejeita corpo alterado", async () => {
    const sig = await sign(BODY, SECRET);
    expect(await verifyWhatsAppSignature(BODY + " ", sig, SECRET)).toBe(false);
  });

  it("rejeita segredo errado", async () => {
    expect(await verifyWhatsAppSignature(BODY, await sign(BODY, "outro"), SECRET)).toBe(false);
  });

  it("rejeita ausência, prefixo errado, tamanho errado e segredo vazio", async () => {
    const sig = await sign(BODY, SECRET);
    expect(await verifyWhatsAppSignature(BODY, null, SECRET)).toBe(false);
    expect(await verifyWhatsAppSignature(BODY, sig.replace("sha256=", "sha1="), SECRET)).toBe(false);
    expect(await verifyWhatsAppSignature(BODY, sig.slice(0, -2), SECRET)).toBe(false);
    expect(await verifyWhatsAppSignature(BODY, sig, "")).toBe(false);
  });
});

describe("verifyWhatsAppSubscription", () => {
  it("devolve o challenge quando o token confere", () => {
    expect(
      verifyWhatsAppSubscription(
        { "hub.mode": "subscribe", "hub.verify_token": "tok", "hub.challenge": "123" },
        "tok",
      ),
    ).toBe("123");
  });

  it("nega token errado, modo errado ou token vazio", () => {
    expect(verifyWhatsAppSubscription({ "hub.mode": "subscribe", "hub.verify_token": "x", "hub.challenge": "1" }, "tok")).toBeNull();
    expect(verifyWhatsAppSubscription({ "hub.mode": "unsubscribe", "hub.verify_token": "tok", "hub.challenge": "1" }, "tok")).toBeNull();
    expect(verifyWhatsAppSubscription({ "hub.mode": "subscribe", "hub.verify_token": "", "hub.challenge": "1" }, "")).toBeNull();
  });
});
