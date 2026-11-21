import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useState } from "react";
import type { VibeChatMessage } from "@/lib/vibeCodeAgentTypes";
import type { VibeConversationsApi } from "@/hooks/useVibeConversations";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      getUser: async () => ({ data: { user: null } }),
    },
    functions: { invoke: async () => ({ data: null, error: new Error("offline") }) },
  },
}));

const { callGithubOp } = vi.hoisted(() => ({
  callGithubOp: vi.fn(async () => ({ ok: false, code: "not_connected", message: "O GitHub não está conectado. Conecte em Conectores → GitHub.", data: {} })),
}));
vi.mock("@/lib/github/client", () => ({
  callGithubOp,
  describeGithubOp: () => "Listar seus repositórios",
  isGithubWrite: () => false,
}));

import { VibeCodeAgentChat } from "@/components/vibe-code/VibeCodeAgentChat";

function Harness({ initial }: { initial: VibeChatMessage[] }) {
  const [messages, setMessages] = useState<VibeChatMessage[]>(initial);
  const api = {
    conversations: [], activeId: null, setActiveId: vi.fn(), messages, setMessages, loading: false,
    refresh: vi.fn(async () => {}), loadMessages: vi.fn(async () => []), open: vi.fn(async () => {}), startNew: vi.fn(),
    rename: vi.fn(async () => {}), remove: vi.fn(async () => {}),
  } as unknown as VibeConversationsApi;
  return (
    <MemoryRouter>
      <VibeCodeAgentChat conversations={api} />
    </MemoryRouter>
  );
}

describe("Vibe Code: /github e cartão do Navigator na conversa (fase 4)", () => {
  it("/github liste meus repositórios envia, responde no chat e mostra o botão para conectar", async () => {
    render(<Harness initial={[]} />);
    const box = screen.getByPlaceholderText(/Peça para criar/);
    fireEvent.change(box, { target: { value: "/github liste meus repositórios" } });
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter" });
    });
    expect(callGithubOp).toHaveBeenCalledWith({ op: "list_repos", max: 20 }, { confirmed: false });
    expect(screen.getByText("/github liste meus repositórios")).toBeTruthy();
    expect(screen.getByText(/ainda não está conectado/)).toBeTruthy();
    const link = screen.getByRole("link", { name: /Conectar o GitHub/ });
    expect(link.getAttribute("href")).toBe("/connectors/github");
    expect((box as HTMLTextAreaElement).value).toBe("");
  });

  it("/github desconhecido mostra a ajuda no chat (nunca some em silêncio)", async () => {
    render(<Harness initial={[]} />);
    const box = screen.getByPlaceholderText(/Peça para criar/);
    fireEvent.change(box, { target: { value: "/github faça mágica" } });
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter" });
    });
    expect(screen.getByText(/Comandos do GitHub/)).toBeTruthy();
  });

  it("cartão do Navigator guardado na conversa aparece depois de recarregar", () => {
    render(
      <Harness
        initial={[
          { id: "u1", role: "user", content: "/navegar abra https://example.com e me diga o título da página", createdAt: 0 },
          {
            id: "a1", role: "assistant", content: "Pronto! O Vertal Navigator concluiu a tarefa.", createdAt: 1,
            steps: [{
              id: "rec1", kind: "navigator", status: "success", title: "Vertal Navigator", startedAt: 1,
              navigator: { taskId: "t1", task: "abra https://example.com e me diga o título da página", state: "done", origin: "command", ok: true, answer: 'O título é "Example Domain".', screenshot: "data:image/jpeg;base64,AAAA", startedAt: 1 },
            }],
          },
        ]}
      />,
    );
    expect(screen.getByTestId("vibe-navigator-card")).toBeTruthy();
    expect(screen.getByText('O título é "Example Domain".')).toBeTruthy();
    expect(screen.getByAltText("Tela final do navegador")).toBeTruthy();
  });
});
