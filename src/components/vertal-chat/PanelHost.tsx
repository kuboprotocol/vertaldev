// Conteúdo do painel aberto dentro do Vertal Chat. Cada painel só é baixado quando abre.
import { lazy } from 'react';
import type { PanelKey } from '@/lib/chatAgent/contract';
import type { PanelRequest } from './panelList';

const OfficeSuite = lazy(() => import('@/components/office/OfficeSuite').then((m) => ({ default: m.OfficeSuite })));
const CreativeDesign = lazy(() => import('@/components/CreativeDesign').then((m) => ({ default: m.CreativeDesign })));
const VertalNotebook = lazy(() => import('@/components/notebook/VertalNotebook').then((m) => ({ default: m.VertalNotebook })));
const CreativeSheets = lazy(() => import('@/components/CreativeSheets').then((m) => ({ default: m.CreativeSheets })));
const CreativeToolInterface = lazy(() =>
  import('@/components/creative/CreativeToolInterface').then((m) => ({ default: m.CreativeToolInterface })),
);

const OPEN_AI = { mode: 'ai' } as const;
const OPEN_CANVAS = { mode: 'canvas' } as const;

const TOOL_KEYS = ['video_studio', 'clips', 'avatar', 'shorts', 'music', 'emo', 'downloader', 'ebook'] as const;
type ToolPanelKey = (typeof TOOL_KEYS)[number];
const isToolPanel = (key: PanelKey): key is ToolPanelKey => (TOOL_KEYS as readonly string[]).includes(key);

/** Painéis com rota própria não passam por aqui: são abertos pela rota. */
export function PanelHost({ request, credits, userId }: { request: PanelRequest; credits: number; userId?: string }) {
  const { key } = request;
  if (key === 'office') {
    return (
      <OfficeSuite
        key={request.nonce}
        creditsAvailable={credits}
        userId={userId}
        initialApp={request.office?.app}
        initialRecordId={request.office?.recordId}
      />
    );
  }
  if (key === 'design' || key === 'canvas') {
    return (
      <CreativeDesign
        key={key === 'canvas' ? `canvas-${request.nonce}` : 'design'}
        creditsAvailable={credits}
        open={request.designOpen ?? (key === 'canvas' ? OPEN_CANVAS : OPEN_AI)}
      />
    );
  }
  if (key === 'notebook') return <VertalNotebook />;
  if (key === 'sheet') return <div className="mx-auto max-w-6xl p-4"><CreativeSheets creditsAvailable={credits} /></div>;
  if (isToolPanel(key)) return <div className="mx-auto max-w-5xl p-4 sm:p-6"><CreativeToolInterface toolKey={key} /></div>;
  return null;
}
