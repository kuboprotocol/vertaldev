// Vertal CRM · tipos, contexto e utilidades da tela (separados do Provider por causa do fast refresh).
import { createContext, useContext } from 'react';
import type { CrmUi } from '@/lib/vertalCrm/i18n';
import type { CrmLang, CrmPipeline } from '../../../supabase/functions/_shared/vertalCrm/core';

export interface CrmWorkspace { id: string; name: string; currency: string; lang: string; owner_id: string; role: string; settings: Record<string, unknown> }
export interface CrmTag { id: string; name: string; color: string }
export interface CrmField { id: string; entity: 'contact' | 'company' | 'deal'; key: string; label: string; type: string; options: string[]; position: number }
export interface CrmMember { user_id: string; role: string; email: string | null; display_name: string | null }
export interface CrmCosts { ai: number; syncActivate: number; syncAiRun: number; syncPlainRun: number }

export interface CrmCtxValue {
  ready: boolean;
  error: string | null;
  userId: string;
  workspace: CrmWorkspace | null;
  workspaces: CrmWorkspace[];
  setWorkspaceId: (id: string) => void;
  pipelines: CrmPipeline[];
  tags: CrmTag[];
  fields: CrmField[];
  members: CrmMember[];
  costs: CrmCosts;
  lang: CrmLang;
  t: CrmUi;
  canWrite: boolean;
  isAdmin: boolean;
  reload: () => Promise<void>;
  money: (n: number | string | null | undefined) => string;
}

export const CrmCtx = createContext<CrmCtxValue | null>(null);

export function useCrm(): CrmCtxValue {
  const v = useContext(CrmCtx);
  if (!v) throw new Error('useCrm fora do CrmProvider');
  return v;
}

export const fullName = (c: { first_name?: string | null; last_name?: string | null; email_primary?: string | null }) =>
  `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() || c.email_primary || '—';

export const STATUS_COLORS: Record<string, string> = { cold: '#7dbde8', warm: '#e8cb7d', hot: '#e88b7d', 'in-contract': '#a4e87d' };
