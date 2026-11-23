import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  AUTH_KIT_DEFAULT_LOGO_URL,
  AUTH_KIT_FOOTER,
  AUTH_KIT_PATHS,
  AUTH_KIT_TERMS_VERSION,
  authKitRequestFromPrefs,
  buildAuthKitFiles,
  formatAuthKitForPrompt,
  isAuthKitPath,
  isSafeLogoUrl,
  loadAuthKitPrefs,
  parseAuthKitRequest,
  resolveManagedAuth,
  saveAuthKitPrefs,
  wantsAuthKit,
  type AuthKitOptions,
} from "@/lib/vertalAuthKit";
import { lintGeneratedFile } from "../../supabase/functions/_shared/vibeAgentCore";
import { auditGeneratedCode } from "../../supabase/functions/_shared/designIntelligence";
import {
  AGENT_PROMPT_BUDGET,
  AUTH_KIT_RULES,
  buildAgentSystemPrompt,
  parseVibeCodeAction,
} from "../../supabase/functions/_shared/chatAgent";
import { vibeCodeRequestBody } from "@/lib/chatAgent/vibeBridge";

const LOGO = "https://abc.supabase.co/storage/v1/object/public/uploads/u1/1_logo.png";
const white = { enabled: true, branding: "white_label", logoUrl: LOGO, termsAccepted: true, termsVersion: AUTH_KIT_TERMS_VERSION, appName: "Loja da Ana" };

function opts(raw: unknown): AuthKitOptions {
  const p = parseAuthKitRequest(raw);
  if (!p.enabled) throw new Error("kit desligado");
  return p.options;
}

const jwt = (payload: object) => `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify(payload)).replace(/=+$/, "")}.sig`;

describe("Vertal Auth Kit — pedido", () => {
  it("rodapé fixo em inglês num único lugar", () => {
    expect(AUTH_KIT_FOOTER).toBe("Protected by VERTAL CYBER SECURITY INFINITE — A VERTAL COMPANY company");
  });

  it("desligado sem enabled:true; true vira o padrão Vertal", () => {
    expect(parseAuthKitRequest(undefined).enabled).toBe(false);
    expect(parseAuthKitRequest({ enabled: "yes" }).enabled).toBe(false);
    const o = opts(true);
    expect(o).toMatchObject({ branding: "vertal", logoUrl: AUTH_KIT_DEFAULT_LOGO_URL, footer: null, appName: "Meu app" });
  });

  it("marca branca só com checkbox, versão atual dos termos e logo https", () => {
    const noTerms = parseAuthKitRequest({ ...white, termsAccepted: false });
    expect(noTerms.enabled && noTerms.options.branding).toBe("vertal");
    expect(noTerms.enabled && noTerms.warnings[0]).toMatch(/termos/);
    const oldTerms = parseAuthKitRequest({ ...white, termsVersion: "2020-01-01" });
    expect(oldTerms.enabled && oldTerms.options.branding).toBe("vertal");
    for (const bad of ["http://x.com/a.png", "javascript:alert(1)", "https://localhost/a.png", "https://u:p@x.com/a.png", 'https://x.com/a.png"onerror="x']) {
      const r = parseAuthKitRequest({ ...white, logoUrl: bad });
      expect(r.enabled && r.options.branding).toBe("vertal");
      expect(isSafeLogoUrl(bad)).toBe(false);
    }
    const ok = opts(white);
    expect(ok).toMatchObject({ branding: "white_label", logoUrl: LOGO, footer: AUTH_KIT_FOOTER, termsVersion: AUTH_KIT_TERMS_VERSION, appName: "Loja da Ana" });
  });

  it("nome do app é limpo e limitado", () => {
    const o = opts({ enabled: true, appName: '  "><script>${x}`\n'.repeat(10) });
    expect(o.appName).not.toMatch(/[<>`$]/);
    expect(o.appName.length).toBeLessThanOrEqual(60);
  });

  it("projeto gerenciado só aceita chave pública", () => {
    expect(resolveManagedAuth("https://auth.vertal.dev/", "sb_publishable_abcdefghijkl")).toEqual({ url: "https://auth.vertal.dev", publishableKey: "sb_publishable_abcdefghijkl" });
    expect(resolveManagedAuth("https://x.supabase.co", jwt({ role: "anon" }))).not.toBeNull();
    expect(resolveManagedAuth("https://x.supabase.co", jwt({ role: "service_role" }))).toBeNull();
    expect(resolveManagedAuth("https://x.supabase.co", "sb_secret_abcdefghijkl")).toBeNull();
    expect(resolveManagedAuth("http://x.supabase.co", "sb_publishable_abcdefghijkl")).toBeNull();
    expect(resolveManagedAuth(undefined, undefined)).toBeNull();
  });

  it("detecta pedidos com login", () => {
    expect(wantsAuthKit("crie um app de tarefas com login e cadastro")).toBe(true);
    expect(wantsAuthKit([{ content: "quero área do cliente" }])).toBe(true);
    expect(wantsAuthKit("uma landing page de padaria")).toBe(false);
  });
});

describe("Vertal Auth Kit — arquivos gerados", () => {
  const vertalFiles = buildAuthKitFiles(opts(true));
  const whiteFiles = buildAuthKitFiles(opts(white), { url: "https://auth.vertal.dev", publishableKey: "sb_publishable_abcdefghijkl" });

  it("grava os 3 arquivos do kit, protegidos contra o agente", () => {
    expect(vertalFiles.map((f) => f.path)).toEqual([AUTH_KIT_PATHS.config, AUTH_KIT_PATHS.client, AUTH_KIT_PATHS.screen]);
    for (const f of vertalFiles) expect(isAuthKitPath(f.path)).toBe(true);
    expect(isAuthKitPath("src/App.tsx")).toBe(false);
  });

  it("passa na auto-revisão e na auditoria de design (sem bloqueador)", () => {
    for (const f of [...vertalFiles, ...whiteFiles]) expect(lintGeneratedFile(f.path, f.content)).toEqual([]);
    const audit = auditGeneratedCode(whiteFiles.map((f) => ({ path: f.path, content: f.content })));
    expect(audit.blockers).toBe(0);
  });

  it("compila como TSX (sem erro de sintaxe)", () => {
    for (const f of [...vertalFiles, ...whiteFiles]) {
      const out = ts.transpileModule(f.content, {
        fileName: f.path,
        reportDiagnostics: true,
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
      });
      expect(out.diagnostics ?? []).toEqual([]);
    }
  });

  it("modo Vertal: logo do Vertal Dev e sem rodapé; marca branca: logo do Dev e rodapé fixo", () => {
    const vc = vertalFiles[0].content;
    expect(vc).toContain(JSON.stringify(AUTH_KIT_DEFAULT_LOGO_URL));
    expect(vc).toContain("footer: null");
    const wc = whiteFiles[0].content;
    expect(wc).toContain(JSON.stringify(LOGO));
    expect(wc).toContain(`footer: ${JSON.stringify(AUTH_KIT_FOOTER)}`);
    expect(wc).toContain("sb_publishable_abcdefghijkl");
    expect(whiteFiles[2].content).toContain("VERTAL_AUTH_CONFIG.footer");
  });

  it("botão do Google com o G oficial, e-mail+senha e Google OAuth do Supabase", () => {
    const screen = vertalFiles[2].content;
    for (const color of ["#EA4335", "#4285F4", "#FBBC05", "#34A853"]) expect(screen).toContain(color);
    expect(screen).toContain('type="password"');
    const client = vertalFiles[1].content;
    expect(client).toContain('provider: "google"');
    expect(client).toContain("signInWithPassword");
    expect(client).toContain("signUp(");
    expect(client).not.toMatch(/service_role|sb_secret_/);
  });

  it("o prompt do agente manda usar o VertalAuthGate e não reescrever o kit", () => {
    const p = formatAuthKitForPrompt(opts(white));
    expect(p).toContain("VertalAuthGate");
    expect(p).toContain(AUTH_KIT_PATHS.screen);
    expect(p).toContain("@supabase/supabase-js");
  });
});

describe("Vertal Auth Kit — Vertal Chat", () => {
  it("a oferta só entra no prompt quando a conversa fala de login, e cabe no orçamento", () => {
    expect(buildAgentSystemPrompt({ secretNames: [] })).not.toContain(AUTH_KIT_RULES);
    const on = buildAgentSystemPrompt({ secretNames: [], authKit: true, github: true, localNow: "agora", memories: "x".repeat(1_200), summary: "z".repeat(1_200) });
    expect(on).toContain("Login com Google gerenciado pelo Vertal");
    expect(on.length).toBeLessThanOrEqual(AGENT_PROMPT_BUDGET);
  });

  it("vibe_code com auth_kit:true liga o kit com o logo do Vertal (marca branca nunca pelo chat)", () => {
    const a = parseVibeCodeAction({ tool: "vibe_code", op: "start", prompt: "app de agenda com login", auth_kit: true });
    expect(a).toMatchObject({ authKit: true });
    expect(vibeCodeRequestBody(a!)).toMatchObject({ authKit: { enabled: true, branding: "vertal" }, mode: "preview" });
    const ask = parseVibeCodeAction({ tool: "vibe_code", op: "ask", prompt: "tem login?", auth_kit: true });
    expect(ask?.authKit).toBeUndefined();
    const plain = parseVibeCodeAction({ tool: "vibe_code", op: "start", prompt: "app de agenda" });
    expect(vibeCodeRequestBody(plain!)).not.toHaveProperty("authKit");
  });
});

describe("Vertal Auth Kit — preferência do Dev", () => {
  it("marca branca só com termos aceitos E logo enviado", () => {
    expect(authKitRequestFromPrefs({ enabled: false, appName: "", termsAccepted: true, logoUrl: LOGO })).toBeUndefined();
    expect(authKitRequestFromPrefs({ enabled: true, appName: "X", termsAccepted: true })).toMatchObject({ branding: "vertal" });
    expect(authKitRequestFromPrefs({ enabled: true, appName: "X", termsAccepted: false, logoUrl: LOGO })).toMatchObject({ branding: "vertal" });
    const req = authKitRequestFromPrefs({ enabled: true, appName: "X", termsAccepted: true, termsVersion: AUTH_KIT_TERMS_VERSION, logoUrl: LOGO });
    expect(req).toMatchObject({ branding: "white_label", termsAccepted: true, termsVersion: AUTH_KIT_TERMS_VERSION, logoUrl: LOGO });
    expect(opts(req).footer).toBe(AUTH_KIT_FOOTER);
  });

  it("salva por projeto e descarta aceite de termos de versão antiga", () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    saveAuthKitPrefs("p1", { enabled: true, appName: "A", termsAccepted: true, termsVersion: AUTH_KIT_TERMS_VERSION, logoUrl: LOGO }, storage);
    expect(loadAuthKitPrefs("p1", storage)).toMatchObject({ enabled: true, termsAccepted: true, logoUrl: LOGO });
    expect(loadAuthKitPrefs("p2", storage).enabled).toBe(false);
    mem.set("vertal-auth-kit:p3", JSON.stringify({ enabled: true, termsAccepted: true, termsVersion: "old", logoUrl: LOGO }));
    expect(loadAuthKitPrefs("p3", storage)).toMatchObject({ enabled: true, termsAccepted: false });
  });
});
