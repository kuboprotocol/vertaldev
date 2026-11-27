// Reteste de 26/11/2026 — restos de inglês no Vertal CRM, Growth e na tela de login (idioma nativo do usuário).
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: null } })) } },
}));

import { formatDateInput, maskDateInput, parseDateInput, withPickedDay } from './vertalCrm/dateInput';
import { LocaleDateInput } from '@/components/vertal-crm/LocaleDateInput';
import { aiMessages, localizeAiContext, localizeAiText } from '../../supabase/functions/_shared/vertalCrm/core';
import { matchProjectByName } from './vertalGrowth/client';
import { stageLabels } from '../../supabase/functions/_shared/vertalGrowth/core';
import { AUTH_UI, authLang } from './authI18n';
import { VERTAL_UI_LANG_KEY } from './vertalGrowth/i18n';

describe('CRM · data e hora em dd/mm/aaaa, 24 h (sem AM/PM do navegador)', () => {
  it('formata e lê nos dois sentidos', () => {
    expect(formatDateInput('2026-12-05T14:30', 'pt', true)).toBe('05/12/2026 14:30');
    expect(formatDateInput('2026-12-05', 'pt', false)).toBe('05/12/2026');
    expect(formatDateInput('2026-12-05', 'en', false)).toBe('12/05/2026');
    expect(parseDateInput('05/12/2026 14:30', 'pt', true)).toBe('2026-12-05T14:30');
    expect(parseDateInput('5/12/2026', 'pt', true)).toBe('2026-12-05T00:00');
    expect(parseDateInput('05/12/2026', 'es', false)).toBe('2026-12-05');
    expect(parseDateInput('12/05/2026', 'en', false)).toBe('2026-12-05');
    expect(parseDateInput('', 'pt', true)).toBe('');
  });

  it('recusa data impossível, hora inválida e texto incompleto', () => {
    expect(parseDateInput('31/02/2026', 'pt', false)).toBeNull();
    expect(parseDateInput('05/12/2026 24:00', 'pt', true)).toBeNull();
    expect(parseDateInput('05/12/20', 'pt', true)).toBeNull();
    expect(parseDateInput('05/12/2026 10:00', 'pt', false)).toBeNull();
  });

  it('máscara enquanto digita e dia escolhido no calendário mantém a hora', () => {
    expect(maskDateInput('051220261430', true)).toBe('05/12/2026 14:30');
    expect(maskDateInput('05122026', false)).toBe('05/12/2026');
    expect(withPickedDay(new Date(2026, 11, 9), '2026-12-05T14:30', true)).toBe('2026-12-09T14:30');
    expect(withPickedDay(new Date(2026, 11, 9), '', true)).toBe('2026-12-09T09:00');
    expect(withPickedDay(new Date(2026, 11, 9), '', false)).toBe('2026-12-09');
  });

  it('campo em pt: placeholder dd/mm/aaaa hh:mm, botão "Abrir calendário" e valor no formato antigo', () => {
    const onChange = vi.fn();
    render(<LocaleDateInput lang="pt" withTime value="" onChange={onChange} ariaLabel="Prazo" />);
    const input = screen.getByLabelText('Prazo') as HTMLInputElement;
    expect(input.type).toBe('text');
    expect(input.placeholder).toBe('dd/mm/aaaa hh:mm');
    expect(screen.getByRole('button', { name: 'Abrir calendário' })).toBeTruthy();
    fireEvent.change(input, { target: { value: '051220261430' } });
    expect(input.value).toBe('05/12/2026 14:30');
    expect(onChange).toHaveBeenLastCalledWith('2026-12-05T14:30');
    expect(document.body.textContent).not.toMatch(/AM|PM|Show (local )?date/);
  });

  it('CRM não usa mais o datetime-local / date nativo nas tarefas e na previsão de fechamento', () => {
    for (const f of ['src/components/vertal-crm/CrmDashboard.tsx', 'src/components/vertal-crm/CrmRecordPanel.tsx']) {
      expect(readFileSync(f, 'utf8')).not.toContain('type="datetime-local"');
    }
  });
});

describe('CRM · IA recebe e devolve rótulos no idioma (nada de "cold")', () => {
  const ctx = {
    type: 'contact',
    record: { first_name: 'Ana', status: 'cold' },
    deals: [{ name: 'Site novo', stage: 'lead', status: 'open', amount: 1000 }],
    tasks: [{ type: 'call', text: 'ligar' }],
  };

  it('troca status do contato, do negócio e tipo de tarefa', () => {
    const pt = localizeAiContext(ctx, 'pt') as typeof ctx;
    expect(pt.record.status).toBe('frio');
    expect(pt.deals[0].status).toBe('aberto');
    expect(pt.deals[0].stage).toBe('lead');
    expect(pt.tasks[0].type).toBe('ligação');
    expect((localizeAiContext(ctx, 'es') as typeof ctx).record.status).toBe('frío');
    expect((localizeAiContext(ctx, 'en') as typeof ctx).record.status).toBe('cold');
  });

  it('o prompt do resumo vai sem o valor cru; a busca continua com ids crus', () => {
    const summary = aiMessages('summary', ctx, 'pt').map((m) => m.content).join('\n');
    expect(summary).toContain('"status":"frio"');
    expect(summary).not.toContain('"status":"cold"');
    const search = aiMessages('search', [{ etapas: ['lead=Lead'] }], 'pt').map((m) => m.content).join('\n');
    expect(search).toContain('cold|warm|hot|in-contract');
  });

  it('rede de segurança no texto: "cold" vira "frio" (pt) e fica em en', () => {
    expect(localizeAiText('- Status: cold, sem contato há 30 dias', 'pt')).toBe('- Status: frio, sem contato há 30 dias');
    expect(localizeAiText('Lead "hot" e cliente in-contract', 'pt')).toBe('Lead quente e cliente cliente (em contrato)');
    expect(localizeAiText('Hotmail e hotel ficam', 'pt')).toBe('Hotmail e hotel ficam');
    expect(localizeAiText('Status: cold', 'en')).toBe('Status: cold');
  });
});

describe('Growth · etapas e projeto no idioma da tela', () => {
  it('etapas em pt mesmo quando a campanha foi criada em inglês', () => {
    expect(stageLabels('b2b', 'pt')).toEqual({ captacao: 'Captação', conversao: 'Conversão', retencao: 'Retenção' });
    const src = readFileSync('src/pages/VertalGrowthPage.tsx', 'utf8');
    // Agora os nomes das etapas vêm do dicionário da tela (21 idiomas), não do servidor (só pt/en/es).
    expect(src).toContain("t.stageNames[g.model === 'nonprofit' ? 'donor' : 'business']");
    expect(src).not.toMatch(/\{stages\.(captacao|conversao|retencao)\}/);
    expect(src).toContain('growth-lang-loading');
  });

  it('"app" não escolhe um projeto qualquer (antes casava com "herokuapp")', () => {
    const list = [
      { id: '1', title: 'Entre no site https://the-internet.herokuapp.com/login, faça' },
      { id: '2', title: 'Loja da Maria' },
      { id: '3', title: 'App de Receitas' },
    ];
    expect(matchProjectByName(list, 'app')).toBeNull();
    expect(matchProjectByName(list, 'meu app')).toBeNull();
    expect(matchProjectByName(list, 'loja da maria')?.id).toBe('2');
    expect(matchProjectByName(list, 'Receitas')?.id).toBe('3');
    expect(matchProjectByName(list, 'internet')?.id).toBe('1');
    expect(matchProjectByName(list, 'inexistente')).toBeNull();
    expect(matchProjectByName([...list, { id: '4', title: 'Receitas fit' }], 'receitas')).toBeNull();
  });
});

describe('Login · textos num idioma só', () => {
  it('pt/en/es com as mesmas chaves e pt sem inglês', () => {
    const keys = Object.keys(AUTH_UI.en).sort();
    expect(Object.keys(AUTH_UI.pt).sort()).toEqual(keys);
    expect(Object.keys(AUTH_UI.es).sort()).toEqual(keys);
    const ptText = JSON.stringify(AUTH_UI.pt);
    expect(ptText).not.toMatch(/Sign In|Welcome|Password|Forgot|Create my|or use email/);
    expect(AUTH_UI.pt.submitSignIn).toBe('Entrar na conta');
    expect(AUTH_UI.en.passwordPlaceholder).toBe('Password');
  });

  it('idioma: ?lang → idioma salvo → navegador', () => {
    localStorage.removeItem(VERTAL_UI_LANG_KEY);
    expect(authLang('es')).toBe('es');
    localStorage.setItem(VERTAL_UI_LANG_KEY, 'pt-BR');
    expect(authLang(null)).toBe('pt');
    localStorage.removeItem(VERTAL_UI_LANG_KEY);
  });

  it('a tela não tem mais textos fixos misturados', () => {
    const src = readFileSync('src/pages/AuthPage.tsx', 'utf8');
    for (const s of ["'Sign In na conta'", "'Welcome back'", 'placeholder="Senha"', '>or use email<', "'Try again'", 'Forgot my password']) {
      expect(src).not.toContain(s);
    }
    // A lógica de login segue igual (mesmas mensagens do Supabase reconhecidas).
    expect(src).toContain("msg.includes('Invalid login credentials')");
    expect(src).toContain('signInWithPassword({ email, password })');
  });
});
