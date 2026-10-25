import { useCallback, useState, type ReactNode } from 'react';
import { Check, Download, Home, LayoutGrid, LayoutTemplate, Layers, Loader2, Search, Sparkles, User, Wand2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { AvatarsWorld, CanvasWorld, GalleryWorld, StudioWorld } from './creative/DesignWorlds';
import { StartCard } from './creative/DesignWorld';
import type { DesignCopy } from './creative/DesignGallery';
import {
  DESIGN_FORMATS,
  DESIGN_FORMATS_INFO,
  DESIGN_PROMPT_MAX_LENGTH,
  DESIGN_TIERS,
  DESIGN_TIERS_INFO,
  canAffordDesign,
  formatDesignCredits,
  getDesignCost,
  type DesignFormat,
  type DesignTier,
} from '@/config/designPricing';

interface CreativeDesignProps {
  creditsAvailable: number;
}

interface DesignImage {
  url: string;
  asset_id: string | null;
}

interface DesignResponse {
  ok: true;
  images: DesignImage[];
  failed_variants: number;
}

const MIN_PROMPT_LENGTH = 3;

type DesignMode = 'home' | 'ai' | 'canvas' | 'studio' | 'avatars' | 'gallery';

const DESIGN_MODES: Array<{ key: DesignMode; label: string; icon: ReactNode }> = [
  { key: 'home', label: 'Início', icon: <Home className="h-4 w-4" /> },
  { key: 'ai', label: 'Com IA', icon: <Wand2 className="h-4 w-4" /> },
  { key: 'canvas', label: 'Canvas', icon: <LayoutTemplate className="h-4 w-4" /> },
  { key: 'studio', label: 'Estúdio Pro', icon: <Layers className="h-4 w-4" /> },
  { key: 'avatars', label: 'Avatares', icon: <User className="h-4 w-4" /> },
  { key: 'gallery', label: 'Galeria', icon: <LayoutGrid className="h-4 w-4" /> },
];

// Mundos próprios, com páginas e subpáginas. Cada um monta na primeira abertura e fica montado ao sair, para não perder o trabalho.
const WORLD_MODES: DesignMode[] = ['canvas', 'studio', 'avatars', 'gallery'];

/** Painel Design Premium: início, criação com IA e os mundos Canvas, Estúdio Pro, Avatares e Galeria. */
export function CreativeDesign({ creditsAvailable }: CreativeDesignProps) {
  const [mode, setMode] = useState<DesignMode>('ai');
  const [openedWorlds, setOpenedWorlds] = useState<DesignMode[]>([]);

  const selectMode = (next: DesignMode) => {
    if (WORLD_MODES.includes(next) && !openedWorlds.includes(next)) {
      setOpenedWorlds([...openedWorlds, next]);
    }
    setMode(next);
  };
  const exitWorld = () => selectMode('home');

  // Cópia de um design da galeria: abre no Canvas, como design novo.
  const [pendingCopy, setPendingCopy] = useState<DesignCopy | null>(null);
  const openCopy = (copy: DesignCopy) => {
    setPendingCopy(copy);
    selectMode('canvas');
  };
  const consumeCopy = useCallback(() => setPendingCopy(null), []);

  return (
    <div className="md:flex md:items-start">
      {/* Celular: barra inferior com os mundos. Computador: trilho lateral fixo, como no protótipo. */}
      <nav
        aria-label="Modo de criação"
        className="fixed inset-x-0 bottom-0 z-30 flex justify-around gap-1 border-t border-white/10 bg-[#0c0b14]/90 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl md:sticky md:top-0 md:h-screen md:w-28 md:shrink-0 md:flex-col md:justify-start md:gap-2 md:border-r md:border-t-0 md:px-3 md:pb-6 md:pt-8"
      >
        {DESIGN_MODES.map((item) => {
          const selected = mode === item.key;
          return (
            <button
              key={item.key}
              type="button"
              aria-pressed={selected}
              onClick={() => selectMode(item.key)}
              className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-1 py-1 text-[11px] font-semibold transition-all active:scale-95 md:w-full md:flex-none ${
                selected ? 'text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <span
                aria-hidden="true"
                className={`flex h-8 w-12 items-center justify-center rounded-full transition-all ${
                  selected ? 'bg-gradient-to-r from-amber-400 to-rose-500 text-slate-900 shadow-lg shadow-rose-500/20' : ''
                }`}
              >
                {item.icon}
              </span>
              <span className="max-w-full truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="min-w-0 flex-1 pb-24 md:pb-0">
        <div hidden={mode !== 'home'}>
          <DesignHome onOpenMode={selectMode} />
        </div>
        <div hidden={mode !== 'ai'}>
          <AiDesignStudio creditsAvailable={creditsAvailable} />
        </div>
        {openedWorlds.includes('canvas') && (
          <div hidden={mode !== 'canvas'}>
            <CanvasWorld onExit={exitWorld} initialCopy={pendingCopy} onCopyConsumed={consumeCopy} />
          </div>
        )}
        {openedWorlds.includes('studio') && (
          <div hidden={mode !== 'studio'}>
            <StudioWorld onExit={exitWorld} />
          </div>
        )}
        {openedWorlds.includes('avatars') && (
          <div hidden={mode !== 'avatars'}>
            <AvatarsWorld onExit={exitWorld} />
          </div>
        )}
        {openedWorlds.includes('gallery') && (
          <div hidden={mode !== 'gallery'}>
            <GalleryWorld onExit={exitWorld} onOpenCopy={openCopy} />
          </div>
        )}
      </div>
    </div>
  );
}

function AiDesignStudio({ creditsAvailable }: CreativeDesignProps) {
  const [prompt, setPrompt] = useState('');
  const [tier, setTier] = useState<DesignTier>('simple');
  const [format, setFormat] = useState<DesignFormat>('post');
  const [images, setImages] = useState<DesignImage[]>([]);
  const [failedVariants, setFailedVariants] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedPrompt = prompt.trim();
  const cost = getDesignCost(tier);
  const variants = DESIGN_TIERS_INFO[tier].variants;
  const hasEnoughCredits = canAffordDesign(tier, creditsAvailable);
  const canGenerate = trimmedPrompt.length >= MIN_PROMPT_LENGTH && hasEnoughCredits && !isGenerating;

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setIsGenerating(true);
    setError(null);
    setImages([]);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke<DesignResponse>('creative-design', {
        body: { prompt: trimmedPrompt, format, tier },
        // Um clique = uma cobrança, mesmo que o botão seja clicado duas vezes.
        headers: { 'X-Idempotency-Key': crypto.randomUUID() },
      });
      if (invokeError) throw invokeError;
      if (!data?.ok || data.images.length === 0) throw new Error('design_generation_failed');
      setImages(data.images);
      setFailedVariants(data.failed_variants);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-amber-300/80">Estúdio de Design</p>
        <h2 className="mt-2 text-3xl font-bold text-white">Design Premium com IA</h2>
        <p className="mt-2 text-slate-400">Escolha o nível de acabamento. Você paga só pelo que gerar.</p>
      </header>

      <section aria-label="Nível de acabamento" className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {DESIGN_TIERS.map((t) => {
          const info = DESIGN_TIERS_INFO[t];
          const selected = tier === t;
          return (
            <button
              key={t}
              type="button"
              aria-pressed={selected}
              onClick={() => setTier(t)}
              className={`text-left rounded-xl border p-5 transition-all ${
                selected
                  ? 'border-amber-300/70 bg-gradient-to-br from-amber-400/15 to-rose-500/10 shadow-lg shadow-amber-500/10'
                  : 'border-slate-700/60 bg-slate-800/50 hover:border-slate-600'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white">{info.label}</span>
                <span className="text-sm font-medium text-amber-300">{formatDesignCredits(info.credits)}</span>
              </div>
              <p className="mt-2 text-sm text-slate-400">{info.description}</p>
              <p className="mt-3 text-xs text-slate-500">
                {info.variants} {info.variants === 1 ? 'variação' : 'variações'}
              </p>
            </button>
          );
        })}
      </section>

      <section aria-label="Formato" className="flex flex-wrap gap-2">
        {DESIGN_FORMATS.map((f) => {
          const info = DESIGN_FORMATS_INFO[f];
          const selected = format === f;
          return (
            <button
              key={f}
              type="button"
              aria-pressed={selected}
              onClick={() => setFormat(f)}
              className={`px-4 py-2 rounded-lg border text-sm transition-all ${
                selected
                  ? 'border-slate-200 bg-white text-slate-900'
                  : 'border-slate-700 bg-slate-800/50 text-slate-300 hover:border-slate-500'
              }`}
            >
              {info.label} <span className="opacity-60">{info.hint}</span>
            </button>
          );
        })}
      </section>

      <section className="space-y-2">
        <label htmlFor="design-prompt" className="block text-sm font-medium text-slate-200">
          Descreva o design
        </label>
        <textarea
          id="design-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          maxLength={DESIGN_PROMPT_MAX_LENGTH}
          rows={4}
          placeholder="Ex: Cartaz de lançamento de um app de IA, tons de azul-noite e dourado, tipografia moderna"
          className="w-full rounded-xl border border-slate-700 bg-slate-900/60 p-4 text-white placeholder:text-slate-500 focus:border-amber-300/60 focus:outline-none"
        />
        <p className="text-right text-xs text-slate-500">
          {prompt.length}/{DESIGN_PROMPT_MAX_LENGTH}
        </p>
      </section>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <p className={`text-sm ${hasEnoughCredits ? 'text-slate-300' : 'text-rose-400'}`}>
          {hasEnoughCredits
            ? `💳 ${formatDesignCredits(cost)} · ${variants} ${variants === 1 ? 'variação' : 'variações'}`
            : `Créditos insuficientes: este nível custa ${cost}, você tem ${creditsAvailable}.`}
        </p>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={!canGenerate}
          className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-gradient-to-r from-amber-400 to-rose-500 text-slate-900 font-semibold transition-all hover:shadow-lg hover:shadow-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Criando {variants === 1 ? 'a arte' : `${variants} variações`}…
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Criar design
            </>
          )}
        </button>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">
          {error}
        </div>
      )}

      {images.length > 0 && (
        <section aria-label="Resultados" className="space-y-4">
          {failedVariants > 0 && (
            <p className="text-sm text-amber-200">
              {images.length} de {images.length + failedVariants} variações ficaram prontas. A cobrança do lote foi mantida.
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {images.map((image, index) => (
              <figure key={image.asset_id ?? image.url} className="group overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-900/60">
                <img src={image.url} alt={`Variação ${index + 1} do design`} className="w-full h-auto" />
                <figcaption className="flex items-center justify-between gap-3 p-4">
                  <span className="flex items-center gap-2 text-sm text-slate-300">
                    <Check className="w-4 h-4 text-emerald-400" aria-hidden />
                    Variação {index + 1}
                  </span>
                  <a
                    href={image.url}
                    download={`design-${index + 1}.png`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-amber-300 hover:text-amber-200"
                  >
                    <Download className="w-4 h-4" aria-hidden />
                    Baixar
                  </a>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** Mensagem curta para o usuário. Não expõe detalhes de infraestrutura. */
interface DesignStart {
  key: Exclude<DesignMode, 'home'>;
  title: string;
  description: string;
  icon: ReactNode;
  gradient: string;
}

// Ferramentas que já abrem um fluxo real. Cada uma leva ao modo correspondente.
const DESIGN_STARTS: DesignStart[] = [
  {
    key: 'ai',
    title: 'Com IA',
    description: 'Gere uma arte a partir de um texto · 1 a 2 créditos',
    icon: <Wand2 className="h-5 w-5" />,
    gradient: 'from-amber-400 to-rose-500',
  },
  {
    key: 'canvas',
    title: 'Canvas',
    description: 'Canvas infinito, com modelos e exportação em PNG e SVG',
    icon: <LayoutTemplate className="h-5 w-5" />,
    gradient: 'from-rose-500 to-orange-400',
  },
  {
    key: 'studio',
    title: 'Estúdio Pro',
    description: 'Editor manual, PhotoCraft e ferramentas grátis',
    icon: <Layers className="h-5 w-5" />,
    gradient: 'from-violet-500 to-blue-500',
  },
  {
    key: 'avatars',
    title: 'Avatares',
    description: 'Avatares falantes, com narração por IA',
    icon: <User className="h-5 w-5" />,
    gradient: 'from-emerald-400 to-cyan-600',
  },
  {
    key: 'gallery',
    title: 'Galeria',
    description: 'Designs publicados por outras pessoas',
    icon: <LayoutGrid className="h-5 w-5" />,
    gradient: 'from-blue-500 to-pink-500',
  },
];

// Seções que dependem da biblioteca universal de produções. Aparecem como indisponíveis, sem dados simulados.
const DESIGN_PENDING = [
  { title: 'Continuar criando', description: 'Os designs em andamento vão aparecer aqui.' },
  { title: 'Seus projetos recentes', description: 'Os últimos designs salvos vão aparecer aqui.' },
  { title: 'Favoritos', description: 'Os designs marcados como favoritos vão aparecer aqui.' },
  { title: 'Modelos', description: 'A galeria de modelos publicados vai aparecer aqui.' },
];

/** Tela inicial do Design Premium: busca, atalhos para as ferramentas e seções ainda em desenvolvimento. */
function DesignHome({ onOpenMode }: { onOpenMode: (mode: DesignMode) => void }) {
  const [query, setQuery] = useState('');
  const term = query.trim().toLowerCase();
  const starts = DESIGN_STARTS.filter(
    (item) => term === '' || item.title.toLowerCase().includes(term) || item.description.toLowerCase().includes(term),
  );

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
      <header className="space-y-5">
        <div className="relative overflow-hidden rounded-3xl border border-amber-300/25 bg-gradient-to-br from-amber-400/15 via-rose-500/10 to-violet-600/15 p-6 md:p-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-300">Design Premium</p>
          <h2 className="mt-2 font-['Unbounded'] text-3xl font-extrabold tracking-tight text-transparent bg-gradient-to-r from-white via-amber-300 to-rose-400 bg-clip-text md:text-4xl">
            O que você gostaria de criar?
          </h2>
          <label className="relative mt-6 block max-w-xl">
            <span className="sr-only">Buscar ferramenta</span>
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar ferramenta"
              className="w-full rounded-2xl border border-slate-700 bg-[#161426] py-3.5 pl-11 pr-4 text-white shadow-2xl shadow-rose-500/10 placeholder:text-slate-500 focus:border-amber-300/60 focus:outline-none"
            />
          </label>
        </div>
      </header>

      <section aria-labelledby="design-home-start">
        <h3 id="design-home-start" className="mb-4 font-['Unbounded'] text-lg font-bold text-white">Começar uma nova criação</h3>
        {starts.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhuma ferramenta encontrada para essa busca.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {starts.map((item) => (
              <StartCard
                key={item.key}
                title={item.title}
                description={item.description}
                icon={item.icon}
                gradient={item.gradient}
                onClick={() => onOpenMode(item.key)}
              />
            ))}
          </div>
        )}
      </section>

      <section aria-label="Em desenvolvimento" className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {DESIGN_PENDING.map((item) => (
          <div key={item.title} className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-5 opacity-80">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-base font-semibold text-slate-200">{item.title}</h4>
              <span className="shrink-0 rounded-full border border-slate-600 px-2 py-0.5 text-[11px] text-slate-300">Em desenvolvimento</span>
            </div>
            <p className="mt-1 text-sm text-slate-400">{item.description}</p>
          </div>
        ))}
      </section>
    </div>
  );
}

function describeError(err: unknown): string {
  const status = (err as { context?: { status?: number } } | null)?.context?.status;
  if (status === 402) return 'Créditos insuficientes para este nível.';
  if (status === 429) return 'Muitas gerações em pouco tempo. Aguarde um minuto e tente de novo.';
  return 'Não foi possível gerar o design agora. Se algum crédito foi descontado, ele é devolvido automaticamente.';
}
