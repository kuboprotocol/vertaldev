import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VibeStagedChanges } from "@/components/vibe-code/VibeStagedChanges";
import type { ClientStagedChange } from "@/lib/vibePlan/engine";

const change = (path: string, over: Partial<ClientStagedChange> = {}): ClientStagedChange => ({
  path,
  baseHash: "",
  content: "novo",
  origin: "task",
  status: "pending",
  added: 2,
  removed: 1,
  createdAt: "2026-11-14T00:00:00Z",
  taskId: 2,
  diff: `--- a/${path}\n+++ b/${path}\n@@ -1 +1,2 @@\n-antigo\n+novo\n+linha`,
  ...over,
});

describe("VibeStagedChanges", () => {
  it("mostra o diff por arquivo e aplica/rejeita um arquivo ou tudo", () => {
    const onApply = vi.fn();
    const onReject = vi.fn();
    render(<VibeStagedChanges staged={[change("src/a.ts"), change("src/b.ts", { status: "stale" })]} busy={false} onApply={onApply} onReject={onReject} />);
    expect(screen.getByText(/2 mudanças staged/)).toBeInTheDocument();
    expect(screen.getByText("-antigo")).toBeInTheDocument();
    expect(screen.getByText("desatualizada")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Aplicar src/a.ts" }));
    fireEvent.click(screen.getByRole("button", { name: "Rejeitar src/b.ts" }));
    fireEvent.click(screen.getByRole("button", { name: /Aplicar tudo/ }));
    fireEvent.click(screen.getByRole("button", { name: /Rejeitar tudo/ }));
    expect(onApply).toHaveBeenNthCalledWith(1, ["src/a.ts"]);
    expect(onApply).toHaveBeenNthCalledWith(2);
    expect(onReject).toHaveBeenNthCalledWith(1, ["src/b.ts"]);
    expect(onReject).toHaveBeenNthCalledWith(2);
  });

  it("não renderiza nada sem mudanças staged", () => {
    const { container } = render(<VibeStagedChanges staged={[]} busy={false} onApply={vi.fn()} onReject={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
