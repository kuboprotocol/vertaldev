// Vertal CRM · tela "liberação em breve" para quem chega em /crm (pela landing "CRM grátis")
// sem estar na allowlist do servidor (VERTAL_CRM_USER_IDS). Nunca mostra erro e nunca abre o CRM:
// só registra o pedido em public.crm_waitlist (RLS: cada pessoa grava/lê a própria linha).
// Desliga com VITE_VERTAL_CRM_WAITLIST=false (volta ao comportamento anterior: página 404).
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Clock3, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { crmDb } from '@/lib/vertalCrm/client';
import { crmLocale, uiDir, uiLangFrom, type CrmLang } from '@/lib/vertalCrm/i18n';
import { useDocumentLang } from '@/lib/useDocumentLang';
import { WAITLIST_TEXT } from '@/lib/vertalCrm/waitlist';

// Documentação do CRM grátis em cada idioma (src/config/freeCrm: pt-BR na raiz, os outros com prefixo).
const docsPath = (lang: CrmLang): string => (lang === 'pt' ? '/docs/vertal-crm' : `/${lang}/docs/vertal-crm`);

type State = 'checking' | 'idle' | 'saving' | 'joined' | 'error';

export function CrmWaitlist({ langHint }: { langHint?: string | null }) {
  const [sp] = useSearchParams();
  const lang = uiLangFrom(langHint, sp.get('lang'), typeof navigator !== 'undefined' ? navigator.language : null);
  const t = WAITLIST_TEXT[lang] ?? WAITLIST_TEXT.pt;
  useDocumentLang(crmLocale(lang), uiDir(lang));
  const [state, setState] = useState<State>('checking');

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user?.id;
      if (!uid) return 'idle' as State;
      const { data: row } = await crmDb().from('crm_waitlist').select('user_id').eq('user_id', uid).maybeSingle();
      return (row ? 'joined' : 'idle') as State;
    })()
      .then((s) => alive && setState(s))
      .catch(() => alive && setState('idle'));
    return () => {
      alive = false;
    };
  }, []);

  const join = async () => {
    setState('saving');
    try {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!user) throw new Error('not_signed_in');
      const source = (sp.get('src') ?? 'crm_page').replace(/[^\w-]/g, '').slice(0, 40) || 'crm_page';
      const { error } = await crmDb().from('crm_waitlist').insert({
        user_id: user.id,
        email: user.email ?? null,
        lang: (typeof navigator !== 'undefined' ? navigator.language : lang).slice(0, 20),
        source,
      });
      // 23505 = já estava na lista.
      if (error && error.code !== '23505') throw error;
      setState('joined');
    } catch {
      setState('error');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground" data-testid="crm-waitlist">
      <div className="w-full max-w-lg rounded-2xl border bg-card/70 p-8 text-center shadow-xl backdrop-blur-xl">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          {state === 'joined' ? <CheckCircle2 className="h-6 w-6 text-primary" /> : <Clock3 className="h-6 w-6 text-primary" />}
        </div>
        <h1 className="font-display text-2xl font-bold">{state === 'joined' ? t.joined : t.title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{state === 'joined' ? t.joinedBody : t.body}</p>
        <p className="mt-2 text-xs text-muted-foreground">{t.free}</p>
        {state !== 'joined' && (
          <Button className="mt-6 w-full" onClick={join} disabled={state === 'checking' || state === 'saving'} data-testid="crm-waitlist-join">
            {state === 'saving' || state === 'checking' ? <Loader2 className="h-4 w-4 animate-spin" /> : t.join}
          </Button>
        )}
        {state === 'error' && <p className="mt-3 text-sm text-destructive" role="alert">{t.error}</p>}
        <div className="mt-6 flex flex-col items-center gap-2 text-sm">
          <a href={docsPath(lang)} className="text-primary hover:underline">{t.docs}</a>
          <Link to="/connectors" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />{t.back}
          </Link>
        </div>
      </div>
    </div>
  );
}
