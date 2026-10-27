import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { VibeRequirementsCard } from "@/components/vibe-code/VibeRequirementsCard";
import { applyConnectionStatus, detectRequirements } from "@/config/connectorCatalog";

describe("VibeRequirementsCard", () => {
  it("mostra o que falta conectar, os segredos e o caminho certo", () => {
    const reqs = applyConnectionStatus(detectRequirements("Cobrar assinatura com Stripe e avisar no Slack"), ["slack"]);
    render(
      <MemoryRouter>
        <VibeRequirementsCard requirements={reqs} />
      </MemoryRouter>,
    );

    expect(screen.getByText("Stripe (pagamentos)")).toBeInTheDocument();
    expect(screen.getByText("STRIPE_SECRET_KEY")).toBeInTheDocument();
    expect(screen.getByText("falta conectar")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /conectar/i })).toHaveAttribute("href", "/connect");
    // Slack já conectado: sem botão de conectar.
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByText("conectado")).toBeInTheDocument();
  });

  it("API fora do catálogo vira 'Configurar' e leva ao hub de conectores", () => {
    const reqs = detectRequirements("", { "a.ts": "const k = process.env.ACME_API_KEY;" });
    render(
      <MemoryRouter>
        <VibeRequirementsCard requirements={reqs} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: /configurar/i })).toHaveAttribute("href", "/connectors");
    expect(screen.getByText("ACME_API_KEY")).toBeInTheDocument();
  });
});
