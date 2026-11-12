import type { ReactNode } from 'react';
import { BookOpen, Clapperboard, Layers, LayoutGrid, Sparkles, type LucideIcon } from 'lucide-react';
import { PREMIUM_BACKGROUND } from './DesignWorld';

export interface ShellWorld {
  key: string;
  label: string;
  icon: LucideIcon;
}

/** Mundos da casca do Design Premium, na ordem da barra. */
const SHELL_WORLDS: ShellWorld[] = [
  { key: 'home', label: 'Início', icon: LayoutGrid },
  { key: 'create', label: 'Criar', icon: Sparkles },
  { key: 'media', label: 'Mídia', icon: Clapperboard },
  { key: 'content', label: 'Conteúdo', icon: BookOpen },
  { key: 'panels', label: 'Painéis', icon: Layers },
];

interface DesignPremiumShellProps {
  worldKey: string;
  onWorldChange: (key: string) => void;
  children: ReactNode;
}

/**
 * Casca do Design Premium: barra de mundos (trilho à esquerda no computador, barra inferior no celular)
 * em volta do conteúdo do mundo escolhido.
 */
export function DesignPremiumShell({ worldKey, onWorldChange, children }: DesignPremiumShellProps) {
  const worldButton = (world: ShellWorld, layout: 'rail' | 'bar') => {
    const selected = world.key === worldKey;
    const Icon = world.icon;
    const base =
      layout === 'rail'
        ? 'flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition-colors'
        : 'flex flex-1 flex-col items-center gap-1 rounded-2xl py-2 text-[11px] font-semibold transition-colors';
    const state = selected
      ? 'bg-white text-slate-900 shadow-lg shadow-white/10'
      : 'text-slate-400 hover:bg-white/5 hover:text-white';
    return (
      <button
        key={world.key}
        type="button"
        aria-current={selected ? 'page' : undefined}
        onClick={() => onWorldChange(world.key)}
        className={`${base} ${state}`}
      >
        <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
        <span>{world.label}</span>
      </button>
    );
  };

  return (
    <div className={PREMIUM_BACKGROUND}>
      <div className="flex min-h-screen">
        <nav
          aria-label="Mundos do Design Premium"
          className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col gap-2 border-r border-slate-700/50 bg-slate-950/40 p-4 md:flex"
        >
          {SHELL_WORLDS.map((world) => worldButton(world, 'rail'))}
        </nav>

        <main className="min-w-0 flex-1 pb-28 md:pb-10">{children}</main>

        <nav
          aria-label="Mundos do Design Premium"
          className="fixed inset-x-0 bottom-0 z-40 flex gap-1 border-t border-slate-700/50 bg-slate-950/90 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur md:hidden"
        >
          {SHELL_WORLDS.map((world) => worldButton(world, 'bar'))}
        </nav>
      </div>
    </div>
  );
}
