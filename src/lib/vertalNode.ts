// Vertal Node no site (/recompensas): plataforma do aparelho, links do app e texto de consentimento.

/**
 * APK de teste mais recente publicado (pré-release pública do workflow vertal-node-android.yml).
 * Usado quando VITE_VERTAL_NODE_ANDROID_URL não está definido, para o botão sempre funcionar.
 * Atualize junto com uma nova pré-release, ou defina VITE_VERTAL_NODE_ANDROID_URL no build.
 */
export const DEFAULT_VERTAL_NODE_ANDROID_URL =
  "https://github.com/kuboprotocol/vertaldev/releases/download/vertal-node-android-test-3cbbeec/vertal-node-android-test-3cbbeec.apk";

/** applicationId do app Android (native/node-sdks/android/app/build.gradle.kts). */
export const VERTAL_NODE_ANDROID_PACKAGE = "dev.vertal.node";

/** Versão do texto de consentimento (igual a VERTAL_NODE_CONSENT_VERSION da Edge Function). */
export const VERTAL_NODE_CONSENT_VERSION = "2026-11-28";

export type NodePlatform = "android" | "ios" | "desktop" | "other";

/** Detecta a plataforma pelo user agent (iPadOS se apresenta como Mac com touch). */
export function detectNodePlatform(
  ua: string = typeof navigator !== "undefined" ? navigator.userAgent : "",
  maxTouchPoints: number = typeof navigator !== "undefined" ? navigator.maxTouchPoints ?? 0 : 0,
): NodePlatform {
  const s = ua || "";
  if (/Android/i.test(s)) return "android";
  if (/iPhone|iPad|iPod/i.test(s)) return "ios";
  if (/Macintosh/i.test(s) && maxTouchPoints > 1) return "ios";
  if (/CrOS/i.test(s)) return "other";
  if (/Windows NT|Macintosh|Mac OS X|Linux|X11/i.test(s)) return "desktop";
  return "other";
}

/**
 * Intent URL do Chrome no Android: abre vertalnode://open no app instalado; sem o app, o Chrome
 * navega para `fallbackUrl` (o APK). O app valida `source` (deeplink parser) e ignora o resto.
 */
export function androidIntentUrl(fallbackUrl: string, source = "recompensas"): string {
  return (
    `intent://open?source=${encodeURIComponent(source)}` +
    `#Intent;scheme=vertalnode;package=${VERTAL_NODE_ANDROID_PACKAGE};` +
    `S.browser_fallback_url=${encodeURIComponent(fallbackUrl)};end`
  );
}

export type ActivationTarget =
  | { kind: "android"; url: string }
  | { kind: "desktop"; url: string }
  | { kind: "desktop_unavailable" }
  | { kind: "unsupported"; platform: NodePlatform };

/** Para onde o botão leva depois do aceite. */
export function activationTarget(
  platform: NodePlatform,
  urls: { androidUrl: string; desktopUrl: string | null },
): ActivationTarget {
  if (platform === "android") return { kind: "android", url: androidIntentUrl(urls.androidUrl) };
  if (platform === "desktop") {
    return urls.desktopUrl ? { kind: "desktop", url: urls.desktopUrl } : { kind: "desktop_unavailable" };
  }
  return { kind: "unsupported", platform };
}
