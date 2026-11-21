import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { callNavigator } = vi.hoisted(() => ({ callNavigator: vi.fn(async () => ({ ok: true, status: "ok" })) }));
vi.mock("@/lib/navigator/client", () => ({ callNavigator }));

import { VibeNavigatorCard } from "@/components/vibe-code/VibeNavigatorCard";
import KuboFlowSelector from "@/components/builder/KuboFlowSelector";
import type { NavigatorCardData } from "@/lib/navigator/vibeCard";
import * as store from "@/lib/navigator/store";

const base: NavigatorCardData = {
  taskId: "t1", task: "abra https://example.com e me diga o título", state: "done", origin: "command", startedAt: 1,
};

describe("VibeNavigatorCard (navegador dentro do chat do Vibe Code)", () => {
  it("encerrado: mostra captura final, resposta citada, passos e 'Usar no pedido'", () => {
    const onUse = vi.fn();
    const onContinue = vi.fn();
    render(
      <VibeNavigatorCard
        card={{ ...base, ok: true, answer: 'O título é "Example Domain".', screenshot: "data:image/jpeg;base64,AAAA", steps: ["Passo 1: abrir"], stepsCount: 1, finalUrl: "https://example.com/" }}
        onUse={onUse}
        onContinue={onContinue}
      />,
    );
    expect(screen.getByAltText("Tela final do navegador")).toBeInTheDocument();
    expect(screen.getByText('O título é "Example Domain".')).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Usar no pedido/ }));
    expect(onUse).toHaveBeenCalledWith('O título é "Example Domain".');
    fireEvent.click(screen.getByRole("button", { name: /Continuar com o agente/ }));
    expect(onContinue).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Passos do agente/ }));
    expect(screen.getByText("Passo 1: abrir")).toBeInTheDocument();
  });

  it("pedido pelo agente e ainda não executado: botão 'Executar agora'", () => {
    const onRun = vi.fn();
    render(<VibeNavigatorCard card={{ ...base, state: "requested", origin: "agent" }} onRun={onRun} />);
    expect(screen.getByText(/pedido pelo agente/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Executar agora/ }));
    expect(onRun).toHaveBeenCalled();
  });

  it("ao vivo: tela compacta, Expandir e aprovação de pagamento inline (sem tela cheia)", async () => {
    store.__resetNavigatorStore();
    callNavigator.mockClear();
    const { unmount } = render(<VibeNavigatorCard card={{ ...base, state: "running" }} />);
    expect(screen.getByRole("button", { name: /Expandir o navegador/ })).toBeInTheDocument();
    expect(store.getNavigatorState().inlineApprovalHosts).toBe(1);
    expect(store.getNavigatorState().panelsMounted).toBe(1);
    act(() => {
      store.__patchNavigatorStoreForTest({
        sessionId: "11111111-2222-4333-8444-555555555555",
        agentStatus: "waiting",
        pending: [{ id: "req0000000000001", kind: "approval", target: "Finalizar compra", url: "https://loja.com/checkout", total: "R$ 10,00" }],
      });
    });
    expect(screen.getByTestId("navigator-approval-inline")).toBeInTheDocument();
    expect(screen.getByText("R$ 10,00")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Aprovar e clicar/ }));
    });
    const input = callNavigator.mock.calls.find((c) => (c as unknown[])[0] === "input") as unknown[] | undefined;
    expect(input?.[1]).toMatchObject({ kind: "approval", approve: true, confirmed: true, requestId: "req0000000000001" });
    unmount();
    expect(store.getNavigatorState().inlineApprovalHosts).toBe(0);
    store.__resetNavigatorStore();
  });
});

describe("KuboFlowSelector (plano enterprise / admin)", () => {
  it("enterprise não trava THINK nem SHIP", () => {
    render(<KuboFlowSelector mode="flow" onChange={() => {}} userPlan="enterprise" />);
    expect(screen.queryByTitle(/Requer plano/)).toBeNull();
  });
  it("free trava THINK e SHIP; admin destrava", () => {
    const { unmount } = render(<KuboFlowSelector mode="flow" onChange={() => {}} userPlan="free" />);
    expect(screen.getAllByTitle(/Requer plano/)).toHaveLength(2);
    unmount();
    render(<KuboFlowSelector mode="flow" onChange={() => {}} userPlan="free" isAdmin />);
    expect(screen.queryByTitle(/Requer plano/)).toBeNull();
  });
});
