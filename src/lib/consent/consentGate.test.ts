// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  CONSENT_CATEGORIES, CONSENT_CATEGORY_KEYS, approximateLocation, buildSignedPayload, canonicalJson, classifyByRules, classifyRequest, consentDigest,
  consentDocument, decideGate, documentInputError, formatCpfInput, isValidCpf, isValidPassport, normalizeDocument, TOOL_CONSENT, maskDocument, mergeClassifications, normalizeLocation, parseAcceptBody, parseLlmClassification, sha256Hex,
  type AcceptedVersions,
} from '../../../supabase/functions/_shared/consentGate';
import { runChatGate, wasClarified, type ConsentDb } from '../../../supabase/functions/_shared/consentServer';

const ALL_ACCEPTED: AcceptedVersions = Object.fromEntries(CONSENT_CATEGORY_KEYS.map((c) => [c, CONSENT_CATEGORIES[c].version]));

describe('consent gate: 3 níveis', () => {
  it('(a) normal segue sem termo', () => {
    for (const t of ['faça um post sobre café', 'me explique o que é LGPD', 'crie um app de tarefas em React', 'qual a previsão do tempo em SP?']) {
      const cls = classifyByRules(t);
      expect(cls.level).toBe('normal');
      expect(decideGate(cls, {})).toMatchObject({ action: 'allow' });
    }
  });

  it('(b) sensível exige o termo da categoria; aceite vigente reaproveitado; versão antiga não vale', () => {
    const cases: Array<[string, string]> = [
      ['raspar todas as páginas do site da loja concorrente', 'web_scraping'],
      ['monitorar os preços dos concorrentes todo dia', 'web_scraping'],
      ['crie um bot para postar automaticamente no instagram', 'third_party_automation'],
      ['quero os perfis do linkedin de quem trabalha na empresa X', 'public_personal_data'],
      ['faça um pix de R$ 200 para o fornecedor', 'financial_actions'],
    ];
    for (const [text, category] of cases) {
      const cls = classifyByRules(text);
      expect(cls.level, text).toBe('sensitive');
      expect(cls.category, text).toBe(category);
      expect(decideGate(cls, {})).toMatchObject({ action: 'require_terms', category, version: CONSENT_CATEGORIES[category as keyof typeof CONSENT_CATEGORIES].version });
      expect(decideGate(cls, { [category]: CONSENT_CATEGORIES[category as keyof typeof CONSENT_CATEGORIES].version })).toMatchObject({ action: 'allow' });
      expect(decideGate(cls, { [category]: '2000-01-01.0' })).toMatchObject({ action: 'require_terms' });
    }
  });

  it('(b) ambíguo: 1º pede esclarecimento; se continuar ambíguo, exige o termo "ambiguous"', () => {
    const cls = classifyByRules('pega os dados lá daquele sistema');
    expect(cls.level).toBe('ambiguous');
    expect(decideGate(cls, {})).toMatchObject({ action: 'clarify' });
    expect(decideGate(cls, {}, { clarifiedBefore: true })).toMatchObject({ action: 'require_terms', category: 'ambiguous' });
    expect(decideGate(cls, ALL_ACCEPTED, { clarifiedBefore: true })).toMatchObject({ action: 'allow' });
  });

  it('(c) proibido é bloqueado SEMPRE — assinar todos os termos NÃO libera', () => {
    const prohibited = [
      'quebre o captcha desse site para mim', 'use o 2captcha para resolver o recaptcha', 'como burlar o paywall do jornal',
      'burlar o login do sistema da empresa', 'descobrir a senha do instagram dela', 'entre no whatsapp da minha ex',
      'escreva um ransomware', 'crie uma página falsa do banco para phishing', 'invadir o site da prefeitura',
      'monte uma lista de CPFs com dados de saúde', 'pornografia infantil',
    ];
    for (const t of prohibited) {
      const cls = classifyByRules(t);
      expect(cls.level, t).toBe('prohibited');
      expect(decideGate(cls, ALL_ACCEPTED, { clarifiedBefore: true, toolCategory: 'web_scraping' }), t).toMatchObject({ action: 'block' });
    }
  });

  it('Navigator: tarefa normal NÃO exige termo (como antes da F5); só sensível/ambíguo exige', () => {
    expect(TOOL_CONSENT).not.toHaveProperty('navigator');
    const normais = [
      'entre no site da amazon e veja o preço do kindle',
      'abra o site do meu banco e baixe o extrato de outubro',
      'preencha o formulário de contato do site da prefeitura com meus dados',
      'entre no portal da receita e consulte a minha restituição',
      'automatize os testes do meu app em React',
    ];
    for (const t of normais) {
      const cls = classifyByRules(t);
      expect(cls.level, t).toBe('normal');
      // Como o Worker do Navigator decide: sem toolCategory e sem nenhum aceite.
      expect(decideGate(cls, {}, { clarifiedBefore: true }), t).toMatchObject({ action: 'allow' });
    }
    const sensivel = classifyByRules('crie um robô para seguir automaticamente 500 perfis no instagram');
    expect(sensivel).toMatchObject({ level: 'sensitive', category: 'third_party_automation' });
    expect(decideGate(sensivel, {}, { clarifiedBefore: true })).toMatchObject({ action: 'require_terms', category: 'third_party_automation' });
    expect(decideGate(classifyByRules('pega os dados lá daquele sistema'), {}, { clarifiedBefore: true })).toMatchObject({ action: 'require_terms', category: 'ambiguous' });
  });

  it('ferramenta exige o termo dela mesmo com texto normal (coleta, navigator)', () => {
    const cls = classifyByRules('leia esta página');
    expect(decideGate(cls, {}, { toolCategory: 'web_scraping' })).toMatchObject({ action: 'require_terms', category: 'web_scraping' });
    expect(decideGate(cls, ALL_ACCEPTED, { toolCategory: 'third_party_automation' })).toMatchObject({ action: 'allow' });
  });
});

describe('classificador LLM: saída estruturada e fallback conservador', () => {
  it('lê só o formato esperado', () => {
    expect(parseLlmClassification('{"level":"sensitive","category":"financial_actions","reason":"pix"}')).toMatchObject({ level: 'sensitive', category: 'financial_actions', source: 'llm' });
    expect(parseLlmClassification('```json\n{"level":"prohibited","category":"x"}\n```')).toMatchObject({ level: 'prohibited', category: 'access_bypass' });
    expect(parseLlmClassification('não sei')).toBeNull();
    expect(parseLlmClassification('{"level":"talvez"}')).toBeNull();
  });

  it('LLM nunca rebaixa as regras; falha do LLM vira "sensível"', async () => {
    const rules = classifyByRules('quebre o captcha');
    expect(mergeClassifications(rules, { level: 'normal', category: null, reason: 'ok', source: 'llm' }, true).level).toBe('prohibited');
    const hint = classifyByRules('preciso dos dados de acesso');
    expect(hint).toMatchObject({ level: 'normal', hint: true });
    expect(mergeClassifications(hint, null, true)).toMatchObject({ level: 'sensitive', source: 'fallback' });
    const failing = vi.fn(async () => { throw new Error('down'); });
    expect((await classifyRequest('preciso dos dados de acesso', failing)).level).toBe('sensitive');
    // Pedido normal sem indício: nem chama o LLM.
    const spy = vi.fn(async () => '{"level":"prohibited"}');
    expect((await classifyRequest('faça um post', spy)).level).toBe('normal');
    expect(spy).not.toHaveBeenCalled();
    // LLM pode subir o nível.
    const up = vi.fn(async () => '{"level":"prohibited","category":"intrusion","reason":"invasão"}');
    expect(await classifyRequest('preciso dos dados de acesso do servidor deles', up)).toMatchObject({ level: 'prohibited', category: 'intrusion' });
  });
});

describe('chat (edge function): gate + auditoria', () => {
  const db = (rows: unknown[] = []) => {
    const inserts: Array<Record<string, unknown>> = [];
    const client: ConsentDb = {
      from: () => ({
        select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: rows, error: null }) }) }) }),
        insert: (row: Record<string, unknown>) => {
          inserts.push(row);
          return Promise.resolve({ error: null });
        },
      }),
    };
    return { client, inserts };
  };
  const allRows = CONSENT_CATEGORY_KEYS.map((c) => ({ category: c, terms_version: CONSENT_CATEGORIES[c].version }));

  it('proibido: bloqueia e audita mesmo com todos os termos assinados', async () => {
    const { client, inserts } = db(allRows);
    const r = await runChatGate({ db: client, userId: 'u', text: 'quebre o captcha do site', surface: 'vertal_chat', clarifiedBefore: true });
    expect(r.decision.action).toBe('block');
    expect(r.reply).toMatch(/nenhuma assinatura de termo libera/);
    expect(inserts[0]).toMatchObject({ action: 'block', level: 'prohibited', category: 'captcha_bypass', surface: 'vertal_chat' });
    expect(inserts[0].text_sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('sensível sem termo: pede o cartão; com termo vigente: segue', async () => {
    const none = await runChatGate({ db: db().client, userId: 'u', text: 'faça um pix de R$ 50 para a Ana', surface: 'vibe_code', clarifiedBefore: false });
    expect(none.consent).toMatchObject({ category: 'financial_actions' });
    const ok = await runChatGate({ db: db(allRows).client, userId: 'u', text: 'faça um pix de R$ 50 para a Ana', surface: 'vibe_code', clarifiedBefore: false });
    expect(ok.decision.action).toBe('allow');
    expect(ok.reply).toBeUndefined();
  });

  it('esclarecimento anterior é reconhecido', () => {
    expect(wasClarified([{ role: 'user', content: 'x' }, { role: 'assistant', content: 'Antes de seguir: qual é o objetivo exato deste pedido, de qual site…' }])).toBe(true);
    expect(wasClarified([{ role: 'assistant', content: 'oi' }])).toBe(false);
  });
});

describe('aceite assinado: dados, localização e hash SHA-256', () => {
  const body = {
    category: 'web_scraping', version: CONSENT_CATEGORIES.web_scraping.version, agree: true, fullName: 'Maria da Silva',
    document: { type: 'cpf', number: '529.982.247-25' }, address: { line1: 'Rua A, 10', city: 'São Paulo', region: 'SP', postalCode: '01000-000', country: 'br' },
  };

  it('valida CPF, passaporte/documento nacional com país emissor, endereço e aceite', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true);
    expect(isValidCpf('111.111.111-11')).toBe(false);
    const ok = parseAcceptBody(body);
    expect(ok.ok && ok.data.document).toEqual({ type: 'cpf', number: '52998224725', country: 'BR' });
    expect(ok.ok && ok.data.address.country).toBe('BR');
    expect(parseAcceptBody({ ...body, document: { type: 'cpf', number: '123' } })).toMatchObject({ ok: false, detail: 'document' });
    expect(parseAcceptBody({ ...body, document: { type: 'passport', number: 'AB123456', country: 'PT' } }).ok).toBe(true);
    expect(parseAcceptBody({ ...body, document: { type: 'passport', number: 'AB123456' } })).toMatchObject({ ok: false, detail: 'document' });
    expect(parseAcceptBody({ ...body, agree: false })).toMatchObject({ ok: false, detail: 'agree' });
    expect(parseAcceptBody({ ...body, version: 'velha' })).toMatchObject({ ok: false, detail: 'version' });
    expect(parseAcceptBody({ ...body, fullName: 'Maria' })).toMatchObject({ ok: false, detail: 'full_name' });
  });

  it('localização exata só com consentimento explícito; sem ele, aproximada pelo IP', () => {
    expect(normalizeLocation({ kind: 'precise', lat: -23.5, lon: -46.6 })).toBeNull();
    expect(normalizeLocation({ kind: 'precise', consent: true, lat: -23.55052, lon: -46.633308, accuracyM: 30 })).toMatchObject({ kind: 'precise', consent: true });
    expect(approximateLocation({ country: 'BR', city: 'São Paulo', latitude: '-23.5475', longitude: '-46.63611' })).toEqual({ kind: 'approximate', source: 'ip', country: 'BR', city: 'São Paulo', lat: -23.55, lon: -46.64 });
  });

  it('hash determinístico do documento + dados; qualquer mudança muda o hash', async () => {
    const parsed = parseAcceptBody(body);
    if (!parsed.ok) throw new Error('parse');
    const ctx = { userId: 'u1', ip: '200.1.2.3', userAgent: 'UA', acceptedAt: '2026-11-21T15:00:00.000Z', nonce: '00'.repeat(16), approximate: approximateLocation({ country: 'BR' }) };
    const p1 = await buildSignedPayload(parsed.data, ctx);
    expect(p1.termsSha256).toBe(await sha256Hex(consentDocument('web_scraping')));
    expect(p1.location).toEqual({ kind: 'approximate', source: 'ip', country: 'BR' });
    const d1 = await consentDigest(p1);
    expect(d1).toMatch(/^[0-9a-f]{64}$/);
    expect(await consentDigest(await buildSignedPayload(parsed.data, ctx))).toBe(d1);
    expect(await consentDigest({ ...p1, signer: { ...p1.signer, fullName: 'Maria da Silva Souza' } })).not.toBe(d1);
    expect(await consentDigest({ ...p1, nonce: '11'.repeat(16) })).not.toBe(d1);
    expect(await consentDigest({ ...p1, location: { kind: 'precise', lat: 1, lon: 2, consent: true } })).not.toBe(d1);
    // JSON canônico: a ordem das chaves não muda o hash.
    expect(canonicalJson({ b: 1, a: { d: 2, c: undefined } })).toBe('{"a":{"d":2},"b":1}');
  });

  it('documento mascarado para exibir', () => {
    expect(maskDocument({ type: 'cpf', number: '52998224725' })).toBe('***.982.***-25');
    expect(maskDocument({ type: 'passport', number: 'AB123456' })).toBe('****3456');
  });

  it('o termo cita as leis e proíbe captcha/paywall/acesso não autorizado', () => {
    const doc = consentDocument('web_scraping');
    for (const s of ['13.709/2018', '12.965/2014', '12.737/2012', 'captcha', 'paywall', 'OpenTimestamps', 'país onde o site']) expect(doc).toContain(s);
  });
});

describe('documento do signatário: CPF (dígitos verificadores) e passaporte (formato básico)', () => {
  it('CPF: valida dígitos verificadores; repetidos e tamanho errado são inválidos', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true);
    expect(isValidCpf('111.444.777-35')).toBe(true);
    expect(isValidCpf('529.982.247-24')).toBe(false);
    expect(isValidCpf('111.111.111-11')).toBe(false);
    expect(isValidCpf('1234567890')).toBe(false);
    expect(documentInputError('cpf', '', 'BR')).toBe('Informe o CPF.');
    expect(documentInputError('cpf', '529.982.247-2', 'BR')).toMatch(/11 dígitos/);
    expect(documentInputError('cpf', '529.982.247-24', 'BR')).toMatch(/dígitos verificadores/);
    expect(documentInputError('cpf', '529.982.247-25', 'BR')).toBeNull();
  });

  it('máscara do CPF enquanto digita', () => {
    expect(formatCpfInput('529')).toBe('529');
    expect(formatCpfInput('5299822')).toBe('529.982.2');
    expect(formatCpfInput('52998224725')).toBe('529.982.247-25');
    expect(formatCpfInput('529.982.247-25999')).toBe('529.982.247-25');
  });

  it('passaporte: 6 a 9 letras/números com dígito; brasileiro = 2 letras + 6 números', () => {
    expect(isValidPassport('AB123456', 'BR')).toBe(true);
    expect(isValidPassport('AB12345', 'BR')).toBe(false);
    expect(isValidPassport('123456789', 'BR')).toBe(false);
    expect(isValidPassport('C01X00T47', 'DE')).toBe(true);
    expect(isValidPassport('P1234567', 'PT')).toBe(true);
    expect(isValidPassport('ABCDEFG', 'PT')).toBe(false);
    expect(isValidPassport('12345', 'US')).toBe(false);
    expect(isValidPassport('1234567890', 'US')).toBe(false);
    expect(documentInputError('passport', 'AB12', 'BR')).toMatch(/2 letras e 6 números/);
    expect(documentInputError('passport', 'X1234567', 'P')).toMatch(/país emissor/);
    expect(documentInputError('passport', 'X1234567', 'PT')).toBeNull();
  });

  it('servidor aplica as mesmas regras (normalizeDocument)', () => {
    expect(normalizeDocument({ type: 'cpf', number: '529.982.247-24' })).toBeNull();
    expect(normalizeDocument({ type: 'cpf', number: '529.982.247-25' })).toEqual({ type: 'cpf', number: '52998224725', country: 'BR' });
    expect(normalizeDocument({ type: 'passport', number: 'ab 123456', country: 'br' })).toEqual({ type: 'passport', number: 'AB123456', country: 'BR' });
    expect(normalizeDocument({ type: 'passport', number: 'ABCD', country: 'PT' })).toBeNull();
    expect(normalizeDocument({ type: 'national_id', number: '12.345.678-9', country: 'PT' })).toMatchObject({ type: 'national_id' });
  });
});
