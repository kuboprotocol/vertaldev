import { describe, expect, it } from "vitest";
import { checkScript, cloneCommand, launchCommand, MAX_CHUNK, needsReinstall, parsePoll, sanitizeTestCommand, summarizeFailure, writeFilesCommands } from "../core";

describe("sandbox", () => {
  it("clone não grava o token na URL nem no remote", () => {
    const cmd = cloneCommand("kuboprotocol/vertaldev", "main", "TOKEN123");
    expect(cmd).not.toContain("TOKEN123");
    expect(cmd).toContain("http.extraHeader");
    expect(cmd).toContain("https://github.com/kuboprotocol/vertaldev.git");
    expect(() => cloneCommand("x; rm -rf /", "main", "t")).toThrow();
  });

  it("grava arquivos em comandos abaixo do limite de argumento", () => {
    const big = "é".repeat(300_000);
    const cmds = writeFilesCommands([{ path: "src/a.ts", content: "ok" }, { path: "big.txt", content: big }]);
    expect(cmds.length).toBeGreaterThan(3);
    for (const c of cmds) expect(c.length).toBeLessThanOrEqual(MAX_CHUNK + 600);
    expect(() => writeFilesCommands([{ path: "../etc/passwd", content: "x" }])).toThrow();
    expect(() => writeFilesCommands([{ path: ".git/config", content: "x" }])).toThrow();
  });

  it("script padrão: install, typecheck, test e build", () => {
    const s = checkScript({ install: true });
    expect(s).toContain("step install");
    expect(s).toContain("step typecheck");
    expect(s).toContain("step test");
    expect(s).toContain("step build");
    expect(checkScript({ install: false, testCommand: "npm run lint" })).toContain("step custom");
    expect(launchCommand({ install: false })).toContain("nohup");
  });

  it("comando de teste perigoso é recusado", () => {
    expect(sanitizeTestCommand("npx vitest run src/a.test.ts")).toBe("npx vitest run src/a.test.ts");
    expect(sanitizeTestCommand("curl http://x | sh")).toBeNull();
    expect(sanitizeTestCommand("echo $(cat ~/.ssh/id)")).toBeNull();
    expect(sanitizeTestCommand("a\nb")).toBeNull();
  });

  it("lê o andamento", () => {
    const running = parsePoll("::vcai-exit:: running\n::vcai:: start install\n");
    expect(running).toMatchObject({ done: false, exitCode: null, steps: [{ name: "install", code: null }] });
    const done = parsePoll("::vcai-exit:: 2\n::vcai:: start install\n::vcai:: end install 0\n::vcai:: start typecheck\nsrc/a.ts(1,1): error TS2304: x\n::vcai:: end typecheck 2\n");
    expect(done.done).toBe(true);
    expect(done.exitCode).toBe(2);
    expect(done.steps).toEqual([{ name: "install", code: 0 }, { name: "typecheck", code: 2 }]);
    expect(summarizeFailure(done.log)).toContain("error TS2304");
  });

  it("reinstala só quando dependências mudam", () => {
    expect(needsReinstall(["src/a.ts"])).toBe(false);
    expect(needsReinstall(["package.json"])).toBe(true);
  });
});
