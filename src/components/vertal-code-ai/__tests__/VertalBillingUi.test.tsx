import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession: vi.fn() } } }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), message: vi.fn() }) }));

import { VertalCreditNoticeBanner } from "../VertalCreditNoticeBanner";
import { VertalCodeAiKeysDialog } from "../VertalCodeAiKeysDialog";

const VENDORS = /openai|openrouter|deepseek|cerebras|gemini|qwen|ollama|modal|lovable/i;

describe("cobrança v2 · UI", () => {
  it("aviso de crédito baixo aparece e some ao marcar como lido", async () => {
    const markRead = vi.fn().mockResolvedValue({ ok: true });
    const api = {
      notices: vi.fn().mockResolvedValue({
        notices: [{ id: "n1", kind: "low_credit", title: "Seus créditos da Vertal estão acabando", body: "Restam 30 créditos…", locale: "pt-BR", created_at: "", read_at: null }],
      }),
      markRead,
    };
    render(<VertalCreditNoticeBanner api={api} />);
    expect(await screen.findByText("Seus créditos da Vertal estão acabando")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Entendi" }));
    await waitFor(() => expect(screen.queryByText("Seus créditos da Vertal estão acabando")).not.toBeInTheDocument());
    expect(markRead).toHaveBeenCalledWith("n1");
  });

  it("desligado (404): não renderiza nada", async () => {
    const { container } = render(<VertalCreditNoticeBanner api={{ notices: vi.fn().mockRejectedValue(new Error("404")), markRead: vi.fn() }} />);
    await waitFor(() => expect(container.innerHTML).toBe(""));
  });

  it("extrato por tipo com markup no diálogo de chaves; marca Vertal apenas", async () => {
    const api = { list: vi.fn().mockResolvedValue({ keys: [] }), create: vi.fn(), revoke: vi.fn() };
    const billing = {
      statement: vi.fn().mockResolvedValue({
        since: "",
        available: true,
        requests: 3,
        totalCredits: 1.1,
        lines: [
          { channel: "retail", kind: "code", requests: 2, freeRequests: 0, credits: 1, markupPct: 69 },
          { channel: "wholesale", kind: "code", requests: 1, freeRequests: 0, credits: 0.1, markupPct: 20 },
        ],
      }),
    };
    render(<VertalCodeAiKeysDialog open onOpenChange={() => {}} api={api as never} billing={billing} />);
    const section = await screen.findByRole("region", { name: "Extrato de uso" });
    expect(section.textContent).toContain("+69% sobre o custo");
    expect(section.textContent).toContain("API / seus apps");
    expect(section.textContent).toContain("Total: 1.100 créditos");
    expect(section.textContent).not.toMatch(VENDORS);
  });
});
