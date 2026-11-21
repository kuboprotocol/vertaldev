// Vibe Code + GitHub (Vertal Navigator, fase 3): operações que o agente pode pedir
// pela API do GitHub usando a conexão OAuth que já existe (github_connections,
// escopo "repo", token cifrado). Executadas na edge function `github-repos`
// (POST {op, ...}) — o navegador só entra como fallback.
//
// Puro (sem Deno/DOM): validado aqui, usado pela edge function, pelo contrato do
// chat e pelo comando /github do Vibe Code. Ações de escrita SEMPRE pedem
// confirmação do usuário no chat antes de chegar na função.

export const GITHUB_OPS = ["list_repos", "create_repo", "create_issue", "create_branch", "create_pr"] as const;
export type GithubOpName = (typeof GITHUB_OPS)[number];

export const GITHUB_WRITE_OPS: ReadonlySet<GithubOpName> = new Set(["create_repo", "create_issue", "create_branch", "create_pr"]);

export type GithubOp =
  | { op: "list_repos"; max: number }
  | { op: "create_repo"; name: string; description?: string; private: boolean }
  | { op: "create_issue"; repo: string; title: string; body?: string }
  | { op: "create_branch"; repo: string; branch: string; from?: string }
  | { op: "create_pr"; repo: string; title: string; head: string; base?: string; body?: string; draft: boolean };

export const GITHUB_LIMITS = { maxTitle: 256, maxBody: 20_000, maxDescription: 350, maxList: 50 } as const;

const REPO_NAME_RE = /^[A-Za-z0-9._-]{1,100}$/;
const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

/** "dono/repo" válido (sem URL, sem barra extra). Aceita também a URL https://github.com/dono/repo. */
export function normalizeRepo(raw: unknown): string | null {
  let s = String(raw ?? "").trim();
  const m = /^https?:\/\/(?:www\.)?github\.com\/([^/\s]+)\/([^/\s#?]+?)(?:\.git)?\/?(?:[#?].*)?$/i.exec(s);
  if (m) s = `${m[1]}/${m[2]}`;
  const parts = s.split("/");
  if (parts.length !== 2) return null;
  const [owner, name] = parts;
  if (!OWNER_RE.test(owner) || !REPO_NAME_RE.test(name) || name === "." || name === "..") return null;
  return `${owner}/${name}`;
}

/** Nome de branch válido para o git (subconjunto seguro de git check-ref-format). */
export function isValidBranch(raw: unknown): raw is string {
  if (typeof raw !== "string") return false;
  const b = raw.trim();
  if (!b || b.length > 200 || b !== raw) return false;
  if (b.startsWith("-") || b.startsWith("/") || b.endsWith("/") || b.endsWith(".") || b.endsWith(".lock")) return false;
  if (b.includes("..") || b.includes("//") || b.includes("@{") || b === "@") return false;
  return /^[A-Za-z0-9._/-]+$/.test(b);
}

const text = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Valida um pedido. null = não executa. */
export function parseGithubOp(raw: unknown): GithubOp | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  switch (a.op) {
    case "list_repos": {
      const n = Number(a.max ?? 20);
      return { op: "list_repos", max: Number.isFinite(n) ? Math.max(1, Math.min(Math.round(n), GITHUB_LIMITS.maxList)) : 20 };
    }
    case "create_repo": {
      const name = text(a.name, 100);
      if (!REPO_NAME_RE.test(name) || name === "." || name === "..") return null;
      const description = text(a.description, GITHUB_LIMITS.maxDescription);
      // Privado por padrão: público só se pedirem explicitamente.
      const isPrivate = a.private === false || a.visibility === "public" ? false : true;
      return { op: "create_repo", name, private: isPrivate, ...(description ? { description } : {}) };
    }
    case "create_issue": {
      const repo = normalizeRepo(a.repo);
      const title = text(a.title, GITHUB_LIMITS.maxTitle);
      if (!repo || title.length < 2) return null;
      const body = text(a.body, GITHUB_LIMITS.maxBody);
      return { op: "create_issue", repo, title, ...(body ? { body } : {}) };
    }
    case "create_branch": {
      const repo = normalizeRepo(a.repo);
      if (!repo || !isValidBranch(a.branch)) return null;
      if (a.from !== undefined && a.from !== null && a.from !== "" && !isValidBranch(a.from)) return null;
      return { op: "create_branch", repo, branch: a.branch as string, ...(isValidBranch(a.from) ? { from: a.from } : {}) };
    }
    case "create_pr": {
      const repo = normalizeRepo(a.repo);
      const title = text(a.title, GITHUB_LIMITS.maxTitle);
      if (!repo || title.length < 2 || !isValidBranch(a.head)) return null;
      if (a.base !== undefined && a.base !== null && a.base !== "" && !isValidBranch(a.base)) return null;
      const body = text(a.body, GITHUB_LIMITS.maxBody);
      // Rascunho por padrão (como no fluxo de PR da Vertal).
      const draft = a.draft === false ? false : true;
      return {
        op: "create_pr", repo, title, head: a.head as string, draft,
        ...(isValidBranch(a.base) ? { base: a.base } : {}), ...(body ? { body } : {}),
      };
    }
    default:
      return null;
  }
}

export const isGithubWrite = (op: GithubOp): boolean => GITHUB_WRITE_OPS.has(op.op);

/** Texto do cartão de confirmação (o que vai acontecer no GitHub). */
export function describeGithubOp(op: GithubOp): string {
  switch (op.op) {
    case "list_repos": return "Listar seus repositórios";
    case "create_repo": return `Criar o repositório ${op.private ? "privado" : "PÚBLICO"} "${op.name}"${op.description ? ` — ${op.description}` : ""}`;
    case "create_issue": return `Abrir a issue "${op.title}" em ${op.repo}`;
    case "create_branch": return `Criar a branch "${op.branch}" em ${op.repo} a partir de ${op.from ?? "a branch padrão"}`;
    case "create_pr": return `Abrir PR${op.draft ? " em rascunho" : ""} "${op.title}" em ${op.repo}: ${op.head} → ${op.base ?? "branch padrão"}`;
  }
}

/** Mensagens das respostas da edge function (pt-BR). */
export const GITHUB_ERROR_MESSAGES: Record<string, string> = {
  not_connected: "O GitHub não está conectado. Conecte em Conectores → GitHub.",
  bad_request: "Pedido inválido para o GitHub.",
  rate_limited: "Muitos pedidos ao GitHub em pouco tempo. Aguarde um minuto.",
  forbidden: "O GitHub recusou: a conexão não tem permissão nesse repositório (ou a organização bloqueia apps OAuth).",
  not_found: "Repositório ou branch não encontrado no GitHub.",
  conflict: "Já existe (repositório, branch ou PR) ou não há diferença entre as branches.",
  github_error: "O GitHub não respondeu como esperado.",
};

/** Classifica a resposta HTTP do GitHub. */
export function githubErrorCode(status: number): string {
  if (status === 401) return "not_connected";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409 || status === 422) return "conflict";
  if (status === 429) return "rate_limited";
  return "github_error";
}

/** Comando "/github …" do Vibe Code → operação. Formatos:
 *   /github repos
 *   /github repo <nome> [publico]
 *   /github issue <dono/repo> <título> [| corpo]
 *   /github branch <dono/repo> <branch> [de <base>]
 *   /github pr <dono/repo> <head> [-> <base>] <título> [| corpo]
 */
export function parseGithubCommand(input: string): GithubOp | null {
  const m = /^\/github\s+(\S+)(?:\s+([\s\S]*))?$/i.exec(input.trim());
  if (!m) return null;
  const sub = m[1].toLowerCase();
  const rest = (m[2] ?? "").trim();
  const [main, ...bodyParts] = rest.split("|");
  const body = bodyParts.join("|").trim() || undefined;
  const words = main.trim().split(/\s+/).filter(Boolean);
  switch (sub) {
    case "repos":
      return parseGithubOp({ op: "list_repos" });
    case "repo": {
      const [name, vis] = words;
      return parseGithubOp({ op: "create_repo", name, private: !/^p[uú]blic[oa]?$/i.test(vis ?? "") });
    }
    case "issue": {
      const [repo, ...title] = words;
      return parseGithubOp({ op: "create_issue", repo, title: title.join(" "), body });
    }
    case "branch": {
      const [repo, branch, de, from] = words;
      return parseGithubOp({ op: "create_branch", repo, branch, ...(/^(de|from)$/i.test(de ?? "") ? { from } : {}) });
    }
    case "pr": {
      const [repo, head, ...restWords] = words;
      let base: string | undefined;
      let titleWords = restWords;
      if (restWords[0] === "->" && restWords[1]) {
        base = restWords[1];
        titleWords = restWords.slice(2);
      }
      return parseGithubOp({ op: "create_pr", repo, head, base, title: titleWords.join(" "), body });
    }
    default:
      return null;
  }
}

/** A conversa recente fala de GitHub/repositório/issue/PR? (liga a ferramenta github no prompt) */
const GITHUB_HINTS = /\b(github|reposit[oó]rio|repo|issue|pull request|pr|branch|commit)\b/i;
export function wantsGithub(recent: Array<string | { content?: unknown; summary?: unknown; tool?: unknown }>, lookback = 8): boolean {
  return recent.slice(-lookback).some((m) => {
    if (typeof m === "string") return GITHUB_HINTS.test(m);
    if (m && typeof m === "object") {
      if (m.tool === "github") return true;
      return GITHUB_HINTS.test(String(m.content ?? "")) || GITHUB_HINTS.test(String(m.summary ?? ""));
    }
    return false;
  });
}
