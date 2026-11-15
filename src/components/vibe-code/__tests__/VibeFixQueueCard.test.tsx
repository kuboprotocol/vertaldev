import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VibeFixQueueCard } from "@/components/vibe-code/VibeFixQueueCard";
import type { FixQueueState } from "@/lib/vibeReview/fixQueue";

const finding = {
  id: "f1",
  source: "review",
  path: "src/a.ts",
  title: "Título do achado",
  severity: "high",
  explanation: "Explicação do achado",
  applicable: true,
} as unknown as FixQueueState["items"][number]["finding"];

const state = (applicable = true): FixQueueState => ({
  command: "review",
  items: [{ finding: { ...finding, applicable } as never, status: "pending" }],
  index: 0,
  files: {},
  decisions: [],
  skippedIds: [],
});

const handlers = () => ({
  onApply: vi.fn(),
  onSkip: vi.fn(),
  onAdjust: vi.fn(),
  onAskAbout: vi.fn(),
  onRestart: vi.fn(),
  onClose: vi.fn(),
});

describe("VibeFixQueueCard atalhos", () => {
  it("A aplica e S pula o item da vez", () => {
    const h = handlers();
    render(<VibeFixQueueCard state={state()} busy={false} {...h} />);
    fireEvent.keyDown(window, { key: "a" });
    expect(h.onApply).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "s" });
    expect(h.onSkip).toHaveBeenCalledTimes(1);
  });

  it("não aplica quando o achado não é aplicável", () => {
    const h = handlers();
    render(<VibeFixQueueCard state={state(false)} busy={false} {...h} />);
    fireEvent.keyDown(window, { key: "a" });
    expect(h.onApply).not.toHaveBeenCalled();
  });

  it("fica quieto enquanto o agente trabalha", () => {
    const h = handlers();
    render(<VibeFixQueueCard state={state()} busy {...h} />);
    fireEvent.keyDown(window, { key: "a" });
    fireEvent.keyDown(window, { key: "s" });
    expect(h.onApply).not.toHaveBeenCalled();
    expect(h.onSkip).not.toHaveBeenCalled();
  });

  it("não reage a tecla digitada dentro de um campo de texto", () => {
    const h = handlers();
    render(
      <>
        <VibeFixQueueCard state={state()} busy={false} {...h} />
        <textarea aria-label="campo" />
      </>,
    );
    const field = screen.getByLabelText("campo");
    fireEvent.keyDown(field, { key: "a" });
    expect(h.onApply).not.toHaveBeenCalled();
  });
});
