import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, Bookmark, Check, ChevronDown, Copy, Loader2, MessageSquarePlus, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
  chatTitleFrom,
  estimateTokens,
  formatTokens,
  makeChat,
  makeNote,
  newId,
  nowIso,
  stripCitations,
  type ChatMessage,
  type ChatSession,
  type ContextItem,
  type Notebook,
} from '@/lib/notebook/model';
import { NOTEBOOK_AI_COSTS, runNotebookAi } from '@/services/notebookAiService';
import { NOTEBOOK_LIMITS } from '../../../supabase/functions/_shared/notebookAi';
import { NotebookMarkdown } from './NotebookMarkdown';
import type { UpdateWorkspace } from './useNotebookWorkspace';

const STARTERS = [
  'Resuma as fontes em 5 pontos',
  'Quais são as ideias mais surpreendentes?',
  'Onde as fontes concordam e discordam?',
  'Crie um plano de estudo a partir disso',
];

interface Props {
  notebook: Notebook;
  chats: ChatSession[];
  context: ContextItem[];
  titles: Record<string, string>;
  update: UpdateWorkspace;
  onCite: (id: string) => void;
}

export function ChatPanel({ notebook, chats, context, titles, update, onCite }: Props) {
  const [activeId, setActiveId] = useState<string | null>(chats[0]?.id ?? null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const session = chats.find((c) => c.id === activeId) ?? null;
  const tokens = useMemo(() => estimateTokens(context), [context]);
  const overBudget = tokens * 4 > NOTEBOOK_LIMITS.contextMaxChars;
  const suggestions = notebook.guide?.questions?.length ? notebook.guide.questions.slice(0, 4) : STARTERS;

  useEffect(() => {
    if (activeId && !chats.some((c) => c.id === activeId)) setActiveId(chats[0]?.id ?? null);
  }, [chats, activeId]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' });
  }, [session?.messages.length, sending]);

  const patchSession = (id: string, fn: (c: ChatSession) => ChatSession) =>
    update((ws) => ({ ...ws, chats: ws.chats.map((c) => (c.id === id ? fn(c) : c)) }));

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || sending) return;
    if (context.length === 0) {
      toast.error('Coloque ao menos uma fonte ou nota no contexto.');
      return;
    }
    let target = session;
    if (!target) {
      target = makeChat(notebook.id, chatTitleFrom(question));
      const created = target;
      update((ws) => ({ ...ws, chats: [created, ...ws.chats] }));
      setActiveId(created.id);
    }
    const id = target.id;
    const userMsg: ChatMessage = { id: newId('m'), role: 'user', content: question, createdAt: nowIso() };
    const history = [...target.messages, userMsg];
    patchSession(id, (c) => ({
      ...c,
      title: c.messages.length === 0 ? chatTitleFrom(question) : c.title,
      messages: [...c.messages, userMsg],
      updatedAt: nowIso(),
    }));
    setInput('');
    setSending(true);
    try {
      const out = await runNotebookAi({
        action: 'chat',
        notebook: { name: notebook.name, description: notebook.description },
        context,
        messages: history.map((m) => ({ role: m.role, content: m.role === 'assistant' ? stripCitations(m.content) : m.content })),
      });
      const reply: ChatMessage = { id: newId('m'), role: 'assistant', content: out.answer, citations: out.citations, createdAt: nowIso() };
      patchSession(id, (c) => ({ ...c, messages: [...c.messages, reply], updatedAt: nowIso() }));
    } catch (e) {
      toast.error((e as Error).message);
      // Devolve a pergunta para a caixa, sem perder o texto.
      patchSession(id, (c) => ({ ...c, messages: c.messages.filter((m) => m.id !== userMsg.id) }));
      setInput(question);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const newChat = () => {
    setActiveId(null);
    setInput('');
    inputRef.current?.focus();
  };

  const removeChat = (id: string) => update((ws) => ({ ...ws, chats: ws.chats.filter((c) => c.id !== id) }));

  const saveNote = (m: ChatMessage) => {
    const q = session?.messages[session.messages.findIndex((x) => x.id === m.id) - 1]?.content ?? 'Resposta da IA';
    update((ws) => ({ ...ws, notes: [makeNote(notebook.id, chatTitleFrom(q), m.content, 'ai'), ...ws.notes] }));
    toast.success('Resposta salva nas notas');
  };

  const copy = async (m: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(stripCitations(m.content));
      setCopied(m.id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error('Não consegui copiar');
    }
  };

  return (
    <section aria-label="Chat" className="flex h-full min-h-0 flex-col">
      <header className="flex items-center justify-between gap-2 border-b border-white/5 px-4 py-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1 text-left text-sm font-semibold text-white hover:bg-white/5">
              <span className="truncate">{session?.title ?? 'Nova conversa'}</span>
              <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72">
            <DropdownMenuItem onClick={newChat}>
              <MessageSquarePlus className="mr-2 h-4 w-4" /> Nova conversa
            </DropdownMenuItem>
            {chats.length > 0 && <DropdownMenuSeparator />}
            {chats.map((c) => (
              <DropdownMenuItem key={c.id} onClick={() => setActiveId(c.id)} className="group justify-between">
                <span className={cn('truncate', c.id === activeId && 'font-semibold text-amber-200')}>{c.title}</span>
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`Excluir conversa ${c.title}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeChat(c.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.stopPropagation();
                      removeChat(c.id);
                    }
                  }}
                  className="ml-2 rounded p-1 text-slate-500 opacity-0 hover:text-rose-300 group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button size="sm" variant="ghost" onClick={newChat} className="h-8 gap-1 text-slate-300">
          <MessageSquarePlus className="h-4 w-4" /> <span className="hidden sm:inline">Nova</span>
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
        {!session || session.messages.length === 0 ? (
          <div className="mx-auto flex max-w-lg flex-col items-center pt-6 text-center">
            <span className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-300 via-orange-500 to-rose-500 shadow-xl shadow-orange-500/25">
              <Sparkles className="h-7 w-7 text-white" />
              <span className="absolute inset-0 -z-10 animate-pulse rounded-2xl bg-orange-500/30 blur-xl" />
            </span>
            <h3 className="mt-4 text-xl font-semibold text-white">Converse com suas fontes</h3>
            <p className="mt-1 text-sm text-slate-400">
              A KUBO IA responde com base no contexto e mostra de onde veio cada informação.
            </p>
            <div className="mt-6 grid w-full gap-2 sm:grid-cols-2">
              {suggestions.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => send(q)}
                  disabled={sending || context.length === 0}
                  className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left text-sm text-slate-200 transition hover:border-amber-300/40 hover:bg-amber-400/5 disabled:opacity-40"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ol className="mx-auto max-w-3xl space-y-5">
            {session.messages.map((m) => (
              <li key={m.id} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                {m.role === 'user' ? (
                  <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-gradient-to-br from-amber-400 to-orange-500 px-4 py-2.5 text-sm font-medium text-slate-950 shadow-lg shadow-orange-500/10">
                    {m.content}
                  </p>
                ) : (
                  <div className="group w-full max-w-[95%]">
                    <div className="rounded-2xl rounded-bl-md border border-white/10 bg-white/[0.04] px-4 py-3">
                      <NotebookMarkdown text={m.content} titles={titles} onCite={onCite} />
                    </div>
                    <div className="mt-1 flex items-center gap-1 opacity-70 transition group-hover:opacity-100">
                      <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs text-slate-400" onClick={() => saveNote(m)}>
                        <Bookmark className="h-3.5 w-3.5" /> Salvar como nota
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs text-slate-400" onClick={() => copy(m)}>
                        {copied === m.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} Copiar
                      </Button>
                      {m.citations && m.citations.length > 0 && (
                        <span className="ml-auto text-[11px] text-slate-500">
                          {m.citations.length} fonte{m.citations.length > 1 ? 's' : ''} citada{m.citations.length > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </li>
            ))}
            {sending && (
              <li className="flex items-center gap-2 text-sm text-slate-400" aria-live="polite">
                <span className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="h-2 w-2 animate-bounce rounded-full bg-amber-300" style={{ animationDelay: `${i * 120}ms` }} />
                  ))}
                </span>
                Lendo as fontes…
              </li>
            )}
          </ol>
        )}
        <div ref={endRef} />
      </div>

      <form
        className="border-t border-white/5 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <div className="mx-auto max-w-3xl">
          <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-2 focus-within:border-amber-300/50 focus-within:ring-2 focus-within:ring-amber-300/10">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={1}
              placeholder={context.length ? 'Pergunte algo sobre as fontes…' : 'Adicione fontes para começar'}
              aria-label="Pergunta para a IA"
              className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-sm text-white outline-none placeholder:text-slate-500"
            />
            <Button
              type="submit"
              size="icon"
              disabled={sending || !input.trim()}
              aria-label="Enviar"
              className="h-10 w-10 shrink-0 rounded-xl bg-amber-400 text-slate-950 hover:bg-amber-300"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
            </Button>
          </div>
          <p className={cn('mt-1.5 px-1 text-[11px]', overBudget ? 'text-amber-300' : 'text-slate-500')}>
            {context.length} {context.length === 1 ? 'item' : 'itens'} no contexto · ~{formatTokens(tokens)} tokens
            {overBudget ? ' · acima do limite: cada fonte será cortada proporcionalmente (use o modo Insights)' : ''} ·{' '}
            {NOTEBOOK_AI_COSTS.chat} crédito por pergunta
          </p>
        </div>
      </form>
    </section>
  );
}
