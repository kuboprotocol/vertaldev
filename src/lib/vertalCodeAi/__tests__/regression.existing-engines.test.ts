// Regressão: o VERTAL Code AI é aditivo. Estes testes congelam (snapshot) a
// saída atual dos motores que já existiam — jogos (blueprint + qualidade),
// código (núcleo do vibe-code-agent) e design (Vertal Design Intelligence) —
// para que nenhuma mudança deste trabalho altere o comportamento deles.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildBlueprintPrompt, isUsableBlueprint, mergeBlueprintIntoConfig } from "@/components/builder/gameBlueprint";
import { validateBlueprint } from "@/components/builder/blueprintQuality";
import {
  auditGeneratedCode,
  buildDesignPrompt,
  buildFixPrompt,
  detectSurface,
  formatAuditSummary,
  resolveDesignConfig,
  SURFACE_PROFILES,
  type DesignSurface,
} from "@/config/designIntelligence";
import {
  checkVibeOrigin,
  composeAgentReply,
  filterRepoTree,
  isSafePath,
  lintGeneratedFile,
  parseAgentTurn,
} from "../../../../supabase/functions/_shared/vibeAgentCore";
import { hashText } from "@/lib/vibeReview/engine";

const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

describe("motor de jogos (inalterado)", () => {
  it("prompt do blueprint", () => {
    expect(buildBlueprintPrompt({ title: "Dragão", description: "Voa e cospe fogo", game_type: "3d", engine: "babylon" })).toMatchSnapshot();
    expect(buildBlueprintPrompt({ title: "  ", game_type: "2d", engine: "phaser" })).toBeNull();
  });

  it("merge do blueprint no config preserva as chaves do builder", () => {
    const out = mergeBlueprintIntoConfig({ keep: 1 }, { blueprint: { title: "X" }, designDoc: "doc", model: "m" } as never, new Date("2026-01-01T00:00:00Z"));
    expect(out).toMatchSnapshot();
    expect(isUsableBlueprint({ blueprint: { title: "Jogo" } })).toMatchSnapshot();
  });

  it("checagem de qualidade do blueprint", () => {
    const sample = {
      title: "Plataforma",
      dimension: "2D",
      entities: [{ kind: "player", name: "Herói", x: 0, y: 0 }, { kind: "enemy", name: "Slime", x: 3, y: 0 }],
      mechanics: ["pular", "coletar moedas"],
    };
    expect(validateBlueprint(sample)).toMatchSnapshot();
    expect(validateBlueprint(null)).toMatchSnapshot();
  });
});

describe("Vertal Design Intelligence (inalterado)", () => {
  it("detecção de superfície e config", () => {
    expect(["dashboard de vendas", "app para iPhone", "landing page", "um gerenciador"].map(detectSurface)).toMatchSnapshot();
    expect(resolveDesignConfig({ prompt: "landing page", envFlag: "off" })).toMatchSnapshot();
  });

  it("prompt de design por superfície (hash do texto)", () => {
    const out: Record<string, string> = {};
    for (const s of Object.keys(SURFACE_PROFILES) as DesignSurface[]) {
      out[`${s}:react`] = sha(buildDesignPrompt(s, { target: "react" }));
      out[`${s}:html`] = sha(buildDesignPrompt(s, { target: "html" }));
    }
    expect(out).toMatchSnapshot();
  });

  it("auditoria de código gerado", () => {
    const audit = auditGeneratedCode([
      { path: "src/App.tsx", content: '<div style={{color:"#ff0000"}} onClick={go}><img src="a.png"/></div>' },
    ]);
    expect(audit).toMatchSnapshot();
    expect(sha(formatAuditSummary(audit))).toMatchSnapshot();
    expect(sha(buildFixPrompt(audit))).toMatchSnapshot();
  });
});

describe("motor de código do Vibe Code (inalterado)", () => {
  it("caminhos seguros e lint", () => {
    expect(["src/a.ts", "../x", ".env", "node_modules/a.js", "a//b"].map(isSafePath)).toMatchSnapshot();
    expect(lintGeneratedFile("src/a.ts", "// TODO: fazer\nconst k = 'sk-123456789012345678901234';")).toMatchSnapshot();
  });

  it("leitura do turno do agente e resposta composta", () => {
    expect(parseAgentTurn('{"thought":"x","actions":[{"type":"message","text":"oi"}]}')).toMatchSnapshot();
    expect(
      composeAgentReply({ notes: ["nota"], questions: [], files: [{ path: "src/a.ts" }], mode: "apply", rejected: [], pendingRequirements: [] } as never),
    ).toMatchSnapshot();
  });

  it("origem e árvore", () => {
    expect(checkVibeOrigin({})).toEqual({ ok: true, origin: "vibe_code" });
    expect(checkVibeOrigin({ origin: "vertal_chat", apply: [] })).toEqual({ ok: false, error: "delegation_preview_only" });
    expect(filterRepoTree(["src/a.ts", "node_modules/x.js", "dist/a.js", "README.md"])).toMatchSnapshot();
    expect(hashText("conteúdo")).toMatchSnapshot();
  });
});
