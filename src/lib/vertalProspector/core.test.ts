import { describe, expect, it } from 'vitest';
import {
  buildOverpassQuery, candidateEmails, classifyEmail, classifyInbound, csvCell, dailyCap, detectSignals, extractCnpjs, extractEmails,
  extractPhones, hasMxAnswer, inferPattern, isBlocked, isProspectCommand, isProspectorEnabled, isPublicHost, isValidCnpj, leadsToCsv,
  meetingSlots, normalizeDnc, normalizeWebsite, optOutFooter, overpassAreaId, parseIcp, parseOverpassElements, parseProspectCommand,
  pickInternalLinks, sendGate, textProblems, waLink, WRITE_SYSTEM, ANALYZE_SYSTEM, REPLY_SYSTEM, ENRICH_SYSTEM, type GateInput,
} from '../../../supabase/functions/_shared/vertalProspector/core';

const ME = '5441b397-7be8-44fc-87e8-8057fdb79a0e';

describe('interruptor do Vertal Prospector', () => {
  it('desligado por padrão e lista vazia = ninguém', () => {
    expect(isProspectorEnabled({}, ME)).toBe(false);
    expect(isProspectorEnabled({ VERTAL_PROSPECTOR_ENABLED: 'true' }, ME)).toBe(false);
    expect(isProspectorEnabled({ VERTAL_PROSPECTOR_ENABLED: 'false', VERTAL_PROSPECTOR_USER_IDS: ME }, ME)).toBe(false);
  });
  it('liga só para quem está na lista', () => {
    const env = { VERTAL_PROSPECTOR_ENABLED: 'true', VERTAL_PROSPECTOR_USER_IDS: ` ${ME.toUpperCase()} ,outro` };
    expect(isProspectorEnabled(env, ME)).toBe(true);
    expect(isProspectorEnabled(env, '11111111-1111-4111-8111-111111111111')).toBe(false);
    expect(isProspectorEnabled(env, null)).toBe(false);
  });
  it('limite diário: padrão 20, teto 50', () => {
    expect(dailyCap({})).toBe(20);
    expect(dailyCap({ VERTAL_PROSPECTOR_DAILY_CAP: '5' })).toBe(5);
    expect(dailyCap({ VERTAL_PROSPECTOR_DAILY_CAP: '500' })).toBe(50);
  });
});

describe('CNPJ, site e SSRF', () => {
  it('valida dígitos do CNPJ', () => {
    expect(isValidCnpj('65.822.139/0001-66')).toBe(true);
    expect(isValidCnpj('11.111.111/1111-11')).toBe(false);
    expect(isValidCnpj('65822139000167')).toBe(false);
  });
  it('normaliza site e recusa hosts internos', () => {
    expect(normalizeWebsite('vertal.dev')).toBe('https://vertal.dev/');
    expect(normalizeWebsite('http://localhost:3000')).toBeNull();
    expect(normalizeWebsite('https://192.168.0.1/admin')).toBeNull();
    expect(normalizeWebsite('https://user:pw@site.com')).toBeNull();
    expect(isPublicHost('169.254.169.254')).toBe(false);
    expect(isPublicHost('empresa.com.br')).toBe(true);
  });
});

describe('ICP e mapa', () => {
  it('aceita só categorias do mapa da lista e tira repetidas', () => {
    const icp = parseIcp({ summary: 'x', area: 'Campinas, SP', osmTags: ['amenity=dentist', { key: 'shop', value: 'bakery' }, 'amenity=dentist', 'evil="]; out;', 'foo=bar'] });
    expect(icp.osmTags).toEqual([{ key: 'amenity', value: 'dentist' }, { key: 'shop', value: 'bakery' }]);
  });
  it('monta a consulta do mapa sem injeção', () => {
    const q = buildOverpassQuery([{ key: 'amenity', value: 'dentist' }], overpassAreaId('relation', 298580)!, 50);
    expect(q).toContain('area(id:3600298580)');
    expect(q).toContain('nwr["amenity"="dentist"]["name"](area.a);');
    expect(q).toContain('out center tags 50;');
    expect(overpassAreaId('node', 1)).toBeNull();
  });
  it('converte elementos em leads sem duplicar domínio', () => {
    const leads = parseOverpassElements({
      elements: [
        { type: 'node', id: 1, tags: { name: 'Clínica Sorriso', amenity: 'dentist', website: 'https://www.sorriso.com.br', phone: '+55 19 3333-4444', 'addr:city': 'Campinas' } },
        { type: 'way', id: 2, tags: { name: 'Sorriso Filial', amenity: 'dentist', website: 'sorriso.com.br' } },
        { type: 'node', id: 3, tags: { amenity: 'dentist' } },
        { type: 'node', id: 4, tags: { name: 'Dr. Dente', amenity: 'dentist', email: 'contato@drdente.com.br' } },
      ],
    }, [{ key: 'amenity', value: 'dentist' }]);
    expect(leads.map((l) => l.name)).toEqual(['Clínica Sorriso', 'Dr. Dente']);
    expect(leads[0].domain).toBe('sorriso.com.br');
    expect(leads[0].category).toBe('amenity=dentist');
  });
});

describe('leitura de site', () => {
  const html = `<html><body><a href="/contato">Fale conosco</a><a href="https://outro.com/x">x</a><a href="/sobre-nos">Quem somos</a>
    <p>Dra. Ana Paula Souza — diretora</p><a href="mailto:ana.souza@sorriso.com.br">e-mail</a> contato@sorriso.com.br logo@2x.png
    <a href="https://wa.me/5519999998888">WhatsApp</a> (19) 3333-4444 CNPJ 65.822.139/0001-66 © 2019 Sorriso <form>e-mail mensagem</form></body></html>`;
  it('extrai e-mails, telefones, WhatsApp e CNPJ', () => {
    expect(extractEmails(html).sort()).toEqual(['ana.souza@sorriso.com.br', 'contato@sorriso.com.br']);
    expect(extractPhones(html).whatsapp).toEqual(['5519999998888']);
    expect(extractPhones(html).phones).toContain('1933334444');
    expect(extractCnpjs(html)).toEqual(['65822139000166']);
  });
  it('escolhe só links internos úteis', () => {
    expect(pickInternalLinks(html, 'https://sorriso.com.br')).toEqual(['https://sorriso.com.br/contato', 'https://sorriso.com.br/sobre-nos']);
  });
  it('detecta sinais objetivos', () => {
    const s = detectSignals(html, 'https://sorriso.com.br');
    expect(s.whatsappButton).toBe(true);
    expect(s.contactForm).toBe(true);
    expect(s.onlineBooking).toBe(false);
    expect(s.copyrightYear).toBe(2019);
  });
});

describe('e-mail do decisor', () => {
  it('descobre padrão e monta candidatos', () => {
    expect(inferPattern('ana.souza@sorriso.com.br', 'Ana Paula Souza')).toBe('first.last');
    expect(candidateEmails('José da Silva', 'empresa.com.br')[0]).toBe('jose@empresa.com.br');
    expect(candidateEmails('José da Silva', 'empresa.com.br', 'first.last')).toEqual(['jose.silva@empresa.com.br']);
  });
  it('classifica verificado/arriscado/palpite/inválido', () => {
    expect(classifyEmail({ email: 'a@b.com', published: true, patternConfirmed: false, hasMx: true })).toBe('verified');
    expect(classifyEmail({ email: 'a@b.com', published: false, patternConfirmed: true, hasMx: true })).toBe('risky');
    expect(classifyEmail({ email: 'a@b.com', published: false, patternConfirmed: false, hasMx: true })).toBe('guess');
    expect(classifyEmail({ email: 'a@b.com', published: true, patternConfirmed: false, hasMx: false })).toBe('invalid');
    expect(classifyEmail({ email: 'a@b.com', published: true, patternConfirmed: false, hasMx: true, blocked: true })).toBe('invalid');
    expect(classifyEmail({ email: null, published: false, patternConfirmed: false, hasMx: null })).toBe('unknown');
  });
  it('lê MX do DNS-over-HTTPS', () => {
    expect(hasMxAnswer({ Status: 0, Answer: [{ type: 15, data: '10 mx.empresa.com.' }] })).toBe(true);
    expect(hasMxAnswer({ Status: 0, Answer: [] })).toBe(false);
    expect(hasMxAnswer({ Status: 3 })).toBe(false);
    expect(hasMxAnswer(null)).toBeNull();
  });
});

describe('não contatar, descadastro e respostas', () => {
  it('lista de não contatar por e-mail, domínio e telefone', () => {
    const dnc = [{ kind: 'domain', value: 'sorriso.com.br' }, { kind: 'phone', value: '5519999998888' }];
    expect(isBlocked(dnc, { email: 'x@sorriso.com.br' })).toBe(true);
    expect(isBlocked(dnc, { phone: '(19) 99999-8888' })).toBe(true);
    expect(isBlocked(dnc, { email: 'x@outra.com' })).toBe(false);
    expect(normalizeDnc('domain', 'https://www.Sorriso.com.br/x')).toBe('sorriso.com.br');
  });
  it('rodapé sempre tem a saída e a origem do contato', () => {
    const f = optOutFooter({ name: 'Laércio', company: 'Vertal Company' });
    expect(f).toMatch(/responder "parar"/);
    expect(f).toMatch(/fonte pública/);
  });
  it('classifica respostas sem modelo', () => {
    expect(classifyInbound('Mail Delivery Subsystem <mailer-daemon@googlemail.com>', 'Delivery Status Notification', '')).toBe('bounce');
    expect(classifyInbound('ana@x.com', 'Re: oi', 'Estou ausente até segunda.')).toBe('auto_reply');
    expect(classifyInbound('ana@x.com', 'Re: oi', 'Por favor, pare de me mandar e-mail.')).toBe('opt_out');
    expect(classifyInbound('ana@x.com', 'Re: oi', 'Me tire da lista')).toBe('opt_out');
    expect(classifyInbound('ana@x.com', 'Re: oi', 'Tenho interesse, como funciona?\n\nEm qua, 26/11, Laércio escreveu:\n> ... responder "parar".')).toBe('reply');
  });
});

describe('portão de envio', () => {
  const base: GateInput = {
    channel: 'email', kind: 'first', subject: 'agenda da clínica', body: 'Olá, Ana. Vi que a clínica não tem agendamento online. Hoje os pacientes marcam só por telefone?',
    status: 'approved', to: 'ana@sorriso.com.br', emailStatus: 'verified', blocked: false, sentToday: 0, cap: 20,
  };
  it('passa quando tudo está certo', () => expect(sendGate(base)).toEqual([]));
  it('nunca envia sem aprovação', () => expect(sendGate({ ...base, status: 'draft' })).toContain('mensagem não aprovada'));
  it('respeita lista de não contatar, descadastro e resposta da empresa', () => {
    expect(sendGate({ ...base, blocked: true })).toContain('contato na lista de não contatar');
    expect(sendGate({ ...base, leadStatus: 'opted_out' }).length).toBeGreaterThan(0);
    expect(sendGate({ ...base, kind: 'followup1', companyReplied: true })).toContain('a empresa já respondeu: a sequência parou');
  });
  it('limite diário e qualidade do e-mail', () => {
    expect(sendGate({ ...base, sentToday: 20 })).toContain('limite diário atingido (20 envios)');
    expect(sendGate({ ...base, emailStatus: 'guess' }).join()).toMatch(/palpite/);
    expect(sendGate({ ...base, emailStatus: 'risky' }).join()).toMatch(/arriscado/);
    expect(sendGate({ ...base, emailStatus: 'risky', allowRisky: true })).toEqual([]);
  });
  it('recusa campos sem preencher, frases proibidas, links e textos longos', () => {
    expect(textProblems('email', 'first', 'oi', 'Olá {{nome}}').join()).toMatch(/mesclagem/);
    expect(textProblems('email', 'first', 'oi', 'Espero que esteja bem. Tudo certo?').join()).toMatch(/proibida/);
    expect(textProblems('email', 'first', 'oi', 'Veja https://vertal.dev').join()).toMatch(/link/);
    expect(textProblems('email', 'first', 'oi', 'palavra '.repeat(200)).join()).toMatch(/longo/);
  });
});

describe('WhatsApp, reuniões e CSV', () => {
  it('wa.me só monta link (envio é do usuário)', () => {
    expect(waLink('(19) 99999-8888', 'Oi, tudo bem?')).toBe('https://wa.me/5519999998888?text=Oi%2C%20tudo%20bem%3F');
    expect(waLink('123', 'x')).toBeNull();
  });
  it('sugere dias úteis em horário de Brasília', () => {
    const slots = meetingSlots(new Date('2026-11-27T15:00:00Z')); // sexta
    expect(slots[0].label).toBe('seg, 30/11 às 10h');
    expect(slots[0].iso).toBe('2026-11-30T13:00:00.000Z');
    expect(slots).toHaveLength(6);
  });
  it('CSV escapa e evita fórmula', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    const csv = leadsToCsv([{ name: 'A, B', email: 'a@b.com', email_status: 'verified', signals: { list: ['x', 'y'] }, source: 'mapa' }]);
    expect(csv.split('\r\n')[1]).toContain('"A, B"');
    expect(csv).toContain('verificado');
  });
});

describe('comando do Vertal Chat', () => {
  it('reconhece e extrai empresa, CNPJ e site', () => {
    expect(isProspectCommand('prospectar clientes para Vertal Company')).toBe(true);
    expect(isProspectCommand('/prospectar')).toBe(true);
    expect(isProspectCommand('como prospectar clientes?')).toBe(false);
    expect(parseProspectCommand('prospectar clientes para Vertal Company, CNPJ 65.822.139/0001-66, site vertal.dev')).toEqual({
      companyName: 'Vertal Company', cnpj: '65822139000166', website: 'https://vertal.dev/',
    });
  });
});

describe('prompts próprios', () => {
  it('em português, só nomes Vertal e com regra anti-invenção', () => {
    for (const p of [WRITE_SYSTEM, ANALYZE_SYSTEM, REPLY_SYSTEM, ENRICH_SYSTEM]) {
      expect(p).not.toMatch(/sellbird|harvey|claude|openai|chatgpt/i);
    }
    expect(WRITE_SYSTEM).toMatch(/inventar/);
    expect(ENRICH_SYSTEM).toMatch(/Nunca invente nome/);
  });
});
