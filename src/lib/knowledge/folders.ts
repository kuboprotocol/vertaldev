/**
 * Pastas de conhecimento do Vertal Chat — lógica pura (sem I/O).
 *
 * Duas raízes por usuário:
 *  - 'personal': ideias e outras empresas. Só o dono lê.
 *  - 'business': o próprio negócio e nicho. O agente pode usar para responder clientes e seguidores.
 *
 * Mantenha MAX_DEPTH e MAX_NAME_LENGTH iguais aos da migration 20261115200000_knowledge_folders.sql.
 */

export type KnowledgeScope = "personal" | "business";

export const SCOPES: KnowledgeScope[] = ["personal", "business"];

export const MAX_DEPTH = 10;
export const MAX_NAME_LENGTH = 80;
export const MAX_NOTE_TITLE_LENGTH = 120;
export const MAX_NOTE_BODY_LENGTH = 20_000;

export interface KnowledgeFolder {
  id: string;
  parentId: string | null;
  scope: KnowledgeScope;
  name: string;
  createdAt: number;
}

export interface KnowledgeFolderNode extends KnowledgeFolder {
  children: KnowledgeFolderNode[];
  depth: number;
}

/** Só a pasta de negócio é lida pelo agente para clientes e seguidores. */
export function isReadableByCustomers(folder: Pick<KnowledgeFolder, "scope">): boolean {
  return folder.scope === "business";
}

/** Nome limpo, sem barras (evita confusão com caminhos) e dentro do limite. */
export function validateFolderName(raw: string): { ok: true; name: string } | { ok: false; reason: "empty" | "too_long" | "invalid_chars" } {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length === 0) return { ok: false, reason: "empty" };
  if (name.length > MAX_NAME_LENGTH) return { ok: false, reason: "too_long" };
  if (name.includes("/") || name.includes("\\") || name.includes("\0")) return { ok: false, reason: "invalid_chars" };
  return { ok: true, name };
}

/** Pode criar subpasta dentro desta pasta? Respeita o limite de profundidade. */
export function canCreateChild(parentDepth: number): boolean {
  return parentDepth + 1 <= MAX_DEPTH;
}

/**
 * Monta a árvore a partir da lista plana. Filhos em ordem alfabética (pt-BR).
 * Pastas órfãs (pai que não existe na lista) são ignoradas, não quebram a árvore.
 */
export function buildFolderTree(folders: KnowledgeFolder[]): KnowledgeFolderNode[] {
  const byId = new Map<string, KnowledgeFolderNode>();
  for (const f of folders) byId.set(f.id, { ...f, children: [], depth: 1 });

  const roots: KnowledgeFolderNode[] = [];
  for (const node of byId.values()) {
    if (node.parentId === null) {
      roots.push(node);
    } else {
      const parent = byId.get(node.parentId);
      if (parent) parent.children.push(node);
    }
  }

  const assignDepth = (node: KnowledgeFolderNode, depth: number) => {
    node.depth = depth;
    node.children.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    for (const child of node.children) assignDepth(child, depth + 1);
  };
  roots.sort((a, b) => SCOPES.indexOf(a.scope) - SCOPES.indexOf(b.scope));
  for (const root of roots) assignDepth(root, 1);
  return roots;
}

/** Ids de uma pasta e de todos os descendentes (para apagar em cascata na interface). */
export function collectSubtreeIds(folders: KnowledgeFolder[], rootId: string): string[] {
  const out = new Set<string>([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of folders) {
      if (f.parentId && out.has(f.parentId) && !out.has(f.id)) {
        out.add(f.id);
        grew = true;
      }
    }
  }
  return [...out];
}

export interface KnowledgeLabels {
  personalRoot: string;
  businessRoot: string;
  personalHint: string;
  businessHint: string;
  newFolder: string;
  newNote: string;
  folderNamePlaceholder: string;
  noteTitlePlaceholder: string;
  noteBodyPlaceholder: string;
  save: string;
  delete: string;
  empty: string;
  maxDepthReached: string;
  customersNotice: string;
  cancel: string;
  invalidName: string;
}

const LABELS: Record<"pt" | "es" | "en", KnowledgeLabels> = {
  pt: {
    personalRoot: "Minhas ideias e outras empresas",
    businessRoot: "Meu negócio e nicho",
    personalHint: "Só você lê. Use para ideias e outras empresas.",
    businessHint: "O Vertal Chat usa isto para responder clientes e seguidores.",
    newFolder: "Nova pasta",
    newNote: "Nova nota",
    folderNamePlaceholder: "Nome da pasta",
    noteTitlePlaceholder: "Título",
    noteBodyPlaceholder: "Escreva aqui",
    save: "Salvar",
    delete: "Apagar",
    empty: "Esta pasta está vazia.",
    maxDepthReached: "Limite de 10 níveis de pastas atingido.",
    customersNotice: "Conteúdo desta pasta pode ser usado nas respostas a clientes.",
    cancel: "Cancelar",
    invalidName: "Nome inválido: use de 1 a 80 caracteres, sem barras.",
  },
  es: {
    personalRoot: "Mis ideas y otras empresas",
    businessRoot: "Mi negocio y nicho",
    personalHint: "Solo tú lees. Úsala para ideas y otras empresas.",
    businessHint: "Vertal Chat usa esto para responder a clientes y seguidores.",
    newFolder: "Nueva carpeta",
    newNote: "Nueva nota",
    folderNamePlaceholder: "Nombre de la carpeta",
    noteTitlePlaceholder: "Título",
    noteBodyPlaceholder: "Escribe aquí",
    save: "Guardar",
    delete: "Eliminar",
    empty: "Esta carpeta está vacía.",
    maxDepthReached: "Límite de 10 niveles de carpetas alcanzado.",
    customersNotice: "El contenido de esta carpeta puede usarse en respuestas a clientes.",
    cancel: "Cancelar",
    invalidName: "Nombre inválido: usa de 1 a 80 caracteres, sin barras.",
  },
  en: {
    personalRoot: "My ideas and other companies",
    businessRoot: "My business and niche",
    personalHint: "Only you can read this. Use it for ideas and other companies.",
    businessHint: "Vertal Chat uses this to answer customers and followers.",
    newFolder: "New folder",
    newNote: "New note",
    folderNamePlaceholder: "Folder name",
    noteTitlePlaceholder: "Title",
    noteBodyPlaceholder: "Write here",
    save: "Save",
    delete: "Delete",
    empty: "This folder is empty.",
    maxDepthReached: "Maximum of 10 folder levels reached.",
    customersNotice: "Content in this folder may be used in replies to customers.",
    cancel: "Cancel",
    invalidName: "Invalid name: use 1 to 80 characters, no slashes.",
  },
};

/** Escolhe o idioma pela tag do navegador (ex.: "pt-BR", "es-MX"). Sem reconhecimento, usa inglês. */
export function resolveLocale(tag: string | null | undefined): keyof typeof LABELS {
  const base = (tag ?? "").toLowerCase().split("-")[0];
  if (base === "pt") return "pt";
  if (base === "es") return "es";
  return "en";
}

export function labelsFor(tag: string | null | undefined): KnowledgeLabels {
  return LABELS[resolveLocale(tag)];
}
