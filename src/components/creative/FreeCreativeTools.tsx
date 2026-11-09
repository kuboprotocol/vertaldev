// Ferramentas criativas gratuitas do Vertal. Todas rodam dentro do painel: o editor manual é do
// Vertal; as Craft são projetos de código aberto (MIT ou Apache-2.0) da storytold/ArtCraft,
// servidos em /<nome>craft/ (veja os componentes *craftEditor).

export type FreeToolMode = 'manual' | 'photocraft' | 'vectorcraft' | 'filmcraft' | 'wordcraft' | 'gridcraft' | 'deckcraft';

interface FreeTool {
  id: string;
  name: string;
  summary: string;
  mode: FreeToolMode;
  actionLabel: string;
}

const FREE_TOOLS: FreeTool[] = [
  {
    id: 'manual',
    name: 'Editor manual',
    summary: 'Monte a arte com texto, formas e imagens. Baixe em PNG.',
    mode: 'manual',
    actionLabel: 'Abrir editor',
  },
  {
    id: 'photocraft',
    name: 'PhotoCraft',
    summary: 'Edição de imagens em camadas, máscaras, ajustes, texto e PSD.',
    mode: 'photocraft',
    actionLabel: 'Abrir PhotoCraft',
  },
  {
    id: 'vectorcraft',
    name: 'VectorCraft',
    summary: 'Ilustração vetorial e logotipos.',
    mode: 'vectorcraft',
    actionLabel: 'Abrir VectorCraft',
  },
  {
    id: 'filmcraft',
    name: 'FilmCraft',
    summary: 'Edição de vídeo, cor e som.',
    mode: 'filmcraft',
    actionLabel: 'Abrir FilmCraft',
  },
  {
    id: 'wordcraft',
    name: 'WordCraft',
    summary: 'Processador de texto e design de documentos.',
    mode: 'wordcraft',
    actionLabel: 'Abrir WordCraft',
  },
  {
    id: 'gridcraft',
    name: 'GridCraft',
    summary: 'Planilhas e tabelas.',
    mode: 'gridcraft',
    actionLabel: 'Abrir GridCraft',
  },
  {
    id: 'deckcraft',
    name: 'DeckCraft',
    summary: 'Apresentações e slides.',
    mode: 'deckcraft',
    actionLabel: 'Abrir DeckCraft',
  },
];

interface FreeCreativeToolsProps {
  onOpenMode: (mode: FreeToolMode) => void;
}

export function FreeCreativeTools({ onOpenMode }: FreeCreativeToolsProps) {
  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-300/80">Grátis</p>
        <h2 className="mt-2 text-3xl font-bold text-white">Ferramentas criativas gratuitas</h2>
        <p className="mt-2 text-slate-400">
          Sem assinatura e sem créditos. Tudo roda no seu navegador, dentro do Vertal.
        </p>
      </header>

      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {FREE_TOOLS.map((tool) => (
          <li key={tool.id} className="flex flex-col rounded-xl border border-slate-700/60 bg-slate-800/50 p-5">
            <span className="text-xs uppercase tracking-wider text-emerald-300/80">Grátis · no Vertal</span>
            <h3 className="mt-1 text-lg font-semibold text-white">{tool.name}</h3>
            <p className="mt-2 text-sm text-slate-400">{tool.summary}</p>
            <button
              type="button"
              onClick={() => onOpenMode(tool.mode)}
              className="mt-auto pt-4 text-left text-sm text-amber-300 hover:text-amber-200"
            >
              {tool.actionLabel}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
