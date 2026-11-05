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
  'w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-800 placeholder:text-slate-400 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200';

/** Bloco da IA: pedido, material opcional e botão com o custo visível. */
export function AiPanel({ placeholder, creditsAvailable, busy, onRun, actionLabel }: AiPanelProps) {
  const [prompt, setPrompt] = useState('');
  const [source, setSource] = useState('');
  const hasCredit = creditsAvailable >= OFFICE_AI_CREDIT_COST;
  const canRun = !busy && hasCredit && prompt.trim().length >= 3;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-sm">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">Assistente de IA</p>
          <p className="text-[11px] text-slate-500">Escreve e organiza a partir do seu pedido</p>
        </div>
      </div>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={placeholder}
        rows={3}
        aria-label="Pedido para a IA"
        className={FIELD}
      />

      <details className="group text-xs text-slate-500">
        <summary className="inline-flex cursor-pointer select-none items-center gap-1 rounded py-1 hover:text-slate-800">
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

      <div className="flex flex-col gap-2 border-t border-slate-200 pt-3">
        <span className="text-xs text-slate-500">
          Custa {OFFICE_AI_CREDIT_COST} crédito por uso · você tem {creditsAvailable}
        </span>
        <button
          type="button"
          disabled={!canRun}
          onClick={() => onRun(prompt.trim(), source.trim())}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
          {busy ? 'Gerando…' : actionLabel}
        </button>
      </div>
      {!hasCredit && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Sem créditos. O editor continua funcionando normalmente.
        </p>
      )}
    </div>
  );
}
