import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, CircleCheck, CircleX, Minus, Plus, RotateCcw, Shuffle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { StudyOutput } from '@/lib/notebook/model';

type Of<K extends StudyOutput['kind']> = Extract<StudyOutput, { kind: K }>;

export function StudyViewer({ output }: { output: StudyOutput }) {
  switch (output.kind) {
    case 'flashcards':
      return <Flashcards output={output} />;
    case 'quiz':
      return <Quiz output={output} />;
    case 'mindmap':
      return <Mindmap output={output} />;
    case 'timeline':
      return <Timeline output={output} />;
  }
}

function Flashcards({ output }: { output: Of<'flashcards'> }) {
  const [order, setOrder] = useState(() => output.cards.map((_, i) => i));
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const card = output.cards[order[pos]];
  const go = (d: number) => {
    setFlipped(false);
    setPos((p) => (p + d + order.length) % order.length);
  };
  const shuffle = () => {
    const next = [...order];
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    setOrder(next);
    setPos(0);
    setFlipped(false);
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        aria-label={flipped ? 'Mostrar pergunta' : 'Mostrar resposta'}
        className="group h-64 w-full max-w-xl [perspective:1200px]"
      >
        <div className={cn('relative h-full w-full transition-transform duration-500 [transform-style:preserve-3d]', flipped && '[transform:rotateY(180deg)]')}>
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-3xl border border-white/10 bg-gradient-to-br from-violet-600/30 via-slate-900 to-slate-950 p-8 text-center shadow-2xl [backface-visibility:hidden]">
            <span className="text-[11px] uppercase tracking-[0.2em] text-violet-300">Pergunta</span>
            <p className="mt-3 text-xl font-semibold text-white">{card.front}</p>
            <span className="mt-6 text-xs text-slate-500">Toque para virar</span>
          </div>
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-3xl border border-amber-300/30 bg-gradient-to-br from-amber-500/25 via-slate-900 to-slate-950 p-8 text-center shadow-2xl [backface-visibility:hidden] [transform:rotateY(180deg)]">
            <span className="text-[11px] uppercase tracking-[0.2em] text-amber-300">Resposta</span>
            <p className="mt-3 text-base leading-relaxed text-slate-100">{card.back}</p>
          </div>
        </div>
      </button>
      <div className="flex items-center gap-3">
        <Button size="icon" variant="secondary" onClick={() => go(-1)} aria-label="Anterior">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-[4rem] text-center text-sm tabular-nums text-slate-300">
          {pos + 1} / {order.length}
        </span>
        <Button size="icon" variant="secondary" onClick={() => go(1)} aria-label="Próximo">
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="ghost" onClick={shuffle} className="gap-1 text-slate-300">
          <Shuffle className="h-4 w-4" /> Embaralhar
        </Button>
      </div>
    </div>
  );
}

function Quiz({ output }: { output: Of<'quiz'> }) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const done = Object.keys(answers).length;
  const score = output.questions.reduce((n, q, i) => n + (answers[i] === q.answer ? 1 : 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-2 text-sm">
        <span className="text-slate-300">
          Respondidas {done}/{output.questions.length}
        </span>
        <span className="font-semibold text-amber-200">
          Acertos: {score}
          {done === output.questions.length && ` · ${Math.round((score / output.questions.length) * 100)}%`}
        </span>
        {done > 0 && (
          <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => setAnswers({})}>
            <RotateCcw className="h-3.5 w-3.5" /> Refazer
          </Button>
        )}
      </div>
      {output.questions.map((q, i) => {
        const chosen = answers[i];
        const answered = chosen !== undefined;
        return (
          <article key={i} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="font-medium text-white">
              <span className="mr-2 text-amber-300">{i + 1}.</span>
              {q.question}
            </p>
            <div className="mt-3 grid gap-2">
              {q.options.map((op, j) => {
                const correct = j === q.answer;
                return (
                  <button
                    key={j}
                    type="button"
                    disabled={answered}
                    onClick={() => setAnswers((a) => ({ ...a, [i]: j }))}
                    className={cn(
                      'flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition',
                      !answered && 'border-white/10 bg-white/[0.02] text-slate-200 hover:border-amber-300/40',
                      answered && correct && 'border-emerald-400/50 bg-emerald-400/10 text-emerald-100',
                      answered && !correct && chosen === j && 'border-rose-400/50 bg-rose-400/10 text-rose-100',
                      answered && !correct && chosen !== j && 'border-white/5 text-slate-500',
                    )}
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/5 text-xs">{String.fromCharCode(65 + j)}</span>
                    <span className="flex-1">{op}</span>
                    {answered && correct && <CircleCheck className="h-4 w-4 text-emerald-300" />}
                    {answered && !correct && chosen === j && <CircleX className="h-4 w-4 text-rose-300" />}
                  </button>
                );
              })}
            </div>
            {answered && q.explanation && <p className="mt-3 rounded-lg bg-white/5 p-3 text-xs leading-relaxed text-slate-300">{q.explanation}</p>}
          </article>
        );
      })}
    </div>
  );
}

const DEPTH_COLORS = ['from-amber-400 to-rose-500', 'from-violet-500 to-fuchsia-500', 'from-sky-400 to-indigo-500', 'from-emerald-400 to-teal-500'];

function MindNode({ node, depth, path, open, toggle }: {
  node: Of<'mindmap'>['root'];
  depth: number;
  path: string;
  open: Set<string>;
  toggle: (p: string) => void;
}) {
  const has = node.children.length > 0;
  const isOpen = open.has(path);
  return (
    <li className="relative">
      <div className="flex items-center gap-2 py-1">
        <button
          type="button"
          onClick={() => has && toggle(path)}
          aria-expanded={has ? isOpen : undefined}
          className={cn(
            'inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-left text-sm transition',
            depth === 0
              ? `bg-gradient-to-r ${DEPTH_COLORS[0]} font-semibold text-white shadow-lg shadow-orange-500/20`
              : 'border border-white/10 bg-white/[0.04] text-slate-100 hover:border-white/25',
            has && 'cursor-pointer',
          )}
        >
          {depth > 0 && <span className={cn('h-2 w-2 shrink-0 rounded-full bg-gradient-to-br', DEPTH_COLORS[depth % DEPTH_COLORS.length])} />}
          {node.label}
          {has && <span className="ml-1 text-slate-400">{isOpen ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}</span>}
        </button>
      </div>
      {has && isOpen && (
        <ul className="ml-4 border-l border-white/10 pl-4">
          {node.children.map((c, i) => (
            <MindNode key={`${path}.${i}`} node={c} depth={depth + 1} path={`${path}.${i}`} open={open} toggle={toggle} />
          ))}
        </ul>
      )}
    </li>
  );
}

function Mindmap({ output }: { output: Of<'mindmap'> }) {
  const allPaths = useMemo(() => {
    const out: string[] = [];
    const walk = (n: Of<'mindmap'>['root'], p: string) => {
      if (n.children.length) out.push(p);
      n.children.forEach((c, i) => walk(c, `${p}.${i}`));
    };
    walk(output.root, '0');
    return out;
  }, [output]);
  const [open, setOpen] = useState(() => new Set(allPaths.filter((p) => p.split('.').length <= 2)));
  const toggle = (p: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return n;
    });
  return (
    <div>
      <div className="mb-3 flex gap-2">
        <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={() => setOpen(new Set(allPaths))}>
          Expandir tudo
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setOpen(new Set(['0']))}>
          Recolher
        </Button>
      </div>
      <ul className="overflow-x-auto">
        <MindNode node={output.root} depth={0} path="0" open={open} toggle={toggle} />
      </ul>
    </div>
  );
}

function Timeline({ output }: { output: Of<'timeline'> }) {
  return (
    <ol className="relative ml-3 border-l border-white/10">
      {output.events.map((e, i) => (
        <li key={i} className="mb-6 ml-6 last:mb-0">
          <span className="absolute -left-[7px] mt-1.5 h-3.5 w-3.5 rounded-full bg-gradient-to-br from-amber-300 to-rose-500 ring-4 ring-slate-950" />
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-300">{e.when || `Etapa ${i + 1}`}</p>
          <p className="mt-0.5 font-medium text-white">{e.title}</p>
          {e.detail && <p className="mt-1 text-sm text-slate-400">{e.detail}</p>}
        </li>
      ))}
    </ol>
  );
}
