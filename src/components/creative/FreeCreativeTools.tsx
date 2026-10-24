import { ExternalLink } from 'lucide-react';

// Ferramentas criativas gratuitas do Vertal. As duas primeiras rodam dentro do painel;
// as demais são projetos de código aberto (MIT ou Apache-2.0) da storytold, abertas no GitHub.

type FreeTool =
  | { id: string; name: string; summary: string; kind: 'mode'; mode: 'manual' | 'photocraft'; actionLabel: string }
  | { id: string; name: string; summary: string; kind: 'link'; href: string };

const FREE_TOOLS: FreeTool[] = [
  {
    id: 'manual',
    name: 'Editor manual',
    summary: 'Monte a arte com texto, formas e imagens. Baixe em PNG.',
    kind: 'mode',
    mode: 'manual',
    actionLabel: 'Abrir editor',
  },
  {
    id: 'photocraft',
    name: 'PhotoCraft',
    summary: 'Edição de imagens em camadas, máscaras, ajustes, texto e PSD.',
    kind: 'mode',
    mode: 'photocraft',
    actionLabel: 'Abrir PhotoCraft',
  },
  {
    id: 'vectorcraft',
    name: 'VectorCraft',
    summary: 'Ilustração vetorial e logotipos.',
    kind: 'link',
    href: 'https://github.com/storytold/vectorcraft',
  },
  {
    id: 'filmcraft',
    name: 'FilmCraft',
    summary: 'Edição de vídeo, cor e som.',
    kind: 'link',
    href: 'https://github.com/storytold/filmcraft',
  },
  {
    id: 'wordcraft',
    name: 'WordCraft',
    summary: 'Processador de texto e design de documentos.',
    kind: 'link',
    href: 'https://github.com/storytold/wordcraft',
  },
  {
    id: 'gridcraft',
    name: 'GridCraft',
    summary: 'Planilhas e tabelas.',
    kind: 'link',
    href: 'https://github.com/storytold/gridcraft',
  },
  {
    id: 'deckcraft',
    name: 'DeckCraft',
    summary: 'Apresentações e slides.',
    kind: 'link',
    href: 'https://github.com/storytold/deckcraft',
  },
];

interface FreeCreativeToolsProps {
  onOpenMode: (mode: 'manual' | 'photocraft') => void;
}

export function FreeCreativeTools({ onOpenMode }: FreeCreativeToolsProps) {
  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-300/80">Grátis</p>
        <h2 className="mt-2 text-3xl font-bold text-white">Ferramentas criativas gratuitas</h2>
        <p className="mt-2 text-slate-400">
          Sem assinatura e sem créditos. As ferramentas abertas rodam no seu navegador ou abrem no GitHub.
        </p>
      </header>

      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {FREE_TOOLS.map((tool) => (
          <li key={tool.id} className="flex flex-col rounded-xl border border-slate-700/60 bg-slate-800/50 p-5">
            <span className="text-xs uppercase tracking-wider text-emerald-300/80">
              {tool.kind === 'mode' ? 'Grátis · no Vertal' : 'Grátis · código aberto'}
            </span>
            <h3 className="mt-1 text-lg font-semibold text-white">{tool.name}</h3>
            <p className="mt-2 text-sm text-slate-400">{tool.summary}</p>
            {tool.kind === 'mode' ? (
              <button
                type="button"
                onClick={() => onOpenMode(tool.mode)}
                className="mt-auto pt-4 text-left text-sm text-amber-300 hover:text-amber-200"
              >
                {tool.actionLabel}
              </button>
            ) : (
              <a
                href={tool.href}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-auto pt-4 inline-flex items-center gap-2 text-sm text-amber-300 hover:text-amber-200"
              >
                Ver no GitHub
                <ExternalLink className="w-4 h-4" aria-hidden />
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
