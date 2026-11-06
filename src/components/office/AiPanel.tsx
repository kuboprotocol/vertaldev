// Painel de IA do Vertal Office: pedido + material opcional + ditado por voz.
// Cada uso da IA custa 1 crédito. O ditado usa o reconhecimento de voz do navegador (sem custo).
import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, Loader2, ChevronDown, Mic, MicOff } from 'lucide-react';
import { OFFICE_AI_CREDIT_COST } from '@/services/officeAiService';

interface AiPanelProps {
  placeholder: string;
  creditsAvailable: number;
  busy: boolean;
  onRun: (prompt: string, source: string) => void;
  actionLabel: string;
  /** Quando existe, cada trecho ditado vai direto para o documento. Senão, vai para o pedido. */
  onDictate?: (text: string) => void;
}

const FIELD =
  'w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-800 placeholder:text-slate-400 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200';

// Tipagem mínima do reconhecimento de voz (não está no lib.dom em todos os navegadores).
interface SpeechResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechResultLike>;
}
interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
}
type RecognitionCtor = new () => RecognitionLike;

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Bloco da IA: pedido, material opcional, ditado por voz e botão com o custo visível. */
export function AiPanel({ placeholder, creditsAvailable, busy, onRun, actionLabel, onDictate }: AiPanelProps) {
  const [prompt, setPrompt] = useState('');
  const [source, setSource] = useState('');
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [micError, setMicError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const lockedRef = useRef(false);
  const recRef = useRef<RecognitionLike | null>(null);
  const onDictateRef = useRef(onDictate);
  onDictateRef.current = onDictate;

  const hasCredit = creditsAvailable >= OFFICE_AI_CREDIT_COST;
  const canRun = !busy && hasCredit && prompt.trim().length >= 3;
  const micSupported = getRecognitionCtor() !== null;

  useEffect(() => () => {
    lockedRef.current = false;
    recRef.current?.stop();
  }, []);

  /** Cria e inicia uma sessão de ditado. Em modo ligado, reinicia sozinha quando o navegador para por silêncio. */
  const startRecognition = () => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = 'pt-BR';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let finalText = '';
      let pending = '';
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else pending += r[0].transcript;
      }
      setInterim(pending);
      const clean = finalText.trim();
      if (!clean) return;
      if (onDictateRef.current) onDictateRef.current(clean);
      else setPrompt((p) => (p ? `${p} ${clean}` : clean));
    };
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      setMicError(e.error === 'not-allowed' ? 'Permissão do microfone negada. Libere o microfone no navegador.' : 'Não consegui ouvir. Tente de novo.');
      lockedRef.current = false;
      setLocked(false);
    };
    rec.onend = () => {
      setInterim('');
      recRef.current = null;
      if (lockedRef.current) {
        startRecognition();
        return;
      }
      setListening(false);
    };
    recRef.current = rec;
    setMicError(null);
    setListening(true);
    rec.start();
  };

  /** Clique simples: liga por um trecho e desliga ao parar. Duplo clique: deixa ligado até o próximo duplo clique. */
  const onMicClick = () => {
    if (lockedRef.current) return;
    if (recRef.current) {
      recRef.current.stop();
      return;
    }
    startRecognition();
  };

  const onMicDoubleClick = () => {
    if (lockedRef.current) {
      lockedRef.current = false;
      setLocked(false);
      recRef.current?.stop();
      return;
    }
    lockedRef.current = true;
    setLocked(true);
    if (!recRef.current) startRecognition();
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-sm">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">Assistente de IA</p>
          <p className="text-[11px] text-slate-500">Escreve e organiza a partir do seu pedido ou da sua fala</p>
        </div>
      </div>

      <div className="relative">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={placeholder}
          rows={3}
          aria-label="Pedido para a IA"
          className={`${FIELD} pr-12`}
        />
        <button
          type="button"
          onClick={onMicClick}
          onDoubleClick={onMicDoubleClick}
          disabled={!micSupported}
          aria-label={locked ? 'Microfone ligado. Clique duas vezes para desligar' : 'Ditar por voz'}
          aria-pressed={listening}
          title={
            micSupported
              ? 'Clique para ditar. Clique duas vezes para deixar o microfone ligado'
              : 'Seu navegador não tem ditado por voz. Use Chrome ou Edge.'
          }
          className={`absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-40 ${
            listening ? 'animate-pulse bg-red-500 text-white shadow-md shadow-red-300' : 'bg-blue-600 text-white shadow-sm hover:bg-blue-700'
          }`}
        >
          {listening ? <MicOff className="h-4 w-4" aria-hidden /> : <Mic className="h-4 w-4" aria-hidden />}
        </button>
      </div>

      {listening && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700" role="status">
          Ouvindo{interim ? `: ${interim}` : '…'} <span className="text-red-500">(toque no microfone para parar)</span>
        </p>
      )}
      {micError && <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">{micError}</p>}
      {!micSupported && <p className="text-[11px] text-slate-500">O ditado por voz funciona no Chrome e no Edge.</p>}

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
