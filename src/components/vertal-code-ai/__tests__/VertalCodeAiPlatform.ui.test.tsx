/* eslint-disable @typescript-eslint/no-explicit-any -- testes com dublês */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession: vi.fn() } } }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), message: vi.fn() }) }));

import { VertalCodeAiOpsPanel } from "../VertalCodeAiOpsPanel";
import { VertalCodeAiKeysDialog } from "../VertalCodeAiKeysDialog";

const VENDOR = /openrouter|gemini|groq|nvidia|nemotron|deepseek|ollama|qwen|llama|gpt-oss|cerebras|anthropic|claude/i;

describe("modo Operação", () => {
  it("ação só executa depois de tocar em Aprovar", async () => {
    const card = { approvalId: "ap1", token: "t", tool: "revoke_api_key", text: 'Aprovar "revoke_api_key" (DESTRUTIVA)?', args: { keyId: "k" } };
    const ops = {
      isOperator: vi.fn(),
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

  it("recusar não executa", async () => {
    const card = { approvalId: "ap2", token: "t", tool: "set_key_cap", text: "Aprovar set_key_cap?", args: {} };
    const ops = { isOperator: vi.fn(), ask: vi.fn(async () => ({ reply: "", results: [], approvals: [card] })), decide: vi.fn(async () => ({ ok: true, status: "rejected" })), report: vi.fn() };
    render(<VertalCodeAiOpsPanel api={ops as any} />);
    fireEvent.change(screen.getByLabelText("Pergunta de operação"), { target: { value: "x" } });
    fireEvent.click(screen.getByLabelText("Perguntar"));
    fireEvent.click(await screen.findByText("Recusar"));
    await waitFor(() => expect(ops.decide).toHaveBeenCalledWith(card, "reject"));
    await screen.findByText("Recusado");
  });
});

describe("chaves da API", () => {
  it("mostra a chave uma vez e não cita terceiros", async () => {
    const api = {
      list: vi.fn(async () => ({ keys: [] })),
      create: vi.fn(async () => ({ key: "vtl_ai_" + "a".repeat(43), record: { id: "1", name: "meu-app", key_prefix: "vtl_ai_aaaaaaa", monthly_cap_credits: 100, rpm: 20, spent_micro: 0, spent_period: null, created_at: "", last_used_at: null, revoked_at: null } })),
      revoke: vi.fn(),
    };
    render(<VertalCodeAiKeysDialog open onOpenChange={() => {}} api={api as any} />);
    fireEvent.change(screen.getByLabelText("Nome da chave"), { target: { value: "meu-app" } });
    fireEvent.click(screen.getByText("Criar chave"));
    await screen.findByText(/não aparece de novo/);
    expect(api.create).toHaveBeenCalledWith("meu-app", 100);
    expect(document.body.textContent).not.toMatch(VENDOR);
  });
});
