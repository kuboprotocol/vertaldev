import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: null } })) } },
}));

import {
  buildTeam, callGrowth, fetchGrowthAccess, forwardEvents, isVertalGrowthEnabled, readGrowthHandoff, vertalGrowthHref, vertalGrowthHrefFromChat,
} from './client';
import { VertalGrowthEntryButton } from '@/components/vertal-growth/VertalGrowthEntryButton';
import { planTeam } from '../../../supabase/functions/_shared/vertalGrowth/core';
import type { HuginnOp } from '../../../supabase/functions/_shared/huginnCore';

describe('Vertal Growth · front', () => {
  it('interruptor desligado por padrão', () => {
    expect(isVertalGrowthEnabled({})).toBe(false);
    expect(isVertalGrowthEnabled({ VITE_VERTAL_GROWTH_TEAM: 'false' })).toBe(false);
    expect(isVertalGrowthEnabled({ VITE_VERTAL_GROWTH_TEAM: 'true' })).toBe(true);
  });
  it('botão: desligado/não liberado não renderiza NADA (Chat, Code AI e o projeto no Vibe Code ficam idênticos)', () => {
    const { container } = render(
      <MemoryRouter>
        <VertalGrowthEntryButton from="chat" />
        <VertalGrowthEntryButton from="code" enabledOverride={false} />
        <VertalGrowthEntryButton from="builder" floating projectId="p" enabledOverride={false} />
        <VertalGrowthEntryButton from="builder" floating projectId="p" enabledOverride hidden />
      </MemoryRouter>,
    );
    expect(container.innerHTML).toBe('');
  });
  it('liberado: mostra "Buscar clientes" e leva o projeto', () => {
    const { getByTestId } = render(<MemoryRouter><VertalGrowthEntryButton from="builder" projectId="60000000-0000-4000-8000-000000000001" enabledOverride /></MemoryRouter>);
    expect(getByTestId('vertal-growth-entry')).toBeTruthy();
    expect(vertalGrowthHref({ from: 'builder', projectId: '60000000-0000-4000-8000-000000000001' })).toBe('/vertal-code-ai/growth?from=builder&projectId=60000000-0000-4000-8000-000000000001');
  });
  it('comando do chat vira endereço com o projeto e o idioma', () => {
    const href = vertalGrowthHrefFromChat('find customers for my app FitVertal');
    const h = readGrowthHandoff(href.split('?')[1]);
    expect(h).toMatchObject({ project: 'FitVertal', from: 'chat', lang: 'en', donors: false });
    expect(readGrowthHandoff(vertalGrowthHrefFromChat('buscar doadores para minha ONG Amigos').split('?')[1]).donors).toBe(true);
  });
  it('acesso: qualquer falha = não liberado; chama a action growth', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ error: 'vertal_growth_disabled' }), { status: 404 }));
    expect(await fetchGrowthAccess('tok', f as unknown as typeof fetch, 'https://x')).toBe(false);
    expect(JSON.parse(String(((f.mock.calls[0] as unknown[])[1] as RequestInit).body))).toEqual({ action: 'growth', op: 'status' });
    await expect(callGrowth('status', {}, { token: '' })).rejects.toThrow('not_signed_in');
  });
  it('equipe: entrada → filtro por evento → agente do app (operações existentes), e eventos vão para a entrada', async () => {
    const ops: HuginnOp[] = [];
    let id = 100;
    const call = vi.fn(async (op: HuginnOp) => {
      ops.push(op);
      return { ok: true, message: 'ok', data: { agent: { id: ++id } } };
    });
    const { presets } = planTeam(['todoist'], 'pt');
    const r = await buildTeam('FitVertal', presets, call);
    expect(r.ok).toBe(true);
    expect(ops[0]).toMatchObject({ op: 'create_agent', type: 'Agents::WebhookAgent' });
    expect(ops[1]).toMatchObject({ op: 'create_agent', type: 'Agents::TriggerAgent', source_ids: [101] });
    expect(ops[2]).toMatchObject({ op: 'create_fluxos_agent', app: 'todoist', key: 'createTask', source_ids: [102] });
    expect(ops.filter((o) => o.op === 'create_fluxos_agent')).toHaveLength(4);
    const team = (r as { ok: true; team: { webhookAgentId: number; agents: unknown[] } }).team;
    expect(team.webhookAgentId).toBe(101);
    expect(team.agents).toHaveLength(4);
    ops.length = 0;
    expect(await forwardEvents(101, [{ type: 'new_lead' }, { type: 'churn_risk' }], call)).toBe(2);
    expect(ops.every((o) => o.op === 'send_webhook_event' && o.agent_id === 101)).toBe(true);
  });
  it('equipe: falha no meio devolve o que já foi criado (para salvar e não duplicar)', async () => {
    let n = 0;
    const call = vi.fn(async () => (++n <= 3 ? { ok: true, message: 'ok', data: { agent: { id: n } } } : { ok: false, message: 'falhou' }));
    const r = await buildTeam('X', planTeam(['todoist'], 'pt').presets, call);
    expect(r.ok).toBe(false);
    expect((r as { partial?: { agents: unknown[] } }).partial?.agents).toHaveLength(1);
  });
  it('preset que precisa de campo (Notion) não é criado sem ele', async () => {
    const call = vi.fn(async () => ({ ok: true, message: 'ok', data: { agent: { id: 1 } } }));
    const r = await buildTeam('X', planTeam(['notion'], 'pt').presets, call);
    expect(r.ok).toBe(true);
    expect(call).toHaveBeenCalledTimes(1); // só a entrada
  });
});

import { GROWTH_UI } from './i18n';
describe('Vertal Growth · marca branca', () => {
  it('textos da tela (pt/en/es) não citam os motores por trás', () => {
    const text = JSON.stringify(GROWTH_UI, (_k, v) => (typeof v === 'function' ? String(v(1, 2)) : v));
    expect(text).not.toMatch(/\b(Huginn|Automatisch|Railway|OpenRouter|DeepSeek|Qwen|Ollama)\b/i);
  });
});
