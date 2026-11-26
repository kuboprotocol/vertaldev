/**
 * vertal.js (Vertal DePIN) no Vertal Dev.
 *
 * O aceite que o usuário já deu no Vertal Node (painel de recompensas em /recompensas, consentimento
 * do parceiro dentro do app nativo) vale como consentimento para o script. Este módulo só LÊ esse
 * aceite: `public.vertal_nodes.opted_in` (gravado pela Edge Function `vertal-node-heartbeat`; RLS
 * deixa o usuário ler só as próprias linhas). O painel (`VertalNodeCard`) não é tocado.
 *
 * - Sem `VITE_VERTAL_JS_SRC` (https) ou `VITE_VERTAL_APP_ID`: não faz nada (nem consulta o banco).
 * - Logado e com algum dispositivo `opted_in = true`: instala o stub e, no idle, chama
 *   `Vertal.init({ appId })` + `Vertal.consent.grant()` (só então o script é baixado).
 * - Opt-out (dispositivos existem, nenhum com `opted_in`) ou logout: `Vertal.consent.revoke()`
 *   se o script já foi liberado nesta aba; senão só apaga o cache `vertal:v1:config`. Nunca baixa o script.
 *
 * O consentimento cobre só o script (status, recompensas, deep link). Compartilhar banda continua
 * sendo opt-in explícito no app nativo; o navegador não faz isso. Sem logs no console.
 */
import { supabase } from "@/integrations/supabase/client";

export type VertalNodeConsent = "granted" | "revoked" | "none";

export interface VertalJsConfig {
  src: string;
  appId: string;
}

type Stubbed = (...args: unknown[]) => Promise<unknown>;

export interface VertalGlobal {
  q: unknown[];
  init: Stubbed;
  on: Stubbed;
  config: Stubbed;
  node: { status: Stubbed; openApp: Stubbed };
  rewards: { mount: Stubbed };
  consent: { grant: Stubbed; revoke: Stubbed; state?: Stubbed };
}

declare global {
  interface Window {
    Vertal?: VertalGlobal;
  }
}

/** Cache que o vertal.js grava depois do grant (o revoke do script também apaga). */
export const VERTAL_JS_CACHE_KEY = "vertal:v1:config";

function clean(v: unknown, max: number): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
}

/** Lê o env; `null` = desligado (gateway ainda não publicado). */
export function getVertalJsConfig(
  env: Record<string, unknown> = import.meta.env as Record<string, unknown>,
): VertalJsConfig | null {
  const src = clean(env.VITE_VERTAL_JS_SRC, 500);
  const appId = clean(env.VITE_VERTAL_APP_ID, 120);
  if (!src || !appId || !/^https:\/\//i.test(src)) return null;
  return { src, appId };
}

/** Stub do snippet oficial (sdk/vertal-js/snippet.html): fila em `Vertal.q`, script só no grant(). */
export function installVertalStub(w: Window, d: Document, src: string): VertalGlobal {
  if (w.Vertal) return w.Vertal;
  let loaded = false;
  const V = { q: [] as unknown[] } as VertalGlobal;
  const stub =
    (p: string): Stubbed =>
    (...a: unknown[]) =>
      new Promise((res, rej) => {
        V.q.push([p, a, res, rej]);
      });
  V.init = stub("init");
  V.on = stub("on");
  V.config = stub("config");
  V.node = { status: stub("node.status"), openApp: stub("node.openApp") };
  V.rewards = { mount: stub("rewards.mount") };
  V.consent = {
    revoke: stub("consent.revoke"),
    grant: (...a: unknown[]) => {
      const p = stub("consent.grant")(...a);
      if (!loaded) {
        loaded = true;
        const s = d.createElement("script");
        s.async = true;
        s.src = src;
        s.dataset.vertalJs = "v1";
        d.head.appendChild(s);
      }
      return p;
    },
  };
  w.Vertal = V;
  return V;
}

/** Aceite do Vertal Node, lido de `vertal_nodes` (só as linhas do próprio usuário, via RLS). */
export async function readVertalNodeConsent(userId: string): Promise<VertalNodeConsent> {
  try {
    // `vertal_nodes` ainda não está nos tipos gerados do Supabase.
    const { data, error } = await (
      supabase as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (k: string, v: string) => Promise<{ data: { opted_in: boolean | null }[] | null; error: unknown }>;
          };
        };
      }
    )
      .from("vertal_nodes")
      .select("opted_in")
      .eq("user_id", userId);
    if (error || !data || data.length === 0) return "none";
    return data.some((r) => r.opted_in === true) ? "granted" : "revoked";
  } catch {
    return "none";
  }
}

export interface ApplyDeps {
  win?: Window;
  doc?: Document;
  /** Agenda no idle; padrão requestIdleCallback (timeout 3 s) ou setTimeout. */
  idle?: (fn: () => void) => void;
}

function defaultIdle(w: Window): (fn: () => void) => void {
  return (fn) => {
    const ric = (w as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
      .requestIdleCallback;
    if (typeof ric === "function") ric.call(w, fn, { timeout: 3000 });
    else w.setTimeout(fn, 1500);
  };
}

const granted = new WeakSet<Window>();

/** Aplica o estado do aceite ao vertal.js. Silencioso: qualquer erro é engolido. */
export function applyVertalConsent(
  state: VertalNodeConsent,
  cfg: VertalJsConfig | null,
  deps: ApplyDeps = {},
): void {
  if (!cfg) return;
  const w = deps.win ?? window;
  const d = deps.doc ?? document;
  try {
    if (state === "granted") {
      if (granted.has(w)) return;
      granted.add(w);
      const idle = deps.idle ?? defaultIdle(w);
      idle(() => {
        if (!granted.has(w)) return; // revogado antes do idle
        try {
          const V = installVertalStub(w, d, cfg.src);
          void V.init({ appId: cfg.appId, version: "v1" }).catch(() => {});
          void V.consent.grant().catch(() => {});
        } catch {
          /* quieto */
        }
      });
      return;
    }
    if (state === "revoked") {
      granted.delete(w);
      if (w.Vertal) {
        void w.Vertal.consent.revoke().catch(() => {});
      } else {
        w.localStorage?.removeItem(VERTAL_JS_CACHE_KEY);
      }
    }
  } catch {
    /* quieto */
  }
}

/** Intervalo mínimo entre releituras do aceite quando a aba volta a ficar visível. */
export const VERTAL_JS_RECHECK_MS = 10 * 60 * 1000;

/**
 * Ponto de montagem único (src/main.tsx). Acompanha a sessão do Supabase e relê o aceite no login,
 * na troca de usuário e quando a aba volta a ficar visível (no máximo a cada 10 min).
 * Devolve a função que desliga os ouvintes. Sem env: não faz nada.
 */
export function startVertalJs(cfg: VertalJsConfig | null = getVertalJsConfig()): () => void {
  if (!cfg || typeof window === "undefined") return () => {};
  let userId: string | null = null;
  let last = 0;
  let seq = 0;

  const check = () => {
    const uid = userId;
    const my = ++seq;
    last = Date.now();
    if (!uid) {
      applyVertalConsent("revoked", cfg);
      return;
    }
    void readVertalNodeConsent(uid).then((state) => {
      if (my === seq) applyVertalConsent(state, cfg);
    });
  };

  const onSession = (uid: string | null) => {
    if (uid === userId && last) return;
    userId = uid;
    check();
  };

  let unsubscribe = () => {};
  try {
    const { data } = supabase.auth.onAuthStateChange((_e, session) => onSession(session?.user?.id ?? null));
    unsubscribe = () => data.subscription.unsubscribe();
  } catch {
    /* quieto */
  }

  const onVisible = () => {
    if (document.visibilityState === "visible" && Date.now() - last > VERTAL_JS_RECHECK_MS) check();
  };
  document.addEventListener("visibilitychange", onVisible);

  return () => {
    seq++;
    unsubscribe();
    document.removeEventListener("visibilitychange", onVisible);
  };
}
