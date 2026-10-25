import { useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';

export interface WorldPage {
  key: string;
  label: string;
  /** Recebe a troca de página, para atalhos dentro da própria página. */
  render: (goTo: (key: string) => void) => ReactNode;
}

interface DesignWorldProps {
  eyebrow: string;
  title: string;
  description: string;
  pages: WorldPage[];
  onExit: () => void;
  /** Texto do botão que sai do mundo. */
  backLabel?: string;
  /** Pede para abrir uma página. Um objeto novo a cada pedido; `undefined` não faz nada. */
  jumpTo?: { key: string };
}

/**
 * Um mundo próprio: cabeçalho, navegação de páginas e subpáginas.
 * Uma página só monta na primeira visita; depois fica montada (escondida) para não perder o trabalho.
 */
export function DesignWorld({ eyebrow, title, description, pages, onExit, backLabel = 'Design Premium', jumpTo }: DesignWorldProps) {
  const [activeKey, setActiveKey] = useState(pages[0].key);
  const [visited, setVisited] = useState<string[]>([pages[0].key]);

  const openPage = (key: string) => {
    setVisited((list) => (list.includes(key) ? list : [...list, key]));
    setActiveKey(key);
  };

  useEffect(() => {
    if (!jumpTo) return;
    setVisited((list) => (list.includes(jumpTo.key) ? list : [...list, jumpTo.key]));
    setActiveKey(jumpTo.key);
  }, [jumpTo]);

  return (
    <div className="flex min-h-[70vh] flex-col border-t border-slate-800/80 md:flex-row">
      <aside className="space-y-6 border-b border-slate-800/80 bg-slate-900/60 px-4 py-6 sm:px-6 md:w-60 md:shrink-0 md:border-b-0 md:border-r">
        <button
          type="button"
          onClick={onExit}
          className="inline-flex items-center gap-2 text-sm text-slate-400 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {backLabel}
        </button>
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-amber-300/80">{eyebrow}</p>
          <h2 className="mt-1 text-xl font-bold text-white">{title}</h2>
          <p className="mt-1 text-sm text-slate-400">{description}</p>
        </div>
        <nav aria-label={`Páginas de ${title}`} className="-mx-1 flex gap-2 overflow-x-auto md:mx-0 md:flex-col md:overflow-visible">
          {pages.map((page) => {
            const selected = page.key === activeKey;
            return (
              <button
                key={page.key}
                type="button"
                aria-current={selected ? 'page' : undefined}
                onClick={() => openPage(page.key)}
                className={`shrink-0 rounded-lg border px-3 py-2 text-left text-sm transition-all ${
                  selected
                    ? 'border-amber-300/70 bg-gradient-to-r from-amber-400/15 to-rose-500/10 text-white'
                    : 'border-transparent text-slate-300 hover:bg-slate-800/60'
                }`}
              >
                {page.label}
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        {pages.map((page) => (
          <div key={page.key} hidden={page.key !== activeKey} className="px-4 py-10 sm:px-6 lg:px-8">
            {visited.includes(page.key) && page.render(openPage)}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Cartão clicável de uma criação ou página do mundo. */
export function StartCard({ title, description, onClick }: { title: string; description: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-slate-700 bg-slate-800/50 p-5 text-left transition-colors hover:border-amber-300/60"
    >
      <span className="block text-base font-semibold text-white">{title}</span>
      <span className="mt-1 block text-sm text-slate-400">{description}</span>
    </button>
  );
}

/** Página de um mundo que depende de dados ainda não ativos. Não mostra itens simulados. */
export function PendingPage({ title, description }: { title: string; description: string }) {
  return (
    <div className="max-w-3xl rounded-xl border border-slate-700/60 bg-slate-900/40 p-6">
      <span className="inline-block rounded-full border border-slate-600 px-2 py-0.5 text-[11px] text-slate-300">
        Em desenvolvimento
      </span>
      <h3 className="mt-3 text-lg font-semibold text-slate-100">{title}</h3>
      <p className="mt-1 text-sm text-slate-400">{description}</p>
    </div>
  );
}
