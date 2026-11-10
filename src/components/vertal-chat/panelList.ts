// Todos os painéis do Painel Criativo que o Vertal Chat abre dentro do próprio layout.
import type { ComponentType } from 'react';
import {
  BookOpen, Clapperboard, Code2, Download, FileText, KeyRound, LayoutTemplate, Music, NotebookPen,
  Palette, Plug, Puzzle, Scissors, Sparkles, Table2, User2, Video,
} from 'lucide-react';
import type { PanelKey } from '@/lib/chatAgent/contract';
import type { DesignCopy } from '@/components/creative/DesignGallery';

/** Como abrir um painel: além da chave, o que o chat acabou de criar. */
export interface PanelRequest {
  key: PanelKey;
  /** Office: abre no aplicativo certo e, se houver, no item salvo na galeria. */
  office?: { app: 'doc' | 'sheet' | 'slides'; recordId?: string };
  /**
   * Design Premium/Canvas: onde abrir. O objeto é criado uma vez por pedido
   * (o painel reage à identidade dele), nunca a cada render.
   */
  designOpen?: { mode: 'ai' | 'canvas'; canvasCopy?: DesignCopy };
  /** Muda a cada pedido para remontar o painel com o conteúdo novo. */
  nonce: number;
}

export interface PanelInfo {
  key: PanelKey;
  label: string;
  hint: string;
  icon: ComponentType<{ className?: string }>;
  group: 'criar' | 'midia' | 'conectar';
  /** Rota própria fora do chat (painéis que são páginas inteiras do produto). */
  route?: string;
}

export const PANEL_LIST: PanelInfo[] = [
  { key: 'office', label: 'Vertal Office', hint: 'Documentos, planilhas, slides e PDF', icon: FileText, group: 'criar' },
  { key: 'design', label: 'Design Premium', hint: 'Artes com IA, slides, estúdio e avatares', icon: Palette, group: 'criar' },
  { key: 'canvas', label: 'Canvas', hint: 'Canvas infinito para montar artes', icon: LayoutTemplate, group: 'criar' },
  { key: 'notebook', label: 'Vertal Notebook', hint: 'Converse com PDFs, links e vídeos', icon: NotebookPen, group: 'criar' },
  { key: 'sheet', label: 'Planilha IA', hint: 'Planilhas geradas por IA', icon: Table2, group: 'criar' },
  { key: 'ebook', label: 'Ebook IA', hint: 'Ebooks completos com capa', icon: BookOpen, group: 'criar' },
  { key: 'builder', label: 'Dev Code', hint: 'Sites e aplicativos', icon: Code2, group: 'criar', route: '/builder' },
  { key: 'video_studio', label: 'Video Studio', hint: 'Fotos viram clipe, meme ou anúncio', icon: Clapperboard, group: 'midia' },
  { key: 'clips', label: 'Cortes virais', hint: 'Momentos virais em 9:16 com legenda', icon: Scissors, group: 'midia' },
  { key: 'avatar', label: 'Avatar IA', hint: 'Avatar falante com narração', icon: User2, group: 'midia' },
  { key: 'shorts', label: 'Shorts', hint: 'Vídeos curtos a partir de texto', icon: Video, group: 'midia' },
  { key: 'music', label: 'Música IA', hint: 'Música original', icon: Music, group: 'midia' },
  { key: 'emo', label: 'EMO', hint: 'Anima uma foto a partir de um vídeo', icon: Sparkles, group: 'midia' },
  { key: 'downloader', label: 'Downloader', hint: 'YouTube, Instagram, TikTok…', icon: Download, group: 'midia' },
  { key: 'connectors', label: 'Conectores', hint: 'Gmail, Slack, GitHub, Web3…', icon: Plug, group: 'conectar', route: '/connectors' },
  { key: 'secrets', label: 'Cofre de segredos', hint: 'Chaves de API para o chat usar', icon: KeyRound, group: 'conectar', route: '/secrets' },
  { key: 'agents', label: 'Habilidades', hint: 'Agentes e habilidades extras', icon: Puzzle, group: 'conectar', route: '/agents' },
];

export const PANEL_BY_KEY = Object.fromEntries(PANEL_LIST.map((p) => [p.key, p])) as Record<PanelKey, PanelInfo>;
