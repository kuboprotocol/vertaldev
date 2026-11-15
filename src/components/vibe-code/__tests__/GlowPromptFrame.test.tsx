import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GlowPromptFrame } from "@/components/vibe-code/GlowPromptFrame";

describe("GlowPromptFrame", () => {
  it("renders its children inside the frame", () => {
    render(<GlowPromptFrame><textarea aria-label="prompt" /></GlowPromptFrame>);
    expect(screen.getByLabelText("prompt")).toBeTruthy();
  });

  it("marks the frame as active while the agent runs", () => {
    const { container } = render(<GlowPromptFrame active><span>x</span></GlowPromptFrame>);
    expect(container.querySelector("[data-active]")).not.toBeNull();
  });
});
