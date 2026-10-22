import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { invoke, uploadFile, createSignedUrl } = vi.hoisted(() => ({
  invoke: vi.fn(),
  uploadFile: vi.fn(),
  createSignedUrl: vi.fn(),
}));

vi.mock("@/hooks/useSubscription", () => ({
  useSubscription: () => ({ editsRemaining: 10 }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    storage: { from: () => ({ createSignedUrl }) },
    functions: { invoke },
  },
}));

vi.mock("@/lib/fileUpload", () => ({
  uploadFile: (...args: unknown[]) => uploadFile(...args),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

// heic2any needs Worker and canvas, which jsdom does not provide; the EMO flow never converts HEIC.
vi.mock("heic2any", () => ({ default: vi.fn() }));

import { CreativeToolInterface } from "./CreativeToolInterface";

const executeButton = () => screen.getByRole("button", { name: /EXECUTAR AGORA/i });

function pickFile(inputId: string, file: File) {
  const input = document.getElementById(inputId) as HTMLInputElement;
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  fireEvent.change(input);
}

describe("Vertal EMO AI upload", () => {
  beforeEach(() => {
    invoke.mockReset();
    uploadFile.mockReset();
    createSignedUrl.mockReset();
    uploadFile.mockImplementation(async (file: File) => ({ path: `user-1/${file.name}` }));
    createSignedUrl.mockImplementation(async (path: string) => ({ data: { signedUrl: `https://signed/${path}` }, error: null }));
  });

  it("shows the photo and video upload slots and blocks execution until both are sent", () => {
    render(<CreativeToolInterface toolKey="emo" />);

    expect(screen.getByText("1. Foto de origem")).toBeTruthy();
    expect(screen.getByText("2. Vídeo de referência")).toBeTruthy();
    expect(document.getElementById("emo-image-input")).toBeTruthy();
    expect(document.getElementById("emo-video-input")).toBeTruthy();
    expect((executeButton() as HTMLButtonElement).disabled).toBe(true);
  });

  it("uploads the picked photo to the private bucket and keeps a signed link", async () => {
    render(<CreativeToolInterface toolKey="emo" />);

    pickFile("emo-image-input", new File(["x"], "rosto.jpg", { type: "image/jpeg" }));

    expect(await screen.findByText("rosto.jpg")).toBeTruthy();
    expect(uploadFile).toHaveBeenCalledWith(expect.any(File), "user-1");
    expect(createSignedUrl).toHaveBeenCalledWith("user-1/rosto.jpg", 60 * 60 * 24 * 7);
  });

  it("rejects a file of the wrong type for a slot", () => {
    render(<CreativeToolInterface toolKey="emo" />);

    pickFile("emo-video-input", new File(["x"], "foto.png", { type: "image/png" }));

    expect(uploadFile).not.toHaveBeenCalled();
  });

  it("sends the signed links to emo-animate and enables execution with both files", async () => {
    invoke.mockResolvedValue({ data: { status: "success", output_url: "https://backend/output/x.mp4" }, error: null });
    render(<CreativeToolInterface toolKey="emo" />);

    pickFile("emo-image-input", new File(["x"], "rosto.jpg", { type: "image/jpeg" }));
    await screen.findByText("rosto.jpg");
    pickFile("emo-video-input", new File(["y"], "ref.mp4", { type: "video/mp4" }));
    await screen.findByText("ref.mp4");

    await waitFor(() => expect((executeButton() as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(executeButton());

    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    expect(invoke).toHaveBeenCalledWith("emo-animate", {
      body: expect.objectContaining({
        source_image: "https://signed/user-1/rosto.jpg",
        driving_video: "https://signed/user-1/ref.mp4",
      }),
    });
  });
});
