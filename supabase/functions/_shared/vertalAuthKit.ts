// Vertal Auth Kit — "Login com Google gerenciado pelo Vertal".
//
// Quando o app que o Dev cria no Vertal Code (Vibe Code) ou no Vertal Chat
// precisa de login, o Vertal oferece uma tela pronta: e-mail + senha e o botão
// do Google, sobre o Supabase Auth (o backend do próprio app ou o projeto de
// autenticação gerenciado pelo Vertal, quando configurado). Nada de edge
// function nova: os arquivos são gerados aqui, de forma determinística, e o
// vibe-code-agent os injeta na entrega do agente.
//
// Marca: por padrão aparece o logo do Vertal Dev. Se o Dev aceitar os termos de
// marca branca (checkbox explícito no Vertal Code), ele troca pelo logo dele e
// uma linha fixa em inglês passa a aparecer sempre embaixo do formulário
// (AUTH_KIT_FOOTER). O "G" do Google fica sempre no botão (regras de marca do
// Google).
//
// Puro (sem Deno/DOM): roda na edge function e no navegador (testes e UI).

/** Linha fixa da marca branca. Mude só aqui: o texto vai para todos os apps gerados daqui em diante. */
export const AUTH_KIT_FOOTER = "Protected by VERTAL CYBER SECURITY INFINITE — A VERTAL COMPANY company";

/** Versão dos termos de marca branca. Mudou o texto dos termos: suba a versão (aceites antigos deixam de valer). */
export const AUTH_KIT_TERMS_VERSION = "2026-11-23";

/** Resumo dos termos mostrado ao lado do checkbox (o aceite grava esta versão). */
export const AUTH_KIT_TERMS_TEXT =
  "Aceito os termos de marca branca do Vertal: posso usar o meu logo na tela de login gerenciada pelo Vertal, " +
  "e a linha \"" + AUTH_KIT_FOOTER + "\" fica sempre visível embaixo do formulário. " +
  "Remover ou esconder essa linha encerra a licença de marca branca deste app.";

/** Logo padrão (Vertal Dev, quadrado e otimizado), servido pelo próprio Vertal. */
export const AUTH_KIT_DEFAULT_LOGO_URL = "https://vertal.dev/brand/vertal-auth-logo.webp";
export const AUTH_KIT_DEFAULT_LOGO_ALT = "Vertal Dev";

/** Arquivos que o kit grava no app gerado (o agente não os escreve). */
export const AUTH_KIT_DIR = "src/vertal-auth";
export const AUTH_KIT_PATHS = {
  config: `${AUTH_KIT_DIR}/config.ts`,
  client: `${AUTH_KIT_DIR}/client.ts`,
  screen: `${AUTH_KIT_DIR}/VertalAuthScreen.tsx`,
} as const;

export const AUTH_KIT_LIMITS = { appNameChars: 60, logoUrlChars: 600 } as const;

export type AuthKitBranding = "vertal" | "white_label";

/** O que o cliente manda no corpo do vibe-code-agent (campo authKit). */
export interface AuthKitRequest {
  enabled?: boolean;
  appName?: string;
  branding?: AuthKitBranding;
  /** Logo do Dev (https), só vale com os termos aceitos. */
  logoUrl?: string;
  termsAccepted?: boolean;
  termsVersion?: string;
  acceptedAt?: string;
}

export interface AuthKitOptions {
  appName: string;
  branding: AuthKitBranding;
  logoUrl: string;
  logoAlt: string;
  /** null no modo Vertal; AUTH_KIT_FOOTER na marca branca. */
  footer: string | null;
  termsVersion: string | null;
  acceptedAt: string | null;
}

/** Projeto de autenticação gerenciado pelo Vertal (só valores públicos). */
export interface AuthKitManaged {
  url: string;
  publishableKey: string;
}

export type AuthKitParse =
  | { enabled: false }
  | { enabled: true; options: AuthKitOptions; warnings: string[] };

const clean = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/[\p{Cc}<>`$\\]/gu, "").replace(/\s+/g, " ").trim().slice(0, max) : "";

/** Só https público, sem credenciais na URL. */
export function isSafeLogoUrl(raw: unknown): raw is string {
  if (typeof raw !== "string" || raw.length > AUTH_KIT_LIMITS.logoUrlChars) return false;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username || u.password) return false;
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".local") || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":")) return false;
    return /["'<>\s`\\]/.test(raw) === false;
  } catch {
    return false;
  }
}

/**
 * Valida o pedido do cliente. Marca branca só com checkbox marcado, termos da
 * versão atual e logo https; faltando algo, cai no logo do Vertal com aviso.
 */
export function parseAuthKitRequest(raw: unknown, fallbackAppName = "Meu app"): AuthKitParse {
  if (raw === true) raw = { enabled: true };
  if (!raw || typeof raw !== "object") return { enabled: false };
  const r = raw as Record<string, unknown>;
  if (r.enabled !== true) return { enabled: false };
  const warnings: string[] = [];
  const appName = clean(r.appName, AUTH_KIT_LIMITS.appNameChars) || clean(fallbackAppName, AUTH_KIT_LIMITS.appNameChars) || "Meu app";
  const vertal: AuthKitOptions = {
    appName,
    branding: "vertal",
    logoUrl: AUTH_KIT_DEFAULT_LOGO_URL,
    logoAlt: AUTH_KIT_DEFAULT_LOGO_ALT,
    footer: null,
    termsVersion: null,
    acceptedAt: null,
  };
  if (r.branding !== "white_label") return { enabled: true, options: vertal, warnings };
  if (r.termsAccepted !== true || r.termsVersion !== AUTH_KIT_TERMS_VERSION) {
    warnings.push("Marca branca exige aceitar os termos atuais; mantive o logo do Vertal.");
    return { enabled: true, options: vertal, warnings };
  }
  if (!isSafeLogoUrl(r.logoUrl)) {
    warnings.push("Logo inválido (precisa ser um link https); mantive o logo do Vertal.");
    return { enabled: true, options: vertal, warnings };
  }
  const acceptedAt = typeof r.acceptedAt === "string" && !Number.isNaN(Date.parse(r.acceptedAt))
    ? new Date(r.acceptedAt).toISOString()
    : null;
  return {
    enabled: true,
    warnings,
    options: {
      appName,
      branding: "white_label",
      logoUrl: r.logoUrl,
      logoAlt: appName,
      footer: AUTH_KIT_FOOTER,
      termsVersion: AUTH_KIT_TERMS_VERSION,
      acceptedAt,
    },
  };
}

/**
 * Projeto gerenciado (secrets VERTAL_AUTH_SUPABASE_URL e
 * VERTAL_AUTH_SUPABASE_PUBLISHABLE_KEY). Só aceita chave pública: nunca uma
 * secret/service_role, mesmo que alguém configure errado.
 */
export function resolveManagedAuth(url: unknown, key: unknown): AuthKitManaged | null {
  if (typeof url !== "string" || typeof key !== "string") return null;
  const u = url.trim().replace(/\/+$/, "");
  const k = key.trim();
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(u)) return null;
  if (!isPublicSupabaseKey(k)) return null;
  return { url: u, publishableKey: k };
}

export function isPublicSupabaseKey(key: string): boolean {
  if (/^sb_publishable_[A-Za-z0-9_-]{10,}$/.test(key)) return true;
  if (/^sb_secret_/.test(key)) return false;
  const parts = key.split(".");
  if (parts.length !== 3) return false;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)));
    return payload?.role === "anon";
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Detecção e prompts
// ---------------------------------------------------------------------------

const AUTH_RE =
  /(?<![\p{L}\d])(login|log[- ]?in|logar|sign[- ]?(?:in|up)|cadastr\p{L}*|autentica\p{L}*|auth(?![\p{L}\d])|entrar com (?:o )?google|conta de usu[aá]rio|[aá]rea (?:logada|do cliente|restrita|de membros)|senha|oauth)/iu;

/** O pedido fala de login/cadastro/área logada? */
export function wantsAuthKit(texts: string | Array<string | { content?: unknown }>): boolean {
  const list = typeof texts === "string" ? [texts] : texts;
  return list.some((t) => {
    const s = typeof t === "string" ? t : typeof t?.content === "string" ? t.content : "";
    return AUTH_RE.test(s);
  });
}

/** Bloco do system prompt do Vibe Code quando o kit está ligado. */
export function formatAuthKitForPrompt(opts: AuthKitOptions): string {
  return `\n\nLogin com Google gerenciado pelo Vertal (LIGADO neste pedido):
- O Vertal grava sozinho ${AUTH_KIT_PATHS.config}, ${AUTH_KIT_PATHS.client} e ${AUTH_KIT_PATHS.screen}. NÃO escreva nem altere esses arquivos.
- Use: import { VertalAuthGate } from "./vertal-auth/VertalAuthScreen" (ajuste o caminho relativo) e envolva as telas que exigem login: <VertalAuthGate>{app}</VertalAuthGate>. Sair: import { signOut, useVertalSession } from "./vertal-auth/client".
- Garanta "@supabase/supabase-js" nas dependencies do package.json. Variáveis: VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (públicas).
- Não crie outra tela de login, não remova o logo nem ${opts.footer ? "a linha \"Protected by…\" do rodapé" : "o botão do Google"}.`;
}

/** Bloco do system prompt quando o pedido fala de login e o kit está desligado: o agente oferece. */
export const AUTH_KIT_OFFER_PROMPT = `\n\nLogin: se este app precisa de login, diga em "message" que o Dev pode ligar "Login com Google gerenciado pelo Vertal" (tela pronta com e-mail, senha e Google, sem configurar OAuth) no botão Login Vertal acima do chat. Se ele preferir sem, siga normalmente.`;

// ---------------------------------------------------------------------------
// Arquivos gerados no app
// ---------------------------------------------------------------------------

export interface AuthKitFile {
  path: string;
  content: string;
  reason: string;
}

const HEADER = "// Gerado pelo Vertal Dev (Login com Google gerenciado pelo Vertal). O Vertal regrava este arquivo.";

/** Ícone "G" oficial do Google (4 cores), obrigatório no botão. */
const GOOGLE_G_SVG = `<svg aria-hidden="true" viewBox="0 0 48 48" className="h-5 w-5 shrink-0">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
          </svg>`;

export function buildAuthKitFiles(opts: AuthKitOptions, managed: AuthKitManaged | null = null): AuthKitFile[] {
  const s = (v: string | null) => JSON.stringify(v);
  const config = `${HEADER}
// Marca: ${opts.branding === "white_label" ? "marca branca (termos " + opts.termsVersion + ")" : "Vertal Dev"}.

export const VERTAL_AUTH_CONFIG = {
  appName: ${s(opts.appName)},
  branding: ${s(opts.branding)},
  logoUrl: ${s(opts.logoUrl)},
  logoAlt: ${s(opts.logoAlt)},
  /** Linha fixa da marca branca (null no modo Vertal). */
  footer: ${s(opts.footer)},
  termsVersion: ${s(opts.termsVersion)},
  acceptedAt: ${s(opts.acceptedAt)},
  /** Supabase Auth do app (variáveis públicas)${managed ? "; sem elas, o projeto gerenciado pelo Vertal" : ""}. */
  supabaseUrl: (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? ${s(managed?.url ?? "")},
  supabaseAnonKey: (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? ${s(managed?.publishableKey ?? "")},
} as const;

export const VERTAL_AUTH_LABELS = {
  title: "Entrar",
  signUpTitle: "Criar conta",
  subtitle: "Acesse sua conta para continuar",
  email: "E-mail",
  password: "Senha",
  submit: "Entrar",
  signUpSubmit: "Criar conta",
  google: "Continuar com o Google",
  divider: "ou",
  toSignUp: "Não tem conta? Criar conta",
  toSignIn: "Já tem conta? Entrar",
  checkEmail: "Enviamos um link de confirmação para o seu e-mail.",
  notConfigured: "O login ainda não foi configurado: defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.",
  genericError: "Não foi possível entrar. Confira os dados e tente de novo.",
} as const;
`;

  const client = `${HEADER}
import { createClient, type Session, type SupabaseClient, type User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { VERTAL_AUTH_CONFIG, VERTAL_AUTH_LABELS } from "./config";

export const vertalAuthConfigured = Boolean(VERTAL_AUTH_CONFIG.supabaseUrl && VERTAL_AUTH_CONFIG.supabaseAnonKey);

export const vertalAuth: SupabaseClient | null = vertalAuthConfigured
  ? createClient(VERTAL_AUTH_CONFIG.supabaseUrl, VERTAL_AUTH_CONFIG.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

export type AuthResult = { ok: true; needsConfirmation?: boolean } | { ok: false; error: string };

function requireClient(): SupabaseClient {
  if (!vertalAuth) throw new Error(VERTAL_AUTH_LABELS.notConfigured);
  return vertalAuth;
}

function failure(e: unknown): AuthResult {
  const message = e instanceof Error && e.message ? e.message : VERTAL_AUTH_LABELS.genericError;
  return { ok: false, error: message };
}

export async function signInWithEmail(email: string, password: string): Promise<AuthResult> {
  try {
    const { error } = await requireClient().auth.signInWithPassword({ email: email.trim(), password });
    return error ? failure(error) : { ok: true };
  } catch (e) {
    return failure(e);
  }
}

export async function signUpWithEmail(email: string, password: string): Promise<AuthResult> {
  try {
    const { data, error } = await requireClient().auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) return failure(error);
    return { ok: true, needsConfirmation: !data.session };
  } catch (e) {
    return failure(e);
  }
}

export async function signInWithGoogle(): Promise<AuthResult> {
  try {
    const { error } = await requireClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
    return error ? failure(error) : { ok: true };
  } catch (e) {
    return failure(e);
  }
}

export async function signOut(): Promise<void> {
  if (vertalAuth) await vertalAuth.auth.signOut();
}

export function useVertalSession(): { session: Session | null; user: User | null; loading: boolean } {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(vertalAuthConfigured);
  useEffect(() => {
    if (!vertalAuth) return;
    let alive = true;
    void vertalAuth.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = vertalAuth.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);
  return { session, user: session?.user ?? null, loading };
}
`;

  const screen = `${HEADER}
import { useState, type FormEvent, type ReactNode } from "react";
import { VERTAL_AUTH_CONFIG, VERTAL_AUTH_LABELS } from "./config";
import { signInWithEmail, signInWithGoogle, signUpWithEmail, useVertalSession, vertalAuthConfigured } from "./client";

export function VertalAuthScreen() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const L = VERTAL_AUTH_LABELS;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    const res = mode === "signin" ? await signInWithEmail(email, password) : await signUpWithEmail(email, password);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else if (res.needsConfirmation) setInfo(L.checkEmail);
  };

  const google = async () => {
    setBusy(true);
    setError(null);
    const res = await signInWithGoogle();
    if (!res.ok) {
      setBusy(false);
      setError(res.error);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-slate-100">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur">
          <div className="mb-6 flex flex-col items-center text-center">
            <img alt={VERTAL_AUTH_CONFIG.logoAlt} src={VERTAL_AUTH_CONFIG.logoUrl}
              width={72}
              height={72}
              className="h-[72px] w-[72px] rounded-xl object-contain"
            />
            <h1 className="mt-4 text-xl font-semibold">{mode === "signin" ? L.title : L.signUpTitle}</h1>
            <p className="mt-1 text-sm text-slate-400">{VERTAL_AUTH_CONFIG.appName} · {L.subtitle}</p>
          </div>

          {!vertalAuthConfigured && (
            <p role="alert" className="mb-4 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-200">
              {L.notConfigured}
            </p>
          )}

          <button
            type="button"
            onClick={() => void google()}
            disabled={busy || !vertalAuthConfigured}
            className="flex w-full items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-60"
          >
          ${GOOGLE_G_SVG}
            <span>{L.google}</span>
          </button>

          <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-wide text-slate-500">
            <span className="h-px flex-1 bg-white/10" />
            {L.divider}
            <span className="h-px flex-1 bg-white/10" />
          </div>

          <form onSubmit={(e) => void submit(e)} className="space-y-3">
            <label htmlFor="vertal-auth-email" className="block text-sm">
              <span className="mb-1 block text-slate-300">{L.email}</span>
              <input
                id="vertal-auth-email"
                aria-label={L.email}
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
              />
            </label>
            <label htmlFor="vertal-auth-password" className="block text-sm">
              <span className="mb-1 block text-slate-300">{L.password}</span>
              <input
                id="vertal-auth-password"
                aria-label={L.password}
                type="password"
                required
                minLength={6}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
              />
            </label>
            {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
            {info && <p role="status" className="text-sm text-emerald-400">{info}</p>}
            <button
              type="submit"
              disabled={busy || !vertalAuthConfigured}
              className="w-full rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 disabled:opacity-60"
            >
              {mode === "signin" ? L.submit : L.signUpSubmit}
            </button>
          </form>

          <button
            type="button"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="mt-4 w-full text-center text-sm text-slate-400 hover:text-slate-200"
          >
            {mode === "signin" ? L.toSignUp : L.toSignIn}
          </button>
        </div>
        {VERTAL_AUTH_CONFIG.footer && (
          <p data-vertal-auth-footer className="mt-4 text-center text-xs text-slate-500">{VERTAL_AUTH_CONFIG.footer}</p>
        )}
      </div>
    </main>
  );
}

/** Mostra a tela de login até haver sessão; depois, o app. */
export function VertalAuthGate({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  const { session, loading } = useVertalSession();
  if (loading) return <>{fallback ?? null}</>;
  if (!session) return <VertalAuthScreen />;
  return <>{children}</>;
}
`;

  return [
    { path: AUTH_KIT_PATHS.config, content: config, reason: "Login Vertal: marca, textos e Supabase Auth" },
    { path: AUTH_KIT_PATHS.client, content: client, reason: "Login Vertal: e-mail/senha, Google e sessão" },
    { path: AUTH_KIT_PATHS.screen, content: screen, reason: "Login Vertal: tela pronta e VertalAuthGate" },
  ];
}

/** Paths do kit: o agente não pode sobrescrevê-los. */
export function isAuthKitPath(path: string): boolean {
  return (Object.values(AUTH_KIT_PATHS) as string[]).includes(path);
}
