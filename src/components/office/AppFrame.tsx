// Moldura de cada aplicativo do Vertal Office: título, abas de menu, faixa de
// ferramentas, área de trabalho, painel da IA e barra de status.
import React from 'react';
import { RibbonBar, RibbonTab, RibbonTabs } from './Ribbon';

export interface AppFrameProps {
  title: string;
  titleLabel: string;
  titlePlaceholder: string;
  onTitle: (value: string) => void;
  tabs: RibbonTab[];
  activeTab: string;
  onTab: (id: string) => void;
  /** Conteúdo da faixa para cada aba (chave = id da aba). */
  ribbons: Record<string, React.ReactNode>;
  /** Barra fixa acima da área de trabalho (ex.: barra de fórmulas). */
  canvasTop?: React.ReactNode;
  /** Área de trabalho (página, grade ou slide). */
  canvas: React.ReactNode;
  /** Painel da IA ao lado da área de trabalho. Null quando fechado. */
  assistant: React.ReactNode | null;
  /** Rodapé de status. */
  status: React.ReactNode;
  /** Cor de fundo da área de trabalho (ex.: cinza de documento). */
  workspaceClass?: string;
}

export function AppFrame(p: AppFrameProps) {
  return (
    <div className="flex min-w-0 flex-1 flex-col bg-white">
      {/* Linha de título do arquivo, como em suítes de escritório. */}
      <div className="flex items-center gap-3 border-b border-slate-200 px-3 py-2">
        <input
          value={p.title}
          onChange={(e) => p.onTitle(e.target.value)}
          aria-label={p.titleLabel}
          placeholder={p.titlePlaceholder}
          className="min-w-0 flex-1 rounded-md bg-transparent px-2 py-1 text-base font-semibold text-slate-900 placeholder:text-slate-400 hover:bg-slate-100 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 sm:text-lg"
        />
      </div>

      <RibbonTabs tabs={p.tabs} active={p.activeTab} onChange={p.onTab} />
      <RibbonBar>{p.ribbons[p.activeTab]}</RibbonBar>

      {p.canvasTop}

      <div className="flex min-h-[560px] min-w-0 flex-1 flex-col lg:flex-row">
        <div className={`min-w-0 flex-1 overflow-auto ${p.workspaceClass ?? 'bg-[#e9ecef]'}`}>{p.canvas}</div>
        {p.assistant && (
          <aside
            aria-label="Assistente de IA"
            className="w-full shrink-0 overflow-y-auto border-t border-slate-200 bg-white p-4 lg:w-[300px] lg:border-l lg:border-t-0"
          >
            {p.assistant}
          </aside>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-[#f3f4f6] px-3 py-1.5 text-[12px] text-slate-600">
        {p.status}
      </div>
    </div>
  );
}
