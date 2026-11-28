/**
 * API do plugin Capacitor "VertalNode" (Android). Nada começa sozinho: só activate(), chamado no
 * toque do usuário, abre a tela de consentimento DO PARCEIRO (Cash Raven) e só inicia depois do aceite.
 */
export type VertalNodeUnavailableReason =
  | "api_key_missing" // build sem CASHRAVEN_API_KEY_ANDROID
  | "sdk_init_failed" // o SDK não iniciou neste aparelho
  | "unsupported_platform"; // web / iOS (a Cash Raven não tem SDK iOS)

export interface VertalNodeStatus {
  available: boolean;
  reason?: VertalNodeUnavailableReason;
  provider: "cashraven";
  platform: "android" | "ios" | "web";
  /** O usuário aceitou a tela de consentimento do parceiro (e não fez opt-out). */
  optedIn: boolean;
  /** Serviço em primeiro plano compartilhando agora (notificação fixa visível). */
  running: boolean;
  /** Pausado pelo usuário: não religa sozinho até o próximo activate(). */
  paused: boolean;
  /** Id pseudônimo do aparelho (uid passado ao SDK; sem dado pessoal). */
  deviceId?: string;
}

export interface VertalNodeActivateResult extends VertalNodeStatus {
  /** false = recusou/fechou a tela do parceiro (nada foi ligado). */
  accepted: boolean;
}

export interface VertalNodePlugin {
  status(): Promise<VertalNodeStatus>;
  /** Permissão de notificação (Android 13+) → consentimento do parceiro → serviço em primeiro plano. */
  activate(): Promise<VertalNodeActivateResult>;
  /** Para o serviço; o consentimento continua. */
  pause(): Promise<VertalNodeStatus>;
  /** Retira o consentimento no SDK, para na hora e desliga a retomada após reiniciar. */
  optOut(): Promise<VertalNodeStatus>;
}
