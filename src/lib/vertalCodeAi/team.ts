// VERTAL Code AI · Equipe Vertal no navegador: estado do progresso por núcleo/papel (puro, testável)
// e chamadas de status, memória e Vertal Decide. Só aparece para quem o servidor liberou (team_status).
import { postAction, type VcaStreamEvent } from './client';

export type TeamCore = 'pensa' | 'constroi' | 'entrega';
export type TeamRole = 'gerente' | 'encarregado' | 'engenheiro' | 'revisor' | 'entregador';
export type TeamRoleState = 'waiting' | 'working' | 'done' | 'failed' | 'skipped' | 'rejected';

export const TEAM_CORES: Array<{ id: TeamCore; label: string; roles: TeamRole[] }> = [
  { id: 'pensa', label: 'Pensa', roles: ['gerente', 'encarregado'] },
  { id: 'constroi', label: 'Constrói', roles: ['engenheiro'] },
  { id: 'entrega', label: 'Entrega', roles: ['revisor', 'entregador'] },
];

export const TEAM_ROLE_LABEL: Record<TeamRole, string> = {
  gerente: 'Gerente',
  encarregado: 'Encarregado',
  engenheiro: 'Engenheiro',
  revisor: 'Revisor/QA',
  entregador: 'Entregador',
};

export const TEAM_STATE_LABEL: Record<TeamRoleState, string> = {
  waiting: 'aguardando',
  working: 'trabalhando',
  done: 'pronto',
  failed: 'falhou',
  skipped: 'pulado',
  rejected: 'reprovou',
};

export interface TeamRoleRow {
  key: string;
  role: TeamRole;
  label: string;
  core: TeamCore;
  state: TeamRoleState;
  detail?: string;
}

export interface TeamDecisionRow {
  label: string;
  value: string;
  confidence: number;
  tier: 'act' | 'escalate' | 'ask';
}

export interface TeamPackage {
  files: Array<{ path: string; added: number; removed: number }>;
  verified: boolean;
  checks: { static: string; sandbox: string; review: string };
  readyToShip: boolean | null;
  humanReview: boolean;
  questions: string[];
}

export interface TeamState {
  cores: Record<TeamCore, 'waiting' | 'working' | 'done'>;
  roles: TeamRoleRow[];
  decisions: TeamDecisionRow[];
  memory?: { available: boolean; used: number; saved?: number };
  budget?: { calls: number; maxCalls: number; decisions: number; stopped: boolean };
  pkg?: TeamPackage;
}

export function emptyTeamState(): TeamState {
  return {
    cores: { pensa: 'waiting', constroi: 'waiting', entrega: 'waiting' },
    roles: (['gerente', 'encarregado', 'engenheiro', 'revisor', 'entregador'] as TeamRole[]).map((r) => ({
      key: r,
      role: r,
      label: TEAM_ROLE_LABEL[r],
      core: TEAM_CORES.find((c) => c.roles.includes(r))!.id,
      state: 'waiting' as const,
    })),
    decisions: [],
  };
}

const s = (v: unknown) => (typeof v === 'string' ? v : '');
const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const isRole = (v: unknown): v is TeamRole => typeof v === 'string' && v in TEAM_ROLE_LABEL;
const isCore = (v: unknown): v is TeamCore => v === 'pensa' || v === 'constroi' || v === 'entrega';
const ROLE_STATES: TeamRoleState[] = ['waiting', 'working', 'done', 'failed', 'skipped', 'rejected'];

/** Aplica um evento da Equipe. Eventos que não são da Equipe voltam o mesmo objeto. */
export function reduceTeamEvent(state: TeamState | undefined, e: VcaStreamEvent): TeamState | undefined {
  switch (e.kind) {
    case 'core': {
      if (!isCore(e.core)) return state;
      const st = state ?? emptyTeamState();
      return { ...st, cores: { ...st.cores, [e.core]: e.state === 'done' ? 'done' : 'working' } };
    }
    case 'role': {
      if (!isRole(e.role)) return state;
      const st = state ?? emptyTeamState();
      const agent = typeof e.agent === 'number' ? e.agent : undefined;
      const key = agent ? `${e.role}-${agent}` : e.role;
      const row: TeamRoleRow = {
        key,
        role: e.role,
        label: s(e.label) || TEAM_ROLE_LABEL[e.role],
        core: isCore(e.core) ? e.core : 'constroi',
        state: ROLE_STATES.includes(e.state as TeamRoleState) ? (e.state as TeamRoleState) : 'working',
        detail: s(e.detail) || undefined,
      };
      // Engenheiro numerado substitui a linha genérica "Engenheiro" (que só fica enquanto ninguém começou).
      let roles = st.roles.filter((r) => !(agent && r.key === e.role));
      const i = roles.findIndex((r) => r.key === key);
      if (i >= 0) roles = roles.map((r, j) => (j === i ? { ...row, detail: row.detail ?? r.detail } : r));
      else {
        const lastSameRole = roles.map((r) => r.role).lastIndexOf(e.role);
        const order = TEAM_CORES.flatMap((c) => c.roles);
        const insertAt = lastSameRole >= 0 ? lastSameRole + 1 : roles.findIndex((r) => order.indexOf(r.role) > order.indexOf(e.role as TeamRole));
        roles = insertAt < 0 ? [...roles, row] : [...roles.slice(0, insertAt), row, ...roles.slice(insertAt)];
      }
      return { ...st, roles };
    }
    case 'decision': {
      const st = state ?? emptyTeamState();
      const tier: TeamDecisionRow['tier'] = e.tier === 'act' || e.tier === 'escalate' || e.tier === 'ask' ? e.tier : 'ask';
      return { ...st, decisions: [...st.decisions, { label: s(e.label), value: s(e.value), confidence: n(e.confidence), tier }].slice(-12) };
    }
    case 'memory': {
      const st = state ?? emptyTeamState();
      const prev = st.memory;
      return {
        ...st,
        memory: {
          available: e.available !== false,
          used: Math.max(prev?.used ?? 0, n(e.used)),
          saved: typeof e.saved === 'number' ? e.saved : prev?.saved,
        },
      };
    }
    case 'budget': {
      const st = state ?? emptyTeamState();
      return { ...st, budget: { calls: n(e.calls), maxCalls: n(e.maxCalls), decisions: n(e.decisions), stopped: !!e.stopped } };
    }
    case 'package': {
      const st = state ?? emptyTeamState();
      const files = Array.isArray(e.files) ? (e.files as Array<Record<string, unknown>>).map((f) => ({ path: s(f.path), added: n(f.added), removed: n(f.removed) })) : [];
      const c = (e.checks ?? {}) as Record<string, unknown>;
      return {
        ...st,
        pkg: {
          files,
          verified: !!e.verified,
          checks: { static: s(c.static), sandbox: s(c.sandbox), review: s(c.review) },
          readyToShip: typeof e.readyToShip === 'boolean' ? e.readyToShip : null,
          humanReview: !!e.humanReview,
          questions: Array.isArray(e.questions) ? (e.questions as unknown[]).filter((q): q is string => typeof q === 'string').slice(0, 6) : [],
        },
      };
    }
    default:
      return state;
  }
}

export const TIER_LABEL: Record<TeamDecisionRow['tier'], string> = {
  act: 'confiante',
  escalate: 'subiu para modelo maior',
  ask: 'precisa de você',
};

// ─── Chamadas ───

export interface TeamStatus {
  team: boolean;
  memory: boolean;
  sandbox: boolean;
  decide: boolean;
}

/** Equipe liberada para este usuário? Qualquer falha (404 incluso) = não. */
export async function fetchTeamStatus(token: string, fetchImpl: typeof fetch = fetch): Promise<TeamStatus | null> {
  if (!token) return null;
  try {
    const r = await postAction<TeamStatus>(token, { action: 'team_status' }, fetchImpl);
    return r?.team === true ? r : null;
  } catch {
    return null;
  }
}

export interface MemoryItem {
  id: string;
  scope: 'user' | 'project';
  kind: string;
  content: string;
  importance: number;
  project_id: string | null;
  updated_at?: string;
}

export const MEMORY_KIND_LABEL: Record<string, string> = {
  decision: 'Decisão',
  preference: 'Preferência',
  code_fact: 'Fato do código',
  run_summary: 'Execução',
  project_summary: 'Resumo do projeto',
  note: 'Nota',
};

export async function listTeamMemory(token: string, projectId: string | null, fetchImpl: typeof fetch = fetch): Promise<{ available: boolean; items: MemoryItem[] }> {
  return postAction(token, { action: 'memory_list', projectId: projectId ?? undefined }, fetchImpl);
}

export async function deleteTeamMemory(
  token: string,
  req: { ids?: string[]; clear?: boolean; clearAll?: boolean; projectId?: string | null },
  fetchImpl: typeof fetch = fetch,
): Promise<{ available: boolean; deleted: number }> {
  return postAction(token, { action: 'memory_delete', ids: req.ids, clear: req.clear, clearAll: req.clearAll, projectId: req.projectId ?? undefined }, fetchImpl);
}
