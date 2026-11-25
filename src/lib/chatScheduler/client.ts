// Vertal Chat · Agendador — cliente (navegador).
// Desligado por padrão: só aparece com VITE_VERTAL_CHAT_SCHEDULER=true E o servidor liberando
// este usuário (edge function vertal-chat-scheduler: VERTAL_CHAT_SCHEDULER_ENABLED + _USER_IDS).
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { functionErrorCode } from '@/lib/functionError';
import { browserLocale, schedUi, schedulerUiLang } from './i18n';

export const SCHEDULER_FUNCTION = 'vertal-chat-scheduler';
export const SCHEDULER_NAME = 'Tarefas agendadas';
/** Evento de janela: abre o painel (o chat dispara depois de criar/listar). */
export const SCHEDULER_OPEN_EVENT = 'vertal-scheduler:open';
/** Evento de janela: a lista mudou (o painel recarrega). */
export const SCHEDULER_CHANGED_EVENT = 'vertal-scheduler:changed';

type EnvLike = Record<string, unknown> | undefined;

export function isSchedulerBuildEnabled(env: EnvLike = import.meta.env as unknown as EnvLike): boolean {
  const v = env?.VITE_VERTAL_CHAT_SCHEDULER;
  return v === true || v === 'true' || v === '1';
}

export interface SchedulerTaskView {
  id: string;
  kind: 'task' | 'reminder' | 'appointment' | 'email_trigger';
  title: string;
  prompt: string;
  status: 'active' | 'paused' | 'done' | 'failed';
  when_text: string;
  next_run_at: string | null;
  next_run_text: string | null;
  last_run_at: string | null;
  last_status: string | null;
  last_error: string | null;
  run_count: number;
  send_to: string[];
  appointment_id: string | null;
  trigger?: { from?: string; subject?: string } | null;
  branches?: { positive?: string; negative?: string; neutral?: string } | null;
}

export interface SchedulerRun {
  id: string;
  status: 'running' | 'ok' | 'error' | 'skipped';
  trigger: string;
  started_at: string;
  finished_at: string | null;
  output: string | null;
  error: string | null;
  sentiment: string | null;
  est_cost_usd: number | null;
}

/** lang: "auto" (padrão: idioma do pedido / navegador) ou o idioma fixo escolhido em Ajustes. */
export interface SchedulerSettings { timezone: string; quiet: { start: string; end: string } | null; notify_email: boolean; lang?: string }

export type SchedulerResult<T> = { ok: true; data: T; message?: string; code?: string } | { ok: false; data?: undefined; message: string; code?: string };

/** Idioma escolhido em Ajustes (o painel atualiza ao carregar/salvar), para as mensagens de erro locais. */
let savedLangSetting: string | null = null;
export function setSchedulerLangSetting(lang: string | null | undefined): void {
  savedLangSetting = lang ?? null;
}
export function getSchedulerLangSetting(): string | null {
  return savedLangSetting;
}

export async function callScheduler<T = Record<string, unknown>>(action: string, payload: Record<string, unknown> = {}): Promise<SchedulerResult<T>> {
  // O servidor usa o idioma do navegador quando não há outro (Ajustes / idioma do pedido).
  const locale = browserLocale();
  const { data, error } = await supabase.functions.invoke(SCHEDULER_FUNCTION, { body: { action, ...(locale ? { locale } : {}), ...payload } });
  const E = schedUi(schedulerUiLang(savedLangSetting)).errors;
  if (error) {
    const code = (await functionErrorCode(error)) ?? 'error';
    if (code.startsWith('rate_limit_exceeded')) return { ok: false, code, message: E.rate };
    return { ok: false, code, message: E[code] ?? E.generic };
  }
  const d = (data ?? {}) as Record<string, unknown>;
  if (d.ok === false) return { ok: false, message: String(d.error ?? E.notOk) };
  return { ok: true, data: d as T };
}

export function openSchedulerPanel(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(SCHEDULER_OPEN_EVENT));
}

export function notifySchedulerChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(SCHEDULER_CHANGED_EVENT));
}

export type SchedulerAccess = 'checking' | 'allowed' | 'denied';

let accessCache: { userId: string; p: Promise<boolean> } | null = null;

async function checkAccess(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user?.id;
  if (!uid) return false;
  if (accessCache?.userId === uid) return accessCache.p;
  const p = callScheduler<{ allowed?: boolean }>('status').then((r) => r.ok && r.data.allowed === true).catch(() => false);
  accessCache = { userId: uid, p };
  p.then((ok) => { if (!ok) accessCache = null; });
  return p;
}

/** 'allowed' só quando o build liga E o servidor libera este usuário. */
export function useSchedulerAccess(enabledOverride?: boolean): SchedulerAccess {
  const buildOn = isSchedulerBuildEnabled();
  const [state, setState] = useState<SchedulerAccess>(() =>
    enabledOverride === true ? 'allowed' : enabledOverride === false || !buildOn ? 'denied' : 'checking',
  );
  useEffect(() => {
    if (enabledOverride !== undefined || !buildOn) return;
    let alive = true;
    checkAccess().then((ok) => alive && setState(ok ? 'allowed' : 'denied'));
    return () => { alive = false; };
  }, [buildOn, enabledOverride]);
  return state;
}

export const KIND_LABEL_UI: Record<SchedulerTaskView['kind'], string> = {
  task: 'Tarefa', reminder: 'Lembrete', appointment: 'Consulta', email_trigger: 'Gatilho de e-mail',
};

export const STATUS_LABEL_UI: Record<SchedulerTaskView['status'], string> = {
  active: 'Ativa', paused: 'Pausada', done: 'Concluída', failed: 'Falhou',
};
