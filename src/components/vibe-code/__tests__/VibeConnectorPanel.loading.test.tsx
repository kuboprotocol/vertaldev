import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

let resolveUser: (v: unknown) => void = () => {};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: () => new Promise((r) => { resolveUser = r; }),
    },
  },
}));

import { VibeConnectorPanel } from "@/components/vibe-code/VibeConnectorPanel";

describe("VibeConnectorPanel contador de conectores", () => {
  it("mostra … enquanto verifica e o número depois", async () => {
    render(<MemoryRouter><VibeConnectorPanel /></MemoryRouter>);
    const badge = screen.getByTestId("connectors-count");
    expect(badge.textContent).toBe("…/5");

    resolveUser({ data: { user: null } });
    await waitFor(() => expect(badge.textContent).toBe("1/5"));
  });
});
