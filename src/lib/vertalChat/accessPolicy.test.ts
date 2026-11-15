import { describe, expect, it } from "vitest";
import {
  MAX_READ_BYTES,
  evaluateAccess,
  isSensitivePath,
  normalizePath,
  type AccessRequest,
  type FileGrant,
} from "./accessPolicy";

const NOW = 1_800_000_000_000;

const ownerGrant: FileGrant = {
  id: "g-docs",
  deviceId: "pc-1",
  rootPath: "/home/ana/Documentos",
  audiences: ["owner"],
  mode: "write",
  expiresAt: null,
  revokedAt: null,
};

const catalogGrant: FileGrant = {
  id: "g-catalogo",
  deviceId: "pc-1",
  rootPath: "/home/ana/Catalogo",
  audiences: ["owner", "external_contact"],
  mode: "read",
  expiresAt: null,
  revokedAt: null,
};

function req(overrides: Partial<AccessRequest>): AccessRequest {
  return {
    audience: "owner",
    deviceId: "pc-1",
    path: "/home/ana/Documentos/contrato.pdf",
    action: "read",
    sizeBytes: 1_000,
    mimeType: "application/pdf",
    now: NOW,
    ...overrides,
  };
}

describe("normalizePath", () => {
  it("aceita caminho absoluto Linux/mac e Windows", () => {
    expect(normalizePath("/home/ana/x.pdf")).toBe("/home/ana/x.pdf");
    expect(normalizePath("C:\\Users\\ana\\Docs\\x.pdf")).toBe("C:/Users/ana/Docs/x.pdf");
  });

  it("recusa '..', relativo e byte nulo", () => {
    expect(normalizePath("/home/ana/../../etc/passwd")).toBeNull();
    expect(normalizePath("C:\\Users\\..\\Windows")).toBeNull();
    expect(normalizePath("documentos/x.pdf")).toBeNull();
    expect(normalizePath("/home/ana/x\0.pdf")).toBeNull();
  });
});

describe("evaluateAccess: concessão por pasta", () => {
  it("libera leitura dentro da pasta concedida", () => {
    const d = evaluateAccess([ownerGrant], req({}));
    expect(d).toEqual({ allowed: true, grantId: "g-docs" });
  });

  it("nega fora da pasta, mesmo com prefixo parecido", () => {
    const d = evaluateAccess([ownerGrant], req({ path: "/home/ana/Documentos-antigos/x.pdf" }));
    expect(d).toEqual({ allowed: false, reason: "no_grant" });
  });

  it("nega traversal que sai da raiz", () => {
    const d = evaluateAccess([ownerGrant], req({ path: "/home/ana/Documentos/../../.bashrc" }));
    expect(d).toEqual({ allowed: false, reason: "path_invalid" });
  });

  it("nega outro dispositivo", () => {
    const d = evaluateAccess([ownerGrant], req({ deviceId: "celular-9" }));
    expect(d).toEqual({ allowed: false, reason: "no_grant" });
  });

  it("nega concessão revogada ou expirada", () => {
    expect(evaluateAccess([{ ...ownerGrant, revokedAt: NOW - 1 }], req({}))).toEqual({ allowed: false, reason: "no_grant" });
    expect(evaluateAccess([{ ...ownerGrant, expiresAt: NOW - 1 }], req({}))).toEqual({ allowed: false, reason: "no_grant" });
    expect(evaluateAccess([{ ...ownerGrant, expiresAt: NOW + 60_000 }], req({}))).toMatchObject({ allowed: true });
  });

  it("respeita o modo: leitura não autoriza escrita", () => {
    const d = evaluateAccess([{ ...ownerGrant, mode: "read" }], req({ action: "write", mimeType: "text/plain" }));
    expect(d).toEqual({ allowed: false, reason: "no_grant" });
  });
});

describe("evaluateAccess: arquivos sensíveis e tipos", () => {
  it("bloqueia chaves, .env e cofres mesmo dentro de pasta concedida", () => {
    for (const path of [
      "/home/ana/Documentos/.env",
      "/home/ana/Documentos/servidor.pem",
      "/home/ana/Documentos/.ssh/id_rsa",
      "/home/ana/Documentos/senhas.kdbx",
      "/home/ana/Documentos/carteira/wallet.dat",
      "/home/ana/Documentos/Login Data",
    ]) {
      expect(isSensitivePath(normalizePath(path)!)).toBe(true);
      expect(evaluateAccess([ownerGrant], req({ path }))).toEqual({ allowed: false, reason: "sensitive_path" });
    }
  });

  it("recusa arquivo grande demais para leitura", () => {
    const d = evaluateAccess([ownerGrant], req({ sizeBytes: MAX_READ_BYTES + 1 }));
    expect(d).toEqual({ allowed: false, reason: "too_large" });
  });

  it("recusa tipo fora da lista (executável)", () => {
    const d = evaluateAccess([ownerGrant], req({ path: "/home/ana/Documentos/setup.exe", mimeType: "application/x-msdownload" }));
    expect(d).toEqual({ allowed: false, reason: "type_not_allowed" });
  });
});

describe("evaluateAccess: cliente externo (WhatsApp/Telegram)", () => {
  it("cliente externo lê pasta marcada para ele", () => {
    const d = evaluateAccess(
      [ownerGrant, catalogGrant],
      req({ audience: "external_contact", path: "/home/ana/Catalogo/precos.pdf" }),
    );
    expect(d).toEqual({ allowed: true, grantId: "g-catalogo" });
  });

  it("cliente externo NÃO lê a pasta privada do dono, mesmo com grant de dono", () => {
    const d = evaluateAccess(
      [ownerGrant, catalogGrant],
      req({ audience: "external_contact", path: "/home/ana/Documentos/contrato.pdf" }),
    );
    expect(d).toEqual({ allowed: false, reason: "no_grant" });
  });

  it("cliente externo nunca comenta nem escreve, mesmo com modo write", () => {
    const d = evaluateAccess(
      [{ ...catalogGrant, mode: "write" }],
      req({ audience: "external_contact", action: "write", path: "/home/ana/Catalogo/x.txt", mimeType: "text/plain" }),
    );
    expect(d).toEqual({ allowed: false, reason: "external_read_only" });
  });
});
