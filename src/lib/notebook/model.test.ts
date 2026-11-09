import { describe, expect, it } from 'vitest';
import {
  BUILTIN_TRANSFORMATIONS,
  buildContext,
  citationsToLinks,
  citeHrefToId,
  contextFromHits,
  emptyWorkspace,
  makeNote,
  makeNotebook,
  makeSource,
  normalizeWorkspace,
  podcastToMarkdown,
  searchWorkspace,
  splitCitations,
  studyToMarkdown,
} from './model';

function sample() {
  const ws = emptyWorkspace();
  const nb = makeNotebook('Pesquisa');
  const a = makeSource(nb.id, { kind: 'text', title: 'Informação pública', content: 'A informação sobre blockchain é descentralizada.' });
  const b = { ...makeSource(nb.id, { kind: 'link', title: 'Outra', content: 'x'.repeat(3000) }), contextMode: 'insights' as const };
  const c = { ...makeSource(nb.id, { kind: 'file', title: 'Fora', content: 'não entra' }), contextMode: 'off' as const };
  const note = { ...makeNote(nb.id, 'Nota', 'Tokens de recompensa'), inContext: true };
  return { ws: { ...ws, notebooks: [nb], sources: [a, b, c], notes: [note] }, nb, a, b, c, note };
}

describe('modelo do Vertal Notebook', () => {
  it('ids servem nas citações', () => {
    const { a } = sample();
    expect(`source:${a.id}`).toMatch(/^source:[A-Za-z0-9_-]{1,64}$/);
  });

  it('contexto respeita o modo de cada fonte e as notas ligadas', () => {
    const { ws, a, b, note } = sample();
    const items = buildContext(ws.sources, ws.notes);
    expect(items.map((i) => i.id)).toEqual([`source:${a.id}`, `source:${b.id}`, `note:${note.id}`]);
    expect(items[0].content).toBe(a.content);
    // Sem insights ainda, o modo insights manda só o começo.
    expect(items[1].content.length).toBeLessThan(1_600);
    const withInsight = { ...b, insights: [{ id: 'i1', transformationId: 't', title: 'Resumo', content: 'curto', createdAt: '' }] };
    expect(buildContext([withInsight], [])[0].content).toBe('## Resumo\ncurto');
  });

  it('citações viram selos numerados na ordem em que aparecem', () => {
    const text = 'Um [source:a1] dois [note:b2] três [source:a1].';
    const { order, parts } = splitCitations(text);
    expect(order).toEqual(['source:a1', 'note:b2']);
    expect(parts.filter((p) => p.type === 'cite').map((p) => (p as { index: number }).index)).toEqual([1, 2, 1]);
    const { markdown } = citationsToLinks(text);
    expect(markdown).toBe('Um [1](#cite-source-a1) dois [2](#cite-note-b2) três [1](#cite-source-a1).');
    expect(citeHrefToId('#cite-note-b2')).toBe('note:b2');
    expect(citeHrefToId('https://x.com')).toBeNull();
  });

  it('busca ignora acentos e exige todos os termos', () => {
    const { ws, a, note } = sample();
    expect(searchWorkspace(ws, 'informacao blockchain').map((h) => h.id)).toEqual([a.id]);
    expect(searchWorkspace(ws, 'informacao inexistente')).toEqual([]);
    expect(searchWorkspace(ws, 'recompensa')[0]).toMatchObject({ type: 'note', id: note.id });
    expect(searchWorkspace(ws, 'a')).toEqual([]);
  });

  it('Pergunte usa os melhores resultados sem repetir fonte', () => {
    const { ws, a } = sample();
    const items = contextFromHits(ws, searchWorkspace(ws, 'informacao'));
    expect(items).toEqual([{ id: `source:${a.id}`, title: a.title, content: a.content }]);
  });

  it('dados antigos ganham as transformações embutidas e mantêm as próprias', () => {
    const custom = { id: 'tf_x', name: 'Minha', title: 'Minha', description: '', prompt: 'p', builtin: false, autoApply: false };
    const old = { notebooks: [], sources: [{ id: 's', notebookId: 'n', kind: 'text', title: 't', content: 'c', createdAt: '' }], transformations: [custom] };
    const ws = normalizeWorkspace(old);
    expect(ws.transformations).toHaveLength(BUILTIN_TRANSFORMATIONS.length + 1);
    expect(ws.sources[0].insights).toEqual([]);
    expect(ws.sources[0].contextMode).toBe('insights');
    expect(normalizeWorkspace('lixo').notebooks).toEqual([]);
  });

  it('exporta roteiro e estudo em markdown', () => {
    const md = podcastToMarkdown({ title: 'Ep', speakers: [{ name: 'Lia' }], lines: [{ speaker: 'Lia', text: 'Oi' }] });
    expect(md).toContain('# Ep');
    expect(md).toContain('**Lia:** Oi');
    const quiz = studyToMarkdown({ title: 'Q', output: { kind: 'quiz', questions: [{ question: 'P?', options: ['a', 'b'], answer: 1, explanation: 'e' }] } });
    expect(quiz).toContain('b) b ✓');
    const mm = studyToMarkdown({ title: 'M', output: { kind: 'mindmap', root: { label: 'raiz', children: [{ label: 'filho', children: [] }] } } });
    expect(mm).toContain('- raiz\n  - filho');
  });
});
