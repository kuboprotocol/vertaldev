import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => {
  const maybeSingle = vi.fn(async () => ({ data: { edits_limit: 100, edits_used: 10 }, error: null }));
  const chain = { select: () => chain, eq: () => chain, maybeSingle };
  return {
    supabase: {
      auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
      from: () => chain,
      channel: () => {
        const ch = { on: () => ch, subscribe: () => ch };
        return ch;
      },
      removeChannel: vi.fn(),
    },
  };
});

import { VibeCreditMeter } from "@/components/vibe-code/VibeCreditMeter";

describe("VibeCreditMeter", () => {
  it("mostra o saldo restante (limite - usado) ao carregar", async () => {
    render(<VibeCreditMeter />);
    await waitFor(() => expect(screen.getByText(/90 créditos/)).toBeTruthy());
  });
});
