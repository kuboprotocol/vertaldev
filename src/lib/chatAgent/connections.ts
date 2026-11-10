// Conexões que o próprio cliente adiciona ao Vertal Chat: APIs e servidores MCP.
// Ficam neste navegador (nome, endereço e o NOME do segredo). A chave em si mora
// no Cofre de segredos e nunca passa por aqui.
import { parseConnections, type UserConnection } from './contract';

const KEY = 'vertal-chat-connections';

export function loadConnections(): UserConnection[] {
  try {
    return parseConnections(JSON.parse(window.localStorage.getItem(KEY) ?? '[]'));
  } catch {
    return [];
  }
}

/** Grava a lista já validada e devolve o que ficou salvo. */
export function saveConnections(list: UserConnection[]): UserConnection[] {
  const clean = parseConnections(list);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(clean));
  } catch {
    /* sem armazenamento: vale só nesta visita */
  }
  return clean;
}

/** Códigos do tempo da Open-Meteo (WMO) em português. */
export function weatherText(code: number): string {
  if (code === 0) return 'céu limpo';
  if (code <= 2) return 'poucas nuvens';
  if (code === 3) return 'nublado';
  if (code <= 48) return 'neblina';
  if (code <= 57) return 'garoa';
  if (code <= 67) return 'chuva';
  if (code <= 77) return 'neve';
  if (code <= 82) return 'pancadas de chuva';
  if (code <= 86) return 'pancadas de neve';
  return 'trovoadas';
}

/** Extrai a resposta JSON-RPC de um corpo MCP (JSON puro ou eventos `data:`). */
export function parseMcpBody(body: string): { result?: unknown; error?: { message?: string } } | null {
  const candidates = body.includes('data:')
    ? body.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim())
    : [body.trim()];
  for (const text of candidates.reverse()) {
    try {
      const obj = JSON.parse(text);
      if (obj && typeof obj === 'object' && ('result' in obj || 'error' in obj)) return obj;
    } catch {
      /* tenta a próxima linha */
    }
  }
  return null;
}
