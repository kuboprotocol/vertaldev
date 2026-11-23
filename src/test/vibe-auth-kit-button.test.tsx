import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/fileUpload", () => ({ uploadFile: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getUser: vi.fn() } } }));

import { VibeAuthKitButton } from "@/components/vibe-code/VibeAuthKitButton";
import { AUTH_KIT_FOOTER, AUTH_KIT_TERMS_VERSION, DEFAULT_AUTH_KIT_PREFS, type AuthKitPrefs } from "@/lib/vertalAuthKit";

function Harness({ onPrefs }: { onPrefs: (p: AuthKitPrefs) => void }) {
  const [prefs, setPrefs] = useState<AuthKitPrefs>(DEFAULT_AUTH_KIT_PREFS);
  return (
    <VibeAuthKitButton
      prefs={prefs}
      onChange={(p) => { setPrefs(p); onPrefs(p); }}
      open
      onOpenChange={() => {}}
    />
  );
}

describe("VibeAuthKitButton (Login Vertal)", () => {
  it("liga o kit; logo próprio só depois do checkbox dos termos, que mostra o rodapé fixo", () => {
    const onPrefs = vi.fn();
    render(<Harness onPrefs={onPrefs} />);
    expect(screen.getByText("Logo do Vertal Dev (padrão)")).toBeInTheDocument();
    expect(screen.getByTestId("vibe-auth-kit-logo")).toBeDisabled();
    expect(screen.queryByText(AUTH_KIT_FOOTER)).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("vibe-auth-kit-switch"));
    expect(onPrefs).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: true }));

    fireEvent.click(screen.getByTestId("vibe-auth-kit-terms"));
    expect(onPrefs).toHaveBeenLastCalledWith(expect.objectContaining({ termsAccepted: true, termsVersion: AUTH_KIT_TERMS_VERSION }));
    expect(screen.getByTestId("vibe-auth-kit-logo")).not.toBeDisabled();
    expect(screen.getByText(AUTH_KIT_FOOTER)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("vibe-auth-kit-terms"));
    expect(onPrefs).toHaveBeenLastCalledWith(expect.objectContaining({ termsAccepted: false, logoUrl: undefined }));
  });
});
