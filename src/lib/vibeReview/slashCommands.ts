// Comandos de barra do chat do Vibe Code (inspirados nos comandos do PR-Agent:
// /review, /improve, /describe, /ask), com apelidos em português.
import type { ReviewCommand } from "./engine";

export interface SlashCommandDef {
  name: string;
  aliases: string[];
  command: Exclude<ReviewCommand, "adjust">;
  label: string;
  description: string;
  /** O comando precisa de um texto depois (ex.: a pergunta do /ask). */
  argRequired?: boolean;
  argHint?: string;
}

export const SLASH_COMMANDS: SlashCommandDef[] = [
  {
    name: "/review",
    aliases: ["/revisar", "/revisao", "/revisão"],
    command: "review",
    label: "Revisar código",
    description: "Revisa o código e monta a fila de correções (gravidade, arquivo, linha e correção)",
    argHint: "foco opcional, ex.: segurança do login",
  },
  {
    name: "/improve",
    aliases: ["/melhorar", "/melhorias"],
    command: "improve",
    label: "Sugerir melhorias",
    description: "Sugestões de melhoria com autorrevisão: só ficam as que tiram nota boa",
    argHint: "foco opcional, ex.: performance",
  },
  {
    name: "/fix",
    aliases: ["/corrigir", "/erros"],
    command: "fix_errors",
    label: "Corrigir erros um a um",
    description: "Pega os erros do preview/build (ou o que você colar) e corrige um por vez com você",
    argHint: "cole o erro aqui (opcional)",
  },
  {
    name: "/describe",
    aliases: ["/descrever", "/resumo"],
    command: "describe",
    label: "Descrever mudanças",
    description: "Resume o que mudou no projeto nesta conversa, arquivo por arquivo",
  },
  {
    name: "/ask",
    aliases: ["/perguntar", "/pergunta"],
    command: "ask",
    label: "Perguntar sobre o código",
    description: "Pergunta qualquer coisa sobre o código do projeto",
    argRequired: true,
    argHint: "sua pergunta",
  },
];

export interface ParsedSlash {
  def: SlashCommandDef;
  arg: string;
}

/** "/review segurança" → { def: review, arg: "segurança" }. null se não for comando conhecido. */
export function parseSlashCommand(input: string): ParsedSlash | null {
  const text = input.trim();
  if (!text.startsWith("/")) return null;
  const match = text.match(/^(\/[^\s]+)(?:\s+([\s\S]*))?$/);
  if (!match) return null;
  const word = match[1].toLowerCase();
  const def = SLASH_COMMANDS.find((c) => c.name === word || c.aliases.includes(word));
  if (!def) return null;
  return { def, arg: (match[2] ?? "").trim() };
}

/** Sugestões enquanto o Dev digita "/re…" (antes do primeiro espaço). */
export function matchSlashHints(input: string): SlashCommandDef[] {
  if (!input.startsWith("/") || /\s/.test(input)) return [];
  const typed = input.toLowerCase();
  return SLASH_COMMANDS.filter((c) => c.name.startsWith(typed) || c.aliases.some((a) => a.startsWith(typed)));
}
