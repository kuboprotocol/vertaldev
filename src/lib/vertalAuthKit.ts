// Login com Google gerenciado pelo Vertal: núcleo compartilhado com o vibe-code-agent
// e a preferência do Dev por projeto (guardada no navegador).
export * from "../../supabase/functions/_shared/vertalAuthKit";
import { AUTH_KIT_TERMS_VERSION, isSafeLogoUrl, type AuthKitRequest } from "../../supabase/functions/_shared/vertalAuthKit";

const KEY = "vertal-auth-kit:";

export interface AuthKitPrefs {
  enabled: boolean;
  appName: string;
  /** true só quando o Dev marcou o checkbox dos termos de marca branca. */
  termsAccepted: boolean;
  termsVersion?: string;
  acceptedAt?: string;
  logoUrl?: string;
}

export const DEFAULT_AUTH_KIT_PREFS: AuthKitPrefs = { enabled: false, appName: "", termsAccepted: false };

export function loadAuthKitPrefs(projectKey: string, storage: Pick<Storage, "getItem"> = localStorage): AuthKitPrefs {
  try {
    const raw = JSON.parse(storage.getItem(KEY + projectKey) ?? "null");
    if (!raw || typeof raw !== "object") return { ...DEFAULT_AUTH_KIT_PREFS };
    const termsOk = raw.termsAccepted === true && raw.termsVersion === AUTH_KIT_TERMS_VERSION;
    return {
      enabled: raw.enabled === true,
      appName: typeof raw.appName === "string" ? raw.appName.slice(0, 60) : "",
      termsAccepted: termsOk,
      termsVersion: termsOk ? AUTH_KIT_TERMS_VERSION : undefined,
      acceptedAt: termsOk && typeof raw.acceptedAt === "string" ? raw.acceptedAt : undefined,
      logoUrl: isSafeLogoUrl(raw.logoUrl) ? raw.logoUrl : undefined,
    };
  } catch {
    return { ...DEFAULT_AUTH_KIT_PREFS };
  }
}

export function saveAuthKitPrefs(projectKey: string, prefs: AuthKitPrefs, storage: Pick<Storage, "setItem"> = localStorage): void {
  try {
    storage.setItem(KEY + projectKey, JSON.stringify(prefs));
  } catch {
    // Sem storage (modo privado): a escolha vale só nesta aba.
  }
}

/** Corpo authKit do vibe-code-agent. Marca branca só com termos aceitos E logo enviado. */
export function authKitRequestFromPrefs(prefs: AuthKitPrefs): AuthKitRequest | undefined {
  if (!prefs.enabled) return undefined;
  const white = prefs.termsAccepted && !!prefs.logoUrl;
  return {
    enabled: true,
    ...(prefs.appName.trim() ? { appName: prefs.appName.trim() } : {}),
    branding: white ? "white_label" : "vertal",
    ...(white
      ? { logoUrl: prefs.logoUrl, termsAccepted: true, termsVersion: AUTH_KIT_TERMS_VERSION, acceptedAt: prefs.acceptedAt }
      : {}),
  };
}
