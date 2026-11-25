// Google Ad Manager (GPT) — anúncio premiado (rewarded) na web.
//
// Fluxo oficial do GPT para OutOfPageFormat.REWARDED:
//   defineOutOfPageSlot(adUnit, REWARDED) -> null quando a página/navegador não suporta
//   evento rewardedSlotReady   -> chamar event.makeRewardedVisible() (mostra o vídeo)
//   evento rewardedSlotGranted -> usuário ganhou a recompensa (aqui chamamos o backend)
//   evento rewardedSlotClosed  -> destroySlots([slot])
//   evento slotRenderEnded com isEmpty -> sem anúncio (no-fill)
//
// O ad unit vem de VITE_GAM_REWARDED_AD_UNIT (ex.: "/1234567/vertal_rewarded_web").

/* Tipos mínimos do GPT usados aqui (evita depender de @types/google-publisher-tag). */
export interface GptSlot {
  addService(service: GptPubAdsService): GptSlot;
}
interface GptEvent {
  slot: GptSlot;
}
interface GptReadyEvent extends GptEvent {
  makeRewardedVisible(): void;
}
interface GptRenderEndedEvent extends GptEvent {
  isEmpty: boolean;
}
export interface GptPubAdsService {
  addEventListener(type: string, listener: (event: never) => void): void;
  removeEventListener?(type: string, listener: (event: never) => void): void;
}
export interface GoogleTag {
  cmd: Array<() => void> | { push(fn: () => void): void };
  apiReady?: boolean;
  enums: { OutOfPageFormat: { REWARDED: number } };
  defineOutOfPageSlot(adUnitPath: string, format: number): GptSlot | null;
  pubads(): GptPubAdsService;
  enableServices(): void;
  display(slot: GptSlot): void;
  destroySlots(slots?: GptSlot[]): boolean;
}

declare global {
  interface Window {
    googletag?: GoogleTag;
  }
}

export const GPT_SRC = "https://securepubads.g.doubleclick.net/tag/js/gpt.js";

export function rewardedAdUnit(): string | null {
  const v = (import.meta.env.VITE_GAM_REWARDED_AD_UNIT as string | undefined)?.trim();
  return v ? v : null;
}

let gptLoading: Promise<GoogleTag> | null = null;

/** Carrega o gpt.js uma vez e resolve com window.googletag pronto para cmd.push. */
export function loadGpt(doc: Document = document): Promise<GoogleTag> {
  if (gptLoading) return gptLoading;
  gptLoading = new Promise<GoogleTag>((resolve, reject) => {
    const w = doc.defaultView as Window | null;
    if (!w) return reject(new Error("no_window"));
    w.googletag = w.googletag || ({ cmd: [] } as unknown as GoogleTag);
    if (doc.querySelector(`script[src="${GPT_SRC}"]`)) {
      resolve(w.googletag);
      return;
    }
    const s = doc.createElement("script");
    s.async = true;
    s.src = GPT_SRC;
    s.crossOrigin = "anonymous";
    s.onload = () => resolve(w.googletag as GoogleTag);
    s.onerror = () => {
      gptLoading = null;
      reject(new Error("gpt_blocked"));
    };
    doc.head.appendChild(s);
  });
  return gptLoading;
}

export type RewardedOutcome =
  | { kind: "granted" }
  | { kind: "closed_without_reward" }
  | { kind: "no_fill" }
  | { kind: "unsupported" }
  | { kind: "error"; message: string };

export interface ShowRewardedOptions {
  adUnit: string;
  /** Chamado no rewardedSlotGranted. O resultado da promessa é ignorado pelo fluxo do anúncio. */
  onGranted: () => Promise<void> | void;
  /** Tempo máximo esperando o anúncio ficar pronto antes de considerar no-fill. */
  readyTimeoutMs?: number;
  googletag?: GoogleTag;
}

/**
 * Pede um anúncio premiado ao GAM e resolve quando o anúncio termina (fechado, sem fill ou erro).
 * onGranted é chamado no máximo uma vez, assim que o GPT dispara rewardedSlotGranted.
 */
export async function showRewardedAd(opts: ShowRewardedOptions): Promise<RewardedOutcome> {
  let gt: GoogleTag;
  try {
    gt = opts.googletag ?? (await loadGpt());
  } catch (e) {
    return { kind: "error", message: e instanceof Error ? e.message : "gpt_load_failed" };
  }

  return new Promise<RewardedOutcome>((resolve) => {
    let settled = false;
    let granted = false;
    let slot: GptSlot | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const listeners: Array<[string, (e: never) => void]> = [];

    const finish = (outcome: RewardedOutcome) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try {
        const pubads = gt.pubads();
        for (const [type, fn] of listeners) pubads.removeEventListener?.(type, fn);
        if (slot) gt.destroySlots([slot]);
      } catch {
        /* ignore */
      }
      resolve(outcome);
    };

    gt.cmd.push(() => {
      try {
        slot = gt.defineOutOfPageSlot(opts.adUnit, gt.enums.OutOfPageFormat.REWARDED);
        if (!slot) {
          finish({ kind: "unsupported" });
          return;
        }
        const pubads = gt.pubads();
        slot.addService(pubads);

        const on = <E>(type: string, fn: (e: E) => void) => {
          const wrapped = ((e: E & GptEvent) => {
            if (e.slot === slot) fn(e);
          }) as unknown as (e: never) => void;
          listeners.push([type, wrapped]);
          pubads.addEventListener(type, wrapped);
        };

        on<GptReadyEvent>("rewardedSlotReady", (e) => {
          if (timer) clearTimeout(timer);
          e.makeRewardedVisible();
        });
        on<GptEvent>("rewardedSlotGranted", () => {
          if (granted) return;
          granted = true;
          void Promise.resolve(opts.onGranted()).catch(() => undefined);
        });
        on<GptEvent>("rewardedSlotClosed", () => {
          finish(granted ? { kind: "granted" } : { kind: "closed_without_reward" });
        });
        on<GptRenderEndedEvent>("slotRenderEnded", (e) => {
          if (e.isEmpty) finish({ kind: "no_fill" });
        });

        timer = setTimeout(() => finish({ kind: "no_fill" }), opts.readyTimeoutMs ?? 15_000);
        gt.enableServices();
        gt.display(slot);
      } catch (e) {
        finish({ kind: "error", message: e instanceof Error ? e.message : "gpt_error" });
      }
    });
  });
}
