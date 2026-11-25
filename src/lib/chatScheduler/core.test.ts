import { describe, expect, it } from 'vitest';
import {
  backoffMs, branchFor, buildGmailQuery, describeSchedule, formatLocal, googleCalendarLink, hasCalendarScope, inQuietHours,
  localParts, nextRun, normalizeSpec, parseCron, parsePtTimeOfDay, parsePtWhen, parseSchedulerAction, parseSentiment,
  quietApplies, quietEnd, schedulerAllowed, summaryLines, wantsScheduler, zonedToUtc,
} from '../../../supabase/functions/_shared/chatScheduler';

const TZ = 'America/Sao_Paulo';
// Quarta-feira, 25/11/2026 04:55 em São Paulo (UTC-3) = 07:55Z.
const NOW = Date.parse('2026-11-25T07:55:00Z');
const local = (ms: number) => {
  const p = localParts(ms, TZ);
  return `${p.y}-${String(p.mo).padStart(2, '0')}-${String(p.d).padStart(2, '0')} ${String(p.h).padStart(2, '0')}:${String(p.mi).padStart(2, '0')}`;
};
const onceAt = (text: string) => {
  const r = parsePtWhen(text, NOW, TZ);
  expect(r?.schedule.type).toBe('once');
  return local(Date.parse((r!.schedule as { at: string }).at));
};

describe('fuso', () => {
  it('converte local ↔ UTC em São Paulo', () => {
    expect(new Date(zonedToUtc(2026, 11, 26, 9, 0, TZ)).toISOString()).toBe('2026-11-26T12:00:00.000Z');
    expect(local(NOW)).toBe('2026-11-25 04:55');
    expect(localParts(NOW, TZ).dow).toBe(3);
  });
  it('respeita horário de verão em outro fuso', () => {
    expect(new Date(zonedToUtc(2026, 7, 1, 9, 0, 'America/New_York')).toISOString()).toBe('2026-07-01T13:00:00.000Z');
    expect(new Date(zonedToUtc(2026, 12, 1, 9, 0, 'America/New_York')).toISOString()).toBe('2026-12-01T14:00:00.000Z');
  });
});

describe('português → quando', () => {
  it('hora do dia', () => {
    expect(parsePtTimeOfDay('às 9h')).toBe('09:00');
    expect(parsePtTimeOfDay('amanhã às 14:30')).toBe('14:30');
    expect(parsePtTimeOfDay('21h15')).toBe('21:15');
    expect(parsePtTimeOfDay('às 3 da tarde')).toBe('15:00');
    expect(parsePtTimeOfDay('meio-dia')).toBe('12:00');
    expect(parsePtTimeOfDay('sem hora')).toBeNull();
  });
  it('datas únicas', () => {
    expect(onceAt('me lembre amanhã às 9h')).toBe('2026-11-26 09:00');
    expect(onceAt('depois de amanhã 15h')).toBe('2026-11-27 15:00');
    expect(onceAt('hoje às 18h30')).toBe('2026-11-25 18:30');
    expect(onceAt('daqui a 2 minutos')).toBe('2026-11-25 04:57');
    expect(onceAt('em 3 horas')).toBe('2026-11-25 07:55');
    expect(onceAt('dia 10 às 8h')).toBe('2026-12-10 08:00');
    expect(onceAt('30/11 às 10h')).toBe('2026-11-30 10:00');
    expect(onceAt('dia 5 de março às 10h')).toBe('2027-03-05 10:00');
    expect(onceAt('sexta às 15h')).toBe('2026-11-27 15:00');
    expect(onceAt('quarta às 3h')).toBe('2026-12-02 03:00');
    expect(onceAt('às 3h')).toBe('2026-11-26 03:00');
  });
  it('recorrências', () => {
    expect(parsePtWhen('todo dia às 8h', NOW, TZ)?.schedule).toEqual({ type: 'daily', time: '08:00' });
    expect(parsePtWhen('toda segunda e quarta às 7h30', NOW, TZ)?.schedule).toEqual({ type: 'weekly', time: '07:30', days: [1, 3] });
    expect(parsePtWhen('dias úteis às 9h', NOW, TZ)?.schedule).toEqual({ type: 'weekly', time: '09:00', days: [1, 2, 3, 4, 5] });
    expect(parsePtWhen('a cada 30 minutos', NOW, TZ)?.schedule).toEqual({ type: 'interval', minutes: 30 });
    expect(parsePtWhen('a cada 2 horas', NOW, TZ)?.schedule).toEqual({ type: 'interval', minutes: 120 });
    expect(parsePtWhen('todo mês dia 5 às 10h', NOW, TZ)?.schedule).toEqual({ type: 'monthly', time: '10:00', day: 5 });
    expect(parsePtWhen('blá blá', NOW, TZ)).toBeNull();
  });
});

describe('próximo disparo', () => {
  it('diário, semanal, mensal, intervalo, cron', () => {
    expect(local(nextRun({ type: 'daily', time: '08:00' }, TZ, NOW)!)).toBe('2026-11-25 08:00');
    expect(local(nextRun({ type: 'daily', time: '04:00' }, TZ, NOW)!)).toBe('2026-11-26 04:00');
    expect(local(nextRun({ type: 'weekly', time: '09:00', days: [1] }, TZ, NOW)!)).toBe('2026-11-30 09:00');
    expect(local(nextRun({ type: 'monthly', time: '09:00', day: 31 }, TZ, NOW)!)).toBe('2026-11-30 09:00');
    expect(nextRun({ type: 'interval', minutes: 1 }, TZ, NOW)).toBe(NOW + 5 * 60_000);
    expect(local(nextRun({ type: 'cron', expr: '0 8 * * 1-5' }, TZ, NOW)!)).toBe('2026-11-25 08:00');
    expect(local(nextRun({ type: 'cron', expr: '*/15 * * * *' }, TZ, NOW)!)).toBe('2026-11-25 05:00');
    expect(nextRun({ type: 'once', at: '2026-11-25T07:00:00Z' }, TZ, NOW)).toBeNull();
    expect(parseCron('1 2 3')).toBeNull();
    expect(parseCron('0 25 * * *')).toBeNull();
  });
});

describe('contrato da ferramenta', () => {
  it('aceita criação e normaliza campos', () => {
    const a = parseSchedulerAction({
      tool: 'agendador', op: 'create', kind: 'email_trigger', title: 'Proposta',
      trigger: { from: 'rh@empresa.com', subject: 'proposta', every_min: 1 },
      branches: { positive: 'me avise', negative: 'me avise com urgência' }, send_to: 'ana@x.com; ruim',
    });
    expect(a).toMatchObject({ tool: 'agendador', op: 'create', kind: 'email_trigger', send_to: ['ana@x.com'] });
  });
  it('rejeita op inválida e referência vazia', () => {
    expect(parseSchedulerAction({ tool: 'agendador', op: 'hack' })).toBeNull();
    expect(parseSchedulerAction({ tool: 'agendador', op: 'pause' })).toBeNull();
    expect(parseSchedulerAction({ tool: 'agendador', op: 'pause', name: 'Boleto' })).toEqual({ tool: 'agendador', op: 'pause', name: 'Boleto' });
    expect(parseSchedulerAction({ tool: 'agendador', op: 'list' })).toEqual({ tool: 'agendador', op: 'list' });
  });
});

describe('normalização', () => {
  it('lembrete', () => {
    const r = normalizeSpec({ kind: 'reminder', title: 'Pagar boleto', when: 'amanhã às 9h' }, NOW, TZ);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.task.schedule).toEqual({ type: 'once', at: '2026-11-26T12:00:00.000Z' });
    expect(r.task.prompt).toBe('Lembrar: Pagar boleto');
    expect(summaryLines(r.task).join('\n')).toContain('Não envia e-mail a terceiros');
  });
  it('consulta cria evento e lembrete antes', () => {
    const r = normalizeSpec({ kind: 'appointment', appointment: { title: 'Dentista', start: '2026-11-27T15:00', remind_before_min: 60, location: 'Centro' } }, NOW, TZ);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.task.appointment?.start).toBe('2026-11-27T18:00:00.000Z');
    expect(r.task.appointment?.end).toBe('2026-11-27T19:00:00.000Z');
    expect(r.task.schedule).toEqual({ type: 'once', at: '2026-11-27T17:00:00.000Z' });
    expect(googleCalendarLink(r.task.appointment!)).toContain('dates=20261127T180000Z%2F20261127T190000Z');
  });
  it('horário passado e gatilho sem critério', () => {
    expect(normalizeSpec({ kind: 'reminder', title: 'x', at: '2026-11-24T10:00' }, NOW, TZ)).toMatchObject({ ok: false });
    expect(normalizeSpec({ kind: 'email_trigger', trigger: {}, prompt: 'x' }, NOW, TZ)).toMatchObject({ ok: false });
  });
  it('gatilho de e-mail', () => {
    const r = normalizeSpec({ kind: 'email_trigger', title: 'Banco', trigger: { from: 'banco@x.com' }, branches: { negative: 'avise' } }, NOW, TZ);
    expect(r.ok && r.task.schedule).toEqual({ type: 'email', every_min: 5 });
  });
  it('descrição', () => {
    expect(describeSchedule({ type: 'weekly', time: '08:00', days: [1, 2, 3, 4, 5] }, TZ)).toBe('dias úteis às 08:00');
    expect(formatLocal(Date.parse('2026-11-26T12:00:00Z'), TZ)).toBe('qui. 26/11 às 09:00');
  });
});

describe('silêncio, tentativas, e-mail', () => {
  it('horário de silêncio atravessando a meia-noite', () => {
    const q = { start: '22:00', end: '07:00' };
    expect(inQuietHours(NOW, TZ, q)).toBe(true);
    expect(local(quietEnd(NOW, TZ, q))).toBe('2026-11-25 07:00');
    expect(inQuietHours(Date.parse('2026-11-25T15:00:00Z'), TZ, q)).toBe(false);
    expect(quietApplies({ schedule: { type: 'daily', time: '08:00' } })).toBe(false);
    expect(quietApplies({ schedule: { type: 'email', every_min: 5 } })).toBe(true);
  });
  it('backoff', () => {
    expect([1, 2, 3, 9].map(backoffMs)).toEqual([60_000, 300_000, 900_000, 900_000]);
  });
  it('busca do Gmail e sentimento', () => {
    expect(buildGmailQuery({ from: 'rh@x.com', subject: 'proposta final', query: 'newer_than:1d has:attachment' }, 1700000000))
      .toBe('from:rh@x.com subject:"proposta final" has:attachment after:1700000000');
    expect(parseSentiment('{"sentiment":"negative","reason":"recusado"}')).toEqual({ sentiment: 'negative', reason: 'recusado' });
    expect(parseSentiment('lixo')).toEqual({ sentiment: 'neutral', reason: '' });
    expect(branchFor({ branches: { positive: 'A' } }, 'negative')).toBeNull();
    expect(branchFor({ branches: { positive: 'A' }, prompt: 'P' }, 'negative')).toBe('P');
  });
});

describe('flag e intenção', () => {
  it('lista de liberação vazia = ninguém', () => {
    const env = (m: Record<string, string>) => (k: string) => m[k];
    expect(schedulerAllowed(env({ VERTAL_CHAT_SCHEDULER_ENABLED: 'true' }), 'u1')).toBe(false);
    expect(schedulerAllowed(env({ VERTAL_CHAT_SCHEDULER_ENABLED: 'true', VERTAL_CHAT_SCHEDULER_USER_IDS: 'U1, u2' }), 'u1')).toBe(true);
    expect(schedulerAllowed(env({ VERTAL_CHAT_SCHEDULER_USER_IDS: 'u1' }), 'u1')).toBe(false);
  });
  it('intenção', () => {
    expect(wantsScheduler(['me lembre amanhã às 9h'])).toBe(true);
    expect(wantsScheduler([{ content: 'quando eu receber um email do banco' }])).toBe(true);
    expect(wantsScheduler(['faça um post para o instagram'])).toBe(false);
    expect(hasCalendarScope('openid https://www.googleapis.com/auth/calendar.events')).toBe(true);
    expect(hasCalendarScope('https://www.googleapis.com/auth/gmail.readonly')).toBe(false);
  });
});
