import { describe, expect, it } from "vitest";
import {
  MAX_DEPTH,
  buildFolderTree,
  canCreateChild,
  collectSubtreeIds,
  isReadableByCustomers,
  labelsFor,
  resolveLocale,
  validateFolderName,
  type KnowledgeFolder,
} from "./folders";

const f = (id: string, parentId: string | null, scope: "personal" | "business", name: string): KnowledgeFolder => ({
  id,
  parentId,
  scope,
  name,
  createdAt: 0,
});

const sample: KnowledgeFolder[] = [
  f("p", null, "personal", "Minhas ideias e outras empresas"),
  f("b", null, "business", "Meu negócio e nicho"),
  f("b1", "b", "business", "Produtos"),
  f("b2", "b", "business", "Atendimento"),
  f("b11", "b1", "business", "Preços"),
  f("p1", "p", "personal", "Startups"),
];

describe("buildFolderTree", () => {
  it("monta raízes na ordem personal, business e filhos em ordem alfabética", () => {
    const tree = buildFolderTree(sample);
    expect(tree.map((n) => n.scope)).toEqual(["personal", "business"]);
    const business = tree[1];
    expect(business.children.map((c) => c.name)).toEqual(["Atendimento", "Produtos"]);
  });

  it("calcula profundidade", () => {
    const tree = buildFolderTree(sample);
    const produtos = tree[1].children.find((c) => c.id === "b1")!;
    expect(produtos.depth).toBe(2);
    expect(produtos.children[0].depth).toBe(3);
  });

  it("ignora pasta órfã em vez de quebrar a árvore", () => {
    const tree = buildFolderTree([...sample, f("x", "nao-existe", "business", "Perdida")]);
    const names = JSON.stringify(tree);
    expect(names).not.toContain("Perdida");
  });
});

describe("escopo", () => {
  it("só a pasta de negócio é lida para clientes", () => {
    expect(isReadableByCustomers({ scope: "business" })).toBe(true);
    expect(isReadableByCustomers({ scope: "personal" })).toBe(false);
  });

  it("subpasta herdada de 'personal' nunca vira leitura de cliente", () => {
    const sub = f("p2", "p", "personal", "Dentro de ideias");
    expect(isReadableByCustomers(sub)).toBe(false);
  });
});

describe("nomes", () => {
  it("normaliza espaços e aceita nome válido", () => {
    expect(validateFolderName("  Meu   nicho  ")).toEqual({ ok: true, name: "Meu nicho" });
  });

  it("rejeita vazio, longo demais e barras", () => {
    expect(validateFolderName("   ")).toEqual({ ok: false, reason: "empty" });
    expect(validateFolderName("a".repeat(81))).toEqual({ ok: false, reason: "too_long" });
    expect(validateFolderName("a/b")).toEqual({ ok: false, reason: "invalid_chars" });
    expect(validateFolderName("a\\b")).toEqual({ ok: false, reason: "invalid_chars" });
  });
});

describe("profundidade", () => {
  it("permite criar até o limite e não além", () => {
    expect(canCreateChild(MAX_DEPTH - 1)).toBe(true);
    expect(canCreateChild(MAX_DEPTH)).toBe(false);
  });
});

describe("apagar em cascata", () => {
  it("coleta a pasta e todos os descendentes, sem tocar irmãos", () => {
    const ids = collectSubtreeIds(sample, "b1").sort();
    expect(ids).toEqual(["b1", "b11"]);
  });
});

describe("idioma", () => {
  it("usa português, espanhol ou inglês pela tag do navegador", () => {
    expect(resolveLocale("pt-BR")).toBe("pt");
    expect(resolveLocale("es-MX")).toBe("es");
    expect(resolveLocale("en-US")).toBe("en");
    expect(resolveLocale("fr-FR")).toBe("en");
    expect(resolveLocale(null)).toBe("en");
  });

  it("rótulos das raízes mudam com o idioma", () => {
    expect(labelsFor("pt-BR").businessRoot).toBe("Meu negócio e nicho");
    expect(labelsFor("en-US").businessRoot).toBe("My business and niche");
    expect(labelsFor("es-ES").personalRoot).toBe("Mis ideas y otras empresas");
  });
});
