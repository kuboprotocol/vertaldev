// Botão "Tarefas agendadas": mesmo idioma do painel (Ajustes → perfil → navegador → pt-BR),
// já na primeira pintura (cache local) e atualizado na hora quando o Idioma muda no painel.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';

const invoke = vi.fn();
const getSession = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) }, auth: { getSession: () => getSession() } },
}));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

import { SchedulerEntryButton } from './SchedulerEntryButton';
import {
  SCHEDULER_LANG_CACHE_KEY, __reloadSchedulerLangCache, getSchedulerLangSetting, setSchedulerLangSetting,
  setSchedulerProfileLocale, syncSchedulerLang,
} from '@/lib/chatScheduler/client';
import { schedUi, schedulerUiLang } from '@/lib/chatScheduler/i18n';
import { registerSchedulerLangs } from '../../../../supabase/functions/_shared/chatSchedulerI18n';
import { SCHEDULER_LANG_DATA } from '../../../../supabase/functions/_shared/chatSchedulerLangs/index';

function session(uid: string, meta: Record<string, unknown> = {}) {
  return { data: { session: { user: { id: uid, user_metadata: meta } } } };
}
function answer(settingsLang: string | undefined) {
  invoke.mockImplementation(async (_fn: string, { body }: { body: { action: string } }) => {
    if (body.action === 'settings_get') return { data: { ok: true, settings: { timezone: 'America/Sao_Paulo', quiet: null, notify_email: false, ...(settingsLang ? { lang: settingsLang } : {}) } }, error: null };
    if (body.action === 'unseen') return { data: { ok: true, count: 0, runs: [] }, error: null };
    return { data: { ok: true }, error: null };
  });
}

beforeEach(() => {
  registerSchedulerLangs(SCHEDULER_LANG_DATA);
  localStorage.clear();
  __reloadSchedulerLangCache();
  invoke.mockReset();
  getSession.mockReset();
  getSession.mockResolvedValue(session('u1'));
  answer(undefined);
});
afterEach(() => { localStorage.clear(); __reloadSchedulerLangCache(); });

describe('ordem do idioma (igual no botão e no painel)', () => {
  it('Ajustes → perfil → navegador → pt-BR', () => {
    expect(schedulerUiLang('ar', 'fr-FR', 'de')).toBe('ar');
    expect(schedulerUiLang('auto', 'fr-FR', 'de')).toBe('de');
    expect(schedulerUiLang('auto', 'fr-FR', null)).toBe('fr');
    expect(schedulerUiLang(null, null, null)).toBe('pt-BR');
    // assinatura antiga (sem perfil) continua igual
    expect(schedulerUiLang('auto', 'es-MX')).toBe('es');
  });
});

describe('SchedulerEntryButton · idioma', () => {
  it('com Árabe em cache, a primeira pintura já sai em árabe e RTL', () => {
    localStorage.setItem(SCHEDULER_LANG_CACHE_KEY, JSON.stringify({ setting: 'ar', profile: null, uid: 'u1' }));
    __reloadSchedulerLangCache();
    render(<SchedulerEntryButton enabledOverride />);
    // sem waitFor: é o primeiro render
    const btn = screen.getByTestId('scheduler-entry');
    const ar = schedUi('ar');
    expect(ar.button).not.toBe(schedUi('pt-BR').button);
    expect(btn.textContent).toContain(ar.button);
    expect(btn.getAttribute('title')).toBe(ar.name);
    expect(btn.getAttribute('dir')).toBe('rtl');
    expect(btn.getAttribute('data-lang')).toBe('ar');
  });

  it('troca de Idioma no painel atualiza o botão sem recarregar (e grava o cache)', async () => {
    answer('ar');
    render(<SchedulerEntryButton enabledOverride />);
    await waitFor(() => expect(screen.getByTestId('scheduler-entry').getAttribute('data-lang')).toBe('ar'));
    act(() => setSchedulerLangSetting('ja'));
    const btn = screen.getByTestId('scheduler-entry');
    expect(btn.textContent).toContain(schedUi('ja').button);
    expect(btn.getAttribute('dir')).toBe('ltr');
    expect(JSON.parse(localStorage.getItem(SCHEDULER_LANG_CACHE_KEY)!).setting).toBe('ja');
  });

  it('carrega Ajustes → Idioma ao montar (sem abrir o painel)', async () => {
    answer('he');
    render(<SchedulerEntryButton enabledOverride />);
    await waitFor(() => expect(screen.getByTestId('scheduler-entry').getAttribute('data-lang')).toBe('he'));
    expect(screen.getByTestId('scheduler-entry').getAttribute('dir')).toBe('rtl');
    expect(invoke.mock.calls.some(([, o]) => (o as { body: { action: string } }).body.action === 'settings_get')).toBe(true);
  });

  it('"Automático" usa o idioma do perfil antes do navegador', async () => {
    getSession.mockResolvedValue(session('u2', { locale: 'it' }));
    answer('auto');
    await syncSchedulerLang(true);
    expect(getSchedulerLangSetting()).toBe('auto');
    render(<SchedulerEntryButton enabledOverride />);
    expect(screen.getByTestId('scheduler-entry').getAttribute('data-lang')).toBe('it');
  });

  it('outro usuário no mesmo navegador não herda o Idioma em cache', () => {
    localStorage.setItem(SCHEDULER_LANG_CACHE_KEY, JSON.stringify({ setting: 'ar', profile: null, uid: 'u1' }));
    __reloadSchedulerLangCache();
    setSchedulerProfileLocale(null, 'u9');
    expect(getSchedulerLangSetting()).toBeNull();
  });

  it('com a flag desligada não renderiza nada nem busca Ajustes', () => {
    const { container } = render(<SchedulerEntryButton enabledOverride={false} />);
    expect(container.innerHTML).toBe('');
    expect(invoke).not.toHaveBeenCalled();
  });
});
