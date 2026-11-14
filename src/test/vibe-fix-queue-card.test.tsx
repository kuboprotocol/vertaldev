import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VibeFixQueueCard } from "@/components/vibe-code/VibeFixQueueCard";
import { emptyFixQueue, fixQueueReducer } from "@/lib/vibeReview/fixQueue";
import type { ReviewFinding } from "@/lib/vibeReview/engine";

const finding = (over: Partial<ReviewFinding> = {}): ReviewFinding => ({
  id: "f1",
  source: "review",
  path: "src/App.tsx",
  title: "Variável indefinida",
  severity: "critical",
  explanation: "`data` não existe neste escopo.",
  startLine: 2,
  endLine: 2,
  existingCode: "const items = data.map(fn);",
  improvedCode: "const items = props.data.map(fn);",
  applicable: true,
  ...over,
});

const handlers = () => ({
  onApply: vi.fn(),
  onSkip: vi.fn(),
  onAdjust: vi.fn(),
  onAskAbout: vi.fn(),
  onOpenFile: vi.fn(),
  onRestart: vi.fn(),
  onClose: vi.fn(),
});

describe("VibeFixQueueCard", () => {
  it("mostra o item da vez com progresso, gravidade, explicação e diff", () => {
    const state = fixQueueReducer(emptyFixQueue, { type: "start", payload: { command: "review", findings: [finding(), finding({ id: "f2", title: "Outro" })], files: {} } });
    const h = handlers();
    render(<VibeFixQueueCard state={state} busy={false} {...h} />);
    expect(screen.getByText("1/2")).toBeInTheDocument();
    expect(screen.getByText("Crítico")).toBeInTheDocument();
    expect(screen.getByText("Variável indefinida")).toBeInTheDocument();
    expect(screen.getByText("src/App.tsx:2")).toBeInTheDocument();
    expect(screen.getByTestId("vibe-fix-diff")).toHaveTextContent("props.data.map");

    fireEvent.click(screen.getByTestId("vibe-fix-apply"));
    expect(h.onApply).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("vibe-fix-skip"));
    expect(h.onSkip).toHaveBeenCalled();
    fireEvent.click(screen.getByText("src/App.tsx:2"));
    expect(h.onOpenFile).toHaveBeenCalledWith("src/App.tsx");
  });

  it("Ajustar abre o comentário e envia", () => {
    const state = fixQueueReducer(emptyFixQueue, { type: "start", payload: { command: "review", findings: [finding()], files: {} } });
    const h = handlers();
    render(<VibeFixQueueCard state={state} busy={false} {...h} />);
    fireEvent.click(screen.getByTestId("vibe-fix-adjust"));
    fireEvent.change(screen.getByPlaceholderText(/Como devo ajustar/), { target: { value: "use props" } });
    fireEvent.click(screen.getByText("Refazer correção"));
    expect(h.onAdjust).toHaveBeenCalledWith("use props");
  });

  it("item sem correção automática desabilita Aplicar e explica", () => {
    const state = fixQueueReducer(emptyFixQueue, {
      type: "start",
      payload: { command: "review", findings: [finding({ applicable: false, problem: "o trecho original não foi encontrado no arquivo atual" })], files: {} },
    });
    render(<VibeFixQueueCard state={state} busy={false} {...handlers()} />);
    expect(screen.getByTestId("vibe-fix-apply")).toBeDisabled();
    expect(screen.getByText(/não foi encontrado/)).toBeInTheDocument();
  });

  it("fila concluída mostra o resumo e Revisar de novo", () => {
    let state = fixQueueReducer(emptyFixQueue, { type: "start", payload: { command: "review", findings: [finding()], files: {} } });
    state = fixQueueReducer(state, { type: "skip" });
    const h = handlers();
    render(<VibeFixQueueCard state={state} busy={false} {...h} />);
    expect(screen.getByText(/Fila concluída: 0 aplicada\(s\), 1 pulada\(s\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Revisar de novo"));
    expect(h.onRestart).toHaveBeenCalled();
  });

  it("fila vazia não renderiza", () => {
    const { container } = render(<VibeFixQueueCard state={emptyFixQueue} busy={false} {...handlers()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
