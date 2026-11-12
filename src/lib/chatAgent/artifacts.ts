// Artefatos do Vertal Chat: tudo que o agente cria e entrega dentro da conversa.
//
// As mensagens ficam em `creative_messages.content` (texto). Os artefatos vão no
// fim do texto, dentro de um comentário HTML em base64: conversas antigas e o
// resto do sistema continuam lendo o conteúdo como texto comum, sem migração.
import type { CanvasSpec, PanelKey } from './contract';
import type { DocData } from '@/lib/office/documentModel';
import type { SheetData } from '@/lib/office/sheetModel';
import type { DeckData } from '@/lib/office/slidesModel';

interface Base {
  /** Id curto e estável dentro da conversa (a1, a2…). O agente usa para editar. */
  id: string;
  title: string;
}

export interface StoredImage {
  /** URL para exibir agora. URLs assinadas expiram: `path` permite renovar. */
  url: string;
  /** Caminho no bucket privado `uploads`, quando a imagem foi guardada lá. */
  path?: string;
}

export type Artifact =
  | (Base & { kind: 'image'; image: StoredImage; prompt: string })
  | (Base & { kind: 'design'; images: StoredImage[]; format: string; prompt: string })
  | (Base & { kind: 'doc'; doc: DocData; officeId?: string })
  | (Base & { kind: 'sheet'; sheet: SheetData; officeId?: string })
  | (Base & { kind: 'slides'; deck: DeckData; officeId?: string })
  | (Base & { kind: 'email'; subject: string; body: string })
  | (Base & { kind: 'canvas'; spec: CanvasSpec })
  | (Base & { kind: 'app'; html: string; prompt: string; projectId?: string })
  | (Base & { kind: 'music'; tracks: Array<{ title: string; audioUrl: string; imageUrl?: string }>; prompt: string })
  | (Base & { kind: 'ebook'; content: string; cover?: string })
  | (Base & { kind: 'notebook'; description: string; emoji?: string; notebookId?: string })
  | (Base & { kind: 'video_studio'; description?: string; tier: string; style: string; aspect: string })
  | (Base & { kind: 'clips'; description?: string; theme: string; mood: string })
  | (Base & { kind: 'emo'; description?: string })
  | (Base & { kind: 'podcast_studio'; topic: string; duration?: number; style?: string; podcastId?: string })
  | (Base & { kind: 'download'; url: string; format: string })
  | (Base & { kind: 'api'; method: string; host: string; status: number; ok: boolean; body: string });

export type ArtifactKind = Artifact['kind'];

/** O que aparece na mensagem do assistente além do texto. */
export interface MessageExtras {
  artifacts: Artifact[];
  /** Painéis que o agente abriu nesta mensagem. */
  panels: PanelKey[];
  /** Falhas de ferramenta, já em linguagem de usuário. */
  errors: string[];
}

export const EMPTY_EXTRAS: MessageExtras = { artifacts: [], panels: [], errors: [] };

const MARKER_RE = /\n*<!--vertal-chat:([A-Za-z0-9+/=]+)-->\s*$/;

/** Limite do que vai junto da mensagem. Acima disso o HTML do app fica só no projeto salvo. */
const INLINE_HTML_MAX = 150_000;

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function fromBase64(b64: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** Versão enxuta para guardar: sem data URLs e sem HTML que já está salvo no projeto. */
function forStorage(a: Artifact): Artifact {
  const slim = (img: StoredImage): StoredImage => (img.url.startsWith('data:') ? { url: '', path: img.path } : img);
  if (a.kind === 'image') return { ...a, image: slim(a.image) };
  if (a.kind === 'design') return { ...a, images: a.images.map(slim) };
  if (a.kind === 'app' && a.projectId && a.html.length > INLINE_HTML_MAX) return { ...a, html: '' };
  return a;
}

/** Texto + artefatos → conteúdo gravado no banco. */
export function encodeMessage(text: string, extras: MessageExtras): string {
  const hasExtras = extras.artifacts.length > 0 || extras.panels.length > 0 || extras.errors.length > 0;
  if (!hasExtras) return text;
  const payload = JSON.stringify({ v: 1, ...extras, artifacts: extras.artifacts.map(forStorage) });
  return `${text}\n\n<!--vertal-chat:${toBase64(payload)}-->`;
}

/** Conteúdo gravado → texto + artefatos. Mensagens sem marcador voltam como texto puro. */
export function decodeMessage(content: string): { text: string; extras: MessageExtras } {
  const match = MARKER_RE.exec(content);
  if (!match) return { text: content, extras: EMPTY_EXTRAS };
  const text = content.slice(0, match.index).trimEnd();
  try {
    const data = JSON.parse(fromBase64(match[1])) as Partial<MessageExtras>;
    return {
      text,
      extras: {
        artifacts: Array.isArray(data.artifacts) ? data.artifacts : [],
        panels: Array.isArray(data.panels) ? data.panels : [],
        errors: Array.isArray(data.errors) ? data.errors : [],
      },
    };
  } catch {
    return { text, extras: EMPTY_EXTRAS };
  }
}

export const KIND_LABEL: Record<ArtifactKind, string> = {
  image: 'Imagem',
  design: 'Design',
  doc: 'Documento',
  sheet: 'Planilha',
  slides: 'Apresentação',
  email: 'E-mail',
  canvas: 'Canvas',
  app: 'Aplicativo',
  music: 'Música',
  ebook: 'Ebook',
  notebook: 'Notebook',
  video_studio: 'Vídeo',
  clips: 'Cortes',
  emo: 'Animação',
  podcast_studio: 'Podcast',
  download: 'Download',
  api: 'Resposta da API',
};

/** O que o agente enxerga do histórico: o texto e uma nota por artefato, com o id para editar. */
export function historyContent(text: string, extras: MessageExtras): string {
  const notes = extras.artifacts.map((a) => `[artefato ${a.id}: ${KIND_LABEL[a.kind].toLowerCase()} "${a.title}"]`);
  const failed = extras.errors.map((e) => `[falhou: ${e}]`);
  return [text, ...notes, ...failed].filter(Boolean).join('\n') || '(sem texto)';
}

/** Texto do artefato para servir de material numa edição (campo `source` das ferramentas). */
export function artifactSourceText(a: Artifact): string {
  switch (a.kind) {
    case 'doc':
      return [a.doc.title, ...a.doc.blocks.map((b) => (b.type === 'bullet' ? `- ${b.text}` : b.text))].join('\n');
    case 'sheet': {
      const rows = new Map<number, Map<string, string>>();
      for (const [ref, raw] of Object.entries(a.sheet.cells)) {
        const m = /^([A-Z]+)(\d+)$/.exec(ref);
        if (!m) continue;
        const row = rows.get(Number(m[2])) ?? new Map<string, string>();
        row.set(m[1], String(raw));
        rows.set(Number(m[2]), row);
      }
      return [...rows.entries()]
        .sort(([x], [y]) => x - y)
        .map(([, cols]) => [...cols.entries()].sort(([x], [y]) => (x.length - y.length) || x.localeCompare(y)).map(([, v]) => v).join(' | '))
        .join('\n');
    }
    case 'slides':
      return [a.deck.title, ...a.deck.slides.map((s) => [`# ${s.title}`, ...s.bullets.map((b) => `- ${b}`)].join('\n'))].join('\n\n');
    case 'email':
      return `Assunto: ${a.subject}\n\n${a.body}`;
    case 'ebook':
      return a.content;
    case 'api':
      return a.body;
    default:
      return a.title;
  }
}

/** Próximo id livre (a1, a2…) dado o que já existe na conversa. */
export function nextArtifactId(existing: Artifact[]): string {
  let max = 0;
  for (const a of existing) {
    const n = /^a(\d+)$/.exec(a.id);
    if (n) max = Math.max(max, Number(n[1]));
  }
  return `a${max + 1}`;
}
