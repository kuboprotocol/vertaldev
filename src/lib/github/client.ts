// Cliente das operações GitHub do agente (edge function github-repos, POST {op}).
// Usa a conexão OAuth do usuário (github_connections). Escrita só com confirmed: true,
// que quem chama envia depois do clique do usuário no cartão de confirmação.
import { supabase } from '@/integrations/supabase/client';
import {
  GITHUB_ERROR_MESSAGES, describeGithubOp, isGithubWrite, type GithubOp,
} from '../../../supabase/functions/_shared/githubOps';

export interface GithubOpResult {
  ok: boolean;
  code?: string;
  message: string;
  url?: string;
  data: Record<string, unknown>;
}

/** Mensagem de erro a partir do corpo da edge function (formato novo {code} ou antigo {error}). */
export function githubCodeFromBody(body: unknown): string {
  const b = (body ?? {}) as { code?: unknown; error?: unknown };
  if (typeof b.code === 'string') return b.code;
  if (b.error === 'GitHub not connected') return 'not_connected';
  if (b.error === 'rate_limited') return 'rate_limited';
  if (b.error === 'Unauthorized' || b.error === 'Missing authorization') return 'unauthorized';
  return 'github_error';
}

/** Resumo em texto para o agente (DADOS) e para o usuário. */
export function summarizeGithubResult(op: GithubOp, data: Record<string, unknown>): string {
  switch (op.op) {
    case 'list_repos': {
      const repos = Array.isArray(data.repos) ? (data.repos as Array<Record<string, unknown>>) : [];
      return repos.length
        ? `${repos.length} repositório(s):\n${repos.map((r) => `- ${String(r.full_name)}${r.private ? ' (privado)' : ''} · branch padrão ${String(r.default_branch ?? '?')}`).join('\n')}`
        : 'Nenhum repositório encontrado.';
    }
    case 'create_repo': return `Repositório ${String(data.full_name ?? op.name)} criado (${data.private ? 'privado' : 'público'}): ${String(data.html_url ?? '')}`;
    case 'create_issue': return `Issue #${String(data.number ?? '?')} aberta em ${op.repo}: ${String(data.html_url ?? '')}`;
    case 'create_branch': return `Branch ${op.branch} criada em ${op.repo} a partir de ${String(data.from ?? op.from ?? '?')}: ${String(data.html_url ?? '')}`;
    case 'create_pr': return `PR #${String(data.number ?? '?')}${data.draft ? ' (rascunho)' : ''} aberto em ${op.repo} (${op.head} → ${String(data.base ?? op.base ?? '?')}): ${String(data.html_url ?? '')}`;
  }
}

export async function callGithubOp(op: GithubOp, opts: { confirmed?: boolean } = {}): Promise<GithubOpResult> {
  if (isGithubWrite(op) && opts.confirmed !== true) {
    return { ok: false, code: 'bad_request', message: 'Esta ação no GitHub precisa da sua confirmação.', data: {} };
  }
  const { data, error } = await supabase.functions.invoke('github-repos', {
    body: { ...op, ...(isGithubWrite(op) ? { confirmed: true } : {}) },
  });
  if (error) {
    let body: unknown = null;
    const ctx = (error as { context?: unknown }).context;
    if (ctx && typeof (ctx as Response).json === 'function') body = await (ctx as Response).clone().json().catch(() => null);
    const code = githubCodeFromBody(body);
    const detail = typeof (body as { detail?: unknown } | null)?.detail === 'string' ? ` (${(body as { detail: string }).detail})` : '';
    return { ok: false, code, message: `${GITHUB_ERROR_MESSAGES[code] ?? 'Falha no GitHub.'}${detail}`, data: {} };
  }
  const d = (data ?? {}) as Record<string, unknown>;
  if (d.ok !== true) {
    const code = githubCodeFromBody(d);
    return { ok: false, code, message: GITHUB_ERROR_MESSAGES[code] ?? 'Falha no GitHub.', data: d };
  }
  return { ok: true, message: summarizeGithubResult(op, d), url: typeof d.html_url === 'string' ? d.html_url : undefined, data: d };
}

export { describeGithubOp, isGithubWrite };
