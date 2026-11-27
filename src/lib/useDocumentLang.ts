// Idioma e direção do documento enquanto uma tela está aberta (diálogos e avisos usam portal, fora da tela):
// árabe → dir="rtl". Ao sair, volta ao que estava.
import { useEffect } from 'react';

export function useDocumentLang(lang: string | null | undefined, dir: 'rtl' | 'ltr'): void {
  useEffect(() => {
    if (typeof document === 'undefined' || !lang) return;
    const el = document.documentElement;
    const prev = { lang: el.getAttribute('lang'), dir: el.getAttribute('dir') };
    el.setAttribute('lang', lang);
    el.setAttribute('dir', dir);
    return () => {
      if (prev.lang === null) el.removeAttribute('lang'); else el.setAttribute('lang', prev.lang);
      if (prev.dir === null) el.removeAttribute('dir'); else el.setAttribute('dir', prev.dir);
    };
  }, [lang, dir]);
}
