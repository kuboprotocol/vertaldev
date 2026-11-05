// Painel de IA do Vertal Office: pedido + material opcional. Cada uso custa 1 crédito.
import React, { useState } from 'react';
import { Sparkles, Loader2, ChevronDown } from 'lucide-react';
import { OFFICE_AI_CREDIT_COST } from '@/services/officeAiService';

interface AiPanelProps {
  placeholder: string;
  creditsAvailable: number;
  busy: boolean;
  onRun: (prompt: string, source: string) => void;
  actionLabel: string;
}

const FIELD =
  'w-full rounded-xl border border-white/10 bg-slate-950/70 p-3 text-sm text-slate-100 placeholder:text-slate-500 transition focus:border-violet-400/50 focus:outline-none focus:ring-2 focus:ring-violet-400/30';

/** Bloco da IA: pedido, material opcional e botão com o custo visível. */
export function AiPanel({ placeholder, creditsAvailable, busy, onRun, actionLabel }: AiPanelProps) {
  const [prompt, setPrompt] = useState('');
  const [source, setSource] = useState('');
  const hasCredit = creditsAvailable >= OFFICE_AI_CREDIT_COST;
  const canRun = !busy && hasCredit && prompt.trim().length >= 3;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-violet-400/20 bg-gradient-to-br from-violet-500/10 via-slate-900/60 to-fuchsia-500/10 p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-md shadow-fuchsia-900/30">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
          </span>
          <span className="text-sm font-semibold text-violet-100">Assistente de IA</span>
        </div>
        <span className="rounded-full border border-violet-300/20 bg-violet-400/10 px-2.5 py-0.5 text-[11px] font-medium text-violet-200">
          {OFFICE_AI_CREDIT_COST} crédito por uso
        </span>
      </div>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={placeholder}
        rows={2}
        aria-label="Pedido para a IA"
        className={FIELD}
      />

      <details className="group mt-2 text-xs text-slate-400">
        <summary className="inline-flex cursor-pointer select-none items-center gap-1 rounded-md py-1 text-slate-400 hover:text-slate-200">
          <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" aria-hidden />
          Colar dados ou texto de referência (opcional)
        </summary>
        <textarea
          value={source}
          onChange={(e) => setSource(e.target.value)}
          rows={4}
          placeholder="Cole aqui tabelas, listas ou textos que a IA deve usar como base."
          aria-label="Material de referência para a IA"
          className={`mt-2 ${FIELD}`}
        />
      </details>

      <div className="mt-4 flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-xs text-slate-400">
          Custa {OFFICE_AI_CREDIT_COST} crédito por uso · você tem {creditsAvailable}
        </span>
        <button
          type="button"
          disabled={!canRun}
          onClick={() => onRun(prompt.trim(), source.trim())}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-fuchsia-900/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
          {busy ? 'Gerando…' : actionLabel}
        </button>
      </div>
      {!hasCredit && (
        <p className="mt-3 rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
          Sem créditos. O editor continua funcionando normalmente.
        </p>
      )}
    </div>
  );
}
