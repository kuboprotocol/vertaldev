import * as Sentry from "@sentry/react";
import { redactForLog } from "../../supabase/functions/_shared/logRedact.ts";

// Anti-telemetria do Vertal Navigator: nada da tarefa, do cartão de aprovação
// (destinatário/assunto/corpo/loja/total) nem senha/código vai para o Sentry.
// Elementos do Navigator usam data-sentry-mask / o seletor abaixo; breadcrumbs de
// UI/console nesses elementos perdem o texto e toda string passa por redactForLog.
const NAVIGATOR_UI_RE = /navigator|approval|aprova|vertal-chat-input|data-sentry-mask/i;

/** Breadcrumb sem texto sensível (exportado para teste). */
export function scrubBreadcrumb<T extends { category?: string; message?: string; data?: Record<string, unknown> }>(b: T, hint?: { event?: unknown }): T | null {
  const category = String(b.category ?? "");
  const target = (hint?.event as { target?: { closest?: (sel: string) => unknown } } | undefined)?.target;
  if (category.startsWith("ui.") && typeof target?.closest === "function" && target.closest("[data-sentry-mask]")) {
    return { ...b, message: "[navigator]" };
  }
  if (category === "console") {
    // Console de qualquer tela pode citar a tarefa; guarda só a mensagem redigida, sem argumentos.
    return { ...b, message: b.message ? redactForLog(b.message, 200) : b.message, data: undefined };
  }
  if (category.startsWith("ui.") && b.message && NAVIGATOR_UI_RE.test(b.message)) {
    return { ...b, message: "[navigator]" };
  }
  if (b.message) b.message = redactForLog(b.message, 300);
  if (b.data && typeof b.data.url === "string") {
    try {
      const u = new URL(b.data.url, "https://vertal.dev");
      b.data.url = u.origin + u.pathname;
    } catch {
      b.data.url = "[url]";
    }
  }
  return b;
}

/** Evento sem texto sensível (mensagem, exceções, extras, corpo de request). */
interface ScrubbableEvent {
  message?: unknown;
  exception?: { values?: Array<{ value?: unknown }> };
  request?: {
    data?: unknown;
    cookies?: unknown;
    headers?: Record<string, string>;
    url?: string;
    query_string?: unknown;
  };
  extra?: Record<string, unknown>;
}

export function scrubEvent<T extends ScrubbableEvent>(event: T): T {
  if (typeof event.message === "string") event.message = redactForLog(event.message, 500);
  for (const ex of event.exception?.values ?? []) {
    if (typeof ex.value === "string") ex.value = redactForLog(ex.value, 500);
  }
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    if (event.request.headers) {
      for (const h of Object.keys(event.request.headers)) {
        if (/authorization|cookie|token|apikey/i.test(h)) delete event.request.headers[h];
      }
    }
    if (typeof event.request.url === "string") event.request.url = event.request.url.split(/[?#]/)[0];
    if (event.request.query_string) delete event.request.query_string;
  }
  if (event.extra) {
    for (const k of Object.keys(event.extra)) event.extra[k] = redactForLog(event.extra[k], 300);
  }
  return event;
}

// Release version (bumped per build). Falls back to a static tag when
// VITE_APP_VERSION is not injected. Correlates errors → release in Sentry.
export const APP_RELEASE =
  (import.meta.env.VITE_APP_VERSION as string | undefined) ||
  `kubovibe@${import.meta.env.MODE}-${new Date().toISOString().slice(0, 10)}`;

let initialized = false;

export function initSentry() {
  if (initialized) return;
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) {
    console.info("[Sentry] DSN not configured — skipping init");
    return;
  }
  try {
    Sentry.init({
      dsn,
      release: APP_RELEASE,
      environment: import.meta.env.MODE,
      // Breadcrumbs are enabled by default (console, fetch/xhr, navigation, dom).
      // We add a small default limit tweak so long sessions don't drop too early.
      maxBreadcrumbs: 100,
      integrations: [
        Sentry.browserTracingIntegration(),
        Sentry.breadcrumbsIntegration({
          console: true,
          dom: true,
          fetch: true,
          history: true,
          xhr: true,
        }),
      ],
      tracesSampleRate: 0.1,
      sendDefaultPii: false,
      // Avoid leaking PII: strip query strings from breadcrumb URLs, mask Navigator UI
      // and redact credentials/tokens from every message (scrubBreadcrumb/scrubEvent).
      beforeBreadcrumb(breadcrumb, hint) {
        return scrubBreadcrumb(breadcrumb, hint);
      },
      beforeSend(event) {
        return scrubEvent(event);
      },
    });
    initialized = true;
    Sentry.addBreadcrumb({ category: "app", message: "Sentry initialized", level: "info" });
    console.info("[Sentry] initialized", { release: APP_RELEASE });
  } catch (e) {
    console.error("[Sentry] init failed", e);
  }
}

export function setSentryUser(user: { id: string; email?: string | null } | null) {
  if (!initialized) return;
  Sentry.setUser(user ? { id: user.id, email: user.email ?? undefined } : null);
}

export function addBreadcrumb(
  message: string,
  category = "app",
  data?: Record<string, unknown>,
  level: Sentry.SeverityLevel = "info",
) {
  if (!initialized) return;
  Sentry.addBreadcrumb({ message, category, data, level });
}

export function captureBoundaryError(
  error: Error,
  info: { componentStack?: string | null; resource?: string; retryCount?: number; route?: string },
): string | undefined {
  if (!initialized) return undefined;
  return Sentry.withScope((scope) => {
    scope.setTag("boundary.resource", info.resource ?? "App");
    scope.setTag("boundary.retry", String(info.retryCount ?? 0));
    if (info.route) scope.setTag("route", info.route);
    scope.setContext("react", {
      componentStack: info.componentStack ?? "(none)",
    });
    scope.setLevel("fatal");
    return Sentry.captureException(error);
  });
}

export { Sentry };
