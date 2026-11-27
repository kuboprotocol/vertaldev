// Vertal · Clonador de voz — cliente do navegador (ações voice_* da edge function creative-music).
// Toda chamada tem tempo-limite e o acompanhamento tem prazo total: o chat e o Studio nunca ficam
// presos esperando (foi assim que o chat "travou" ao pedir para clonar a voz).
import { supabase } from '@/integrations/supabase/client';
import { functionErrorCode } from '@/lib/functionError';
import { VOICE_LIMITS, type VoiceLang } from '../../../supabase/functions/_shared/voiceClone';
import { voiceServerLang } from './i18n';

export interface VoiceCloneConfig {
  enabled: boolean;
  engine: boolean;
  costs: { create: number; speak: number; sing: number };
  consent_version: string;
  consent_text: string;
  limits: { max_voices: number; min_seconds: number; max_seconds: number; max_bytes: number; max_text: number };
  /** Idiomas da fala (código → nome nativo). Ausente em servidores antigos. */
  speech_languages?: Record<string, string>;
}

export interface SavedVoice {
  id: string;
  name: string;
  language: string;
  sample_seconds: number;
  created_at: string;
}

export interface VoiceJob {
  job_id: string;
  kind: 'speak' | 'sing';
  status: 'processing' | 'completed' | 'failed' | string;
  audio_url: string | null;
  error?: string | null;
  refunded?: boolean;
  created_at?: string;
  title?: string | null;
  text?: string | null;
  message?: string;
  speech_language?: string;
  language_fallback?: boolean;
}

export class VoiceCloneError extends Error {
  constructor(message: string, public code: string) {
    super(message);
  }
}

const CALL_TIMEOUT_MS = 45_000;

function withTimeout<T>(work: Promise<T>, ms: number, code = 'timeout'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new VoiceCloneError('Tempo esgotado ao falar com o servidor.', code)), ms);
    work.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

/**
 * Idioma das mensagens do Clonador (pt/en/es), a partir do idioma do APP (Ajustes → último pedido no chat →
 * navegador → perfil → pt-BR). O nome ficou por compatibilidade; antes lia só o navegador.
 */
export function browserVoiceLang(): VoiceLang {
  return voiceServerLang();
}

export async function callVoice<T>(body: Record<string, unknown>, opts: { idem?: string; timeoutMs?: number } = {}): Promise<T> {
  const run = supabase.functions.invoke('creative-music', {
    body: { language: browserVoiceLang(), ...body },
    headers: opts.idem ? { 'X-Idempotency-Key': opts.idem } : undefined,
  });
  const { data, error } = await withTimeout(run, opts.timeoutMs ?? CALL_TIMEOUT_MS);
  if (error) {
    let msg = '';
    let code = '';
    try {
      const ctx = (error as { context?: Response }).context;
      const j = ctx ? await ctx.clone().json() : null;
      msg = j?.error ?? '';
      code = j?.code ?? '';
    } catch {
      /* sem corpo */
    }
    if (!code) code = (await functionErrorCode(error)) ?? 'unavailable';
    throw new VoiceCloneError(msg || 'O Clonador de voz está indisponível agora.', code);
  }
  return data as T;
}

export const getVoiceConfig = () => callVoice<VoiceCloneConfig & { ok: boolean }>({ action: 'voice_config' }, { timeoutMs: 20_000 });
export const listVoices = async () => (await callVoice<{ voices: SavedVoice[] }>({ action: 'voice_list' })).voices ?? [];
export const deleteVoice = (voiceId: string) => callVoice<{ deleted: boolean }>({ action: 'voice_delete', voice_id: voiceId });
export const listVoiceJobs = async () => (await callVoice<{ jobs: VoiceJob[] }>({ action: 'voice_jobs' })).jobs ?? [];

/** Sobe a amostra para uploads/<user>/voices/ e cria a voz com o consentimento aceito. */
export async function createVoice(input: {
  userId: string;
  name: string;
  sample: Blob;
  seconds: number;
  consentVersion: string;
  /** Idioma falado na amostra (um dos idiomas da fala); opcional. */
  voiceLanguage?: string;
}): Promise<SavedVoice> {
  if (input.sample.size > VOICE_LIMITS.maxSampleBytes) throw new VoiceCloneError('A amostra passou de 12 MB.', 'sample_invalid');
  const mime = (input.sample.type || 'audio/webm').split(';')[0];
  const ext = mime.includes('mpeg') || mime.includes('mp3') ? 'mp3' : mime.includes('wav') ? 'wav' : mime.includes('mp4') || mime.includes('m4a') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm';
  const path = `${input.userId}/voices/${crypto.randomUUID()}.${ext}`;
  const { error } = await withTimeout(
    supabase.storage.from('uploads').upload(path, input.sample, { contentType: mime, upsert: false }),
    60_000,
  );
  if (error) throw new VoiceCloneError('Não foi possível enviar a amostra.', 'upload_failed');
  const r = await callVoice<{ voice: SavedVoice }>({
    action: 'voice_create', name: input.name, sample_path: path, sample_mime: mime, sample_seconds: input.seconds,
    consent: { accepted: true, owner_confirmed: true, version: input.consentVersion },
    ...(input.voiceLanguage ? { voice_language: input.voiceLanguage } : {}),
  }, { idem: crypto.randomUUID() });
  return r.voice;
}

export interface StartedJob {
  job_id: string; kind: 'speak' | 'sing'; eta_seconds?: number; voice?: { id: string; name: string };
  speech_language?: string; language_fallback?: boolean;
}

/** speechLanguage: código de um dos idiomas da fala; vazio/"auto" = o servidor detecta pelo texto. */
export const startSpeak = (text: string, voiceId?: string, speechLanguage?: string) =>
  callVoice<StartedJob>({
    action: 'voice_speak', text, ...(voiceId ? { voice_id: voiceId } : {}),
    ...(speechLanguage && speechLanguage !== 'auto' ? { speech_language: speechLanguage } : {}),
  }, { idem: crypto.randomUUID() });

export const startSing = (sourceUrl: string, voiceId?: string, title?: string) =>
  callVoice<StartedJob>({ action: 'voice_sing', source_url: sourceUrl, ...(voiceId ? { voice_id: voiceId } : {}), ...(title ? { title } : {}) }, { idem: crypto.randomUUID() });

export const voiceJobStatus = (jobId: string) => callVoice<VoiceJob>({ action: 'voice_status', job_id: jobId }, { timeoutMs: 90_000 });

/**
 * Acompanha um trabalho até terminar, com prazo total. Estourou o prazo → VoiceCloneError("timeout"):
 * o trabalho continua no servidor (aparece no histórico do Clonador) e o crédito volta se falhar.
 */
export async function waitVoiceJob(
  jobId: string,
  opts: { deadlineMs: number; intervalMs?: number; signal?: AbortSignal; onTick?: (elapsedS: number) => void },
): Promise<VoiceJob> {
  const started = Date.now();
  const interval = opts.intervalMs ?? 5_000;
  for (;;) {
    if (opts.signal?.aborted) throw new VoiceCloneError('Interrompido.', 'aborted');
    let st: VoiceJob | null = null;
    try {
      st = await voiceJobStatus(jobId);
    } catch (e) {
      // Uma consulta que falha não derruba o trabalho: tenta de novo até o prazo.
      if (e instanceof VoiceCloneError && e.code !== 'timeout' && e.code !== 'unavailable') throw e;
    }
    if (st && st.status !== 'processing') return st;
    const elapsed = Date.now() - started;
    opts.onTick?.(Math.round(elapsed / 1000));
    if (elapsed + interval > opts.deadlineMs) throw new VoiceCloneError('Ainda processando.', 'timeout');
    await new Promise((r) => setTimeout(r, interval));
  }
}

/** Duração de um áudio gravado/enviado (segundos), lida no próprio navegador. */
export function audioDuration(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const a = new Audio();
    let done = false;
    const finish = (v: number) => {
      if (done) return;
      done = true;
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(v) ? v : 0);
    };
    a.preload = 'metadata';
    a.onloadedmetadata = () => {
      // webm do MediaRecorder às vezes vem com duração Infinity: força o cálculo.
      if (a.duration === Infinity) {
        a.currentTime = 1e7;
        a.ontimeupdate = () => { a.ontimeupdate = null; finish(a.duration); };
      } else finish(a.duration);
    };
    a.onerror = () => finish(0);
    setTimeout(() => finish(0), 8_000);
    a.src = url;
  });
}
