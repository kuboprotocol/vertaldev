// Vertal CRM · estado compartilhado da tela (workspace, funis, etiquetas, campos, membros, idioma).
// Base de UI adaptada do Atomic CRM (MIT, Marmelab) — ver LICENSE.atomic-crm.md nesta pasta.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { callCrm, crmDb } from '@/lib/vertalCrm/client';
import { crmUi, crmLocale, uiDir, uiLangFrom, browserLang } from '@/lib/vertalCrm/i18n';
import { useDocumentLang } from '@/lib/useDocumentLang';
import { rememberUiLang, storedUiLang } from '@/lib/vertalUiLang';
import { localizePipeline, type CrmPipeline } from '../../../supabase/functions/_shared/vertalCrm/core';
import { CrmCtx, type CrmCosts, type CrmCtxValue, type CrmField, type CrmMember, type CrmTag, type CrmWorkspace } from './crmState';

export function CrmProvider({ children, langHint }: { children: ReactNode; langHint?: string | null }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState('');
  const [workspaces, setWorkspaces] = useState<CrmWorkspace[]>([]);
  const [wsId, setWsId] = useState<string>(() => (typeof localStorage !== 'undefined' ? localStorage.getItem('vertal-crm-ws') ?? '' : ''));
  const [pipelines, setPipelines] = useState<CrmPipeline[]>([]);
  const [tags, setTags] = useState<CrmTag[]>([]);
  const [fields, setFields] = useState<CrmField[]>([]);
  const [members, setMembers] = useState<CrmMember[]>([]);
  const [costs, setCosts] = useState<CrmCosts>({ ai: 1, syncActivate: 4, syncAiRun: 2, syncPlainRun: 0 });

  const workspace = workspaces.find((w) => w.id === wsId) ?? workspaces[0] ?? null;
  // Idioma nativo: ?lang → ajuste do workspace → idioma do workspace (o mesmo das etapas do funil) → idioma salvo → navegador.
  // Antes o idioma do workspace era ignorado e um navegador em inglês deixava a tela em inglês com etapas em português.
  const lang = uiLangFrom(langHint, (workspace?.settings?.uiLang as string) ?? null, workspace?.lang ?? null, storedUiLang(), browserLang());
  const t = crmUi(lang);
  useDocumentLang(crmLocale(lang), uiDir(lang));
  useEffect(() => {
    if (workspace) rememberUiLang(lang);
  }, [workspace, lang]);
  useEffect(() => {
    // <title> da aba (antes ficava o título da home do Vertal Dev).
    const prev = document.title;
    document.title = t.docTitle;
    return () => {
      document.title = prev;
    };
  }, [t.docTitle]);

  const loadMeta = useCallback(async (ws: string) => {
    const db = crmDb();
    const [p, tg, f, m] = await Promise.all([
      db.from('crm_pipelines').select('*').eq('workspace_id', ws).order('position'),
      db.from('crm_tags').select('*').eq('workspace_id', ws).order('name'),
      db.from('crm_custom_fields').select('*').eq('workspace_id', ws).order('position'),
      db.from('crm_members').select('user_id, role, email, display_name').eq('workspace_id', ws),
    ]);
    setPipelines((p.data ?? []) as CrmPipeline[]);
    setTags((tg.data ?? []) as CrmTag[]);
    setFields(((f.data ?? []) as CrmField[]).map((x) => ({ ...x, options: Array.isArray(x.options) ? x.options : [] })));
    setMembers((m.data ?? []) as CrmMember[]);
  }, []);

  const reload = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getUser();
      setUserId(data.user?.id ?? '');
      const r = await callCrm<{ workspaces: CrmWorkspace[]; workspace: CrmWorkspace }>('bootstrap', { lang: uiLangFrom(langHint, storedUiLang(), browserLang()) });
      const st = await callCrm<{ costs: CrmCosts }>('status');
      setCosts(st.costs);
      setWorkspaces(r.workspaces);
      const current = r.workspaces.find((w) => w.id === wsId) ?? r.workspaces[0];
      if (current) await loadMeta(current.id);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'error');
    } finally {
      setReady(true);
    }
  }, [loadMeta, wsId, langHint]);

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setWorkspaceId = useCallback((id: string) => {
    setWsId(id);
    try {
      localStorage.setItem('vertal-crm-ws', id);
    } catch { /* modo privado */ }
    void loadMeta(id);
  }, [loadMeta]);

  const money = useCallback((n: number | string | null | undefined) => {
    const v = Number(n ?? 0);
    try {
      return new Intl.NumberFormat(crmLocale(lang), { style: 'currency', currency: workspace?.currency ?? 'BRL', maximumFractionDigits: 0 }).format(Number.isFinite(v) ? v : 0);
    } catch {
      return String(v);
    }
  }, [lang, workspace?.currency]);

  // Etapas e nome padrão do funil no idioma da tela (o funil gravado em pt aparece traduzido; nomes próprios ficam).
  const shownPipelines = useMemo(() => pipelines.map((p) => localizePipeline(p, lang)), [pipelines, lang]);

  const role = workspace?.role ?? 'viewer';
  const value = useMemo<CrmCtxValue>(() => ({
    ready, error, userId, workspace, workspaces, setWorkspaceId, pipelines: shownPipelines, tags, fields, members, costs, lang, t,
    canWrite: role === 'owner' || role === 'admin' || role === 'member', isAdmin: role === 'owner' || role === 'admin',
    reload: async () => {
      if (!workspace) return;
      const r = await callCrm<{ workspaces: CrmWorkspace[] }>('list_workspaces').catch(() => null);
      if (r?.workspaces?.length) setWorkspaces(r.workspaces);
      await loadMeta(workspace.id);
    },
    money,
  }), [ready, error, userId, workspace, workspaces, setWorkspaceId, shownPipelines, tags, fields, members, costs, lang, t, role, loadMeta, money]);

  return <CrmCtx.Provider value={value}>{children}</CrmCtx.Provider>;
}

