// AppLixir — vídeo premiado (rewarded video) na web, SDK v6.
//
// Contrato oficial (https://github.com/applixirinc/applixir-integration/blob/main/llms.txt):
//   <script src="https://cdn.applixir.com/applixir.app.v6.1.0.js">  -> window.initializeAndOpenPlayer
//   initializeAndOpenPlayer({ apiKey, injectionElementId, adStatusCallbackFn, adErrorCallbackFn })
//   adStatusCallbackFn recebe um OBJETO { type }. Só "complete" significa vídeo assistido até o fim.
//   "allAdsCompleted" chega no fim de qualquer anúncio E quando não havia anúncio (no-fill).
//   "skipped" / "manuallyEnded" / "consentDeclined" = sem recompensa.
//
// A chave (VITE_APPLIXIR_API_KEY) é pública por definição: o próprio SDK roda no navegador.
// Enquanto a conta não é aprovada pela AppLixir, usa-se a chave sandbox compartilhada, que só
// devolve anúncios de teste. O crédito NUNCA é decidido aqui: o painel chama o backend
// (rewarded-video-claim) com o nonce de uso único quando o SDK avisa "complete".

import type { RewardedOutcome } from "@/lib/gamRewarded";

export const APPLIXIR_SDK_SRC = "https://cdn.applixir.com/applixir.app.v6.1.0.js";
export const APPLIXIR_CONTAINER_ID = "applixir-ad-container";

export interface ApplixirStatus {
  type: string;
  ad?: unknown;
  error?: unknown;
}
export interface ApplixirError {
  getError?: () => { data?: { type?: string; errorCode?: number; errorMessage?: string } };
}
export interface ApplixirOptions {
  apiKey: string;
  injectionElementId: string;
  adStatusCallbackFn: (status: ApplixirStatus) => void;
  adErrorCallbackFn?: (error: ApplixirError) => void;
  userId?: string;
  customData?: Record<string, unknown>;
}
export type InitializeAndOpenPlayer = (options: ApplixirOptions) => void;

declare global {
  interface Window {
    initializeAndOpenPlayer?: InitializeAndOpenPlayer;
  }
}

export function applixirApiKey(): string | null {
  const v = (import.meta.env.VITE_APPLIXIR_API_KEY as string | undefined)?.trim();
  return v ? v : null;
}

let sdkLoading: Promise<InitializeAndOpenPlayer> | null = null;

/** Carrega o SDK da AppLixir uma vez e resolve com window.initializeAndOpenPlayer. */
export function loadApplixirSdk(
  doc: Document = document,
  timeoutMs = 15_000,
): Promise<InitializeAndOpenPlayer> {
  const w = doc.defaultView as Window | null;
  if (w?.initializeAndOpenPlayer) return Promise.resolve(w.initializeAndOpenPlayer);
  if (sdkLoading) return sdkLoading;

  sdkLoading = new Promise<InitializeAndOpenPlayer>((resolve, reject) => {
    if (!w) return reject(new Error("no_window"));
    let timer: ReturnType<typeof setTimeout> | null = null;
    const fail = (why: string) => {
      if (timer) clearTimeout(timer);
      sdkLoading = null;
      reject(new Error(why));
    };
    const done = () => {
      if (timer) clearTimeout(timer);
      if (typeof w.initializeAndOpenPlayer === "function") resolve(w.initializeAndOpenPlayer);
      else fail("applixir_sdk_missing");
    };
    timer = setTimeout(() => fail("applixir_sdk_timeout"), timeoutMs);

    let s = doc.querySelector<HTMLScriptElement>(`script[src="${APPLIXIR_SDK_SRC}"]`);
    if (!s) {
      s = doc.createElement("script");
      s.async = true;
      s.src = APPLIXIR_SDK_SRC;
      doc.head.appendChild(s);
    }
    s.addEventListener("load", done, { once: true });
    s.addEventListener("error", () => fail("applixir_sdk_blocked"), { once: true });
  });
  return sdkLoading;
}

/** Só para testes: esquece o carregamento anterior. */
export function __resetApplixirForTests(): void {
  sdkLoading = null;
}

export interface ShowApplixirOptions {
  apiKey: string;
  /** Chamado no máximo uma vez, quando o SDK avisa "complete" (vídeo assistido até o fim). */
  onGranted: () => Promise<void> | void;
  containerId?: string;
  customData?: Record<string, unknown>;
  /** Tempo máximo sem nenhum sinal do player ("loaded"/"started") antes de considerar sem anúncio. */
  loadTimeoutMs?: number;
  /** Depois do "complete", quanto esperar o "allAdsCompleted" antes de encerrar sozinho. */
  closeGraceMs?: number;
  open?: InitializeAndOpenPlayer;
}

const NO_REWARD = new Set(["skipped", "manuallyEnded", "consentDeclined"]);

/**
 * Abre o player da AppLixir e resolve quando o anúncio termina (assistido, fechado, sem anúncio ou erro).
 * Precisa ser chamado a partir de um clique do usuário (o SDK exige gesto do usuário).
 */
export async function showApplixirAd(opts: ShowApplixirOptions): Promise<RewardedOutcome> {
  let open: InitializeAndOpenPlayer;
  try {
    open = opts.open ?? (await loadApplixirSdk());
  } catch (e) {
    return { kind: "error", message: e instanceof Error ? e.message : "applixir_sdk_failed" };
  }

  return new Promise<RewardedOutcome>((resolve) => {
    let settled = false;
    let granted = false;
    let started = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finish = (outcome: RewardedOutcome) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(outcome);
    };
    const arm = (ms: number, outcome: RewardedOutcome) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => finish(outcome), ms);
    };

    arm(opts.loadTimeoutMs ?? 20_000, { kind: "no_fill" });

    try {
      open({
        apiKey: opts.apiKey,
        injectionElementId: opts.containerId ?? APPLIXIR_CONTAINER_ID,
        customData: opts.customData,
        adStatusCallbackFn: (status) => {
          const type = status?.type;
          if (!type || settled) return;
          if (type === "loaded" || type === "started") {
            started = true;
            // Anúncio carregado: sem prazo de no-fill (o vídeo pode durar 30 s ou mais).
            if (timer) clearTimeout(timer);
            timer = null;
          } else if (type === "complete") {
            if (granted) return;
            granted = true;
            void Promise.resolve(opts.onGranted()).catch(() => undefined);
            arm(opts.closeGraceMs ?? 5_000, { kind: "granted" });
          } else if (NO_REWARD.has(type)) {
            finish(granted ? { kind: "granted" } : { kind: "closed_without_reward" });
          } else if (type === "allAdsCompleted") {
            if (granted) finish({ kind: "granted" });
            else finish(started ? { kind: "closed_without_reward" } : { kind: "no_fill" });
          }
        },
        adErrorCallbackFn: (error) => {
          if (granted) return finish({ kind: "granted" });
          let data: { errorCode?: number; errorMessage?: string } | undefined;
          try {
            data = error?.getError?.()?.data;
          } catch {
            data = undefined;
          }
          // 303 = "No Ads" (sem anúncio para este usuário/domínio agora).
          if (data?.errorCode === 303 || /no ads?/i.test(data?.errorMessage ?? "")) {
            finish({ kind: "no_fill" });
          } else {
            finish({ kind: "error", message: data?.errorMessage || "applixir_error" });
          }
        },
      });
    } catch (e) {
      finish({ kind: "error", message: e instanceof Error ? e.message : "applixir_open_failed" });
    }
  });
}
