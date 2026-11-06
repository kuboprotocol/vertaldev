import { describe, expect, it } from "vitest";
import {
  PYTHON_PACKAGES,
  VIBE_LIBRARIES,
  findLibrary,
  librariesByStatus,
  pythonImportName,
} from "@/config/vibeLibraries";
import { sanitizePackages } from "@/config/vibeAgents";

const SHELL_SAFE_PIP = /^[a-z0-9][a-z0-9._-]*$/;

// Entradas que já existiam antes desta expansão: não podem sumir nem mudar de status.
const ORIGINAL_PYTHON_READY = [
  "pandas", "numpy", "scipy", "polars", "pyarrow", "duckdb", "scikit-learn", "statsmodels", "xgboost", "lightgbm",
  "matplotlib", "seaborn", "plotly", "altair", "bokeh", "openpyxl", "xlsxwriter", "python-docx", "python-pptx",
  "pypdf", "reportlab", "pyyaml", "tabulate", "markdown", "requests", "httpx", "aiohttp", "beautifulsoup4", "lxml",
  "feedparser", "fastapi", "uvicorn", "flask", "pydantic", "sqlalchemy", "psycopg2-binary", "asyncpg", "pymongo",
  "redis", "supabase", "pytest", "hypothesis", "ruff", "mypy", "openai", "anthropic", "tiktoken", "nltk", "sympy",
  "networkx", "shapely", "web3", "eth-account", "cryptography", "python-dateutil", "pytz", "rich", "typer", "tqdm",
  "orjson", "joblib", "pillow", "opencv-python-headless", "imageio", "pydub", "pefile", "pyelftools", "capstone",
  "yara-python",
];
const ORIGINAL_IDS_NON_PYTHON = ["ghidra", "next", "react", "express", "github.com/gin-gonic/gin", "gorm.io/gorm"];

describe("catálogo de bibliotecas do Vibe Dev", () => {
  it("é maior que a versão anterior e tem ids únicos", () => {
    expect(VIBE_LIBRARIES.length).toBeGreaterThanOrEqual(260);
    const ids = VIBE_LIBRARIES.map((l) => l.id);
    expect(new Set(ids).size, "ids duplicados").toBe(ids.length);
  });

  it("nenhuma entrada original foi removida ou perdeu o status ready", () => {
    for (const pkg of ORIGINAL_PYTHON_READY) {
      const lib = findLibrary(pkg);
      expect(lib, pkg).toBeDefined();
      expect(lib?.status, pkg).toBe("ready");
    }
    for (const id of ORIGINAL_IDS_NON_PYTHON) expect(findLibrary(id), id).toBeDefined();
  });

  it("toda entrada tem descrição, pacote e nome preenchidos", () => {
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

  it("nome de import Python é conhecido para os pacotes que diferem do nome pip", () => {
    expect(pythonImportName("beautifulsoup4")).toBe("bs4");
    expect(pythonImportName("pillow")).toBe("PIL");
    expect(pythonImportName("opencv-python-headless")).toBe("cv2");
    expect(pythonImportName("scikit-learn")).toBe("sklearn");
    expect(pythonImportName("pymupdf")).toBe("fitz");
    expect(pythonImportName("pandas")).toBe("pandas");
    expect(pythonImportName("torch")).toBe("torch");
    expect(pythonImportName("next")).toBeUndefined();
  });
});

describe("allowlist de pip da sandbox Python", () => {
  it("é derivada só de bibliotecas pip com status ready", () => {
    const expected = VIBE_LIBRARIES.filter((l) => l.runtime === "pip" && l.status === "ready").map((l) => l.package);
    expect(PYTHON_PACKAGES).toEqual(expected);
  });

  it("contém todos os pacotes que já estavam permitidos antes", () => {
    for (const pkg of ORIGINAL_PYTHON_READY) expect(PYTHON_PACKAGES, pkg).toContain(pkg);
  });

  it("nomes são únicos e seguros para o shell (vão num comando pip install)", () => {
    expect(new Set(PYTHON_PACKAGES).size).toBe(PYTHON_PACKAGES.length);
    for (const pkg of PYTHON_PACKAGES) expect(pkg, pkg).toMatch(SHELL_SAFE_PIP);
  });

  it("não contém nada que exija template próprio", () => {
    for (const pkg of ["torch", "tensorflow", "transformers", "spacy", "sentence-transformers", "prophet", "mlflow", "geopandas", "pytesseract", "selenium", "pyghidra", "ghidra-bridge"]) {
      expect(PYTHON_PACKAGES).not.toContain(pkg);
    }
  });

  it("sanitizePackages aceita a lista, normaliza caixa e descarta o resto", () => {
    expect(sanitizePackages(["Pillow", "  PANDAS ", "torch", "pandas", "; rm -rf /"])).toEqual(["pillow", "pandas"]);
  });
});

describe("entradas vindas do REA (morluto/rea)", () => {
  const rea = VIBE_LIBRARIES.filter((l) => l.source?.startsWith("REA"));

  it("traz as duas listas: dependências npm e motores de código aberto", () => {
    expect(rea.length).toBeGreaterThanOrEqual(50);
    expect(rea.some((l) => l.runtime === "npm")).toBe(true);
    expect(rea.some((l) => l.runtime === "tool")).toBe(true);
  });

  it("ferramentas de exploração e interceptação nunca entram na allowlist de pip", () => {
    for (const pkg of ["pwntools", "unicorn", "binwalk", "unblob", "mitmproxy"]) {
      expect(findLibrary(pkg)?.status, pkg).toBe("template");
      expect(PYTHON_PACKAGES, pkg).not.toContain(pkg);
    }
  });

  it("pwntools carrega a restrição de exploits", () => {
    expect(findLibrary("pwntools")?.note).toContain("exploits");
    expect(findLibrary("pwntools")?.note).toContain("não gera nem executa");
  });

  it("ferramentas externas são sempre template e nunca pip", () => {
    const tools = VIBE_LIBRARIES.filter((l) => l.runtime === "tool");
    expect(tools.length).toBeGreaterThanOrEqual(8);
    for (const t of tools) {
      expect(t.status, t.id).toBe("template");
      expect(PYTHON_PACKAGES, t.id).not.toContain(t.package);
    }
  });

  it("markdownify e polib são instaláveis, cairosvg não (depende do Cairo)", () => {
    expect(PYTHON_PACKAGES).toContain("markdownify");
    expect(PYTHON_PACKAGES).toContain("polib");
    expect(PYTHON_PACKAGES).not.toContain("cairosvg");
  });

  it("produtos comerciais (IDA, Hopper, JEB) não viram entrada instalável", () => {
    for (const name of ["ida", "ida-pro", "hopper", "jeb", "hex-rays"]) {
      expect(findLibrary(name), name).toBeUndefined();
    }
  });
});
