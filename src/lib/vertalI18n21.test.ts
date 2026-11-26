// Vertal CRM / Growth Team / Prospector · os 21 idiomas das páginas de SEO do CRM grátis.
// Garante que toda chave do pt-BR existe (e não está vazia) em todos os idiomas, que os nomes de produto
// continuam "Vertal …", que a IA recebe o idioma do usuário e que o árabe abre em RTL.
import { describe, expect, it } from 'vitest';
import { FREE_CRM_LOCALES } from '@/config/freeCrm';
import { CRM_UI } from './vertalCrm/i18n';
import { GROWTH_UI } from './vertalGrowth/i18n';
import { DATE_INPUT_TEXT, formatDateInput, maskDateInput, parseDateInput } from './vertalCrm/dateInput';
import { WAITLIST_TEXT } from './vertalCrm/waitlist';
import { LEAD_CARD_TEXT, leadAddressLine, leadMapUrl, leadTelHref } from './vertalProspector/leadCard';
import { CONNECTORS_TITLE, preferredUiLang } from './vertalUiLang';
import { authLang } from './authI18n';
import { resolveUiLang, uiDir, uiLocale, UI_LANGS, UI_LANG_AI_NAME, UI_LANG_NAMES } from '../../supabase/functions/_shared/vertalUiLang';
import {
  aiMessages, AI_VALUE_LABELS, CRM_DEFAULT_CURRENCY, CRM_DEFAULT_WS_NAME, crmLang, defaultPipelineName, defaultStages,
} from '../../supabase/functions/_shared/vertalCrm/core';

type Tree = Record<string, unknown>;
const SAMPLE_ARGS: unknown[] = [3, 2];
const syncSample = { newLeads: 1, engaged: 2, customers: 3, atRisk: 4, drafts: 5, autoSent: 6 };

/** Caminhos de todas as folhas (strings e funções) de um dicionário. */
function leaves(o: Tree, prefix = ''): Array<[string, unknown]> {
  return Object.entries(o).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k;
    return v && typeof v === 'object' ? leaves(v as Tree, path) : [[path, v] as [string, unknown]];
  });
}

function checkDict(name: string, dicts: Record<string, Tree>) {
  const base = new Map(leaves(dicts.pt));
  describe(`${name}: 21 idiomas`, () => {
    it('tem exatamente os 21 idiomas', () => {
      expect(Object.keys(dicts).sort()).toEqual([...UI_LANGS].sort());
    });
    for (const lang of UI_LANGS) {
      it(`${lang}: toda chave do pt-BR existe, sem texto vazio nem marcador sobrando`, () => {
        const got = new Map(leaves(dicts[lang]));
        const missing = [...base.keys()].filter((k) => !got.has(k));
        const extra = [...got.keys()].filter((k) => !base.has(k));
        expect(missing, `faltando em ${lang}`).toEqual([]);
        expect(extra, `sobrando em ${lang}`).toEqual([]);
        for (const [k, v] of got) {
          const baseType = typeof base.get(k);
          expect(typeof v, `${lang}.${k}`).toBe(baseType);
          const text = typeof v === 'function'
            ? String((v as (...a: unknown[]) => unknown)(...(k.endsWith('syncDone') ? [syncSample] : k.endsWith('reminderTitle') ? ['App'] : SAMPLE_ARGS)))
            : String(v);
          expect(text.trim().length, `${lang}.${k} vazio`).toBeGreaterThan(0);
          expect(text, `${lang}.${k} com marcador`).not.toMatch(/\{\w+\}|undefined|\[object/);
        }
      });
    }
  });
}

checkDict('Vertal CRM', CRM_UI as unknown as Record<string, Tree>);
checkDict('Vertal Growth Team', GROWTH_UI as unknown as Record<string, Tree>);

describe('21 idiomas: mesmos das páginas de SEO do CRM grátis', () => {
  it('UI_LANGS = FREE_CRM_LOCALES (pt-BR = "pt")', () => {
    expect(FREE_CRM_LOCALES.map((c) => (c.code === 'pt-BR' ? 'pt' : c.code)).sort()).toEqual([...UI_LANGS].sort());
  });
  it('tabelas pequenas também cobrem os 21', () => {
    for (const table of [DATE_INPUT_TEXT, WAITLIST_TEXT, LEAD_CARD_TEXT, CONNECTORS_TITLE, UI_LANG_NAMES, UI_LANG_AI_NAME, CRM_DEFAULT_CURRENCY, CRM_DEFAULT_WS_NAME, AI_VALUE_LABELS]) {
      expect(Object.keys(table).sort()).toEqual([...UI_LANGS].sort());
    }
  });
  it('nomes de produto continuam "Vertal …" e a palavra AUTOPILOT não é traduzida', () => {
    for (const lang of UI_LANGS) {
      expect(CRM_UI[lang].title).toBe('Vertal CRM');
      expect(CRM_UI[lang].docTitle).toContain('Vertal CRM');
      expect(CRM_UI[lang].sources.prospector).toBe('Vertal Prospector');
      expect(GROWTH_UI[lang].title.startsWith('Vertal Growth')).toBe(true);
      expect(GROWTH_UI[lang].autopilotType).toContain('AUTOPILOT');
      expect(GROWTH_UI[lang].errors.autopilot_needs_confirmation).toContain('AUTOPILOT');
      expect(GROWTH_UI[lang].reminderTitle('Loja')).toContain('Loja');
    }
  });
  it('textos traduzidos de verdade (não ficaram em português)', () => {
    expect(CRM_UI.de.tabs.contacts).toBe('Kontakte');
    expect(CRM_UI.ja.tabs.deals).toBe('商談');
    expect(CRM_UI.ar.save).toBe('حفظ');
    expect(GROWTH_UI.fr.approve).toBe('Approuver');
    expect(GROWTH_UI['zh-TW'].stageNames.business.retencao).toBe('留存');
    expect(CRM_UI.de.csv.imported(3, 1)).toBe('3 Kontakt(e) importiert, 1 Zeile(n) übersprungen.');
    expect(CRM_UI.de.csv.imported(3, 0)).toBe('3 Kontakt(e) importiert.');
    expect(CRM_UI.ja.ai.charged(0)).toBe('このアカウントでは無料です。');
    expect(GROWTH_UI.de.syncDone({ ...syncSample, autoSent: 0 })).not.toContain('Autopilot');
  });
});

describe('detecção do idioma (?lang → workspace → salvo → navegador)', () => {
  it('reconhece os 21 e variantes regionais', () => {
    expect(resolveUiLang('de-AT')).toBe('de');
    expect(resolveUiLang('pt-PT')).toBe('pt-PT');
    expect(resolveUiLang('pt_BR')).toBe('pt');
    expect(resolveUiLang('zh-Hant-TW')).toBe('zh-TW');
    expect(resolveUiLang('zh-HK')).toBe('zh-TW');
    expect(resolveUiLang('zh')).toBe('zh-CN');
    expect(resolveUiLang('ja-JP')).toBe('ja');
    expect(resolveUiLang('ar-EG')).toBe('ar');
    expect(resolveUiLang('sv', null, 'ko-KR')).toBe('ko');
    expect(resolveUiLang('xx', undefined)).toBe('pt');
    expect(crmLang('fr-CA')).toBe('fr');
  });
  it('?lang vence o idioma salvo e o navegador', () => {
    localStorage.setItem('vertal-ui-lang', 'es');
    expect(preferredUiLang('ja')).toBe('ja');
    expect(preferredUiLang()).toBe('es');
    localStorage.removeItem('vertal-ui-lang');
  });
  it('login (só pt/en/es) cai no mais próximo', () => {
    expect(authLang('de')).toBe('en');
    expect(authLang('pt-PT')).toBe('pt');
    expect(authLang('es')).toBe('es');
  });
  it('árabe abre em RTL; datas/números no formato do idioma', () => {
    expect(uiDir('ar')).toBe('rtl');
    expect(uiDir('de')).toBe('ltr');
    expect(uiLocale('pt')).toBe('pt-BR');
    expect(uiLocale('ja')).toBe('ja');
  });
});

describe('servidor do CRM nos 21 idiomas', () => {
  it('funil padrão traduzido, ids estáveis e tipos corretos', () => {
    for (const lang of UI_LANGS) {
      const st = defaultStages(lang);
      expect(st.map((s) => s.kind)).toEqual(['open', 'open', 'open', 'open', 'won', 'lost']);
      expect(st.every((s) => s.label.trim() && s.id)).toBe(true);
      expect(defaultPipelineName(lang).trim()).not.toBe('');
    }
    expect(defaultStages('de')[3].label).toBe('In Verhandlung');
    expect(defaultStages('pt').map((s) => s.id)).toEqual(['lead', 'qualificado', 'proposta', 'negociacao', 'ganho', 'perdido']);
    expect(defaultStages('ja').map((s) => s.id)).toEqual(['lead', 'qualified', 'proposal', 'negotiation', 'won', 'lost']);
  });
  it('IA responde no idioma do usuário', () => {
    const msgs = aiMessages('summary', { contact: { status: 'hot' } }, 'de');
    expect(msgs[0].content).toContain('Responda SEMPRE em Deutsch');
    expect(msgs[1].content).toContain('heiß');
    expect(aiMessages('summary', {}, 'ja')[0].content).toContain('日本語');
    expect(aiMessages('summary', {}, 'ar')[0].content).toContain('العربية');
  });
});

describe('campo de data por idioma', () => {
  it('ja/ko/zh: aaaa/mm/dd; de: dd/mm/aaaa; en: mm/dd/aaaa', () => {
    expect(formatDateInput('2026-12-01', 'ja', false)).toBe('2026/12/01');
    expect(parseDateInput('2026/12/01', 'ja', false)).toBe('2026-12-01');
    expect(maskDateInput('20261201', false, 'ko')).toBe('2026/12/01');
    expect(formatDateInput('2026-12-01T14:30', 'de', true)).toBe('01/12/2026 14:30');
    expect(parseDateInput('01/12/2026 14:30', 'de', true)).toBe('2026-12-01T14:30');
    expect(parseDateInput('12/01/2026', 'en', false)).toBe('2026-12-01');
    expect(parseDateInput('31/02/2026', 'fr', false)).toBeNull();
  });
});

describe('Prospector: endereço no cartão do lead', () => {
  const lead = { name: 'Loja X', address: 'Rua Francisco Milano, 144 - Jardim Ângela', city: 'São Paulo', phone: '+55 11 3333-4444', website: 'https://lojax.com.br' };
  const areas = ['São Paulo, SP', 'Campinas, SP'];
  it('rua, número, bairro e cidade/UF quando a área da campanha tem o estado', () => {
    expect(leadAddressLine(lead, areas)).toBe('Rua Francisco Milano, 144 - Jardim Ângela · São Paulo, SP');
    expect(leadAddressLine({ city: 'Campinas' }, areas)).toBe('Campinas, SP');
    expect(leadAddressLine({}, areas)).toBe('');
  });
  it('link de busca do Google Maps a partir do endereço', () => {
    const url = leadMapUrl(lead, areas)!;
    expect(url.startsWith('https://www.google.com/maps/search/?api=1&query=')).toBe(true);
    expect(decodeURIComponent(url.split('query=')[1])).toBe('Loja X, Rua Francisco Milano, 144 - Jardim Ângela, São Paulo, SP');
    expect(leadMapUrl({ name: 'Y' })).toBeNull();
  });
  it('telefone vira tel:', () => {
    expect(leadTelHref('+55 11 3333-4444')).toBe('tel:+551133334444');
    expect(leadTelHref('123')).toBeNull();
  });
});
