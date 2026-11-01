import { describe, expect, it } from "vitest";
import {
  ANTI_PATTERNS,
  auditGeneratedCode,
  buildDesignPrompt,
  buildFixPrompt,
  detectSurface,
  formatAuditSummary,
  resolveDesignConfig,
  SURFACE_PROFILES,
} from "./designIntelligence";

describe("detectSurface", () => {
  it("detecta dashboard SaaS", () => expect(detectSurface("Crie um dashboard de métricas de vendas")).toBe("saas_dashboard"));
  it("detecta app mobile", () => expect(detectSurface("app Flutter de delivery para iPhone e Android")).toBe("mobile_app"));
  it("detecta landing page", () => expect(detectSurface("faça uma landing page com lista de espera")).toBe("landing_page"));
  it("cai em web_app por padrão", () => expect(detectSurface("um gerenciador de tarefas")).toBe("web_app"));
});

describe("resolveDesignConfig", () => {
  it("vem ligado por padrão", () => {
    expect(resolveDesignConfig({ prompt: "dashboard" })).toEqual({ enabled: true, surface: "saas_dashboard", surfaceSource: "detected" });
  });
  it("secret DESIGN_INTELLIGENCE=off desliga (rollback)", () => {
    expect(resolveDesignConfig({ prompt: "x", envFlag: "off" }).enabled).toBe(false);
    expect(resolveDesignConfig({ prompt: "x", envFlag: "OFF", requestEnabled: true }).enabled).toBe(false);
  });
  it("pedido pode desligar e escolher o perfil", () => {
    expect(resolveDesignConfig({ prompt: "x", requestEnabled: false }).enabled).toBe(false);
    expect(resolveDesignConfig({ prompt: "dashboard", requestSurface: "landing_page" })).toMatchObject({
      surface: "landing_page",
      surfaceSource: "explicit",
    });
  });
  it("ignora perfil inválido", () => {
    expect(resolveDesignConfig({ prompt: "x", requestSurface: "banana" }).surfaceSource).toBe("detected");
  });
});

describe("buildDesignPrompt", () => {
  it("inclui perfil, tokens, anti-padrões e checklist", () => {
    for (const surface of Object.keys(SURFACE_PROFILES) as Array<keyof typeof SURFACE_PROFILES>) {
      const p = buildDesignPrompt(surface, { target: "react" });
      expect(p).toContain(SURFACE_PROFILES[surface].label);
      expect(p).toContain("44×44px");
      expect(p).toContain(ANTI_PATTERNS[0]);
      expect(p).toContain("Checklist");
    }
  });
  it("proíbe uso de marca/assets da Apple", () => {
    expect(buildDesignPrompt("web_app", { target: "html" })).toMatch(/nunca use logo, nome, fontes proprietárias/);
  });
  it("cabe num orçamento razoável de contexto", () => {
    expect(buildDesignPrompt("saas_dashboard", { target: "react" }).length).toBeLessThan(7000);
  });
});

describe("auditGeneratedCode", () => {
  const good = `export function Card() {
  return (
    <section className="rounded-2xl bg-card p-6 text-foreground motion-safe:animate-in">
      <img src="/hero.png" alt="Painel de vendas" />
      <label htmlFor="email">E-mail</label>
      <input id="email" type="email" className="text-base" />
      <button type="button" aria-label="Fechar"><X /></button>
      <button className="focus-visible:ring-2 outline-none">Salvar</button>
    </section>
  );
}`;

  it("código bom passa sem bloqueadores", () => {
    const r = auditGeneratedCode([{ path: "src/components/Card.tsx", content: good }]);
    expect(r.blockers).toBe(0);
    expect(r.score).toBeGreaterThanOrEqual(90);
  });

  it("aponta os problemas clássicos", () => {
    const bad = `<div onClick={go} className="text-gray-300 text-[10px] outline-none">
  <img src="/a.png">
  <button><Trash2 /></button>
  <input placeholder="Email" className="text-sm" />
  <span className="font-['SF Pro Display']">x</span>
</div>`;
    const r = auditGeneratedCode([{ path: "src/pages/Bad.tsx", content: bad }]);
    const rules = new Set(r.findings.map((f) => f.rule));
    for (const id of ["clickable-div", "low-contrast-gray", "tiny-text", "focus-outline-removed", "img-alt", "icon-button-label", "input-label", "small-input-font", "apple-brand-asset"]) {
      expect(rules, id).toContain(id);
    }
    expect(r.score).toBeLessThan(50);
    expect(formatAuditSummary(r)).toMatch(/bloqueador/);
    expect(buildFixPrompt(r)).toContain("[img-alt]");
  });

  it("valida documento HTML (lang, viewport, zoom)", () => {
    const html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, user-scalable=no"></head><body></body></html>`;
    const rules = auditGeneratedCode([{ path: "index.html", content: html }]).findings.map((f) => f.rule);
    expect(rules).toContain("html-lang");
    expect(rules).toContain("zoom-disabled");
    const noViewport = auditGeneratedCode([{ path: "a.html", content: `<!DOCTYPE html><html lang="pt-BR"></html>` }]);
    expect(noViewport.findings.map((f) => f.rule)).toContain("viewport-meta");
  });

  it("ignora arquivos que não são de UI", () => {
    const r = auditGeneratedCode([{ path: "supabase/functions/x/index.ts", content: '<img src="a">' }]);
    expect(r.checkedFiles).toBe(0);
    expect(formatAuditSummary(r)).toMatch(/Nenhum arquivo/);
  });
});
