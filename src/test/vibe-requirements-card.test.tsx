import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const saveSecretValue = vi.fn(async (input: { env_key: string }) => ({ env_key: input.env_key, masked_hint: "re_••••abcd" }));
vi.mock("@/hooks/useKuboSecrets", () => ({ saveSecretValue: (i: { env_key: string }) => saveSecretValue(i) }));

import { VibeRequirementsCard } from "@/components/vibe-code/VibeRequirementsCard";
import { applyConnectionStatus, applyVaultStatus, detectRequirements } from "@/config/connectorCatalog";

const renderCard = (reqs: ReturnType<typeof detectRequirements>) =>
  render(
    <MemoryRouter>
      <VibeRequirementsCard requirements={reqs} />
    </MemoryRouter>,
  );

describe("VibeRequirementsCard", () => {
  beforeEach(() => {
    saveSecretValue.mockClear();
  });

  it("conector: mostra Conectar e onde pegar a chave; conectado não pede nada", () => {
    const reqs = applyConnectionStatus(detectRequirements("Cobrar assinatura com Stripe e avisar no Slack"), ["slack"]);
    renderCard(reqs);

    expect(screen.getByText("Stripe (pagamentos)")).toBeInTheDocument();
    expect(screen.getByText("STRIPE_SECRET_KEY")).toBeInTheDocument();
    expect(screen.getByText("falta conectar")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /conectar/i })).toHaveAttribute("href", "/connect");
    expect(screen.getByRole("link", { name: /onde pegar a chave/i })).toHaveAttribute("href", "https://dashboard.stripe.com/apikeys");
    // Conector não usa o campo do cofre: a chave vai pelo próprio conector.
    expect(screen.queryByTestId("vibe-secret-fields")).toBeNull();
    // Slack já conectado: nenhum link para ele.
    expect(screen.getByText("conectado")).toBeInTheDocument();
    expect(screen.getAllByRole("link").every((a) => !a.getAttribute("href")?.includes("slack"))).toBe(true);
  });

  it("API sem conector: conta, chave e campo para colar, que guarda no cofre e some", async () => {
    renderCard(detectRequirements("enviar e-mail de confirmação com Resend"));

    expect(screen.getByRole("link", { name: /criar conta/i })).toHaveAttribute("href", "https://resend.com/signup");
    expect(screen.getByRole("link", { name: /onde pegar a chave/i })).toHaveAttribute("href", "https://resend.com/api-keys");

    const field = screen.getByLabelText("Valor de RESEND_API_KEY") as HTMLInputElement;
    expect(field.type).toBe("password");
    fireEvent.change(field, { target: { value: "re_live_secret_value" } });
    fireEvent.click(screen.getByRole("button", { name: /guardar no cofre/i }));

    await waitFor(() => expect(saveSecretValue).toHaveBeenCalledTimes(1));
    expect(saveSecretValue.mock.calls[0][0]).toMatchObject({ env_key: "RESEND_API_KEY", value: "re_live_secret_value" });
    await waitFor(() => expect(screen.getByText("no cofre")).toBeInTheDocument());
    expect(screen.queryByLabelText("Valor de RESEND_API_KEY")).toBeNull();
    expect(document.body.innerHTML).not.toContain("re_live_secret_value");
  });

  it("chave que já está no cofre aparece pronta, sem pedir de novo", () => {
    renderCard(applyVaultStatus(detectRequirements("enviar e-mail com Resend"), ["RESEND_API_KEY"]));
    expect(screen.getByText("no cofre")).toBeInTheDocument();
    expect(screen.queryByTestId("vibe-secret-fields")).toBeNull();
  });

  it("API fora do catálogo pede a chave com o nome exato da variável", () => {
    renderCard(detectRequirements("", { "a.ts": "const k = process.env.ACME_API_KEY;" }));
    expect(screen.getByText("ACME_API_KEY")).toBeInTheDocument();
    expect(screen.getByLabelText("Valor de ACME_API_KEY")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /cofre de segredos/i })).toHaveAttribute("href", "/secrets");
  });
});
