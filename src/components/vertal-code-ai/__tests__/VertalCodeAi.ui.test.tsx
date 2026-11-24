/* eslint-disable @typescript-eslint/no-explicit-any -- testes com dublês */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession: vi.fn() } } }));
vi.mock("@/hooks/useWorkspaceProject", () => ({
  useWorkspaceProject: () => ({ projectId: "11111111-1111-4111-8111-111111111111", projects: [{ id: "11111111-1111-4111-8111-111111111111", title: "Meu App" }], loadProjects: vi.fn() }),
}));
// O medidor de créditos do Vibe Code fala com o Supabase; aqui só importa o resto da barra.
vi.mock("@/components/vibe-code/VibeCreditMeter", () => ({ VibeCreditMeter: () => null }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), message: vi.fn() }) }));

import { VibeTopBar } from "@/components/vibe-code/VibeTopBar";
import { VertalCodeAiApp } from "../VertalCodeAiApp";
import { VertalCodeAiChatHandoff } from "../VertalCodeAiEntry";
import type { VcaiApi } from "@/lib/vertalCodeAi/api";

const VENDOR = /openrouter|gemini|groq|nvidia|nemotron|deepseek|ollama|qwen|llama|gpt-oss|cerebras|anthropic|claude|e2b/i;

function fakeApi(over: Partial<VcaiApi> = {}): VcaiApi {
  return {
    status: vi.fn(async () => ({
      enabled: true,
      profiles: [
        { id: "auto", label: "VERTAL Code AI · Auto", description: "", cost: "free" },
        { id: "codigo", label: "VERTAL Code AI · Código", description: "", cost: "free" },
      ],
      sandbox: false,
      projectSource: "vault",
      paid: false,
      selfHosted: false,
      customProviders: true,
      freeRequestsLeft: 42,
    })) as VcaiApi["status"],
    plan: vi.fn(async () => ({
      mode: "plan",
      plan: { summary: "Adicionar tela de login", steps: [{ title: "Criar Login.tsx", detail: "formulário", files: ["src/Login.tsx"] }], questions: [], risks: [] },
      route: { cost: "free", attempts: 1, imagesRead: false },
    })) as VcaiApi["plan"],
    build: vi.fn(async () => ({
      mode: "build",
      summary: "Tela criada",
      notes: [],
      testCommand: null,
      files: [{ path: "src/Login.tsx", isNew: true, after: "export {}\n", diff: "--- /dev/null\n+++ b/src/Login.tsx\n@@ -0,0 +1,1 @@\n+export {}", added: 1, removed: 0, reason: null, baseHash: "", problems: [] }],
      failures: [],
      route: { cost: "free", attempts: 1, imagesRead: false },
    })) as VcaiApi["build"],
    sandboxStart: vi.fn(),
    sandboxUpdate: vi.fn(),
    sandboxPoll: vi.fn(),
    sandboxStop: vi.fn(),
    apply: vi.fn(async () => ({ ok: true, message: "ok" })),
    ...over,
  };
}

beforeEach(() => localStorage.removeItem("vertal-code-ai"));
afterEach(() => localStorage.removeItem("vertal-code-ai"));

describe("pontos de entrada (interruptor desligado por padrão)", () => {
  it("Vibe Code fica idêntico com o interruptor desligado", () => {
    render(<MemoryRouter><VibeTopBar /></MemoryRouter>);
    expect(screen.queryByText(/Code AI/)).toBeNull();
  });

  it("Vibe Code mostra o atalho quando ligado no aparelho", () => {
    localStorage.setItem("vertal-code-ai", "on");
    render(<MemoryRouter><VibeTopBar /></MemoryRouter>);
    expect(screen.getByRole("button", { name: /VERTAL Code AI/ })).toBeTruthy();
  });

  it("Vertal Chat não mostra nada desligado e leva o pedido quando ligado", () => {
    const { container, rerender } = render(<MemoryRouter><VertalCodeAiChatHandoff messages={[{ role: "user", text: "quero um app" }]} /></MemoryRouter>);
    expect(container.innerHTML).toBe("");
    localStorage.setItem("vertal-code-ai", "on");
    rerender(<MemoryRouter><VertalCodeAiChatHandoff messages={[{ role: "user", text: "quero um app" }]} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button"));
    expect(JSON.parse(sessionStorage.getItem("vertal-code-ai:handoff")!).prompt).toBe("quero um app");
  });
});

describe("tela do VERTAL Code AI", () => {
  it("planeja, constrói, mostra o diff e aplica pelo caminho existente", async () => {
    const api = fakeApi();
    render(<MemoryRouter><VertalCodeAiApp api={api} /></MemoryRouter>);
    await screen.findByText(/42 pedidos grátis/);
    fireEvent.change(screen.getByLabelText("Pedido"), { target: { value: "quero uma tela de login" } });
    fireEvent.click(screen.getByLabelText("Enviar"));
    await screen.findByText("Adicionar tela de login");
    expect(api.plan).toHaveBeenCalledWith(expect.objectContaining({ prompt: "quero uma tela de login", profile: "auto", projectId: "11111111-1111-4111-8111-111111111111" }), expect.anything());

    fireEvent.click(screen.getByText("Construir este plano"));
    await screen.findByText(/Revisar mudanças/);
    expect(api.sandboxStart).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Aplicar/ }));
    await waitFor(() =>
      expect(api.apply).toHaveBeenCalledWith({
        projectId: "11111111-1111-4111-8111-111111111111",
        files: [{ path: "src/Login.tsx", content: "export {}\n", baseHash: "" }],
      }),
    );
    expect(document.body.textContent).not.toMatch(VENDOR);
  });

  it("servidor desligado: mostra o aviso sem quebrar", async () => {
    const api = fakeApi({ status: vi.fn(async () => Promise.reject(new Error("O VERTAL Code AI ainda não foi ligado neste servidor."))) as VcaiApi["status"] });
    render(<MemoryRouter><VertalCodeAiApp api={api} /></MemoryRouter>);
    await screen.findByText(/ainda não foi ligado/);
  });

  it("anexo de imagem aparece como chip e vai junto do pedido", async () => {
    const api = fakeApi();
    const { container } = render(<MemoryRouter><VertalCodeAiApp api={api} /></MemoryRouter>);
    await screen.findByText(/42 pedidos grátis/);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const img = new File([new Uint8Array([137, 80, 78, 71])], "tela.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [img] } });
    await screen.findByText("tela.png");
    fireEvent.change(screen.getByLabelText("Pedido"), { target: { value: "faça igual ao print" } });
    fireEvent.click(screen.getByLabelText("Enviar"));
    await waitFor(() => expect(api.plan).toHaveBeenCalled());
    const arg = (api.plan as any).mock.calls[0][0];
    expect(arg.attachments[0]).toMatchObject({ name: "tela.png", kind: "image" });
    expect(arg.attachments[0].data.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("textos da tela não citam terceiros", async () => {
    render(<MemoryRouter><VertalCodeAiApp api={fakeApi()} /></MemoryRouter>);
    await screen.findByText(/42 pedidos grátis/);
    fireEvent.click(screen.getByLabelText("Provedores próprios"));
    await screen.findByText("Provedores próprios", { selector: "h2" });
    expect(document.body.textContent).not.toMatch(VENDOR);
  });
});

import { VertalCodeAiOpsPanel } from "../VertalCodeAiOpsPanel";

describe("modo Operação e isolamento na tela", () => {
  it("cliente comum não vê o modo Operação", async () => {
    render(<MemoryRouter><VertalCodeAiApp api={fakeApi()} /></MemoryRouter>);
    await screen.findByText(/42 pedidos grátis/);
    expect(screen.queryByLabelText("Modo Operação")).toBeNull();
  });

  it("operador vê o modo Operação", async () => {
    const api = fakeApi({ status: vi.fn(async () => ({ ...(await fakeApi().status()), operator: true })) as VcaiApi["status"] });
    render(<MemoryRouter><VertalCodeAiApp api={api} /></MemoryRouter>);
    expect(await screen.findByLabelText("Modo Operação")).toBeTruthy();
  });

  it("sem permissão de aplicar: botão Aplicar desligado", async () => {
    const api = fakeApi({ status: vi.fn(async () => ({ ...(await fakeApi().status()), canApply: false })) as VcaiApi["status"] });
    render(<MemoryRouter><VertalCodeAiApp api={api} /></MemoryRouter>);
    await screen.findByText(/42 pedidos grátis/);
    fireEvent.change(screen.getByLabelText("Pedido"), { target: { value: "x" } });
    fireEvent.click(screen.getByLabelText("Enviar"));
    fireEvent.click(await screen.findByText("Construir este plano"));
    await screen.findByText(/Revisar mudanças/);
    expect((screen.getByRole("button", { name: /Aplicar/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(api.apply).not.toHaveBeenCalled();
  });

  it("ação só executa depois de tocar em Aprovar", async () => {
    const card = { approvalId: "ap1", token: "t", tool: "revoke_api_key", text: 'Aprovar "revoke_api_key" (DESTRUTIVA)?', args: { keyId: "k" } };
    const ops = {
      ask: vi.fn(async () => ({ reply: "Preciso da sua aprovação.", results: [], approvals: [card] })),
      decide: vi.fn(async () => ({ ok: true, status: "done" })),
      report: vi.fn(),
    };
    render(<VertalCodeAiOpsPanel api={ops as any} />);
    fireEvent.change(screen.getByLabelText("Pergunta de operação"), { target: { value: "revoga a chave k" } });
    fireEvent.click(screen.getByLabelText("Perguntar"));
    await screen.findByText(/DESTRUTIVA/);
    expect(ops.decide).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Aprovar"));
    await waitFor(() => expect(ops.decide).toHaveBeenCalledWith(card, "approve"));
    await screen.findByText("Executado");
  });
});
