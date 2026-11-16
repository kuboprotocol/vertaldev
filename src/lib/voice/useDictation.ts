// Ditado direto na caixa de mensagem do Vertal Chat (Web Speech API, sem custo).
// Toque no microfone para começar, fale, toque de novo para parar. O texto entra no campo.
import { useCallback, useEffect, useRef, useState } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Recognition = any;

export type DictationError = 'unsupported' | 'insecure' | 'denied' | 'no-mic' | 'no-speech' | 'network' | 'other';

export const DICTATION_ERROR_TEXT: Record<DictationError, string> = {
  unsupported: 'Seu navegador não tem ditado por voz. Use Chrome, Edge ou Safari.',
  insecure: 'O microfone só funciona em páginas https.',
  denied: 'O acesso ao microfone foi bloqueado. Libere o microfone no cadeado ao lado do endereço do site e tente de novo.',
  'no-mic': 'Nenhum microfone encontrado neste aparelho.',
  'no-speech': 'Não ouvi nada. Toque no microfone e fale de novo.',
  network: 'O serviço de voz do navegador ficou sem conexão. Tente de novo.',
  other: 'Não consegui usar o microfone agora. Tente de novo.',
};

function getRecognitionCtor(): (new () => Recognition) | null {
  if (typeof window === 'undefined') return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

function mapError(code: string): DictationError {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'denied';
    case 'audio-capture':
      return 'no-mic';
    case 'no-speech':
      return 'no-speech';
    case 'network':
      return 'network';
    default:
      return 'other';
  }
}

export function useDictation({
  lang = 'pt-BR',
  onText,
  onError,
}: {
  lang?: string;
  /** Recebe o texto ditado até agora nesta sessão (final + parcial). */
  onText: (text: string) => void;
  onError?: (error: DictationError) => void;
}) {
  const [listening, setListening] = useState(false);
  const recRef = useRef<Recognition | null>(null);
  const onTextRef = useRef(onText);
  const onErrorRef = useRef(onError);
  onTextRef.current = onText;
  onErrorRef.current = onError;

  const supported = getRecognitionCtor() !== null;

  const stop = useCallback(() => {
    const rec = recRef.current;
    if (rec) {
      try {
        rec.stop();
      } catch {
        /* já parado */
      }
    }
  }, []);

  const start = useCallback(async () => {
    if (recRef.current) return;
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      onErrorRef.current?.('unsupported');
      return;
    }
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      onErrorRef.current?.('insecure');
      return;
    }

    // Pede a permissão do microfone antes (no Chrome isso mostra o pedido de forma confiável).
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
      }
    } catch (err) {
      const name = (err as { name?: string })?.name;
      onErrorRef.current?.(name === 'NotFoundError' || name === 'OverconstrainedError' ? 'no-mic' : 'denied');
      return;
    }

    const rec: Recognition = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    let finalText = '';
    rec.onresult = (event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      onTextRef.current((finalText + interim).replace(/\s+/g, ' ').trim());
    };
    rec.onerror = (event: { error: string }) => {
      if (event.error === 'aborted') return;
      onErrorRef.current?.(mapError(event.error));
    };
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
    };

    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      recRef.current = null;
      setListening(false);
      onErrorRef.current?.('other');
    }
  }, [lang]);

  const toggle = useCallback(() => {
    if (recRef.current) stop();
    else void start();
  }, [start, stop]);

  // Para o microfone ao sair da tela.
  useEffect(() => () => {
    const rec = recRef.current;
    if (rec) {
      try {
        rec.abort();
      } catch {
        /* nada */
      }
    }
  }, []);

  return { supported, listening, start, stop, toggle };
}
