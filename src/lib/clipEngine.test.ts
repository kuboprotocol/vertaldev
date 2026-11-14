import { describe, expect, it } from "vitest";
import {
  captionPages, centerToFocus, chunkPlan, columnFocus, combineScores, emojiFor, focusAt, isSkin, smoothFocusTrack, cropRect, encodeWav, findClips, formatTime, mergeTranscripts,
  normalizeAiClips, parseTimestamp, quoteClips, snapToSentences, transcriptForPrompt, type Transcript,
} from "./clipEngine";

/** 40 sentences of 5s each (200s), some with strong hooks. */
function fakeTranscript(): Transcript {
  const lines = Array.from({ length: 40 }, (_, i) =>
    i === 10 ? "Por que ninguém te conta o segredo do dinheiro?"
      : i === 25 ? "Pare agora: esse erro custa um milhão por ano!"
      : `Frase comum número ${i} sobre o assunto do vídeo.`,
  );
  const segments = lines.map((text, i) => ({ text, start: i * 5, end: i * 5 + 5 }));
  return mergeTranscripts([{ offset: 0, transcript: { segments, language: "pt" } }], 200);
}

describe("time helpers", () => {
  it("formats and parses timestamps", () => {
    expect(formatTime(65)).toBe("1:05");
    expect(formatTime(3725)).toBe("1:02:05");
    expect(parseTimestamp("1:05")).toBe(65);
    expect(parseTimestamp("01:02:05")).toBe(3725);
    expect(parseTimestamp("12.5")).toBe(12.5);
    expect(parseTimestamp(7)).toBe(7);
    expect(parseTimestamp("abc")).toBeNull();
    expect(parseTimestamp(-1)).toBeNull();
  });

  it("plans chunks and quotes credits", () => {
    expect(chunkPlan(650, 300)).toEqual([{ start: 0, end: 300 }, { start: 300, end: 600 }, { start: 600, end: 650 }]);
    expect(quoteClips(8)).toBe(8);
    expect(quoteClips(1)).toBe(1);
    expect(quoteClips(0)).toBe(1);
  });
});

describe("mergeTranscripts", () => {
  it("shifts chunks by offset and keeps order", () => {
    const t = mergeTranscripts([
      { offset: 300, transcript: { words: [{ word: " b", start: 1, end: 2 }], segments: [{ text: "b", start: 1, end: 2 }] } },
      { offset: 0, transcript: { words: [{ word: "a", start: 1, end: 2 }], segments: [{ text: "a", start: 1, end: 2 }] } },
    ], 600);
    expect(t.words.map((w) => [w.word, w.start])).toEqual([["a", 1], ["b", 301]]);
    expect(t.segments[1].start).toBe(301);
  });

  it("synthesizes word timings when only segments exist", () => {
    const t = fakeTranscript();
    expect(t.words.length).toBeGreaterThan(100);
    expect(t.words[0].start).toBe(0);
  });
});

describe("clip selection", () => {
  it("in-house engine returns non-overlapping clips within range, best hooks first", () => {
    const t = fakeTranscript();
    const clips = findClips(t, { min: 15, max: 30 }, 4);
    expect(clips.length).toBe(4);
    for (const c of clips) {
      expect(c.end - c.start).toBeGreaterThanOrEqual(15);
      expect(c.end - c.start).toBeLessThanOrEqual(30);
      expect(c.score).toBeGreaterThanOrEqual(0);
      expect(c.score).toBeLessThanOrEqual(100);
    }
    const sorted = [...clips].sort((a, b) => a.start - b.start);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i].start).toBeGreaterThanOrEqual(sorted[i - 1].end - 0.25 * 30);
    expect([50, 125]).toContain(clips[0].start);
  });

  it("snaps to sentence boundaries", () => {
    const t = fakeTranscript();
    expect(snapToSentences(t, 51.7, 78.2, { min: 15, max: 30 })).toEqual({ start: 50, end: 80 });
  });

  it("normalizes AI output: mm:ss, snapping, invalid entries and overlaps", () => {
    const t = fakeTranscript();
    const clips = normalizeAiClips({
      clips: [
        { start: "0:51", end: "1:18", title: "Segredo", scores: { hook: 9, flow: 8, value: 8, trend: 7 }, hashtags: ["dinheiro", "#ia"] },
        { start: 52, end: 79, title: "Duplicado" },
        { start: 90, end: 80, title: "Inválido" },
        { start: 999, end: 1010, title: "Fora do vídeo" },
      ],
    }, t, { min: 15, max: 30 }, 5);
    expect(clips).toHaveLength(1);
    expect(clips[0]).toMatchObject({ start: 50, end: 80, title: "Segredo", source: "ai", hashtags: ["#dinheiro", "#ia"] });
  });

  it("weights the hook most", () => {
    expect(combineScores({ hook: 10, flow: 0, value: 0, trend: 0 })).toBe(40);
    expect(combineScores({ hook: 10, flow: 10, value: 10, trend: 10 })).toBe(100);
  });

  it("builds a timestamped prompt", () => {
    expect(transcriptForPrompt(fakeTranscript()).split("\n")[0]).toBe("[0.0-5.0] Frase comum número 0 sobre o assunto do vídeo.");
  });
});

describe("captions", () => {
  it("pages words by size, punctuation and pauses", () => {
    const words = [
      { word: "Olha", start: 0, end: 0.3 }, { word: "só", start: 0.3, end: 0.5 }, { word: "isso,", start: 0.5, end: 0.8 },
      { word: "é", start: 0.9, end: 1 }, { word: "incrível", start: 1, end: 1.5 },
      { word: "depois", start: 3, end: 3.4 },
    ];
    const pages = captionPages(words, 0, 10, 3);
    expect(pages.map((p) => p.words.map((w) => w.word).join(" "))).toEqual(["Olha só isso,", "é incrível", "depois"]);
    expect(pages[0].end).toBe(0.9); // held until the next page
  });
});

describe("framing and audio", () => {
  it("crops 16:9 into 9:16 following the focus", () => {
    const c = cropRect(1920, 1080, 1080, 1920, 0.5);
    expect(c.sh).toBe(1080);
    expect(c.sw).toBeCloseTo(607.5);
    expect(c.sx).toBeCloseTo((1920 - 607.5) / 2);
    expect(cropRect(1920, 1080, 1080, 1920, 0).sx).toBe(0);
  });

  it("encodes a valid WAV header", () => {
    const buf = encodeWav(new Float32Array([0, 1, -1]), 16000);
    const v = new DataView(buf);
    expect(buf.byteLength).toBe(50);
    expect(String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3))).toBe("RIFF");
    expect(v.getUint32(24, true)).toBe(16000);
    expect(v.getInt16(46, true)).toBe(32767);
    expect(v.getInt16(48, true)).toBe(-32768);
  });
});

describe("auto-reframe (Vertal Track)", () => {
  it("finds the subject's column window", () => {
    const cols = new Array(100).fill(0);
    for (let i = 70; i < 80; i++) cols[i] = 5;
    expect(columnFocus(cols, 0.3)).toBeCloseTo(0.75, 1);
    expect(columnFocus(new Array(10).fill(0), 0.3)).toBeNull();
  });

  it("maps a subject center to the crop pan range", () => {
    expect(centerToFocus(0.5, 0.3)).toBeCloseTo(0.5);
    expect(centerToFocus(0.1, 0.3)).toBe(0);
    expect(centerToFocus(0.95, 0.3)).toBe(1);
    expect(centerToFocus(0.2, 1)).toBe(0.5);
  });

  it("smooths jitter, snaps on cuts and holds through gaps", () => {
    const track = smoothFocusTrack([
      { t: 0, x: 0.5 }, { t: 0.5, x: 0.53 }, { t: 1, x: 0.6 }, { t: 1.5, x: null }, { t: 2, x: 0.95 },
    ]);
    expect(track.map((k) => k.x)).toEqual([0.5, 0.5, 0.535, 0.535, 0.95]);
  });

  it("interpolates focus, holding across cuts", () => {
    const track = [{ t: 0, x: 0.2 }, { t: 1, x: 0.4 }, { t: 2, x: 0.95 }];
    expect(focusAt(track, 0.5)).toBeCloseTo(0.3);
    expect(focusAt(track, 1.2)).toBe(0.4);
    expect(focusAt(track, 1.8)).toBe(0.95);
    expect(focusAt([], 3, 0.42)).toBe(0.42);
  });

  it("detects skin tones", () => {
    expect(isSkin(224, 172, 140)).toBe(true);
    expect(isSkin(141, 85, 36)).toBe(true);
    expect(isSkin(30, 90, 200)).toBe(false);
  });
});

describe("auto emojis", () => {
  it("maps keywords in pt/en, ignoring case, accents variants and punctuation", () => {
    expect(emojiFor("Dinheiro,")).toBe("💰");
    expect(emojiFor("IA")).toBe("🤖");
    expect(emojiFor("milhões!")).toBe("💰");
    expect(emojiFor("segredo")).toBe("🤫");
    expect(emojiFor("bitcoin")).toBe("🪙");
    expect(emojiFor("casa")).toBeNull();
    expect(emojiFor("a")).toBeNull();
  });
});
