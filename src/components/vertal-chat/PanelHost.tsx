// Conteúdo do painel aberto dentro do Vertal Chat. Cada painel só é baixado quando abre.
import { lazy, Suspense } from 'react';
import type { PanelKey } from '@/lib/chatAgent/contract';
import type { PanelRequest } from './panelList';
import { HistoryPanel } from './HistoryPanel';
import { VoicePanel } from './VoicePanel';

const OfficeSuite = lazy(() => import('@/components/office/OfficeSuite').then((m) => ({ default: m.OfficeSuite })));
const CreativeDesign = lazy(() => import('@/components/CreativeDesign').then((m) => ({ default: m.CreativeDesign })));
const VertalNotebook = lazy(() => import('@/components/notebook/VertalNotebook').then((m) => ({ default: m.VertalNotebook })));
const VertalClock = lazy(() => import('@/components/clock/VertalClock'));
const CreativeSheets = lazy(() => import('@/components/CreativeSheets').then((m) => ({ default: m.CreativeSheets })));
const FigcraftEditor = lazy(() => import('@/components/creative/FigcraftEditor').then((m) => ({ default: m.FigcraftEditor })));
const CadStudio = lazy(() => import('@/components/creative/CadStudio').then((m) => ({ default: m.CadStudio })));
const NavigatorPanel = lazy(() => import('./NavigatorPanel').then((m) => ({ default: m.NavigatorPanel })));
const DocumentScanner = lazy(() => import('@/components/scanner/DocumentScanner').then((m) => ({ default: m.DocumentScanner })));
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
  if (key === 'history') return <HistoryPanel />;
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
  if (key === 'figcraft') {
    return (
      <Suspense fallback={null}>
        <FigcraftEditor key={request.nonce} openDesignId={request.figcraft?.designId ?? null} openNonce={request.nonce} />
      </Suspense>
    );
  }
  if (key === 'cad') {
    return (
      <Suspense fallback={null}>
        <div className="mx-auto max-w-7xl p-3 sm:p-4"><CadStudio creditsAvailable={credits} /></div>
      </Suspense>
    );
  }
  if (key === 'navigator') {
    return (
      <Suspense fallback={null}>
        <NavigatorPanel />
      </Suspense>
    );
  }
  if (key === 'scanner') {
    return (
      <Suspense fallback={null}>
        <div className="mx-auto max-w-4xl p-3 sm:p-4"><DocumentScanner /></div>
      </Suspense>
    );
  }
  if (key === 'notebook') return <VertalNotebook />;
  if (key === 'clock') return <div className="mx-auto max-w-3xl p-3 sm:p-4"><VertalClock /></div>;
  if (key === 'voice') return <div className="mx-auto max-w-2xl p-3 sm:p-4"><VoicePanel onSend={(text) => window.dispatchEvent(new CustomEvent('vertal-chat:voice-text', { detail: text }))} onClose={() => {}} /></div>;
  if (key === 'sheet') return <div className="mx-auto max-w-6xl p-4"><CreativeSheets creditsAvailable={credits} /></div>;
  if (isToolPanel(key)) return <div className="mx-auto max-w-5xl p-4 sm:p-6"><CreativeToolInterface toolKey={key} /></div>;
  return null;
}
