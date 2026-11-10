import { describe, expect, it } from 'vitest';
import {
  artifactSourceText,
  decodeMessage,
  encodeMessage,
  historyContent,
  nextArtifactId,
  type Artifact,
  type MessageExtras,
} from './artifacts';
import { textHeight, wrapCanvasText } from './canvasSpec';

const doc: Artifact = {
  id: 'a1', kind: 'doc', title: 'Plano de ação — café',
  doc: {
    id: 'd', title: 'Plano de ação — café', updatedAt: '2026-11-10T00:00:00.000Z',
    blocks: [
      { id: 'b1', type: 'heading', text: 'Objetivo' },
      { id: 'b2', type: 'bullet', text: 'Abrir às 7h' },
    ],
  },
};

describe('mensagens com artefatos', () => {
  it('grava e lê de volta texto, artefatos, painéis e erros (com acentos e emoji)', () => {
    const extras: MessageExtras = { artifacts: [doc], panels: ['office'], errors: ['Créditos insuficientes ☕'] };
    const content = encodeMessage('Pronto, criei o documento.', extras);
    expect(content.startsWith('Pronto, criei o documento.')).toBe(true);
    expect(decodeMessage(content)).toEqual({ text: 'Pronto, criei o documento.', extras });
  });

  it('mensagem sem extras fica como texto puro e mensagens antigas continuam legíveis', () => {
    const empty: MessageExtras = { artifacts: [], panels: [], errors: [] };
    expect(encodeMessage('Só conversa', empty)).toBe('Só conversa');
    expect(decodeMessage('Resposta antiga do chat')).toEqual({ text: 'Resposta antiga do chat', extras: empty });
  });

  it('marcador corrompido não quebra a conversa', () => {
    const { text, extras } = decodeMessage('Texto\n\n<!--vertal-chat:AAAA-->');
    expect(text).toBe('Texto');
    expect(extras.artifacts).toEqual([]);
  });

  it('não grava data URLs: guarda só o caminho do arquivo', () => {
    const image: Artifact = { id: 'a2', kind: 'image', title: 'Logo', prompt: 'logo', image: { url: `data:image/png;base64,${'A'.repeat(5000)}`, path: 'u1/chat/x.png' } };
    const content = encodeMessage('', { artifacts: [image], panels: [], errors: [] });
    expect(content.length).toBeLessThan(600);
    const back = decodeMessage(content).extras.artifacts[0];
    expect(back).toMatchObject({ kind: 'image', image: { url: '', path: 'u1/chat/x.png' } });
  });
});

describe('contexto para o agente', () => {
  it('o histórico leva o id de cada artefato e as falhas', () => {
    expect(historyContent('Feito.', { artifacts: [doc], panels: [], errors: ['Sem créditos'] })).toBe(
      'Feito.\n[artefato a1: documento "Plano de ação — café"]\n[falhou: Sem créditos]',
    );
    expect(historyContent('', { artifacts: [], panels: [], errors: [] })).toBe('(sem texto)');
  });

  it('gera o próximo id livre', () => {
    expect(nextArtifactId([])).toBe('a1');
    expect(nextArtifactId([doc, { ...doc, id: 'a7' }])).toBe('a8');
  });

  it('texto de origem da planilha sai em ordem de linha e coluna (inclusive depois da coluna Z)', () => {
    const sheet: Artifact = {
      id: 'a3', kind: 'sheet', title: 'Vendas',
      sheet: { id: 's', title: 'Vendas', updatedAt: '', cells: { B2: '10', A2: 'Café', A1: 'Produto', B1: 'Qtd', AA1: 'Obs', Z1: 'Fim' } },
    };
    expect(artifactSourceText(sheet)).toBe('Produto | Qtd | Fim | Obs\nCafé | 10');
    expect(artifactSourceText(doc)).toBe('Plano de ação — café\nObjetivo\n- Abrir às 7h');
  });
});

describe('texto do Canvas', () => {
  const base = { type: 'text' as const, x: 0, y: 0, color: 'black' as const, align: 'left' as const, bold: false };

  it('quebra em linhas que cabem na largura', () => {
    const lines = wrapCanvasText({ ...base, w: 540, size: 50, text: 'Grande inauguração neste sábado' });
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(' ')).toBe('Grande inauguração neste sábado');
    expect(Math.max(...lines.map((l) => l.length))).toBeLessThanOrEqual(20);
  });

  it('palavra maior que a linha fica inteira e quebras manuais são respeitadas', () => {
    expect(wrapCanvasText({ ...base, w: 100, size: 50, text: 'Extraordinariamente' })).toEqual(['Extraordinariamente']);
    expect(wrapCanvasText({ ...base, w: 2000, size: 20, text: 'Linha 1\nLinha 2' })).toEqual(['Linha 1', 'Linha 2']);
    expect(textHeight({ ...base, w: 2000, size: 20, text: 'Linha 1\nLinha 2' })).toBe(54);
  });
});

describe('prévia de app', () => {
  it('coloca o armazenamento em memória antes dos scripts do app', async () => {
    const { previewHtml } = await import('./previewHtml');
    const out = previewHtml('<!DOCTYPE html><html><head><script>localStorage.getItem("a")</script></head><body></body></html>');
    expect(out.indexOf('sessionStorage')).toBeLessThan(out.indexOf('localStorage.getItem("a")'));
    expect(previewHtml('<p>oi</p>').endsWith('<p>oi</p>')).toBe(true);
  });
});
