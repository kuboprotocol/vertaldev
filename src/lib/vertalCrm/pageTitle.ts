// Vertal CRM · título da aba (<title>). Só age para quem tem o Vertal CRM liberado (flag + allowlist);
// para os demais não faz nada (a página fica idêntica). Restaura o título anterior ao sair.
import { useEffect } from 'react';
import { CONNECTORS_TITLE, resolveUiLang, storedUiLang } from '@/lib/vertalUiLang';

export function vertalConnectorsTitle(lang?: string | null): string {
  return CONNECTORS_TITLE[resolveUiLang(lang, storedUiLang(), typeof navigator !== 'undefined' ? navigator.language : null)];
}

export function useVertalPageTitle(title: string | null): void {
  useEffect(() => {
    if (!title || typeof document === 'undefined') return;
    const prev = document.title;
    document.title = title;
    return () => {
      document.title = prev;
    };
  }, [title]);
}
