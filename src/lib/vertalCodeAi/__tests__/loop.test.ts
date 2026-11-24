/* eslint-disable @typescript-eslint/no-explicit-any -- testes com dublês */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession: vi.fn() } } }));

import type { BuildResponse, PollResponse, ProposedFile, VcaiApi } from "../api";
import { mergeProposals, runBuildLoop } from "../loop";

const file = (path: string, after: string, extra: Partial<ProposedFile> = {}): ProposedFile => ({
  path,
  isNew: false,
  after,
  diff: "",
  added: 1,
  removed: 0,
  reason: null,
  baseHash: "h0",
  problems: [],
  ...extra,
});

const build = (files: ProposedFile[], extra: Partial<BuildResponse> = {}): BuildResponse => ({
  mode: "build",
  summary: "s",
  notes: [],
  testCommand: null,
  files,
  failures: [],
  route: { cost: "free", attempts: 1, imagesRead: false },
  ...extra,
});

const poll = (exitCode: number | null, failure: string | null = null): PollResponse => ({
  done: exitCode !== null,
  exitCode,
  steps: [{ name: "typecheck", code: exitCode }],
  log: failure ?? "",
  failure,
});

function fakeApi(builds: BuildResponse[], polls: PollResponse[]): VcaiApi & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    status: vi.fn(),
    plan: vi.fn(),
    build: vi.fn(async (req) => {
      calls.push(req.fix ? `build:fix:${req.fix.log}` : "build");
      return builds.shift()!;
    }),
    sandboxStart: vi.fn(async () => {
      calls.push("start");
      return { handle: "h1" };
    }),
    sandboxUpdate: vi.fn(async () => {
      calls.push("update");
      return { handle: "h2" };
    }),
    sandboxPoll: vi.fn(async () => {
      calls.push("poll");
      return polls.shift()!;
    }),
    sandboxStop: vi.fn(async () => {
      calls.push("stop");
    }),
    apply: vi.fn(),
  } as VcaiApi & { calls: string[] };
}

const req = { prompt: "faça x", profile: "auto" as const, effort: "low" as const };
const sleep = async () => undefined;

describe("ciclo construir ─► testar ─► corrigir", () => {
  it("sem sandbox: só constrói e devolve para revisão", async () => {
    const api = fakeApi([build([file("a.ts", "1")])], []);
    const r = await runBuildLoop({ api, request: req, test: false, sleep });
    expect(r.ok).toBe(true);
    expect(api.calls).toEqual(["build"]);
  });

  it("falha nos testes, corrige sozinho e passa", async () => {
    const api = fakeApi(
      [build([file("a.ts", "v1"), file("b.ts", "b1", { isNew: true, baseHash: "" })]), build([file("a.ts", "v2", { baseHash: "outro" })])],
      [poll(null), poll(2, "error TS2304"), poll(0)],
    );
    const events: string[] = [];
    const r = await runBuildLoop({ api, request: req, test: true, sleep, onEvent: (e) => events.push(e.kind) });
    expect(r.ok).toBe(true);
    expect(r.rounds).toBe(2);
    expect(api.calls).toEqual(["build", "start", "poll", "poll", "build:fix:error TS2304", "update", "poll", "stop"]);
    // Versão final acumulada; baseHash continua o do arquivo original.
    expect(r.files.find((f) => f.path === "a.ts")).toMatchObject({ after: "v2", baseHash: "h0" });
    expect(r.files.find((f) => f.path === "b.ts")).toMatchObject({ after: "b1", isNew: true });
    expect(events).toContain("fixing");
  });

  it("para no limite de correções e encerra o sandbox", async () => {
    const api = fakeApi([build([file("a.ts", "v1")]), build([file("a.ts", "v2")])], [poll(1, "x"), poll(1, "y")]);
    const r = await runBuildLoop({ api, request: req, test: true, sleep, maxFixRounds: 1 });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/1 correção/);
    expect(api.calls.at(-1)).toBe("stop");
  });

  it("encerra o sandbox mesmo com erro no meio", async () => {
    const api = fakeApi([build([file("a.ts", "v1")])], []);
    (api.sandboxPoll as any).mockRejectedValueOnce(new Error("rede"));
    await expect(runBuildLoop({ api, request: req, test: true, sleep })).rejects.toThrow("rede");
    expect(api.calls.at(-1)).toBe("stop");
  });

  it("mergeProposals mantém o baseHash original", () => {
    expect(mergeProposals([file("a", "1")], [file("a", "2", { baseHash: "x" }), file("c", "3")]).map((f) => [f.path, f.after, f.baseHash])).toEqual([
      ["a", "2", "h0"],
      ["c", "3", "h0"],
    ]);
  });
});
