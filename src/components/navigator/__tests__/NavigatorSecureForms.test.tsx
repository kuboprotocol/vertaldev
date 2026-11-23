import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { callNavigator } = vi.hoisted(() => ({ callNavigator: vi.fn(async (..._args: unknown[]) => ({ ok: true, status: "ok", saved: ["GOOGLE_COM_PASSWORD"] })) }));
vi.mock("@/lib/navigator/client", () => ({
  callNavigator,
  // Áudio do navegador (ticket): no teste o prefetch falha em silêncio, o botão fica desligado.
  navigatorAudioUrl: vi.fn(async () => ({ ok: false, message: "sem áudio no teste" })),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: vi.fn(async () => ({ data: { url: "https://accounts.google.com/o/oauth2" }, error: null })) } } }));

import { NavigatorRequestCard } from "@/components/navigator/NavigatorSecureForms";
import { VertalNavigatorInline } from "@/components/vertal-chat/VertalNavigatorCard";
import * as store from "@/lib/navigator/store";
import type { NavigatorPending } from "@/lib/navigator/navigatorCore";

const SID = "22222222-2222-4222-8222-222222222222";
afterEach(() => {
  store.__resetNavigatorStore();
  callNavigator.mockClear();
});

const login: NavigatorPending = { id: "abcdef1234567890", kind: "login", host: "accounts.google.com", domain: "google.com", site: "google-com", loginFields: ["username", "password"] };

describe("cartões seguros do Navigator (inline no chat)", () => {
  it("login: envia direto ao Worker, guarda no Cofre por padrão e limpa a senha da tela", async () => {
    store.__patchNavigatorStoreForTest({ sessionId: SID, pending: [login] });
    render(<NavigatorRequestCard pending={login} />);
    expect(screen.getByText("Entrar em google.com")).toBeInTheDocument();
    expect(screen.getByLabelText("Guardar no Cofre para google.com")).toBeChecked();
    fireEvent.change(screen.getByLabelText("E-mail ou usuário"), { target: { value: "laercio@gmail.com" } });
    const pw = screen.getByLabelText("Senha") as HTMLInputElement;
    expect(pw.type).toBe("password");
    fireEvent.change(pw, { target: { value: "S3nh@Forte!" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Entrar/ })); });
    expect(callNavigator).toHaveBeenCalledWith("input", { sessionId: SID, requestId: login.id, kind: "login", save: true, username: "laercio@gmail.com", password: "S3nh@Forte!" });
    await waitFor(() => expect(pw.value).toBe(""));
    expect(JSON.stringify(store.getNavigatorState())).not.toContain("S3nh@Forte!");
    expect(await screen.findByText(/Guardado no Cofre: GOOGLE_COM_PASSWORD/)).toBeInTheDocument();
  });

  it("login recusado: volta com o usuário preenchido e só pede a senha de novo", () => {
    render(<NavigatorRequestCard pending={{ ...login, retry: true, prefillUsername: "laercio@gmail.com" }} />);
    expect(screen.getByText(/recusou o login/)).toBeInTheDocument();
    expect((screen.getByLabelText("E-mail ou usuário") as HTMLInputElement).value).toBe("laercio@gmail.com");
  });

  it("Gmail: oferece o conector no lugar da senha", async () => {
    store.__patchNavigatorStoreForTest({ sessionId: SID, pending: [login] });
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<NavigatorRequestCard pending={{ ...login, connector: "gmail" }} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Conectar Gmail" })); });
    expect(open).toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Já conectei/ })); });
    expect(callNavigator).toHaveBeenCalledWith("input", { sessionId: SID, requestId: login.id, kind: "connector", connector: "gmail" });
  });

  it("código do autenticador com opção de guardar a chave (exige consentimento)", async () => {
    const code: NavigatorPending = { id: "abcdef1234567891", kind: "code", host: "github.com", domain: "github.com", otpKind: "totp" };
    store.__patchNavigatorStoreForTest({ sessionId: SID, pending: [code] });
    render(<NavigatorRequestCard pending={code} />);
    expect(screen.getByText("Código do app autenticador")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Guardar no Cofre a chave do autenticador/));
    fireEvent.change(screen.getByLabelText("Chave do autenticador"), { target: { value: "JBSWY3DPEHPK3PXP" } });
    expect(screen.getByRole("button", { name: /Enviar código/ })).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/Autorizo a Vertal/));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Enviar código/ })); });
    expect(callNavigator).toHaveBeenCalledWith("input", { sessionId: SID, requestId: code.id, kind: "code", totpSeed: "JBSWY3DPEHPK3PXP", confirmed: true });
  });

  it("telefone: país (+55 padrão) + DDD + número em E.164; guardar só se marcar", async () => {
    const phone: NavigatorPending = { id: "abcdef1234567892", kind: "phone", host: "www.itau.com.br", domain: "itau.com.br", question: "Celular para SMS" };
    store.__patchNavigatorStoreForTest({ sessionId: SID, pending: [phone] });
    render(<NavigatorRequestCard pending={phone} />);
    expect((screen.getByLabelText("País") as HTMLSelectElement).value).toBe("55");
    expect(screen.getByLabelText("Guardar no Cofre para itau.com.br")).not.toBeChecked();
    fireEvent.change(screen.getByLabelText("DDD"), { target: { value: "11" } });
    fireEvent.change(screen.getByLabelText("Número"), { target: { value: "99999-8888" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /^Enviar$/ })); });
    expect(callNavigator).toHaveBeenCalledWith("input", { sessionId: SID, requestId: phone.id, kind: "phone", value: "+5511999998888", save: false });
  });

  it("Vertal Chat: o navegador aparece como cartão na mensagem (sem painel/página) e o pedido aparece nele", () => {
    store.__patchNavigatorStoreForTest({
      sessionId: SID, agentStatus: "waiting", pending: [login],
      currentTask: { id: "t1", task: "leia meus e-mails", runId: "r1", baseSeq: 0, startedAt: 1, origin: "vertal-chat" },
    });
    const listener = vi.fn();
    window.addEventListener("vertal-navigator:open", listener);
    render(<VertalNavigatorInline pending />);
    expect(screen.getByTestId("vertal-navigator-live")).toBeInTheDocument();
    expect(screen.getByTestId("navigator-secure-form")).toBeInTheDocument();
    expect(store.getNavigatorState().inlineApprovalHosts).toBe(1);
    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener("vertal-navigator:open", listener);
  });

  it("tarefa de outra origem ou mensagem já respondida: sem cartão ao vivo", () => {
    store.__patchNavigatorStoreForTest({ sessionId: SID, agentStatus: "running", currentTask: { id: "t1", task: "x", runId: "r1", baseSeq: 0, startedAt: 1, origin: "vibe-code" } });
    const { container } = render(<VertalNavigatorInline pending />);
    expect(container).toBeEmptyDOMElement();
    const r2 = render(<VertalNavigatorInline pending={false} />);
    expect(r2.container).toBeEmptyDOMElement();
  });
});
