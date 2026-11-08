import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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

import { VibeCodeAgentChat } from "@/components/vibe-code/VibeCodeAgentChat";

const messages: VibeChatMessage[] = [
  { id: "u1", role: "user", content: "Crie a página de preços", createdAt: 0 },
  {
    id: "a1",
    role: "assistant",
    content: "Criei a página de preços com três planos. Preparei 1 arquivo(s) para você revisar: `src/pages/Pricing.tsx`.",
    createdAt: 1,
    steps: [
      { id: "s1", kind: "plan", title: "Página de preços", status: "success", startedAt: 1 },
      { id: "s2", kind: "memory", title: "Usando 2 memória(s) do Prime", status: "success", startedAt: 1 },
      {
        id: "s3",
        kind: "diff",
        title: "Preview src/pages/Pricing.tsx",
        status: "success",
        path: "src/pages/Pricing.tsx",
        diff: "+export default function Pricing() {}",
        proposedContent: "export default function Pricing() {}",
        startedAt: 1,
      },
      { id: "s4", kind: "reply", title: "Resposta do agente", status: "success", detail: "ignorado: content vence", startedAt: 1 },
    ],
  },
];

function fakeApi(): VibeConversationsApi {
  return {
    conversations: [],
    activeId: "c1",
    setActiveId: vi.fn(),
    messages,
    setMessages: vi.fn(),
    loading: false,
    refresh: vi.fn(async () => {}),
    loadMessages: vi.fn(async () => []),
    open: vi.fn(async () => {}),
    startNew: vi.fn(),
    rename: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
  } as unknown as VibeConversationsApi;
}

function renderChat(onOpenFile = vi.fn()) {
  render(
    <MemoryRouter>
      <VibeCodeAgentChat conversations={fakeApi()} onOpenFile={onOpenFile} />
    </MemoryRouter>,
  );
  return onOpenFile;
}

describe("VibeCodeAgentChat", () => {
  it("mostra a resposta do agente como conversa", () => {
    renderChat();
    expect(screen.getByText(/Criei a página de preços com três planos/)).toBeTruthy();
    expect(screen.queryByText("ignorado: content vence")).toBeNull();
  });

  it("entrega o código numa caixinha que leva ao arquivo", () => {
    const onOpenFile = renderChat();
    const box = screen.getByRole("button", { name: "Abrir src/pages/Pricing.tsx" });
    fireEvent.click(box);
    expect(onOpenFile).toHaveBeenCalledTimes(1);
    expect(onOpenFile.mock.calls[0][0]).toMatchObject({
      path: "src/pages/Pricing.tsx",
      content: "export default function Pricing() {}",
      status: "preview",
    });
  });

  it("recolhe os passos técnicos e mostra sob demanda", () => {
    renderChat();
    expect(screen.queryByText("Usando 2 memória(s) do Prime")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Ver o que o agente fez \(3 passos\)/ }));
    expect(screen.getByText("Usando 2 memória(s) do Prime")).toBeTruthy();
  });

  it("transforma os links da resposta em links clicáveis, sem a pontuação final", () => {
    const withLink: VibeChatMessage[] = [
      { id: "a2", role: "assistant", content: "Gere a chave em https://resend.com/api-keys.", createdAt: 2, steps: [] },
    ];
    render(
      <MemoryRouter>
        <VibeCodeAgentChat conversations={{ ...fakeApi(), messages: withLink } as VibeConversationsApi} />
      </MemoryRouter>,
    );
    const link = screen.getByRole("link", { name: "https://resend.com/api-keys" });
    expect(link.getAttribute("href")).toBe("https://resend.com/api-keys");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("oferece conectores e o cofre de chaves a partir do chat", () => {
    renderChat();
    fireEvent.click(screen.getByRole("button", { name: "Conectores e chaves" }));
    expect(screen.getByText("Cofre de segredos")).toBeTruthy();
    const vaultLink = screen.getAllByRole("link").find((a) => a.getAttribute("href") === "/secrets");
    expect(vaultLink).toBeTruthy();
  });
});
