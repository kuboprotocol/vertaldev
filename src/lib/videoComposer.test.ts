import { describe, expect, it } from "vitest";
import { buildTimeline, kenBurns, pickMimeType, sceneAlpha, wrapText } from "./videoComposer";

describe("videoComposer helpers", () => {
  it("prefers MP4 and falls back to WebM", () => {
    expect(pickMimeType(() => true)).toMatch(/^video\/mp4/);
    expect(pickMimeType((t) => t.startsWith("video/webm"))).toBe("video/webm;codecs=vp9,opus");
    expect(pickMimeType(() => false)).toBeNull();
  });

  it("overlaps scenes by the crossfade duration", () => {
    const { entries, total } = buildTimeline([3, 3, 6]);
    expect(entries.map((e) => [e.start, e.end])).toEqual([[0, 3], [2.5, 5.5], [5, 11]]);
    expect(total).toBe(11);
  });

  it("fades between scenes but not at the very start or end", () => {
    const { entries } = buildTimeline([3, 3]);
    expect(sceneAlpha(entries[0], 0, true, false)).toBe(1);
    expect(sceneAlpha(entries[0], 2.75, true, false)).toBeCloseTo(0.5);
    expect(sceneAlpha(entries[1], 2.75, false, true)).toBeCloseTo(0.5);
    expect(sceneAlpha(entries[1], 5.5, false, true)).toBe(1);
    expect(sceneAlpha(entries[1], 1, false, true)).toBe(0);
  });

  it("alternates zoom direction between scenes", () => {
    expect(kenBurns(0, 1).scale).toBeGreaterThan(kenBurns(0, 0).scale);
    expect(kenBurns(1, 1).scale).toBeLessThan(kenBurns(1, 0).scale);
  });

  it("wraps text to the available width and never drops long words", () => {
    const measure = (s: string) => s.length * 10;
    expect(wrapText("quando o pix cai na conta", 100, measure)).toEqual(["quando o", "pix cai na", "conta"]);
    expect(wrapText("supercalifragilistico", 50, measure)).toEqual(["supercalifragilistico"]);
    expect(wrapText("   ", 50, measure)).toEqual([]);
  });
});
