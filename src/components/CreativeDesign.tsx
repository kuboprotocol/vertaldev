import { useState } from 'react';
import { Check, Download, Loader2, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ManualDesignEditor } from './creative/ManualDesignEditor';
import { AdobeEcosystem } from './creative/AdobeEcosystem';
import { PhotocraftEditor } from './creative/PhotocraftEditor';
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

type DesignMode = 'ai' | 'manual' | 'photocraft' | 'adobe';

const DESIGN_MODES: Array<{ key: DesignMode; label: string }> = [
  { key: 'ai', label: 'Com IA' },
  { key: 'manual', label: 'Editor manual' },
  { key: 'photocraft', label: 'PhotoCraft' },
  { key: 'adobe', label: 'Ecossistema Adobe' },
];

/** Painel Design Premium: IA, editor manual e ecossistema Adobe. Os três ficam montados para não perder o trabalho ao trocar de aba. */
export function CreativeDesign({ creditsAvailable }: CreativeDesignProps) {
  const [mode, setMode] = useState<DesignMode>('ai');

  return (
    <div>
      <nav aria-label="Modo de criação" className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 flex flex-wrap gap-2">
        {DESIGN_MODES.map((item) => {
          const selected = mode === item.key;
          return (
            <button
              key={item.key}
              type="button"
              aria-pressed={selected}
              onClick={() => setMode(item.key)}
              className={`px-4 py-2 rounded-lg border text-sm transition-all ${
                selected
                  ? 'border-amber-300/70 bg-gradient-to-r from-amber-400/15 to-rose-500/10 text-white'
                  : 'border-slate-700 bg-slate-800/50 text-slate-300 hover:border-slate-500'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      <div hidden={mode !== 'ai'}>
        <AiDesignStudio creditsAvailable={creditsAvailable} />
      </div>
      <div hidden={mode !== 'manual'} className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <ManualDesignEditor />
      </div>
      <div hidden={mode !== 'photocraft'} className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <PhotocraftEditor />
      </div>
      <div hidden={mode !== 'adobe'} className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <AdobeEcosystem />
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
function describeError(err: unknown): string {
  const status = (err as { context?: { status?: number } } | null)?.context?.status;
  if (status === 402) return 'Créditos insuficientes para este nível.';
  if (status === 429) return 'Muitas gerações em pouco tempo. Aguarde um minuto e tente de novo.';
  return 'Não foi possível gerar o design agora. Se algum crédito foi descontado, ele é devolvido automaticamente.';
}
