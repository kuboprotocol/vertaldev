import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { vertalAiForRequest } from "../../supabase/functions/_shared/vertalAiConnectorStore";
import { VertalAiOfferCard } from "@/components/vertal-ai/VertalAiOfferCard";

const LAERCIO = "5441b397-7be8-44fc-87e8-8057fdb79a0e";
/** Qualquer acesso ao banco explode: prova que, com a flag desligada, o motor nem consulta. */
const explodingAdmin = new Proxy({}, { get: () => { throw new Error("banco não deveria ser tocado"); } });

describe("engine guard: vertalAiForRequest com a flag desligada", () => {
  it("sem flag → off, sem tocar no banco", async () => {
    await expect(vertalAiForRequest(explodingAdmin, {}, { userId: LAERCIO, projectId: null, prompt: "crie um app gerador de vídeo com IA", request: { enabled: true } }))
      .resolves.toEqual({ state: { mode: "off" } });
  });
  it("flag ligada mas usuário fora da allowlist → off, sem tocar no banco", async () => {
    const env = { SUPABASE_URL: "https://x.supabase.co", VERTAL_GPU_CONFIG: JSON.stringify({ VERTAL_AI_API_ENABLED: true, VERTAL_AI_CONNECTOR_ENABLED: true, VERTAL_AI_CONNECTOR_USER_IDS: LAERCIO }) };
    await expect(vertalAiForRequest(explodingAdmin, env, { userId: "11111111-2222-4333-8444-555555555555", projectId: null, prompt: "app com IA", request: { enabled: true } }))
      .resolves.toEqual({ state: { mode: "off" } });
  });
});

describe("cartão Ativar Vertal AI", () => {
  it("não aparece com VITE_VERTAL_AI_CONNECTOR desligado", () => {
    const { container } = render(<VertalAiOfferCard projectId={null} onActivated={vi.fn()} uiEnabled={false} />);
    expect(container.innerHTML).toBe("");
  });
  it("aparece com o botão de um clique quando ligado", () => {
    render(<VertalAiOfferCard projectId={null} onActivated={vi.fn()} uiEnabled />);
    expect(screen.getByTestId("vibe-vertal-ai-activate").textContent).toContain("Ativar Vertal AI");
  });
});
