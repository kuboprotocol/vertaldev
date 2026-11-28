// Vertal Node embutido no app nativo (fase 2): quando o Vertal Dev (ou um app gerado) roda como app
// Capacitor no Android ou como app Electron no computador, o botão do card de recompensas chama o SDK
// do parceiro (Cash Raven) direto, em vez de abrir/baixar o app separado do Vertal Node.
//
// Desligado por padrão: só vale com VITE_VERTAL_NODE_EMBEDDED_SDK=true NO BUILD do app nativo.
// Regras (Play / LGPD): nada liga sem o toque do usuário; o aceite é gravado em vertal_node_consents
// antes; a tela de consentimento DO PARCEIRO aparece (o SDK nomeia o fornecedor); pausar e desativar
// (opt-out) ficam sempre visíveis.

export type EmbeddedNodeKind = "capacitor" | "electron";

export interface EmbeddedNodeState {
  available: boolean;
  /** Por que não está disponível (ex.: "api_key_missing", "sdk_init_failed"). */
  reason?: string;
  optedIn: boolean;
  running: boolean;
  paused: boolean;
}

export interface EmbeddedNodeBridge {
  kind: EmbeddedNodeKind;
  status(): Promise<EmbeddedNodeState>;
  /** Consentimento do parceiro (se preciso) → inicia. `accepted=false` = recusou, nada ligou. */
  activate(): Promise<EmbeddedNodeState & { accepted: boolean }>;
  pause(): Promise<EmbeddedNodeState>;
  optOut(): Promise<EmbeddedNodeState>;
}

/** VITE_VERTAL_NODE_EMBEDDED_SDK=true|1 liga (padrão: desligado). */
export function embeddedSdkEnabled(value: unknown = import.meta.env.VITE_VERTAL_NODE_EMBEDDED_SDK): boolean {
  return typeof value === "string" && /^(true|1)$/i.test(value.trim());
}

type Raw = Record<string, unknown> | null | undefined;

function toState(raw: Raw, availableKey: "available" | "enabled"): EmbeddedNodeState {
  const r: Record<string, unknown> = raw ?? {};
  return {
    available: r[availableKey] === true,
    reason: typeof r.reason === "string" ? r.reason : undefined,
    optedIn: r.optedIn === true,
    running: r.running === true,
    paused: r.paused === true,
  };
}

interface CapacitorPluginLike {
  status(): Promise<Raw>;
  activate(): Promise<Raw>;
  pause(): Promise<Raw>;
  optOut(): Promise<Raw>;
}
interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  isPluginAvailable?: (name: string) => boolean;
  registerPlugin?: (name: string) => unknown;
  Plugins?: Record<string, unknown>;
}
interface ElectronVertalNode {
  activate(): Promise<Raw>;
  stop(): Promise<Raw>;
  optOut(): Promise<Raw>;
  status(): Promise<Raw>;
}

function capacitorBridge(cap: CapacitorGlobal): EmbeddedNodeBridge | null {
  if (cap.isNativePlatform?.() !== true || cap.getPlatform?.() !== "android") return null;
  if (cap.isPluginAvailable && !cap.isPluginAvailable("VertalNode")) return null;
  const plugin = (cap.Plugins?.VertalNode ?? cap.registerPlugin?.("VertalNode")) as CapacitorPluginLike | undefined;
  if (!plugin || typeof plugin.activate !== "function") return null;
  return {
    kind: "capacitor",
    status: async () => toState(await plugin.status(), "available"),
    activate: async () => {
      const r = await plugin.activate();
      return { ...toState(r, "available"), accepted: r?.accepted === true };
    },
    pause: async () => toState(await plugin.pause(), "available"),
    optOut: async () => toState(await plugin.optOut(), "available"),
  };
}

function electronBridge(api: ElectronVertalNode): EmbeddedNodeBridge | null {
  if (typeof api.activate !== "function" || typeof api.status !== "function") return null;
  return {
    kind: "electron",
    status: async () => toState(await api.status(), "enabled"),
    activate: async () => {
      const s = toState(await api.activate(), "enabled");
      return { ...s, accepted: s.optedIn };
    },
    pause: async () => toState(await api.stop(), "enabled"),
    optOut: async () => toState(await api.optOut(), "enabled"),
  };
}

/** Ponte para o SDK embutido, ou null (web normal, iOS, flag desligado, app sem o plugin). */
export function getEmbeddedNodeBridge(
  g: unknown = globalThis,
  enabled: boolean = embeddedSdkEnabled(),
): EmbeddedNodeBridge | null {
  if (!enabled || !g) return null;
  const w = g as { Capacitor?: CapacitorGlobal; vertalNode?: ElectronVertalNode };
  try {
    if (w.vertalNode) return electronBridge(w.vertalNode);
    if (w.Capacitor) return capacitorBridge(w.Capacitor);
  } catch {
    /* ponte quebrada: cai no fluxo do app separado */
  }
  return null;
}
