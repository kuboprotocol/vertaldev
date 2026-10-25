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

/** Fundo do Design Premium: escuro, com brilhos âmbar e rosa nas bordas. */
export const PREMIUM_BACKGROUND =
  "min-h-screen bg-[#0c0b14] text-slate-100 bg-[radial-gradient(60%_40%_at_90%_-10%,rgba(255,92,138,0.22),transparent_70%),radial-gradient(50%_35%_at_-10%_10%,rgba(255,201,107,0.14),transparent_70%)] bg-fixed font-['Manrope']";

/**
 * Um mundo próprio: cartão de cabeçalho, chips de páginas e subpáginas.
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
    <div className="flex min-h-[70vh] flex-col gap-6 px-4 pb-28 pt-6 sm:px-6 md:pb-10 lg:px-8">
      <header className="relative overflow-hidden rounded-3xl border border-amber-300/25 bg-gradient-to-br from-amber-400/15 via-rose-500/10 to-violet-600/15 p-6 shadow-2xl shadow-rose-500/10 md:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" aria-hidden="true" />
        <button
          type="button"
          onClick={onExit}
          className="relative inline-flex items-center gap-2 text-sm text-slate-300 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {backLabel}
        </button>
        <div className="relative mt-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-300">{eyebrow}</p>
          <h2 className="mt-2 font-['Unbounded'] text-2xl font-extrabold tracking-tight text-white md:text-3xl">{title}</h2>
          <p className="mt-2 max-w-xl text-sm text-slate-300">{description}</p>
        </div>
      </header>

      <nav aria-label={`Páginas de ${title}`} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {pages.map((page) => {
          const selected = page.key === activeKey;
          return (
            <button
              key={page.key}
              type="button"
              aria-current={selected ? 'page' : undefined}
              onClick={() => openPage(page.key)}
              className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition-all ${
                selected
                  ? 'border-white bg-white text-slate-900 shadow-lg shadow-white/10'
                  : 'border-slate-700 bg-slate-800/50 text-slate-300 hover:border-slate-500 hover:text-white'
              }`}
            >
              {page.label}
            </button>
          );
        })}
      </nav>

      <div className="min-w-0">
        {pages.map((page) => (
          <div key={page.key} hidden={page.key !== activeKey}>
            {visited.includes(page.key) && page.render(openPage)}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Cartão clicável de uma criação ou página do mundo. Com `icon`, mostra um círculo colorido, como no protótipo. */
export function StartCard({
  title,
  description,
  onClick,
  icon,
  gradient = 'from-amber-400 to-rose-500',
}: {
  title: string;
  description: string;
  onClick: () => void;
  icon?: ReactNode;
  gradient?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-4 rounded-2xl border border-slate-700/60 bg-slate-900/50 p-4 text-left transition-all duration-300 hover:-translate-y-0.5 hover:border-slate-500 hover:bg-slate-800/60 active:scale-[0.98]"
    >
      {icon && (
        <span
          aria-hidden="true"
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${gradient} text-white shadow-lg transition-transform duration-300 group-hover:scale-105`}
        >
          {icon}
        </span>
      )}
      <span className="min-w-0">
        <span className="block text-base font-semibold text-white">{title}</span>
        <span className="mt-0.5 block text-sm text-slate-400">{description}</span>
      </span>
    </button>
  );
}

/** Página de um mundo que depende de dados ainda não ativos. Não mostra itens simulados. */
export function PendingPage({ title, description }: { title: string; description: string }) {
  return (
    <div className="max-w-3xl rounded-2xl border border-dashed border-slate-600/70 bg-slate-900/40 p-6">
      <span className="inline-block rounded-full border border-amber-300/30 bg-amber-300/10 px-2.5 py-0.5 text-[11px] font-bold text-amber-300">
        Em desenvolvimento
      </span>
      <h3 className="mt-3 font-['Unbounded'] text-lg font-bold text-white">{title}</h3>
      <p className="mt-1 text-sm text-slate-400">{description}</p>
    </div>
  );
}
