import { memo, useMemo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import { citationsToLinks, citeHrefToId } from '@/lib/notebook/model';
import { cn } from '@/lib/utils';

interface Props {
  text: string;
  /** Título de cada id citado (para o tooltip). */
  titles?: Record<string, string>;
  onCite?: (id: string) => void;
  className?: string;
}

/** Markdown do Notebook: citações [source:id] viram selos numerados clicáveis. */
export const NotebookMarkdown = memo(function NotebookMarkdown({ text, titles, onCite, className }: Props) {
  const { markdown } = useMemo(() => citationsToLinks(text), [text]);

  const components = useMemo<Components>(
    () => ({
      h1: ({ children }) => <h3 className="mb-2 mt-4 text-lg font-semibold text-white first:mt-0">{children}</h3>,
      h2: ({ children }) => <h4 className="mb-2 mt-4 text-base font-semibold text-white first:mt-0">{children}</h4>,
      h3: ({ children }) => <h5 className="mb-1.5 mt-3 font-semibold text-slate-100 first:mt-0">{children}</h5>,
      p: ({ children }) => <p className="mb-3 leading-relaxed last:mb-0">{children}</p>,
      ul: ({ children }) => <ul className="mb-3 ml-5 list-disc space-y-1 marker:text-amber-300/70">{children}</ul>,
      ol: ({ children }) => <ol className="mb-3 ml-5 list-decimal space-y-1 marker:text-amber-300/70">{children}</ol>,
      strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
      blockquote: ({ children }) => <blockquote className="mb-3 border-l-2 border-amber-400/60 pl-3 italic text-slate-300">{children}</blockquote>,
      code: ({ children }) => <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[0.85em] text-amber-200">{children}</code>,
      pre: ({ children }) => <pre className="mb-3 overflow-x-auto rounded-lg bg-black/40 p-3 text-xs">{children}</pre>,
      hr: () => <hr className="my-4 border-white/10" />,
      a: ({ href, children }) => {
        const id = citeHrefToId(href);
        if (id) {
          return (
            <button
              type="button"
              onClick={() => onCite?.(id)}
              title={titles?.[id] ?? id}
              aria-label={`Citação ${String(children)}: ${titles?.[id] ?? id}`}
              className="mx-0.5 inline-flex h-[1.15rem] min-w-[1.15rem] -translate-y-px items-center justify-center rounded-full bg-amber-400/15 px-1 align-middle text-[0.65rem] font-semibold text-amber-200 ring-1 ring-amber-300/40 transition hover:bg-amber-400/30 hover:text-white"
            >
              {children}
            </button>
          );
        }
        return (
          <a href={href} target="_blank" rel="noreferrer noopener" className="text-sky-300 underline-offset-2 hover:underline">
            {children}
          </a>
        );
      },
    }),
    [onCite, titles],
  );

  return (
    <div className={cn('text-sm text-slate-200', className)}>
      <ReactMarkdown components={components}>{markdown}</ReactMarkdown>
    </div>
  );
});
