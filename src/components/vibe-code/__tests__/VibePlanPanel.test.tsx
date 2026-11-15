import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VibePlanPanel } from "@/components/vibe-code/VibePlanPanel";
import type { VibePlanState } from "@/lib/vibeCodeAgentTypes";
import type { PlanTask } from "@/lib/vibePlan/engine";

const task = (over: Partial<PlanTask>): PlanTask => ({
  id: 1,
  title: "Tarefa",
  description: "",
  details: "",
  testStrategy: "",
  priority: "medium",
  status: "pending",
  dependencies: [],
  subtasks: [],
  files: [],
  ...over,
});

const state = (over: Partial<VibePlanState> = {}): VibePlanState => ({
  version: 1,
  graph: {
    version: 1,
    goal: "Loja com checkout",
    tasks: [
      task({ id: 1, title: "Criar layout", status: "done", priority: "high" }),
      task({ id: 2, title: "Carrinho", dependencies: [1], priority: "high" }),
      task({ id: 3, title: "Checkout", dependencies: [2], priority: "low" }),
    ],
    createdAt: "2026-11-14T00:00:00Z",
    updatedAt: "2026-11-14T00:00:00Z",
  },
  staged: [],
  autonomy: "semi",
  modelPack: "balanced",
  debug: null,
  applied: [],
  updatedAt: "2026-11-14T00:00:00Z",
  repoFiles: 10,
  ...over,
});

const handlers = () => ({ onRunNext: vi.fn(), onRunAll: vi.fn(), onStopAll: vi.fn(), onConfig: vi.fn(), onClose: vi.fn() });

describe("VibePlanPanel", () => {
  it("lista as tarefas com status, prioridade, dependências e destaca a próxima", () => {
    render(<VibePlanPanel state={state()} busy={false} runningAll={false} {...handlers()} />);
    expect(screen.getByText("1/3")).toBeInTheDocument();
    expect(screen.getByText("Carrinho")).toBeInTheDocument();
    expect(screen.getByText("Feita")).toBeInTheDocument();
    expect(screen.getByText("← #2")).toBeInTheDocument();
    const next = screen.getByText("Carrinho").closest("li");
    expect(next?.getAttribute("data-next")).toBe("true");
    expect(screen.getByText("Checkout").closest("li")?.getAttribute("data-next")).toBeNull();
  });

  it("executa a próxima, todas, e muda autonomia e pacote pela ação config", () => {
    const h = handlers();
    render(<VibePlanPanel state={state()} busy={false} runningAll={false} {...h} />);
    fireEvent.click(screen.getByRole("button", { name: /Executar próxima/ }));
    fireEvent.click(screen.getByRole("button", { name: /Executar todas \(semi-autônomo\)/ }));
    fireEvent.change(screen.getByLabelText("Autonomia"), { target: { value: "full" } });
    fireEvent.change(screen.getByLabelText("Pacote de modelos"), { target: { value: "strong" } });
    expect(h.onRunNext).toHaveBeenCalledTimes(1);
    expect(h.onRunAll).toHaveBeenCalledTimes(1);
    expect(h.onConfig).toHaveBeenCalledWith({ autonomy: "full" });
    expect(h.onConfig).toHaveBeenCalledWith({ modelPack: "strong" });
  });

  it("bloqueia executar com mudanças staged e mostra Parar durante a sequência", () => {
    const h = handlers();
    const staged = [{ path: "src/a.ts", baseHash: "", content: "x", origin: "task" as const, status: "pending" as const, added: 1, removed: 0, createdAt: "", diff: "+x" }];
    render(<VibePlanPanel state={state({ staged })} busy={false} runningAll {...h} />);
    expect(screen.getByRole("button", { name: /Executar próxima/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Parar sequência/ }));
    expect(h.onStopAll).toHaveBeenCalled();
  });
});
