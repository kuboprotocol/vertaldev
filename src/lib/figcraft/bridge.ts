// Ponte entre o Vertal e o figCraft (web build em /figcraft/, mesma origem).
//
// O figCraft fala com o host por postMessage, no contrato de craft-web-host (storytold/craft-libs):
//   app → host:  figcraft:ready {version, appVersion, file}, figcraft:save {name, bytes, saveAs},
//                figcraft:dirty {dirty}, figcraft:failed {error}
//   host → app:  figcraft:open {name, bytes}
// Só a mesma origem é ouvida: por isso o build fica dentro do próprio site (public/figcraft).
import { DESIGN_FILE_MAX_BYTES } from './contract';

/** Onde está o build. VITE_FIGCRAFT_URL aponta para outro caminho da mesma origem, se precisar. */
export const FIGCRAFT_BASE: string = import.meta.env.VITE_FIGCRAFT_URL || '/figcraft/';

/**
 * URL do iframe: `?host=parent` (modo hospedado, mensagens de save/open), `control` (liga
 * `window.figcraft`, para o chat e o painel rodarem comandos do engine) e o autor dos comentários.
 */
export function figcraftFrameSrc(author?: string): string {
  const base = FIGCRAFT_BASE.endsWith('/') ? FIGCRAFT_BASE : `${FIGCRAFT_BASE}/`;
  const params = new URLSearchParams({ host: 'parent', control: '' });
  const name = author?.trim().slice(0, 200);
  if (name) params.set('author', name);
  return `${base}index.html?${params.toString()}`;
}

export type FigcraftInbound =
  | { type: 'ready'; appVersion: string; fileData: boolean }
  | { type: 'save'; name: string; bytes: ArrayBuffer; saveAs: boolean }
  | { type: 'dirty'; dirty: boolean }
  | { type: 'failed'; error: string };

const bytesOf = (v: unknown): ArrayBuffer | null => {
  if (v instanceof ArrayBuffer) return v.byteLength <= DESIGN_FILE_MAX_BYTES ? v : null;
  if (ArrayBuffer.isView(v) && v.byteLength <= DESIGN_FILE_MAX_BYTES) {
    return v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength) as ArrayBuffer;
  }
  return null;
};

/** Lê uma mensagem do figCraft. Qualquer coisa fora do contrato vira null (é ignorada). */
export function parseFigcraftMessage(data: unknown): FigcraftInbound | null {
  if (!data || typeof data !== 'object') return null;
  const m = data as Record<string, unknown>;
  switch (m.type) {
    case 'figcraft:ready':
      return {
        type: 'ready',
        appVersion: typeof m.appVersion === 'string' ? m.appVersion.slice(0, 40) : '',
        fileData: m.file === true,
      };
    case 'figcraft:save': {
      const bytes = bytesOf(m.bytes);
      if (!bytes || typeof m.name !== 'string') return null;
      return { type: 'save', name: m.name.slice(0, 255), bytes, saveAs: m.saveAs === true };
    }
    case 'figcraft:dirty':
      return typeof m.dirty === 'boolean' ? { type: 'dirty', dirty: m.dirty } : null;
    case 'figcraft:failed':
      return { type: 'failed', error: typeof m.error === 'string' ? m.error.slice(0, 300) : 'erro desconhecido' };
    default:
      return null;
  }
}

/**
 * Envia um documento ao editor. Copia os bytes antes de transferir o buffer, para o chamador
 * continuar com os dele. Devolve false quando o iframe ainda não carregou.
 */
export function postOpenToFigcraft(frame: HTMLIFrameElement, name: string, bytes: Uint8Array): boolean {
  const win = frame.contentWindow;
  if (!win) return false;
  const copy = bytes.slice().buffer as ArrayBuffer;
  win.postMessage({ type: 'figcraft:open', name, bytes: copy }, window.location.origin, [copy]);
  return true;
}

/** Só as mensagens do próprio iframe, da mesma origem, passam. */
export function isFromFrame(event: MessageEvent, frame: HTMLIFrameElement | null): boolean {
  return !!frame && event.source === frame.contentWindow && event.origin === window.location.origin;
}
