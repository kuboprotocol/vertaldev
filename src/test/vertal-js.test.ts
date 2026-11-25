import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({
  rows: [] as { opted_in: boolean | null }[] | null,
  error: null as unknown,
  user: null as { id: string } | null,
  from: vi.fn(),
  authCb: null as null | ((e: string, s: { user: { id: string } } | null) => void),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: (e: string, s: { user: { id: string } } | null) => void) => {
        h.authCb = cb;
        // supabase-js v2 emite INITIAL_SESSION logo na inscrição
        queueMicrotask(() => cb("INITIAL_SESSION", h.user ? { user: h.user } : null));
        return { data: { subscription: { unsubscribe: () => (h.authCb = null) } } };
      },
    },
    from: (t: string) => {
      h.from(t);
      return { select: () => ({ eq: async () => ({ data: h.rows, error: h.error }) }) };
    },
  },
}));

import {
  VERTAL_JS_CACHE_KEY,
  applyVertalConsent,
  getVertalJsConfig,
  readVertalNodeConsent,
  startVertalJs,
} from "@/lib/vertal-js";

const CFG = { src: "https://gw.example/sdk/v1/vertal.js", appId: "vertal-dev" };
const scriptTag = () => document.head.querySelector('script[data-vertal-js="v1"]');
const now = (fn: () => void) => fn();

beforeEach(() => {
  h.rows = [];
  h.error = null;
  h.user = { id: "u1" };
  h.from.mockClear();
  h.authCb = null;
  applyVertalConsent("revoked", CFG); // zera o estado do módulo entre testes
  delete window.Vertal;
  document.head.querySelectorAll("script[data-vertal-js]").forEach((s) => s.remove());
  localStorage.clear();
  Object.defineProperty(window, "requestIdleCallback", {
    configurable: true,
    writable: true,
    value: (cb: () => void) => {
      cb();
      return 1;
    },
  });
});

let stop: () => void = () => {};
const tick = () => new Promise((r) => setTimeout(r, 10));

afterEach(() => {
  stop();
  vi.restoreAllMocks();
});

describe("getVertalJsConfig", () => {
  it("sem env (ou sem https) = desligado", () => {
    expect(getVertalJsConfig({})).toBeNull();
    expect(getVertalJsConfig({ VITE_VERTAL_JS_SRC: CFG.src })).toBeNull();
    expect(getVertalJsConfig({ VITE_VERTAL_APP_ID: "x" })).toBeNull();
    expect(getVertalJsConfig({ VITE_VERTAL_JS_SRC: "http://gw/x.js", VITE_VERTAL_APP_ID: "x" })).toBeNull();
    expect(getVertalJsConfig({ VITE_VERTAL_JS_SRC: ` ${CFG.src} `, VITE_VERTAL_APP_ID: "vertal-dev" })).toEqual(CFG);
  });
});

describe("readVertalNodeConsent (vertal_nodes.opted_in)", () => {
  it("algum dispositivo com opt-in = granted; só opt-out = revoked; nada/erro = none", async () => {
    h.rows = [{ opted_in: false }, { opted_in: true }];
    expect(await readVertalNodeConsent("u1")).toBe("granted");
    expect(h.from).toHaveBeenCalledWith("vertal_nodes");
    h.rows = [{ opted_in: false }];
    expect(await readVertalNodeConsent("u1")).toBe("revoked");
    h.rows = [];
    expect(await readVertalNodeConsent("u1")).toBe("none");
    h.rows = null;
    h.error = { message: "relation does not exist" };
    expect(await readVertalNodeConsent("u1")).toBe("none");
  });
});

describe("startVertalJs", () => {
  it("sem env: nenhum script, nem consulta ao banco, nem ouvinte de sessão", async () => {
    h.rows = [{ opted_in: true }];
    stop = startVertalJs(null);
    await tick();
    expect(h.authCb).toBeNull();
    expect(h.from).not.toHaveBeenCalled();
    expect(scriptTag()).toBeNull();
    expect(window.Vertal).toBeUndefined();
  });

  it("aceito no painel: init({appId}) + consent.grant() e o script é baixado", async () => {
    h.rows = [{ opted_in: true }];
    stop = startVertalJs(CFG);
    await waitFor(() => expect(scriptTag()).not.toBeNull());
    expect(scriptTag()?.getAttribute("src")).toBe(CFG.src);
    const q = window.Vertal!.q as [string, unknown[]][];
    expect(q.map((c) => c[0])).toEqual(["init", "consent.grant"]);
    expect(q[0][1][0]).toEqual({ appId: "vertal-dev", version: "v1" });
  });

  it("não aceito: nenhuma tag de script", async () => {
    h.rows = [];
    stop = startVertalJs(CFG);
    await waitFor(() => expect(h.from).toHaveBeenCalled());
    await tick();
    expect(scriptTag()).toBeNull();
    expect(window.Vertal).toBeUndefined();
  });

  it("deslogado: não consulta e não baixa nada", async () => {
    h.user = null;
    stop = startVertalJs(CFG);
    await tick();
    expect(h.from).not.toHaveBeenCalled();
    expect(scriptTag()).toBeNull();
  });

  it("logout depois do aceite: Vertal.consent.revoke()", async () => {
    h.rows = [{ opted_in: true }];
    stop = startVertalJs(CFG);
    await waitFor(() => expect(scriptTag()).not.toBeNull());
    const revoke = vi.spyOn(window.Vertal!.consent, "revoke");
    h.authCb!("SIGNED_OUT", null);
    expect(revoke).toHaveBeenCalledTimes(1);
  });

  it("não escreve no console", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m));
    h.rows = [{ opted_in: true }];
    stop = startVertalJs(CFG);
    await waitFor(() => expect(scriptTag()).not.toBeNull());
    spies.forEach((sp) => expect(sp).not.toHaveBeenCalled());
  });
});

describe("applyVertalConsent: revogação", () => {
  it("revogado depois do aceite: Vertal.consent.revoke()", () => {
    const win = window;
    applyVertalConsent("granted", CFG, { win, doc: document, idle: now });
    const revoke = vi.spyOn(window.Vertal!.consent, "revoke");
    applyVertalConsent("revoked", CFG, { win, doc: document, idle: now });
    expect(revoke).toHaveBeenCalledTimes(1);
  });

  it("revogado sem script carregado: não baixa nada e apaga o cache", () => {
    localStorage.setItem(VERTAL_JS_CACHE_KEY, "{}");
    applyVertalConsent("revoked", CFG, { idle: now });
    expect(scriptTag()).toBeNull();
    expect(window.Vertal).toBeUndefined();
    expect(localStorage.getItem(VERTAL_JS_CACHE_KEY)).toBeNull();
  });

  it("revogado antes do idle: o grant agendado não roda", () => {
    let pending: (() => void) | null = null;
    applyVertalConsent("granted", CFG, { idle: (fn) => (pending = fn) });
    applyVertalConsent("revoked", CFG, { idle: now });
    pending!();
    expect(scriptTag()).toBeNull();
    expect(window.Vertal).toBeUndefined();
  });
});
