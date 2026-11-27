// Idioma da interface do Vertal CRM / Growth Team / Prospector (21 idiomas), sem dicionários:
// módulo leve para quem só precisa decidir o idioma (login, botões no chat, título da aba).
import { resolveUiLang, type UiLang } from '../../supabase/functions/_shared/vertalUiLang';

export type { UiLang };
export { baseUiLang, resolveUiLang, uiDir, uiLocale, UI_LANGS, UI_LANG_NAMES } from '../../supabase/functions/_shared/vertalUiLang';

/**
 * Idioma nativo do usuário guardado pelo Vertal CRM/Growth (idioma do workspace do CRM ou o que o servidor
 * devolveu), para que as telas não caiam no idioma do navegador (ex.: navegador em inglês de um usuário brasileiro).
 */
export const VERTAL_UI_LANG_KEY = 'vertal-ui-lang';
export function storedUiLang(): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(VERTAL_UI_LANG_KEY) : null;
  } catch {
    return null;
  }
}
export function rememberUiLang(lang: string | null | undefined): void {
  if (!lang) return;
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(VERTAL_UI_LANG_KEY, lang);
  } catch { /* modo privado */ }
}
/** Ordem: pedido explícito (?lang / comando do chat) → idioma salvo do usuário → navegador → pt-BR. */
export function preferredUiLang(explicit?: string | null): UiLang {
  return resolveUiLang(explicit, storedUiLang(), typeof navigator !== 'undefined' ? navigator.language : null);
}

/** Título da aba Conectores nos 21 idiomas (o mesmo de CRM_UI[*].connectorsTitle). */
export const CONNECTORS_TITLE: Record<UiLang, string> = {
  pt: 'Conectores | Vertal Dev', 'pt-PT': 'Conectores | Vertal Dev', en: 'Connectors | Vertal Dev', es: 'Conectores | Vertal Dev',
  fr: 'Connecteurs | Vertal Dev', de: 'Konnektoren | Vertal Dev', it: 'Connettori | Vertal Dev', nl: 'Connectoren | Vertal Dev',
  pl: 'Konektory | Vertal Dev', tr: 'Bağlayıcılar | Vertal Dev', ru: 'Коннекторы | Vertal Dev', uk: 'Конектори | Vertal Dev',
  ar: 'الموصلات | Vertal Dev', hi: 'कनेक्टर्स | Vertal Dev', id: 'Konektor | Vertal Dev', vi: 'Trình kết nối | Vertal Dev',
  th: 'ตัวเชื่อมต่อ | Vertal Dev', ja: 'コネクタ | Vertal Dev', ko: '커넥터 | Vertal Dev', 'zh-CN': '连接器 | Vertal Dev', 'zh-TW': '連接器 | Vertal Dev',
};
