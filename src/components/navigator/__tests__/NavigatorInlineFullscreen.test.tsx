import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { callNavigator, navigatorAudioUrl } = vi.hoisted(() => ({
  callNavigator: vi.fn(async (..._args: unknown[]) => ({ ok: true, status: "ok" }) as Record<string, unknown>),
  navigatorAudioUrl: vi.fn(async (..._args: unknown[]) => ({ ok: false, message: "sem áudio no teste" })),
}));
vi.mock("@/lib/navigator/client", () => ({
  callNavigator,
  navigatorAudioUrl,
  pauseNavigatorMedia: vi.fn(async () => ({ ok: false, message: "sem mídia no teste" })),
  navigatorUserId: vi.fn(async () => null),
}));

import { VibeNavigatorCard } from "@/components/vibe-code/VibeNavigatorCard";
import { navigatorSessionPath } from "@/components/navigator/navigatorUi";
import { escapeContainingBlocks } from "@/components/navigator/useNavigatorFullscreen";
import NavigatorSessionPage from "@/pages/NavigatorSessionPage";
import type { NavigatorCardData } from "@/lib/navigator/vibeCard";
import * as store from "@/lib/navigator/store";

const SID = "11111111-2222-4333-8444-555555555555";
const card: NavigatorCardData = { taskId: "t1", task: "abra https://example.com e me diga o título", state: "running", origin: "command", startedAt: 1 };

function liveSession() {
  act(() => {
    store.__patchNavigatorStoreForTest({
      sessionId: SID,
      liveViewUrl: "https://6080-sbx.e2b.app/vnc.html?view_only=1",
      agentStatus: "running",
      currentTask: { id: "t1", task: card.task, runId: "r1", baseSeq: 0, startedAt: 1 },
      events: [{ seq: 1, type: "step", runId: "r1", step: 1, action: "abrir https://example.com" } as never],
    });
  });
}

describe("Vertal Navigator: cartão ao vivo inline + tela cheia", () => {
  beforeEach(() => {
    store.__resetNavigatorStore();
    callNavigator.mockClear();
    navigatorAudioUrl.mockClear();
  });
  afterEach(() => {
    store.__resetNavigatorStore();
    vi.restoreAllMocks();
  });

  it("padrão: fica inline na página do projeto (sem tela cheia e sem navegar)", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<VibeNavigatorCard card={card} />);
    liveSession();
    const shell = screen.getByTestId("navigator-live-shell");
    expect(shell).toHaveAttribute("data-fullscreen", "false");
    expect(shell).not.toHaveAttribute("role");
    expect(screen.getByTitle("Tela ao vivo do Vertal Navigator")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Assumir controle/ })).toBeInTheDocument();
    expect(open).not.toHaveBeenCalled();
  });

  it("Expandir leva o MESMO iframe para a tela cheia; Esc recolhe e devolve o foco", async () => {
    render(<VibeNavigatorCard card={card} />);
    liveSession();
    const frame = screen.getByTitle("Tela ao vivo do Vertal Navigator");
    const audioCalls = navigatorAudioUrl.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: /Expandir o navegador em tela cheia/ }));
    const dialog = screen.getByRole("dialog", { name: /Vertal Navigator em tela cheia/ });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("data-fullscreen", "true");
    expect(dialog.className).toContain("fixed");
    // Mesmo nó: nada de recarregar o noVNC nem reconectar.
    expect(screen.getByTitle("Tela ao vivo do Vertal Navigator")).toBe(frame);
    expect(screen.getAllByTitle("Tela ao vivo do Vertal Navigator")).toHaveLength(1);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /Recolher o navegador/ }));
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.getByTestId("navigator-live-shell")).toHaveAttribute("data-fullscreen", "false");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByTitle("Tela ao vivo do Vertal Navigator")).toBe(frame);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: /Expandir o navegador/ })));
    expect(document.body.style.overflow).toBe("");
    // Um único controle de som / ticket de áudio: expandir e recolher não abrem outro listener.
    expect(navigatorAudioUrl.mock.calls.length).toBe(audioCalls);
  });

  it("tela cheia: Tab fica preso dentro (foco cicla) e o botão Recolher fecha", () => {
    render(<VibeNavigatorCard card={card} />);
    liveSession();
    fireEvent.click(screen.getByRole("button", { name: /Expandir o navegador/ }));
    const dialog = screen.getByRole("dialog");
    const focusables = Array.from(dialog.querySelectorAll<HTMLElement>("button:not([disabled]), iframe, a[href], input:not([disabled])"));
    const last = focusables[focusables.length - 1];
    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(focusables[0]);
    fireEvent.keyDown(focusables[0], { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
    fireEvent.click(screen.getByRole("button", { name: /Recolher o navegador/ }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Abrir em outra tela: só abre a sub-página da mesma sessão quando o usuário toca", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<VibeNavigatorCard card={card} />);
    liveSession();
    expect(open).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Abrir o navegador em outra tela/ }));
    expect(open).toHaveBeenCalledWith(`/navegar/${SID}`, "_blank", "noopener,noreferrer");
    expect(navigatorSessionPath(SID)).toBe(`/navegar/${SID}`);
  });

  it("mostra o passo atual do agente no cartão compacto", () => {
    render(<VibeNavigatorCard card={card} />);
    liveSession();
    expect(screen.getByTestId("navigator-current-step").textContent).toMatch(/Agora:/);
  });

  it("escapeContainingBlocks neutraliza transform/backdrop-filter dos ancestrais e restaura", () => {
    const outer = document.createElement("div");
    outer.style.transform = "translateX(1px)";
    outer.style.setProperty("backdrop-filter", "blur(8px)");
    const inner = document.createElement("div");
    outer.appendChild(inner);
    document.body.appendChild(outer);
    const restore = escapeContainingBlocks(inner);
    expect(outer.style.getPropertyValue("transform")).toBe("none");
    expect(outer.style.getPropertyPriority("transform")).toBe("important");
    restore();
    expect(outer.style.transform).toBe("translateX(1px)");
    outer.remove();
  });
});

describe("Sub-página /navegar/:sessionId", () => {
  beforeEach(() => {
    store.__resetNavigatorStore();
    callNavigator.mockClear();
  });
  afterEach(() => store.__resetNavigatorStore());

  it("acompanha a sessão existente pelo /status (sem abrir navegador novo) e mostra a tela ao vivo", async () => {
    callNavigator.mockImplementation(async (route: unknown) => (route === "status"
      ? { ok: true, status: "ok", sessionId: SID, liveViewUrl: "https://6080-sbx.e2b.app/vnc.html?view_only=1", agentStatus: "running", events: [], lastSeq: 0, pending: [], filling: [] }
      : { ok: true, status: "ok" }));
    render(
      <MemoryRouter initialEntries={[`/navegar/${SID}`]}>
        <Routes><Route path="/navegar/:sessionId" element={<NavigatorSessionPage />} /></Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByTitle("Tela ao vivo do Vertal Navigator")).toBeInTheDocument());
    const routes = callNavigator.mock.calls.map((c) => (c as unknown[])[0]);
    expect(routes).toContain("status");
    expect(routes).not.toContain("start");
    expect((callNavigator.mock.calls.find((c) => (c as unknown[])[0] === "status") as unknown[])[1]).toMatchObject({ sessionId: SID });
  });

  it("link inválido: não chama o servidor e explica", async () => {
    await store.attachNavigatorSession("../etc");
    expect(callNavigator).not.toHaveBeenCalled();
    expect(store.getNavigatorState().error).toMatch(/inválido/);
  });
});
