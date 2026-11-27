import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { ErrorBoundary } from "./components/ErrorBoundary";

import { assertFrontendEnv } from "./lib/envCheck";
import { toast } from "sonner";
import { clearTelemetry, getTelemetryEvents, saveTelemetryEvent } from "./utils/pwaTelemetry";
import { installRuntimeReporter, reportRuntime } from "./lib/runtimeReporter";
import { initSentry, addBreadcrumb } from "./lib/sentry";
import { redirectNativeToMobileClient } from "./lib/nativeEntry";
import { installServiceWorkerAutoReload } from "./lib/swAutoReload";
// vertal.js (Vertal DePIN): só com VITE_VERTAL_JS_SRC + VITE_VERTAL_APP_ID e aceite do Vertal Node.
import { startVertalJs } from "./lib/vertal-js";
// vertal.dev/embed: página mínima que qualquer site pode emoldurar (worker/embedPolicy.ts).
import EmbedRoot from "./embed/app/EmbedRoot";
import { EMBED_HANDOFF_KEY, isEmbedPath } from "./lib/embedAuth";

const IS_EMBED = isEmbedPath(window.location.pathname);

// Install error beacons FIRST so we catch errors thrown during boot.
initSentry();
installRuntimeReporter();
addBreadcrumb("boot", "app", { at: new Date().toISOString() });
redirectNativeToMobileClient();
installServiceWorkerAutoReload();

try {
  assertFrontendEnv();
} catch (e) {
  reportRuntime({ severity: "fatal", message: `envCheck failed: ${(e as Error).message}`, stack: (e as Error).stack });
  throw e;
}

// Intercept fetch calls to mock the telemetry API endpoint
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  const [resource, config] = args;
  const url = typeof resource === 'string' ? resource : resource instanceof URL ? resource.href : resource.url;

  if (url.includes('/api/pwa/telemetry')) {
    const { supabase } = await import("./integrations/supabase/client");
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const events = getTelemetryEvents();
    
    if (config?.method === 'DELETE') {
      clearTelemetry();
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }

    return new Response(JSON.stringify(events), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  return originalFetch(...args);
};



const MUTE_LS_KEY = 'kubo:pwa:mute_toasts';
let ignorePwaToasts = (() => { try { return localStorage.getItem(MUTE_LS_KEY) === 'true'; } catch { return false; } })();

// Listen for PWA asset fallback events
if (typeof window !== 'undefined') {
  window.addEventListener('pwa:asset-fallback', (e: any) => {
    const { type, url } = e.detail;
    
    // Telemetry update
    const category = type === 'image' ? (url?.endsWith('.svg') ? 'svg' : 'image') : (type === 'font' ? 'font' : 'other');
    saveTelemetryEvent({ type: category, url: url || 'unknown' });
    
    console.log(`[PWA Telemetry] Fallback triggered: ${category}`, { url });

    if (ignorePwaToasts) return;

    toast.info(`Offline Mode: Asset (${type}) replaced`, {
      description: `Usando placeholder para: ${url?.split('/').pop()}`,
      duration: 5000,
      id: `pwa-fallback-${type}`, 
      action: {
        label: "Silenciar",
        onClick: () => {
          ignorePwaToasts = true;
          localStorage.setItem(MUTE_LS_KEY, 'true');
          toast.dismiss();
          toast.success("Avisos offline silenciados.");
        }
      },
    });
  });
  
  window.addEventListener('error', (e: ErrorEvent) => {
    const target = e.target as HTMLElement;
    const url = (target as any).src || (target as any).srcset || (target as any).href;
    
    if (target instanceof HTMLImageElement || target instanceof HTMLSourceElement) {
      window.dispatchEvent(new CustomEvent('pwa:asset-fallback', {
        detail: { type: 'image', url }
      }));
    } else if (target instanceof HTMLLinkElement && target.rel === 'stylesheet') {
      window.dispatchEvent(new CustomEvent('pwa:asset-fallback', {
        detail: { type: 'font', url }
      }));
    }
  }, true);
}

// Blocked storage inside a frame: index.html already shows "Open in Vertal Dev".
if (!(window as { __VERTAL_EMBED_BLOCKED__?: boolean }).__VERTAL_EMBED_BLOCKED__) createRoot(document.getElementById("root")!).render(
  <ErrorBoundary global resourceName="Root">
    {IS_EMBED ? <EmbedRoot /> : <App />}
  </ErrorBoundary>
);

// vertal.js (DePIN) never runs inside the embed on other people's sites.
if (!IS_EMBED) startVertalJs();

// Embed sign-in popup: if the sign-in provider sent this tab to another page
// (e.g. /dashboard), bring it back to /embed/login to finish the handoff.
if (!IS_EMBED && window.opener) {
  let pending: string | null = null;
  try { pending = sessionStorage.getItem(EMBED_HANDOFF_KEY); } catch { /* ignore */ }
  if (pending && /^[A-Za-z0-9_-]{16,128}$/.test(pending)) {
    void import("./integrations/supabase/client").then(({ supabase }) => {
      const go = () => window.location.replace(`/embed/login?nonce=${pending}`);
      supabase.auth.getSession().then(({ data }) => { if (data.session) go(); });
      supabase.auth.onAuthStateChange((_e, session) => { if (session) go(); });
    });
  }
}
