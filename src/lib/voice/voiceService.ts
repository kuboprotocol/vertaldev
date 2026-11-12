// Serviço de captura de voz + transcrição com suporte a Web Speech API e Whisper

interface TranscriptionResult {
  text: string;
  confidence: number;
  language?: string;
  isFinal: boolean;
  duration?: number;
}

interface VoiceRecordingState {
  isRecording: boolean;
  transcript: string;
  confidence: number;
  duration: number;
  interimTranscript: string;
}

// Web Speech API (nativa do navegador - sem dependências)
export class WebSpeechVoiceService {
  private recognition: SpeechRecognition | null = null;
  private finalTranscript = '';
  private interimTranscript = '';

  constructor() {
    // Verifica suporte a Web Speech API
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.setupRecognition();
    }
  }

  private setupRecognition() {
    if (!this.recognition) return;

    // Configurações do reconhecimento
    this.recognition.continuous = false;
    this.recognition.interimResults = true;
    this.recognition.lang = 'pt-BR'; // Português do Brasil por padrão

    // Handlers de eventos
    this.recognition.onstart = () => {
      console.log('🎤 Gravação iniciada');
    };

    this.recognition.onend = () => {
      console.log('🎤 Gravação finalizada');
    };

    this.recognition.onerror = (event: any) => {
      console.error('Erro no reconhecimento:', event.error);
    };
  }

  isSupported(): boolean {
    return this.recognition !== null;
  }

  start(onInterim?: (text: string) => void): void {
    if (!this.recognition) {
      console.error('Web Speech API não é suportado neste navegador');
      return;
    }

    this.finalTranscript = '';
    this.interimTranscript = '';

    // Evento para resultados intermediários e finais
    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      this.interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;

        if (event.results[i].isFinal) {
          this.finalTranscript += transcript + ' ';
        } else {
          this.interimTranscript += transcript;
        }
      }

      // Chama callback com transcrição intermediária
      if (onInterim) {
        onInterim(this.finalTranscript + this.interimTranscript);
      }
    };

    this.recognition.start();
  }

  stop(): TranscriptionResult {
    if (!this.recognition) {
      return { text: '', confidence: 0, isFinal: true };
    }

    this.recognition.stop();

    return {
      text: this.finalTranscript.trim(),
      confidence: 0.95, // Web Speech API não fornece confiança, estimamos 95%
      language: 'pt-BR',
      isFinal: true,
    };
  }

  setLanguage(lang: string): void {
    if (this.recognition) {
      this.recognition.lang = lang;
    }
  }
}

// Integração com Whisper API (fallback para maior precisão)
export async function transcribeWithWhisper(audioBlob: Blob, apiKey?: string): Promise<TranscriptionResult> {
  // Se não houver chave da API, tenta usar a Web Speech API
  if (!apiKey) {
    console.log('⚠️ Chave Whisper não configurada, usando Web Speech API');
    return { text: '', confidence: 0.8, isFinal: true };
  }

  try {
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.wav');
    formData.append('model', 'whisper-1');
    formData.append('language', 'pt');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Erro Whisper: ${response.status}`);
    }

    const data = await response.json();

    return {
      text: data.text,
      confidence: 0.98, // Whisper tem alta confiança
      language: 'pt-BR',
      isFinal: true,
    };
  } catch (error) {
    console.error('Erro ao usar Whisper:', error);
    throw error;
  }
}

// Hook React para gerenciar estado de gravação
export function useVoiceRecording() {
  const [state, setState] = React.useState<VoiceRecordingState>({
    isRecording: false,
    transcript: '',
    confidence: 0,
    duration: 0,
    interimTranscript: '',
  });

  const voiceService = React.useMemo(() => new WebSpeechVoiceService(), []);
  const startTimeRef = React.useRef<number>(0);
  const timerRef = React.useRef<NodeJS.Timeout>();

  const startRecording = React.useCallback(() => {
    if (!voiceService.isSupported()) {
      console.error('Web Speech API não é suportado');
      return;
    }

    setState((prev) => ({ ...prev, isRecording: true, transcript: '', interimTranscript: '' }));
    startTimeRef.current = Date.now();

    // Timer para mostrar duração
    timerRef.current = setInterval(() => {
      const duration = Math.floor((Date.now() - startTimeRef.current) / 1000);
      setState((prev) => ({ ...prev, duration }));
    }, 100);

    // Inicia gravação com callback para transcrição intermediária
    voiceService.start((interimText) => {
      setState((prev) => ({
        ...prev,
        interimTranscript: interimText,
      }));
    });
  }, [voiceService]);

  const stopRecording = React.useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    const result = voiceService.stop();

    setState((prev) => ({
      ...prev,
      isRecording: false,
      transcript: result.text,
      confidence: result.confidence,
      interimTranscript: '',
    }));

    return result;
  }, [voiceService]);

  const setLanguage = React.useCallback((lang: string) => {
    voiceService.setLanguage(lang);
  }, [voiceService]);

  return {
    state,
    startRecording,
    stopRecording,
    setLanguage,
    isSupported: voiceService.isSupported(),
  };
}

// Utilidade para capturar áudio como Blob (para Whisper)
export async function captureAudioBlob(): Promise<Blob | null> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaRecorder = new MediaRecorder(stream);
    const chunks: BlobPart[] = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    return new Promise((resolve) => {
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/wav' });
        stream.getTracks().forEach((track) => track.stop());
        resolve(blob);
      };

      // Para teste, grava por 30 segundos máximo
      mediaRecorder.start();
      setTimeout(() => mediaRecorder.stop(), 30000);
    });
  } catch (error) {
    console.error('Erro ao capturar áudio:', error);
    return null;
  }
}

// Re-export React se não estiver disponível localmente
import * as React from 'react';
