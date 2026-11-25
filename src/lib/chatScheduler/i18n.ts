// Vertal Chat · Agendador — textos da tela (dicionário único em supabase/functions/_shared/chatSchedulerI18n.ts).
// O app não tem um sistema de i18n global; este dicionário vale só para o Agendador.
// Idioma: Ajustes → Idioma (se não for "automático") → idioma do perfil → idioma do navegador → pt-BR.
// pt-BR, en e es vêm no bundle; os outros idiomas são baixados sob demanda (só para quem tem o
// Agendador liberado), então o app de ninguém fica mais pesado.
import { useEffect, useState } from 'react';
import {
  SCHED_LANGS, approvalLabels, intlLocale, normLang, registerSchedulerLangs, schedLang, schedLangRegistered, schedUiText,
  type ApprovalLabels, type SchedUiText,
} from '../../../supabase/functions/_shared/chatSchedulerI18n';

/** Código de idioma do Agendador ("pt-BR", "en", "fr", "zh-Hant", "ar"…). */
export type UiLang = string;
export type { ApprovalLabels };

export function browserLocale(): string | null {
  try {
    return typeof navigator !== 'undefined' ? navigator.language || null : null;
  } catch {
    return null;
  }
}

/**
 * Idioma da tela do Agendador. `setting` = valor salvo em Ajustes ("auto" ou um idioma);
 * `profile` = idioma do perfil (user_metadata.locale). Ordem: Ajustes → perfil → navegador → pt-BR.
 */
export function schedulerUiLang(setting?: string | null, browser: string | null = browserLocale(), profile: string | null = null): UiLang {
  return schedLang(normLang(setting) ?? normLang(profile) ?? normLang(browser) ?? 'pt-BR');
}

/** Locale do Intl para datas no idioma. */
export function dateLocale(l: UiLang): string {
  return intlLocale(l === 'pt' ? 'pt-BR' : l);
}

export function schedUi(l: UiLang): SchedUiText {
  return schedUiText(l === 'pt' ? 'pt-BR' : l);
}

/** Rótulos do cartão "Permitir esta ação?" no idioma (só usados com a flag do Agendador ligada). */
export function schedApprovalLabels(l: UiLang): ApprovalLabels {
  return approvalLabels(l === 'pt' ? 'pt-BR' : l);
}

/** Opções do seletor "Idioma" em Ajustes (cada idioma no próprio nome). */
export const LANG_CHOICES: Array<{ value: string; label: (l: UiLang) => string }> = [
  { value: 'auto', label: (l) => schedUi(l).langAuto },
  ...SCHED_LANGS.map((m) => ({ value: m.code, label: () => m.native })),
];

/** pt-BR, pt, en e es vêm no bundle; os demais dependem do download sob demanda. */
export function schedLangBundled(l: UiLang): boolean {
  return l === 'pt-BR' || l === 'pt' || l === 'en' || l === 'es';
}

let loading: Promise<void> | null = null;

/** Baixa e registra os idiomas além de pt/en/es (uma vez). */
export function ensureSchedulerLangs(): Promise<void> {
  if (schedLangRegistered('fr')) return Promise.resolve();
  loading ??= import('../../../supabase/functions/_shared/chatSchedulerLangs/index')
    .then((m) => registerSchedulerLangs(m.SCHEDULER_LANG_DATA))
    .catch(() => { loading = null; });
  return loading;
}

/** Re-renderiza quando os idiomas extras chegam. `enabled` = Agendador liberado. */
export function useSchedulerLangs(enabled: boolean): number {
  const [version, setVersion] = useState(() => (schedLangRegistered('fr') ? 1 : 0));
  useEffect(() => {
    if (!enabled || version) return;
    let alive = true;
    void ensureSchedulerLangs().then(() => alive && setVersion(1));
    return () => { alive = false; };
  }, [enabled, version]);
  return version;
}
