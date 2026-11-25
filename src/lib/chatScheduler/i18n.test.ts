// Agendador multilíngue: cobertura do dicionário, regressão de pt/en/es, detecção, datas e RTL.
import { describe, expect, it } from 'vitest';
import legacy from './__fixtures__/legacy-pt-en-es.json';
import {
  SCHED_LANGS, SCHED_OPTIONAL_KEYS, SCHED_REQUIRED_KEYS, approvalLabels, rawSchedStrings, registerSchedulerLangs, schedLang,
  schedTemplates, schedUiText, sget, type SchedKey,
} from '../../../supabase/functions/_shared/chatSchedulerI18n';
import { SCHEDULER_LANG_DATA } from '../../../supabase/functions/_shared/chatSchedulerLangs/index';
import {
  describeSchedule, detectLang, formatLocal, intlLocale, isRtl, langName, nativeLangName, normLang, normalizeSpec, parseExplicitIso,
  resolveLang, schedText, summaryLines, templatesFor, wantsScheduler,
} from '../../../supabase/functions/_shared/chatScheduler';
import { LANG_CHOICES, schedUi, schedulerUiLang } from './i18n';

const ARGS = ['A1', 'B2', 'C3'];
function flat(o: unknown): unknown {
  if (typeof o === 'function') return (o as (...a: unknown[]) => unknown)(...ARGS);
  if (Array.isArray(o)) return o.map(flat);
  if (o && typeof o === 'object') return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, flat(v)]));
  return o;
}
const NOW = Date.UTC(2026, 10, 25, 12, 0, 0);
const TZ = 'America/Sao_Paulo';
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

describe('pt-BR / en / es: textos idênticos aos de antes (fixture medida no main ebbae80)', () => {
  const SPECS = [
    { kind: 'reminder', title: 'T', when: 'in 2 minutes' },
    { kind: 'task', prompt: 'P', repeat: { every: 'day', time: '08:00' }, send_to: ['a@b.com'], allow_app_actions: true, notify_email: true },
    { kind: 'task', prompt: 'P', repeat: { every: 'week', days: [1, 3], time: '08:00' } },
    { kind: 'task', prompt: 'P', repeat: { every: 'weekdays', time: '08:00' } },
    { kind: 'task', prompt: 'P', repeat: { every: 'month', day: 5, time: '08:00' } },
    { kind: 'task', prompt: 'P', repeat: { every: 'hour', interval: 2 } },
    { kind: 'task', prompt: 'P', repeat: { every: 'minutes', interval: 15 } },
    { kind: 'task', prompt: 'P', cron: '0 8 * * 1-5' },
    { kind: 'appointment', title: 'Dent', appointment: { start: '2026-11-27T15:00', location: 'Rua', remind_before_min: 60 } },
    { kind: 'email_trigger', title: 'RH', trigger: { from: 'rh@x.com', subject: 'prop', query: 'q', criteria: 'c' }, branches: { positive: 'p', negative: 'n', neutral: 'u' } },
    { kind: 'reminder', title: 'x', when: 'blah' },
    { kind: 'reminder', title: 'x', at: '2020-01-01T00:00' },
  ];
  for (const l of ['pt-BR', 'en', 'es'] as const) {
    const fx = (legacy as unknown as Record<string, Record<string, unknown>>)[l];
    it(`${l}: cartão, erros, avisos, datas, modelos e tela`, () => {
      const norm = SPECS.map((s) => {
        const r = normalizeSpec(s as never, NOW, TZ, l);
        return r.ok ? { notes: r.notes, lines: summaryLines(r.task, { lang: l, calendar: 'vertal' }), g: summaryLines(r.task, { lang: l, calendar: 'google' }) } : r;
      });
      expect(norm).toEqual(fx.norm);
      expect(formatLocal(NOW, TZ, l)).toBe(fx.fmt);
      expect(templatesFor(l)).toEqual(fx.tpl);
      const text = flat(schedText(l)) as Record<string, unknown>;
      for (const [k, v] of Object.entries(fx.text as Record<string, unknown>)) expect([k, text[k]]).toEqual([k, v]);
      expect(schedText(l).kind).toEqual(fx.kind);
      const ui = flat(schedUi(schedulerUiLang(l))) as Record<string, unknown>;
      for (const [k, v] of Object.entries(fx.ui as Record<string, unknown>)) expect([k, ui[k]]).toEqual([k, v]);
    });
  }
  it('sem idioma = pt-BR, como antes', () => {
    const r = normalizeSpec({ kind: 'reminder', title: 'T', when: 'amanhã às 9h' } as never, NOW, TZ);
    expect(summaryLines((r as unknown as { task: never }).task)).toEqual((legacy as unknown as { noLang: string[] }).noLang);
  });
});

describe('dicionário único: todo idioma tem toda chave', () => {
  registerSchedulerLangs(SCHEDULER_LANG_DATA);
  const bases = SCHED_LANGS.filter((m) => !m.parent);

  it('cobre os 65 idiomas/variantes pedidos', () => {
    expect(SCHED_LANGS).toHaveLength(65);
    for (const code of ['ru', 'tr', 'zh-Hans', 'zh-Hant', 'ar', 'ko', 'ms', 'fr', 'it', 'de', 'pl', 'ja', 'hi', 'en', 'pt-BR', 'pt-PT', 'es', 'cs', 'he',
      'nl', 'sv', 'nb', 'da', 'fi', 'el', 'hu', 'ro', 'uk', 'bg', 'hr', 'vi', 'th', 'id', 'fil', 'fa', 'ur', 'bn', 'sw', 'ca',
      'nl-BE', 'fr-BE', 'de-CH', 'fr-CH', 'it-CH', 'rm',
      'sk', 'sl', 'sr', 'lt', 'lv', 'et', 'is', 'ga', 'cy', 'eu', 'gl', 'sq', 'mk', 'bs', 'hy', 'ka', 'az', 'kk', 'uz', 'ta']) {
      expect(SCHED_LANGS.map((m) => m.code)).toContain(code);
    }
  });

  for (const m of bases) {
    it(`${m.code}: todas as chaves obrigatórias, sem vazio`, () => {
      const raw = rawSchedStrings(m.code);
      expect(raw, `${m.code} não registrado`).toBeDefined();
      const missing = SCHED_REQUIRED_KEYS.filter((k) => !raw![k]?.trim());
      expect(missing).toEqual([]);
    });
  }

  it('pt-BR resolve também todas as opcionais (é a reserva de qualquer chave faltando)', () => {
    expect(SCHED_OPTIONAL_KEYS.filter((k) => !sget('pt-BR', k))).toEqual([]);
  });

  it('marcadores {n}, {t}, {title}… iguais aos do pt-BR em todo idioma', () => {
    const bad: string[] = [];
    for (const m of SCHED_LANGS) {
      for (const [k, v] of Object.entries(rawSchedStrings(m.code) ?? {})) {
        if (k === 'dow' || k === 'at') continue;
        if (v !== undefined && placeholders(v) !== placeholders(sget('pt-BR', k as SchedKey))) bad.push(`${m.code}.${k}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('nenhum idioma deixa chave sem texto (com herança, apelido e reserva pt-BR)', () => {
    for (const m of SCHED_LANGS) {
      for (const k of [...SCHED_REQUIRED_KEYS, ...SCHED_OPTIONAL_KEYS]) {
        if (k === 'dow' || k === 'at') continue;
        expect(sget(m.code, k), `${m.code}.${k}`).not.toBe('');
      }
    }
  });

  it('chave faltando cai no pt-BR; variante herda do idioma-base', () => {
    registerSchedulerLangs({ ...SCHEDULER_LANG_DATA, it: { ...SCHEDULER_LANG_DATA.it, save: undefined } });
    expect(sget('it', 'save')).toBe('Salvar');
    registerSchedulerLangs(SCHEDULER_LANG_DATA);
    expect(sget('it', 'save')).toBe('Salva');
    expect(sget('fr-CH', 'button')).toBe(sget('fr', 'button'));
    expect(sget('pt-PT', 'save')).toBe('Guardar');
    expect(sget('pt-PT', 'button')).toBe('Tarefas');
  });

  it('de-CH: sem ß', () => {
    const de = SCHED_REQUIRED_KEYS.map((k) => sget('de', k)).join(' ');
    const ch = SCHED_REQUIRED_KEYS.map((k) => sget('de-CH', k)).join(' ');
    expect(de).toContain('ß');
    expect(ch).not.toContain('ß');
    expect(ch).toContain('ss');
  });

  it('seletor de Idioma: cada idioma no próprio nome', () => {
    const labels = Object.fromEntries(LANG_CHOICES.map((c) => [c.value, c.label('fr')]));
    expect(labels.auto).toBe('Automatique');
    expect(labels.ja).toBe('日本語');
    expect(labels.ar).toBe('العربية');
    expect(labels['de-CH']).toBe('Deutsch (Schweiz)');
    expect(LANG_CHOICES).toHaveLength(66);
  });
});

describe('textos no idioma', () => {
  registerSchedulerLangs(SCHEDULER_LANG_DATA);
  it('lembrete, cartão e modelos em francês, russo, árabe, japonês, híndi', () => {
    expect(schedText('fr').reminder).toBe('Rappel');
    expect(schedText('ja').kind.reminder).not.toBe('Reminder');
    expect(schedText('ru').failed('X', 3, 'e')).toContain('«X»');
    expect(schedTemplates('ar')[0].example).toMatch(/[\u0600-\u06FF]/);
    expect(schedTemplates('hi')[0].example).toMatch(/[\u0900-\u097F]/);
    expect(schedUiText('ja').button).toBe('タスク');
  });
  it('idioma desconhecido → inglês; nenhum → pt-BR', () => {
    expect(schedText('xx').reminder).toBe('Reminder');
    expect(schedText(null).reminder).toBe('Lembrete');
  });
  it('cartão de permissão traduzido', () => {
    const l = approvalLabels('ar');
    expect(l.dir).toBe('rtl');
    expect(l.title).toMatch(/[\u0600-\u06FF]/);
    expect(approvalLabels('pt-BR')).toMatchObject({ title: 'Permitir esta ação?', allow: 'Permitir', deny: 'Não permitir', method: 'TAREFA AGENDADA' });
    expect(approvalLabels('en').method).toBe('SCHEDULED TASK');
  });
  it('RTL: árabe, hebraico, persa, urdu', () => {
    for (const l of ['ar', 'he', 'fa', 'ur']) {
      expect(isRtl(l)).toBe(true);
      expect(schedUi(l).dir).toBe('rtl');
    }
    expect(isRtl('ja')).toBe(false);
    expect(schedUi('fr').dir).toBe('ltr');
  });
  it('nome do idioma em português para o executor', () => {
    expect(langName('ru')).toBe('russo (русский)');
    expect(langName('fr')).toBe('francês (français)');
    expect(nativeLangName('ko')).toBe('한국어');
  });
});

describe('datas no idioma (Intl)', () => {
  registerSchedulerLangs(SCHEDULER_LANG_DATA);
  it('formatLocal e describeSchedule usam o locale', () => {
    expect(formatLocal(NOW, TZ, 'fr')).toMatch(/mer\.?/);
    expect(formatLocal(NOW, TZ, 'de')).toMatch(/Mi\.?/);
    expect(formatLocal(NOW, TZ, 'ja')).toMatch(/水/);
    expect(formatLocal(NOW, TZ, 'ru')).toMatch(/ср/);
    expect(describeSchedule({ type: 'weekly', days: [1, 3], time: '08:00' }, TZ, 'fr')).toMatch(/lun\.?.*mer\.?.*08:00/);
    expect(describeSchedule({ type: 'daily', time: '08:00' }, TZ, 'ja')).toContain('08:00');
    expect(intlLocale('zh-Hant')).toBe('zh-TW');
  });
});

describe('idioma do pedido', () => {
  it('normLang entende variantes e apelidos', () => {
    expect(normLang('zh-TW')).toBe('zh-Hant');
    expect(normLang('zh-CN')).toBe('zh-Hans');
    expect(normLang('zh')).toBe('zh-Hans');
    expect(normLang('de-CH')).toBe('de-CH');
    expect(normLang('de-AT')).toBe('de');
    expect(normLang('nl_BE')).toBe('nl-BE');
    expect(normLang('fr-CA')).toBe('fr');
    expect(normLang('no')).toBe('nb');
    expect(normLang('iw')).toBe('he');
    expect(normLang('tl')).toBe('fil');
    expect(normLang('pt-PT')).toBe('pt-PT');
    expect(normLang('French')).toBe('fr');
    expect(normLang('日本語')).toBe('ja');
    expect(schedLang('rm-CH')).toBe('rm');
    expect(resolveLang({ spec: { locale: 'ar-EG' } })).toBe('ar');
  });
  it('detecta pela escrita', () => {
    expect(detectLang('Напомни мне завтра в 9 утра')).toBe('ru');
    expect(detectLang('Нагадай мені завтра о 9 ранку')).toBe('uk');
    expect(detectLang('明日の9時に思い出させて')).toBe('ja');
    expect(detectLang('明天早上9点提醒我')).toBe('zh-Hans');
    expect(detectLang('明天早上9點鐘提醒我，這個很重要')).toBe('zh-Hant');
    expect(detectLang('내일 오전 9시에 알려줘')).toBe('ko');
    expect(detectLang('ذكرني غدا الساعة 9 صباحا')).toBe('ar');
    expect(detectLang('فردا ساعت ۹ صبح یادم بنداز')).toBe('fa');
    expect(detectLang('مجھے کل صبح 9 بجے یاد دلانا')).toBe('ur');
    expect(detectLang('תזכיר לי מחר בתשע')).toBe('he');
    expect(detectLang('मुझे कल सुबह 9 बजे याद दिलाना')).toBe('hi');
    expect(detectLang('Θύμισέ μου αύριο στις 9')).toBe('el');
    expect(detectLang('เตือนฉันพรุ่งนี้ 9 โมง')).toBe('th');
    expect(detectLang('Ертең сағат 9-да еске салыңыз')).toBe('kk');
  });
  it('detecta outros idiomas latinos sem mexer em pt/en/es', () => {
    expect(detectLang('Rappelle-moi demain à 9 heures de payer la facture')).toBe('fr');
    expect(detectLang('Erinnere mich morgen um 9 Uhr an die Rechnung')).toBe('de');
    expect(detectLang('Ricordami domani alle 9 di pagare la bolletta')).toBe('it');
    expect(detectLang('Przypomnij mi jutro o 9 żeby zapłacić rachunek')).toBe('pl');
    expect(detectLang('Yarın saat 9da bana faturayı hatırlat')).toBe('tr');
    expect(detectLang('Remind me in 2 minutes to drink water')).toBe('en');
    expect(detectLang('Recuérdame en 2 minutos tomar agua')).toBe('es');
    expect(detectLang('me lembre daqui 2 minutos de beber água')).toBe('pt-BR');
    expect(detectLang('ok')).toBeNull();
  });
  it('a ferramenta entra no prompt também para pedidos em outros idiomas', () => {
    for (const t of ['Rappelle-moi demain à 9h', 'Erinnere mich morgen', 'Напомни мне через 5 минут', '明日の9時にリマインドして', 'ذكرني غدا', 'मुझे कल याद दिलाना', '내일 알려줘', '明天提醒我']) {
      expect(wantsScheduler([t]), t).toBe(true);
    }
    expect(wantsScheduler(['Qual é a capital da França?'])).toBe(false);
  });
});

describe('idiomas sem leitor de datas: horário explícito em ISO, validado no servidor', () => {
  registerSchedulerLangs(SCHEDULER_LANG_DATA);
  const at = '2026-11-26T09:00:00+01:00';
  const cases: Array<[string, string, string]> = [
    ['fr', 'Payer la facture', 'demain à 9 h'],
    ['de', 'Rechnung bezahlen', 'morgen um 9 Uhr'],
    ['ru', 'Оплатить счёт', 'завтра в 9 утра'],
    ['ja', '請求書を支払う', '明日の9時'],
    ['ar', 'دفع الفاتورة', 'غدا الساعة 9'],
  ];
  for (const [lang, title, when] of cases) {
    it(`${lang}: "at" com fuso vira o horário exato; o texto de "when" sozinho não é adivinhado`, () => {
      const ok = normalizeSpec({ kind: 'reminder', title, when, at, timezone: 'Europe/Paris', lang }, NOW, TZ, lang);
      expect(ok.ok).toBe(true);
      const task = (ok as { task: { schedule: { type: string; at: string }; timezone: string } }).task;
      expect(task.schedule).toEqual({ type: 'once', at: '2026-11-26T08:00:00.000Z' });
      expect(task.timezone).toBe('Europe/Paris');
      const lines = summaryLines(task as never, { lang });
      expect(lines[0]).toBe(`${schedText(lang).kind.reminder}: ${title}`);
      const only = normalizeSpec({ kind: 'reminder', title, when }, NOW, TZ, lang);
      expect(only).toEqual({ ok: false, error: schedText(lang).errWhen });
    });
  }
  it('validação do ISO', () => {
    expect(parseExplicitIso('2026-11-26T09:00', 'Asia/Tokyo', NOW)).toBe(Date.parse('2026-11-26T00:00:00Z'));
    expect(parseExplicitIso('2026-02-30T09:00:00+09:00', TZ, NOW)).toBeNull();
    expect(parseExplicitIso('2026-11-26T25:00', TZ, NOW)).toBeNull();
    expect(parseExplicitIso('amanhã', TZ, NOW)).toBeNull();
    expect(parseExplicitIso('2040-01-01T09:00:00Z', TZ, NOW)).toBeNull();
    expect(normalizeSpec({ kind: 'reminder', title: 'x', at: '2026-11-20T09:00:00+01:00' }, NOW, TZ, 'de'))
      .toEqual({ ok: false, error: schedText('de').errPast });
    // fuso inválido do modelo: cai no do usuário (não em São Paulo por engano)
    const r = normalizeSpec({ kind: 'reminder', title: 'x', at: '2026-11-26T09:00', timezone: 'Mars/Base' }, NOW, 'Asia/Tokyo', 'ja');
    expect((r as { task: { timezone: string } }).task.timezone).toBe('Asia/Tokyo');
  });
  it('repetição e consulta continuam sem texto de data', () => {
    const r = normalizeSpec({ kind: 'task', prompt: 'ニュース', repeat: { every: 'day', time: '08:00' } }, NOW, 'Asia/Tokyo', 'ja');
    expect(r.ok).toBe(true);
    const a = normalizeSpec({ kind: 'appointment', title: 'Dentiste', appointment: { start: '2026-11-27T15:00:00+01:00' } }, NOW, 'Europe/Paris', 'fr');
    expect(a.ok).toBe(true);
  });
  it('pedido em outro idioma com "when" em inglês ainda usa o leitor', () => {
    const r = normalizeSpec({ kind: 'reminder', title: 'x', when: 'in 10 minutes' }, NOW, TZ, 'fr');
    expect(r.ok).toBe(true);
  });
});
