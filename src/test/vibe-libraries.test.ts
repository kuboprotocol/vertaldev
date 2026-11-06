import { describe, expect, it } from "vitest";
import {
  PYTHON_PACKAGES,
  VIBE_LIBRARIES,
  findLibrary,
  librariesByStatus,
} from "@/config/vibeLibraries";
import { sanitizePackages } from "@/config/vibeAgents";

const SHELL_SAFE_PIP = /^[a-z0-9][a-z0-9._-]*$/;

describe("catálogo de bibliotecas do Vibe Dev", () => {
  it("tem mais de 100 bibliotecas e ids únicos", () => {
    expect(VIBE_LIBRARIES.length).toBeGreaterThanOrEqual(100);
    const ids = VIBE_LIBRARIES.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("toda entrada tem descrição e pacote preenchidos", () => {
    for (const lib of VIBE_LIBRARIES) {
      expect(lib.description.trim(), lib.id).not.toBe("");
      expect(lib.package.trim(), lib.id).not.toBe("");
      expect(lib.name.trim(), lib.id).not.toBe("");
    }
  });

  it("cobre Go, Next e Ghidra, pedidos explicitamente", () => {
    expect(librariesByStatus("reference").some((l) => l.runtime === "go")).toBe(true);
    expect(findLibrary("next")?.runtime).toBe("npm");
    expect(findLibrary("ghidra")?.status).toBe("template");
  });

  it("entradas Go usam nome curto sem o sufixo de versão", () => {
    expect(findLibrary("github.com/gofiber/fiber/v2")?.name).toBe("fiber");
    expect(findLibrary("github.com/gin-gonic/gin")?.name).toBe("gin");
  });

  it("Ghidra deixa claro o uso restrito a análise autorizada", () => {
    const ghidra = findLibrary("ghidra");
    expect(ghidra?.note).toContain("autorização");
    expect(ghidra?.note).toContain("não faz exploração automática");
  });
});

describe("allowlist de pip da sandbox Python", () => {
  it("é derivada só de bibliotecas pip com status ready", () => {
    const expected = VIBE_LIBRARIES.filter((l) => l.runtime === "pip" && l.status === "ready").map((l) => l.package);
    expect(PYTHON_PACKAGES).toEqual(expected);
  });

  it("mantém todos os pacotes que já estavam permitidos antes", () => {
    const previous = [
      "pandas", "numpy", "scipy", "scikit-learn", "matplotlib", "seaborn", "plotly", "statsmodels",
      "openpyxl", "xlsxwriter", "python-docx", "pypdf", "beautifulsoup4", "lxml", "requests", "httpx",
      "pydantic", "tabulate", "networkx", "sympy",
    ];
    for (const pkg of previous) expect(PYTHON_PACKAGES, pkg).toContain(pkg);
  });

  it("nomes são únicos e seguros para o shell (vão num comando pip install)", () => {
    expect(new Set(PYTHON_PACKAGES).size).toBe(PYTHON_PACKAGES.length);
    for (const pkg of PYTHON_PACKAGES) expect(pkg, pkg).toMatch(SHELL_SAFE_PIP);
  });

  it("não contém nada que exija template próprio", () => {
    for (const pkg of ["torch", "tensorflow", "transformers", "spacy", "sentence-transformers", "pyghidra", "ghidra-bridge"]) {
      expect(PYTHON_PACKAGES).not.toContain(pkg);
    }
  });

  it("sanitizePackages aceita a lista, normaliza caixa e descarta o resto", () => {
    expect(sanitizePackages(["Pillow", "  PANDAS ", "torch", "pandas", "; rm -rf /"])).toEqual(["pillow", "pandas"]);
  });
});
