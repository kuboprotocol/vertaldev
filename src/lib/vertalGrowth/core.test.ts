import { describe, expect, it } from 'vitest';
import {
  abuseProblems, autopilotRequestOk, fallbackDraft, GROWTH_AGENT_RUN_COST, GROWTH_LAUNCH_COST, growthChargeAdmins, growthChargeOn, growthFooter,
  growthLang, growthSendGate, growthTextProblems, inferBusinessModel, isGrowthCommand, isGrowthEnabled, maxLeadsPerCampaign, parseGrowthCommand,
  planTeam, readProject, stageLabels, teamEvent,
} from '../../../supabase/functions/_shared/vertalGrowth/core';
import { isProspectCommand } from '../../../supabase/functions/_shared/vertalProspector/core';
import { FLUXOS_ACTION_COST } from '../../../supabase/functions/_shared/fluxosApps';

const U = '5441b397-7be8-44fc-87e8-8057fdb79a0e';
const ON = { VERTAL_GROWTH_TEAM_ENABLED: 'true', VERTAL_PROSPECTOR_ENABLED: 'true', VERTAL_PROSPECTOR_USER_IDS: U };

describe('Vertal Growth · interruptores', () => {
  it('liga só com a flag E o usuário na mesma lista do Prospector', () => {
    expect(isGrowthEnabled(ON, U)).toBe(true);
    expect(isGrowthEnabled({ ...ON, VERTAL_GROWTH_TEAM_ENABLED: 'false' }, U)).toBe(false);
    expect(isGrowthEnabled({ ...ON, VERTAL_PROSPECTOR_USER_IDS: '' }, U)).toBe(false); // lista vazia = ninguém
    expect(isGrowthEnabled(ON, '00000000-0000-4000-8000-000000000000')).toBe(false);
    expect(isGrowthEnabled({}, U)).toBe(false);
  });
  it('cobrança e teto de leads por variável', () => {
    expect(growthChargeOn({ VERTAL_GROWTH_TEAM_CHARGE: 'true' })).toBe(true);
    expect(growthChargeOn({})).toBe(false);
    expect(growthChargeAdmins({})).toBe(false);
    expect(maxLeadsPerCampaign({})).toBe(200);
    expect(maxLeadsPerCampaign({ VERTAL_GROWTH_TEAM_MAX_LEADS: '9999' })).toBe(500);
  });
  it('preço: 20 créditos no lançamento e o mesmo preço por execução do Agentes ↔ Fluxos', () => {
    expect(GROWTH_LAUNCH_COST).toBe(20);
    expect(GROWTH_AGENT_RUN_COST).toBe(FLUXOS_ACTION_COST);
  });
});

describe('Vertal Growth · modelo de negócio', () => {
  it('assinatura para pessoas → B2C com assinatura', () => {
    const r = inferBusinessModel('Treinos para você em casa. Assine o plano mensal por R$ 19/mês. Teste grátis de 7 dias. Baixe o app na App Store.');
    expect(r.model).toBe('b2c');
    expect(r.subscription).toBe(true);
  });
  it('produto para empresas → B2B', () => {
    expect(inferBusinessModel('CRM para clínicas e escritórios. Gestão da sua empresa. Solicite uma demo para o seu negócio.').model).toBe('b2b');
  });
  it('causa com doação → nonprofit', () => {
    expect(inferBusinessModel('ONG sem fins lucrativos. Faça uma doação, seja voluntário, doe agora. Doação recorrente ajuda a causa.').model).toBe('nonprofit');
  });
  it('"doar" solto numa loja não vira ONG', () => {
    expect(inferBusinessModel('Loja de roupas para você. Compre e ganhe frete. Doar roupas usadas.').model).not.toBe('nonprofit');
  });
  it('lê nome, descrição e site publicado do projeto', () => {
    const r = readProject({
      id: 'p', title: 'Crie um app de treino', is_published: true, published_url: 'https://treino.pages.dev',
      generated_code: '<html><head><title>FitVertal</title><meta name="description" content="Treinos curtos para você"></head><body><h1>FitVertal</h1><script>x()</script></body></html>',
    });
    expect(r.name).toBe('FitVertal');
    expect(r.description).toBe('Treinos curtos para você');
    expect(r.website).toBe('https://treino.pages.dev');
  });
  it('rótulos das etapas (negócio e doadores) no idioma do dev', () => {
    expect(stageLabels('b2c', 'pt')).toEqual({ captacao: 'Captação', conversao: 'Conversão', retencao: 'Retenção' });
    expect(stageLabels('nonprofit', 'pt').retencao).toBe('Doação recorrente');
    expect(stageLabels('nonprofit', 'en').captacao).toBe('Donor outreach');
    expect(stageLabels('b2b', 'es').conversao).toBe('Conversión');
  });
  it('idioma: pt/en/es pelo navegador ou texto', () => {
    expect(growthLang('en-US')).toBe('en');
    expect(growthLang('es-419')).toBe('es');
    expect(growthLang(undefined)).toBe('pt');
  });
});

describe('Vertal Growth · segurança', () => {
  it('bloqueia conteúdo de golpe/aposta/adulto e link encurtado', () => {
    expect(abuseProblems('Ganhe dinheiro fácil com aposta esportiva')).not.toHaveLength(0);
    expect(abuseProblems('veja bit.ly/abc')).toContain('link encurtado não é permitido');
    expect(abuseProblems('App de agenda para clínicas')).toHaveLength(0);
  });
  it('texto: campo sem preencher, caixa alta, pontuação, tamanho', () => {
    expect(growthTextProblems('onboarding', 'Oi {{nome}}', 'Bem-vindo')).toContain('tem campo de mesclagem sem preencher');
    expect(growthTextProblems('checkin', 'TUDO CERTO COM VOCÊ', 'ok')).toContain('assunto todo em maiúsculas');
    expect(growthTextProblems('checkin', 'Oi', 'Compre já!!!')).toContain('pontuação exagerada');
    expect(growthTextProblems('checkin', 'Oi', 'palavra '.repeat(200))[0]).toMatch(/longo demais/);
  });
  const base = { status: 'approved', kind: 'onboarding' as const, subject: 'Bem-vindo', body: 'Que bom ter você aqui.', to: 'ana@exemplo.com', emailStatus: 'verified', contactStatus: 'active', blocked: false, sentToday: 0, cap: 20 };
  it('portão: só aprovado, fora da lista, dentro do limite', () => {
    expect(growthSendGate(base)).toEqual([]);
    expect(growthSendGate({ ...base, status: 'draft' })).toContain('mensagem não aprovada');
    expect(growthSendGate({ ...base, blocked: true })).toContain('contato na lista de não contatar');
    expect(growthSendGate({ ...base, contactStatus: 'opted_out' })).toContain('contato pediu para não receber mensagens');
    expect(growthSendGate({ ...base, sentToday: 20 })).toContain('limite diário atingido (20 envios)');
  });
  it('piloto automático só envia para e-mail verificado (nem com "aceito arriscado")', () => {
    expect(growthSendGate({ ...base, emailStatus: 'risky', allowRisky: true })).toEqual([]);
    expect(growthSendGate({ ...base, emailStatus: 'risky', allowRisky: true, autopilot: true })).toContain('piloto automático só envia para e-mail verificado');
  });
  it('piloto automático: só com AUTOPILOT digitado na tela de configurações; desligar sempre pode', () => {
    expect(autopilotRequestOk({ enabled: true })).toBe(false);
    expect(autopilotRequestOk({ enabled: true, confirmText: 'AUTOPILOT' })).toBe(false);
    expect(autopilotRequestOk({ enabled: true, confirmText: 'AUTOPILOT', origin: 'growth_settings' })).toBe(true);
    expect(autopilotRequestOk({ enabled: false })).toBe(true);
  });
  it('rodapé LGPD diz a origem e a saída no idioma', () => {
    expect(growthFooter('pt', { name: 'Laércio', company: 'Vertal' }, 'stripe')).toMatch(/tem uma conta conosco.*"parar"/s);
    expect(growthFooter('en', {}, 'prospector')).toMatch(/public source.*"stop"/s);
  });
  it('texto de reserva sem IA passa no portão e não inventa nome', () => {
    const d = fallbackDraft('pt', 'winback', { name: 'ana@x.com', product: 'FitVertal' });
    expect(growthTextProblems('winback', d.subject, d.body)).toEqual([]);
    expect(d.body).not.toContain('ana@');
  });
});

describe('Vertal Growth · equipe e comando', () => {
  it('só cria agentes para apps que o dev conectou (prioridade de CRM)', () => {
    expect(planTeam(['formatter'], 'pt').presets).toEqual([]);
    const p = planTeam(['todoist', 'pipedrive'], 'pt');
    expect(p.crmApp).toBe('pipedrive');
    expect(p.presets.map((x) => x.event)).toEqual(['new_lead', 'reply_positive', 'new_customer', 'churn_risk']);
    expect(p.presets[0]).toMatchObject({ app: 'pipedrive', key: 'createPerson' });
    const t = planTeam(['todoist'], 'en');
    expect(t.presets.every((x) => x.key === 'createTask')).toBe(true);
    expect(String(t.presets[0].parameters.content)).toContain('{{ name }}');
    expect(planTeam(['hubspot'], 'pt').presets.map((x) => x.id)).toEqual(['lead_to_crm', 'customer_onboarding']);
    expect(planTeam(['notion'], 'pt').presets[0].needs).toEqual(['databaseId']);
  });
  it('evento para a equipe: só contato e contexto, uma linha', () => {
    const e = teamEvent('new_lead', { project: 'FitVertal', name: 'Academia\nX', email: 'a@x.com', stage: 'captacao' });
    expect(e).toMatchObject({ type: 'new_lead', name: 'Academia X', email: 'a@x.com', project: 'FitVertal' });
  });
  it('comando do chat em pt/en/es, sem tomar o comando do Prospector', () => {
    expect(isGrowthCommand('busque clientes para minha aplicação FitVertal')).toBe(true);
    expect(parseGrowthCommand('buscar clientes para meu app Vertal Run').project).toBe('Vertal Run');
    expect(parseGrowthCommand('find customers for my app FitVertal')).toMatchObject({ project: 'FitVertal', lang: 'en' });
    expect(parseGrowthCommand('buscar doadores para minha ONG Amigos do Bem')).toMatchObject({ project: 'Amigos do Bem', donors: true });
    expect(isGrowthCommand('/growth')).toBe(true);
    // "encontrar clientes para <empresa>" continua no Prospector.
    expect(isProspectCommand('encontrar clientes para Vertal Company')).toBe(true);
    expect(isGrowthCommand('encontrar clientes para Vertal Company')).toBe(false);
    expect(isGrowthCommand('quais são meus clientes?')).toBe(false);
  });
});
