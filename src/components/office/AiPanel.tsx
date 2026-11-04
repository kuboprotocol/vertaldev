// Painel de IA do Vertal Office: pedido + material opcional. Cada uso custa 1 crédito.
import React, { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { OFFICE_AI_CREDIT_COST } from '@/services/officeAiService';

interface AiPanelProps {
  placeholder: string;
  creditsAvailable: number;
  busy: boolean;
  onRun: (prompt: string, source: string) => void;
  actionLabel: string;
}

/** Bloco da IA: pedido, material opcional e botão com o custo visível. */
export function AiPanel({ placeholder, creditsAvailable, busy, onRun, actionLabel }: AiPanelProps) {
  const [prompt, setPrompt] = useState('');
  const [source, setSource] = useState('');
  const hasCredit = creditsAvailable >= OFFICE_AI_CREDIT_COST;
  const canRun = !busy && hasCredit && prompt.trim().length >= 3;

  return (
    <div className="rounded-xl border border-violet-400/20 bg-violet-500/5 p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-violet-200">
        <Sparkles className="h-4 w-4" /> Inteligência artificial
      </div>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={placeholder}
        rows={2}
        className="w-full rounded-lg border border-white/10 bg-slate-950/60 p-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-400/50"
      />
      <details className="text-xs text-slate-400">
        <summary className="cursor-pointer select-none">Colar dados ou texto de referência (opcional)</summary>
        <textarea
          value={source}
          onChange={(e) => setSource(e.target.value)}
          rows={4}
          placeholder="Cole aqui tabelas, listas ou textos que a IA deve usar como base."
          className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/60 p-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-400/50"
        />
      </details>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-slate-400">
          Custa {OFFICE_AI_CREDIT_COST} crédito por uso · você tem {creditsAvailable}
        </span>
        <button
          type="button"
          disabled={!canRun}
          onClick={() => onRun(prompt.trim(), source.trim())}
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {busy ? 'Gerando…' : actionLabel}
        </button>
      </div>
      {!hasCredit && <p className="text-xs text-amber-300">Sem créditos. O editor continua funcionando normalmente.</p>}
    </div>
  );
}
