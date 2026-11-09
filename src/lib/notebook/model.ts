// Modelo do Vertal Notebook: cadernos, fontes, notas, chats, transformações,
// podcasts e materiais de estudo. Funções puras (sem React nem IndexedDB) para
// serem testadas e reaproveitadas pela interface.
//
// Inspirado funcionalidade por funcionalidade no Open Notebook
// (lfnovo/open-notebook, MIT, Luis Novo), a alternativa aberta ao NotebookLM.
import type {
  ContextItem,
  GuideOutput,
  PodcastLength,
  PodcastOutput,
  Speaker,
  StudyKind,
  StudyOutput,
} from '../../../supabase/functions/_shared/notebookAi';

export type { ContextItem, GuideOutput, PodcastLength, PodcastOutput, Speaker, StudyKind, StudyOutput };

/** Como a fonte entra no contexto da IA (igual ao Open Notebook). */
export type ContextMode = 'off' | 'insights' | 'full';
export type SourceKind = 'link' | 'file' | 'text' | 'youtube';

export interface Insight {
  id: string;
  transformationId: string;
  title: string;
  content: string;
  createdAt: string;
}

export interface Source {
  id: string;
  notebookId: string;
  kind: SourceKind;
  title: string;
  content: string;
  url?: string;
  fileName?: string;
  contextMode: ContextMode;
  insights: Insight[];
  createdAt: string;
}

export interface Note {
  id: string;
  notebookId: string;
  title: string;
  content: string;
  /** Escrita pela pessoa ou salva de uma resposta/transformação da IA. */
  origin: 'human' | 'ai';
  /** Notas também podem entrar no contexto. */
  inContext: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: string[];
  createdAt: string;
}

export interface ChatSession {
  id: string;
  notebookId: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface Transformation {
  id: string;
  name: string;
  /** Título do insight gerado. */
  title: string;
  description: string;
  prompt: string;
  builtin: boolean;
  /** Roda sozinha ao adicionar uma fonte. */
  autoApply: boolean;
}

export interface SpeakerProfile extends Speaker {
  voiceURI?: string;
}

export interface PodcastEpisode {
  id: string;
  notebookId: string;
  title: string;
  profileId: string;
  speakers: SpeakerProfile[];
  lines: PodcastOutput['lines'];
  createdAt: string;
}

export interface StudyItem {
  id: string;
  notebookId: string;
  title: string;
  output: StudyOutput;
  createdAt: string;
}

export interface Notebook {
  id: string;
  name: string;
  description: string;
  emoji: string;
  /** Índice em NOTEBOOK_COLORS. */
  color: number;
  archived: boolean;
  guide?: GuideOutput & { createdAt: string };
  createdAt: string;
  updatedAt: string;
}

export interface Workspace {
  version: 1;
  notebooks: Notebook[];
  sources: Source[];
  notes: Note[];
  chats: ChatSession[];
  transformations: Transformation[];
  episodes: PodcastEpisode[];
  studies: StudyItem[];
}

export const NOTEBOOK_COLORS = [
  'from-amber-400 via-orange-500 to-rose-500',
  'from-violet-500 via-fuchsia-500 to-pink-500',
  'from-sky-400 via-blue-500 to-indigo-600',
  'from-emerald-400 via-teal-500 to-cyan-600',
  'from-rose-400 via-red-500 to-orange-500',
  'from-lime-400 via-emerald-500 to-teal-600',
] as const;

export const NOTEBOOK_EMOJIS = ['📘', '🧠', '🚀', '🔬', '💡', '📈', '🎓', '🧪', '🌍', '⚖️', '🎙️', '🪙'];

/** Transformações embutidas: as seis do Open Notebook mais três do Vertal. */
export const BUILTIN_TRANSFORMATIONS: Transformation[] = [
  {
    id: 'tf_dense_summary',
    name: 'Resumo denso',
    title: 'Resumo denso',
    description: 'Resumo completo e enxuto, sem perder nenhum ponto importante.',
    prompt:
      'Escreva um resumo denso do material: cubra todos os argumentos, dados e conclusões importantes, sem enrolação. Use parágrafos curtos e, no fim, uma lista "Em uma frase" com a ideia central.',
    builtin: true,
    autoApply: true,
  },
  {
    id: 'tf_key_insights',
    name: 'Ideias-chave',
    title: 'Ideias-chave',
    description: 'Os insights mais valiosos, com por que importam.',
    prompt:
      'Extraia de 5 a 10 ideias-chave do material. Para cada uma: um título em negrito, 1-2 frases explicando e uma linha "Por que importa".',
    builtin: true,
    autoApply: false,
  },
  {
    id: 'tf_paper_analysis',
    name: 'Análise de artigo',
    title: 'Análise de artigo',
    description: 'Pergunta, método, resultados, limitações e implicações.',
    prompt:
      'Analise o material como um artigo científico ou técnico. Seções: Pergunta central; Método; Principais resultados; Limitações; Implicações práticas; Perguntas em aberto.',
    builtin: true,
    autoApply: false,
  },
  {
    id: 'tf_reflection',
    name: 'Perguntas de reflexão',
    title: 'Perguntas de reflexão',
    description: 'Perguntas para pensar mais fundo sobre o tema.',
    prompt:
      'Crie de 6 a 10 perguntas de reflexão que levem a pensar mais fundo sobre o material: conexões, contrapontos, aplicações e consequências. Agrupe por tema.',
    builtin: true,
    autoApply: false,
  },
  {
    id: 'tf_toc',
    name: 'Sumário',
    title: 'Sumário',
    description: 'Índice dos tópicos na ordem em que aparecem.',
    prompt:
      'Monte um sumário (índice) do material, com tópicos e subtópicos na ordem em que aparecem, cada um com uma linha de descrição.',
    builtin: true,
    autoApply: false,
  },
  {
    id: 'tf_simple_summary',
    name: 'Explique simples',
    title: 'Explicação simples',
    description: 'Como se fosse para alguém de 12 anos.',
    prompt:
      'Explique o material de forma simples, como para alguém de 12 anos, usando analogias do dia a dia. No máximo 5 parágrafos curtos.',
    builtin: true,
    autoApply: false,
  },
  {
    id: 'tf_study_guide',
    name: 'Guia de estudo',
    title: 'Guia de estudo',
    description: 'Conceitos, glossário e questões para revisar.',
    prompt:
      'Crie um guia de estudo: 1) Conceitos essenciais; 2) Glossário com termos e definições; 3) Cinco questões dissertativas com respostas-modelo curtas.',
    builtin: true,
    autoApply: false,
  },
  {
    id: 'tf_faq',
    name: 'FAQ',
    title: 'Perguntas frequentes',
    description: 'Perguntas e respostas que alguém faria sobre o tema.',
    prompt: 'Escreva um FAQ com 8 a 12 perguntas que alguém faria sobre o material, cada uma com resposta direta.',
    builtin: true,
    autoApply: false,
  },
  {
    id: 'tf_action_plan',
    name: 'Plano de ação',
    title: 'Plano de ação',
    description: 'Transforma o conteúdo em passos práticos.',
    prompt:
      'Transforme o material em um plano de ação prático: objetivo, passos numerados com responsável sugerido e prazo relativo, riscos e métricas de sucesso.',
    builtin: true,
    autoApply: false,
  },
];

export interface PodcastProfile {
  id: string;
  name: string;
  description: string;
  briefing: string;
  speakers: SpeakerProfile[];
  length: PodcastLength;
}

/** Perfis de episódio (Episode Profiles do Open Notebook), de 1 a 4 locutores. */
export const PODCAST_PROFILES: PodcastProfile[] = [
  {
    id: 'deep_dive',
    name: 'Mergulho profundo',
    description: 'Duas vozes destrincham o tema com curiosidade.',
    briefing: 'Explore o tema a fundo, com exemplos concretos e as implicações mais interessantes.',
    length: 'medium',
    speakers: [
      { name: 'Lia', backstory: 'Apresentadora curiosa que puxa as perguntas certas', personality: 'calorosa, animada' },
      { name: 'Rafa', backstory: 'Especialista que explica com analogias', personality: 'calmo, preciso, bem-humorado' },
    ],
  },
  {
    id: 'debate',
    name: 'Debate',
    description: 'Duas posições opostas e uma mediadora.',
    briefing: 'Apresente os argumentos a favor e contra os pontos centrais, com uma mediação justa e conclusão equilibrada.',
    length: 'medium',
    speakers: [
      { name: 'Clara', backstory: 'Mediadora neutra', personality: 'objetiva, organizada' },
      { name: 'Bruno', backstory: 'Defende as ideias do material', personality: 'entusiasmado, persuasivo' },
      { name: 'Nina', backstory: 'Faz o contraponto crítico', personality: 'cética, afiada, educada' },
    ],
  },
  {
    id: 'class',
    name: 'Aula rápida',
    description: 'Uma professora explica o essencial sozinha.',
    briefing: 'Aula didática: comece pelo porquê, explique os conceitos em ordem e termine com um resumo para revisar.',
    length: 'short',
    speakers: [{ name: 'Profa. Ana', backstory: 'Professora experiente e didática', personality: 'clara, paciente, inspiradora' }],
  },
  {
    id: 'roundtable',
    name: 'Mesa-redonda',
    description: 'Quatro perspectivas diferentes sobre o tema.',
    briefing: 'Mesa-redonda com visões de negócio, tecnologia, usuário e sociedade sobre o material.',
    length: 'long',
    speakers: [
      { name: 'Marina', backstory: 'Apresentadora e fundadora de startup', personality: 'ágil, estratégica' },
      { name: 'Diego', backstory: 'Engenheiro de IA e Web3', personality: 'técnico, entusiasmado' },
      { name: 'Júlia', backstory: 'Designer de produto focada no usuário', personality: 'empática, prática' },
      { name: 'Otávio', backstory: 'Economista', personality: 'analítico, provocador' },
    ],
  },
];

// ─── Criação ────────────────────────────────────────────────────────────────

let seq = 0;
/** Id curto, seguro para citações ([source:<id>]). */
export function newId(prefix = ''): string {
  seq = (seq + 1) % 1_000_000;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}${Date.now().toString(36)}${seq.toString(36)}${rand}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function emptyWorkspace(): Workspace {
  return {
    version: 1,
    notebooks: [],
    sources: [],
    notes: [],
    chats: [],
    transformations: BUILTIN_TRANSFORMATIONS.map((t) => ({ ...t })),
    episodes: [],
    studies: [],
  };
}

/** Garante campos e transformações embutidas em dados salvos por versões antigas. */
export function normalizeWorkspace(raw: unknown): Workspace {
  const base = emptyWorkspace();
  if (!raw || typeof raw !== 'object') return base;
  const w = raw as Partial<Workspace>;
  const list = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  const custom = list<Transformation>(w.transformations).filter((t) => !t.builtin);
  const savedBuiltins = new Map(list<Transformation>(w.transformations).filter((t) => t.builtin).map((t) => [t.id, t]));
  return {
    version: 1,
    notebooks: list(w.notebooks),
    sources: list<Source>(w.sources).map((s) => ({ ...s, insights: list(s.insights), contextMode: s.contextMode ?? 'insights' })),
    notes: list<Note>(w.notes).map((n) => ({ ...n, inContext: n.inContext ?? false })),
    chats: list(w.chats),
    transformations: [
      ...BUILTIN_TRANSFORMATIONS.map((t) => ({ ...t, autoApply: savedBuiltins.get(t.id)?.autoApply ?? t.autoApply })),
      ...custom,
    ],
    episodes: list(w.episodes),
    studies: list(w.studies),
  };
}

export function makeNotebook(name: string, description = '', index = 0): Notebook {
  const t = nowIso();
  return {
    id: newId('nb'),
    name: name.trim() || 'Caderno sem nome',
    description: description.trim(),
    emoji: NOTEBOOK_EMOJIS[index % NOTEBOOK_EMOJIS.length],
    color: index % NOTEBOOK_COLORS.length,
    archived: false,
    createdAt: t,
    updatedAt: t,
  };
}

export function makeSource(notebookId: string, input: { kind: SourceKind; title: string; content: string; url?: string; fileName?: string }): Source {
  return {
    id: newId('s'),
    notebookId,
    kind: input.kind,
    title: input.title.trim() || 'Fonte sem título',
    content: input.content,
    url: input.url,
    fileName: input.fileName,
    contextMode: 'full',
    insights: [],
    createdAt: nowIso(),
  };
}

export function makeNote(notebookId: string, title: string, content: string, origin: Note['origin'] = 'human'): Note {
  const t = nowIso();
  return { id: newId('n'), notebookId, title: title.trim() || 'Nota sem título', content, origin, inContext: false, createdAt: t, updatedAt: t };
}

export function makeChat(notebookId: string, title = 'Nova conversa'): ChatSession {
  const t = nowIso();
  return { id: newId('c'), notebookId, title, messages: [], createdAt: t, updatedAt: t };
}

export function makeTransformation(input: Pick<Transformation, 'name' | 'title' | 'description' | 'prompt'>): Transformation {
  return { id: newId('tf'), ...input, builtin: false, autoApply: false };
}

/** Título curto para uma conversa a partir da primeira pergunta. */
export function chatTitleFrom(question: string): string {
  const clean = question.replace(/\s+/g, ' ').trim();
  return clean.length > 48 ? `${clean.slice(0, 47)}…` : clean || 'Nova conversa';
}

// ─── Contexto da IA ─────────────────────────────────────────────────────────

export function sourceInsightsText(source: Source): string {
  return source.insights.map((i) => `## ${i.title}\n${i.content}`).join('\n\n');
}

/**
 * Monta o contexto do caderno respeitando o modo de cada fonte:
 * - full: conteúdo completo;
 * - insights: só os insights (ou o começo do texto, se ainda não houver insight);
 * - off: fora.
 * Notas entram quando `inContext` está ligado.
 */
export function buildContext(sources: Source[], notes: Note[]): ContextItem[] {
  const items: ContextItem[] = [];
  for (const s of sources) {
    if (s.contextMode === 'off') continue;
    const content =
      s.contextMode === 'full' ? s.content : sourceInsightsText(s) || `${s.content.slice(0, 1_500)}${s.content.length > 1_500 ? '…' : ''}`;
    if (content.trim()) items.push({ id: `source:${s.id}`, title: s.title, content });
  }
  for (const n of notes) {
    if (n.inContext && n.content.trim()) items.push({ id: `note:${n.id}`, title: n.title, content: n.content });
  }
  return items;
}

/** Estimativa de tokens (~4 caracteres por token), mostrada ao lado do contexto. */
export function estimateTokens(items: ContextItem[]): number {
  return Math.ceil(items.reduce((n, i) => n + i.content.length + i.title.length, 0) / 4);
}

export function formatTokens(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

// ─── Citações ───────────────────────────────────────────────────────────────

export type AnswerPart = { type: 'text'; text: string } | { type: 'cite'; id: string; index: number };

const CITE_RE = /\[((?:source|note):[A-Za-z0-9_-]{1,64})\]/g;

/** Separa a resposta em texto e citações numeradas na ordem da primeira aparição. */
export function splitCitations(text: string): { parts: AnswerPart[]; order: string[] } {
  const parts: AnswerPart[] = [];
  const order: string[] = [];
  let last = 0;
  for (const m of text.matchAll(CITE_RE)) {
    const at = m.index ?? 0;
    if (at > last) parts.push({ type: 'text', text: text.slice(last, at) });
    const id = m[1];
    if (!order.includes(id)) order.push(id);
    parts.push({ type: 'cite', id, index: order.indexOf(id) + 1 });
    last = at + m[0].length;
  }
  if (last < text.length) parts.push({ type: 'text', text: text.slice(last) });
  return { parts, order };
}

/** Troca [source:id] por marcadores de link markdown que a interface transforma em selos. */
export function citationsToLinks(text: string): { markdown: string; order: string[] } {
  const { parts, order } = splitCitations(text);
  const markdown = parts.map((p) => (p.type === 'text' ? p.text : `[${p.index}](#cite-${p.id.replace(':', '-')})`)).join('');
  return { markdown, order };
}

export function citeHrefToId(href: string | undefined): string | null {
  const m = /^#cite-(source|note)-([A-Za-z0-9_-]{1,64})$/.exec(href ?? '');
  return m ? `${m[1]}:${m[2]}` : null;
}

export function stripCitations(text: string): string {
  return text.replace(CITE_RE, '').replace(/[ \t]{2,}/g, ' ');
}

// ─── Busca ──────────────────────────────────────────────────────────────────

export interface SearchHit {
  type: 'source' | 'note' | 'insight';
  id: string;
  notebookId: string;
  title: string;
  snippet: string;
  score: number;
  /** Id da fonte (para insights). */
  sourceId?: string;
}

export function normalizeText(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function snippetAround(text: string, terms: string[], size = 180): string {
  const norm = normalizeText(text);
  let at = -1;
  for (const t of terms) {
    at = norm.indexOf(t);
    if (at >= 0) break;
  }
  if (at < 0) return text.slice(0, size).trim();
  const start = Math.max(0, at - Math.floor(size / 3));
  const snippet = text.slice(start, start + size).replace(/\s+/g, ' ').trim();
  return `${start > 0 ? '…' : ''}${snippet}${start + size < text.length ? '…' : ''}`;
}

function scoreText(title: string, body: string, terms: string[]): number {
  const t = normalizeText(title);
  const b = normalizeText(body);
  let score = 0;
  for (const term of terms) {
    if (t.includes(term)) score += 5;
    let from = 0;
    let count = 0;
    while (count < 20) {
      const i = b.indexOf(term, from);
      if (i < 0) break;
      count += 1;
      from = i + term.length;
    }
    if (count === 0 && !t.includes(term)) return 0;
    score += Math.min(count, 20);
  }
  return score;
}

/** Busca de texto completo (sem acentos, todos os termos) em fontes, insights e notas. */
export function searchWorkspace(ws: Workspace, query: string, notebookId?: string, limit = 30): SearchHit[] {
  const terms = normalizeText(query)
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
  if (terms.length === 0) return [];
  const inScope = (id: string) => !notebookId || id === notebookId;
  const hits: SearchHit[] = [];
  for (const s of ws.sources) {
    if (!inScope(s.notebookId)) continue;
    const score = scoreText(s.title, s.content, terms);
    if (score > 0) hits.push({ type: 'source', id: s.id, notebookId: s.notebookId, title: s.title, snippet: snippetAround(s.content, terms), score });
    for (const ins of s.insights) {
      const si = scoreText(ins.title, ins.content, terms);
      if (si > 0)
        hits.push({ type: 'insight', id: ins.id, sourceId: s.id, notebookId: s.notebookId, title: `${ins.title} · ${s.title}`, snippet: snippetAround(ins.content, terms), score: si });
    }
  }
  for (const n of ws.notes) {
    if (!inScope(n.notebookId)) continue;
    const score = scoreText(n.title, n.content, terms);
    if (score > 0) hits.push({ type: 'note', id: n.id, notebookId: n.notebookId, title: n.title, snippet: snippetAround(n.content, terms), score });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Contexto para o "Pergunte" a partir dos melhores resultados da busca. */
export function contextFromHits(ws: Workspace, hits: SearchHit[], max = 8): ContextItem[] {
  const items: ContextItem[] = [];
  const seen = new Set<string>();
  for (const h of hits) {
    if (items.length >= max) break;
    if (h.type === 'note') {
      const n = ws.notes.find((x) => x.id === h.id);
      const key = `note:${h.id}`;
      if (n && !seen.has(key)) {
        seen.add(key);
        items.push({ id: key, title: n.title, content: n.content });
      }
    } else {
      const sid = h.type === 'source' ? h.id : h.sourceId!;
      const s = ws.sources.find((x) => x.id === sid);
      const key = `source:${sid}`;
      if (s && !seen.has(key)) {
        seen.add(key);
        items.push({ id: key, title: s.title, content: s.content });
      }
    }
  }
  return items;
}

// ─── Exportação ─────────────────────────────────────────────────────────────

export function podcastToMarkdown(ep: Pick<PodcastEpisode, 'title' | 'lines' | 'speakers'>): string {
  const cast = ep.speakers.map((s) => `- **${s.name}**${s.backstory ? `: ${s.backstory}` : ''}`).join('\n');
  const body = ep.lines.map((l) => `**${l.speaker}:** ${l.text}`).join('\n\n');
  return `# ${ep.title}\n\n## Elenco\n${cast}\n\n## Roteiro\n\n${body}\n`;
}

export function studyToMarkdown(item: Pick<StudyItem, 'title' | 'output'>): string {
  const o = item.output;
  const head = `# ${item.title}\n\n`;
  if (o.kind === 'flashcards') return head + o.cards.map((c, i) => `${i + 1}. **${c.front}**\n   ${c.back}`).join('\n');
  if (o.kind === 'quiz')
    return (
      head +
      o.questions
        .map(
          (q, i) =>
            `${i + 1}. ${q.question}\n${q.options.map((op, j) => `   ${String.fromCharCode(97 + j)}) ${op}${j === q.answer ? ' ✓' : ''}`).join('\n')}\n   _${q.explanation}_`,
        )
        .join('\n\n')
    );
  if (o.kind === 'timeline') return head + o.events.map((e) => `- **${e.when}** · ${e.title}: ${e.detail}`).join('\n');
  const walk = (n: { label: string; children: { label: string; children: unknown[] }[] }, d: number): string =>
    `${'  '.repeat(d)}- ${n.label}\n${n.children.map((c) => walk(c as never, d + 1)).join('')}`;
  return head + walk(o.root, 0);
}

export const STUDY_LABELS: Record<StudyKind, string> = {
  flashcards: 'Flashcards',
  quiz: 'Quiz',
  mindmap: 'Mapa mental',
  timeline: 'Linha do tempo',
};

export function studyTitle(kind: StudyKind, notebookName: string): string {
  return `${STUDY_LABELS[kind]} · ${notebookName}`;
}
