// VERTAL Code AI · tela (pensada para celular primeiro).
// Modo novo, ao lado do Vibe Code: não usa nem altera o estado do Vibe Code (projeto ativo,
// conversas, fila de correções). Só aparece com VITE_VERTAL_CODE_AI=true.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Brain, Check, Eye, FileCode2, Hammer, ImagePlus, ListChecks, Loader2, Paperclip, Send, Sparkles, Square, Trash2, Users, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { VertalCodeAiGate } from '@/components/vertal-code-ai/VertalCodeAiGate';
import { VertalProspectorEntryButton } from '@/components/vertal-prospector/VertalProspectorEntryButton';
import { VertalGrowthEntryButton } from '@/components/vertal-growth/VertalGrowthEntryButton';
import { VertalSensesPanel } from '@/components/vertal-code-ai/VertalSensesPanel';
import { VertalTeamProgress } from '@/components/vertal-code-ai/VertalTeamProgress';
import { VertalCodeAiMemoryPanel } from '@/components/vertal-code-ai/VertalCodeAiMemoryPanel';
import { fetchTeamStatus, type TeamStatus } from '@/lib/vertalCodeAi/team';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  errorText,
  functionUrl,
  isMediaOption,
  postAction,
  readHandoff,
  streamRun,
  VERTAL_CODE_AI_NAME,
  VCA_UI_OPTION_LABEL,
  VCA_UI_TEXT_OPTIONS,
  type VcaStreamEvent,
  type VcaUiEffort,
  type VcaUiMode,
  type VcaUiOption,
} from '@/lib/vertalCodeAi/client';
import {
  type ChatItem,
  type DiffItem,
  type PlanData,
  reduceEvent,
  loadSession,
  saveSession,
  historyForModel,
  EFFORT_LABEL,
} from '@/lib/vertalCodeAi/session';

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_TEXT_BYTES = 200 * 1024;

function readAs(file: File, kind: 'text' | 'dataUrl'): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(r.error);
    if (kind === 'text') r.readAsText(file);
    else r.readAsDataURL(file);
  });
}

function DiffView({ diff }: { diff: string }) {
  return (
    <pre className="max-h-80 overflow-auto rounded-md bg-black/40 p-2 text-[11px] leading-4">
      {diff.split('\n').map((l, i) => (
        <div
          key={i}
          className={cn(
            'whitespace-pre',
            l.startsWith('+') && !l.startsWith('+++') && 'bg-emerald-500/15 text-emerald-300',
            l.startsWith('-') && !l.startsWith('---') && 'bg-rose-500/15 text-rose-300',
            l.startsWith('@@') && 'text-sky-300',
          )}
        >
          {l || ' '}
        </div>
      ))}
    </pre>
  );
}

function VertalCodeAIScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const handoff = useMemo(() => readHandoff(location.search), [location.search]);

  const [mode, setMode] = useState<VcaUiMode>('build');
  const [effort, setEffort] = useState<VcaUiEffort>('auto');
  const [option, setOption] = useState<VcaUiOption>('auto');
  const [options, setOptions] = useState<VcaUiOption[]>(VCA_UI_TEXT_OPTIONS);
  const [input, setInput] = useState(handoff.prompt);
  const [items, setItems] = useState<ChatItem[]>(() => loadSession());
  const [running, setRunning] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<Array<{ path: string; content: string }>>([]);
  const [projects, setProjects] = useState<Array<{ id: string; title: string }>>([]);
  const [projectId, setProjectId] = useState<string>(handoff.projectId ?? '');
  const [notice, setNotice] = useState<string | null>(null);
  // Equipe Vertal: só aparece se o servidor liberar (team_status); desligada por padrão.
  const [teamStatus, setTeamStatus] = useState<TeamStatus | null>(null);
  const [teamOn, setTeamOn] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const imageRef = useRef<HTMLInputElement | null>(null);

  // Corpo em bloco: o efeito NÃO pode devolver valor. No Chrome novo scrollIntoView() devolve uma Promise,
  // e o React chamava essa Promise como "limpeza" ao sair da tela → crash "n is not a function" no "Buscar clientes".
  useEffect(() => {
    saveSession(items);
  }, [items]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [items]);
  useEffect(() => {
    // Lista própria de projetos (não mexe no projeto ativo do Vibe Code).
    supabase
      .from('projects')
      .select('id,title')
      .order('updated_at', { ascending: false })
      .limit(50)
      .then(({ data }) => setProjects((data ?? []) as Array<{ id: string; title: string }>));
  }, []);

  const token = async () => (await supabase.auth.getSession()).data.session?.access_token ?? '';
  const [sensesOpen, setSensesOpen] = useState(false);
  const sensesToken = useCallback(async () => (await supabase.auth.getSession()).data.session?.access_token ?? '', []);

  useEffect(() => {
    // Opções que o servidor liberou (imagem/vídeo só aparecem quando ligados).
    (async () => {
      const t = await token();
      if (!t) return;
      try {
        const res = await postAction<{ options?: Array<{ id: VcaUiOption }> }>(t, { action: 'models' });
        const ids = (res.options ?? []).map((o) => o.id).filter((id) => id in VCA_UI_OPTION_LABEL);
        if (ids.length) setOptions(ids);
      } catch {
        /* mantém as opções de texto */
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      setTeamStatus(await fetchTeamStatus(await token()));
    })();
  }, []);

  /** Vertal Imagem / Vertal Vídeo: gera e mostra no balão do agente. */
  const runMedia = useCallback(
    async (prompt: string, kind: 'imagem' | 'video') => {
      const text = prompt.trim();
      if (!text || running) return;
      const t = await token();
      if (!t) {
        setNotice('Entre na sua conta para usar o VERTAL Code AI.');
        return;
      }
      const runId = `r${Date.now()}`;
      const patch = (p: Partial<Extract<ChatItem, { type: 'agent' }>>) =>
        setItems((prev) => prev.map((it) => (it.type === 'agent' && it.id === runId ? { ...it, ...p } : it)));
      setItems((prev) => [
        ...prev,
        { type: 'user', id: `u${runId}`, text, mode: 'build', images: images.length, files: [] },
        { type: 'agent', id: runId, steps: [{ text: kind === 'imagem' ? 'Gerando imagem' : 'Gerando vídeo (pode levar alguns minutos)' }], diffs: [], done: false, prompt: text },
      ]);
      setInput('');
      setRunning(true);
      setNotice(null);
      try {
        if (kind === 'imagem') {
          const res = await postAction<{ images: string[]; text?: string; model: { label: string; cost?: string } }>(t, { action: 'image', prompt: text, images });
          patch({ media: { kind: 'image', urls: res.images }, reply: res.text || undefined, steps: [{ text: `Modelo: ${res.model.label} (${res.model.cost === 'self_hosted' ? 'própria' : 'pago'})` }] });
        } else {
          const sub = await postAction<{ job: string; model: { label: string; cost?: string } }>(t, { action: 'video', prompt: text });
          patch({ steps: [{ text: `Modelo: ${sub.model.label} (${sub.model.cost === 'self_hosted' ? 'própria' : 'pago'})` }, { text: 'Na fila…' }] });
          for (let i = 0; i < 60; i++) {
            await new Promise((r) => setTimeout(r, 10_000));
            const st = await postAction<{ status: string; url: string | null; needsProxy?: boolean; error?: string }>(t, { action: 'video_status', job: sub.job });
            if (st.error) throw new Error(st.error);
            if (st.status === 'completed') {
              let url = st.url;
              if (!url && st.needsProxy) {
                const r = await fetch(functionUrl(), { method: 'POST', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'video_content', job: sub.job }) });
                if (!r.ok) throw new Error('vca_media_failed');
                url = URL.createObjectURL(await r.blob());
              }
              if (url) patch({ media: { kind: 'video', urls: [url] } });
              break;
            }
          }
        }
      } catch (err) {
        patch({ error: errorText(err instanceof Error ? err.message : '') });
      } finally {
        patch({ done: true });
        setRunning(false);
        setImages([]);
      }
    },
    [running, images],
  );

  const run = useCallback(
    async (prompt: string, runMode: VcaUiMode, plan?: PlanData) => {
      const text = prompt.trim();
      if (!text || running) return;
      const t = await token();
      if (!t) {
        setNotice('Entre na sua conta para usar o VERTAL Code AI.');
        return;
      }
      const runId = `r${Date.now()}`;
      const history = historyForModel(items);
      setItems((prev) => [...prev, { type: 'user', id: `u${runId}`, text, mode: runMode, images: images.length, files: attachments.map((a) => a.path) }, { type: 'agent', id: runId, steps: [], diffs: [], done: false, prompt: text }]);
      setInput('');
      setRunning(true);
      setNotice(null);
      const ac = new AbortController();
      abortRef.current = ac;
      try {
        await streamRun(
          t,
          {
            mode: runMode,
            effort,
            option,
            prompt: text,
            history,
            images,
            attachments,
            plan,
            projectId: projectId || null,
            origin: handoff.from === 'chat' ? 'vertal_chat' : handoff.from === 'vibe' ? 'vibe_code' : 'vertal_code_ai',
            action: teamOn && teamStatus ? 'team_run' : 'run',
          },
          (e: VcaStreamEvent) => setItems((prev) => prev.map((it) => (it.type === 'agent' && it.id === runId ? reduceEvent(it, e) : it))),
          ac.signal,
        );
      } catch (err) {
        const code = err instanceof Error ? err.message : '';
        if (code !== 'AbortError' && !ac.signal.aborted) setNotice(errorText(code));
      } finally {
        setItems((prev) => prev.map((it) => (it.type === 'agent' && it.id === runId ? { ...it, done: true } : it)));
        setRunning(false);
        setImages([]);
        setAttachments([]);
        abortRef.current = null;
      }
    },
    [running, items, effort, option, images, attachments, projectId, handoff.from, teamOn, teamStatus],
  );

  const toggleDiff = (agentId: string, path: string) =>
    setItems((prev) =>
      prev.map((it) =>
        it.type === 'agent' && it.id === agentId
          ? { ...it, diffs: it.diffs.map((d) => (d.path === path ? { ...d, selected: !d.selected } : d)) }
          : it,
      ),
    );

  const apply = async (agentId: string, diffs: DiffItem[]) => {
    const chosen = diffs.filter((d) => d.selected && d.status === 'pending');
    if (!chosen.length) return;
    const t = await token();
    try {
      const res = await postAction<{ applied: string[]; conflicts: string[]; skipped: string[] }>(t, {
        action: 'apply',
        projectId: projectId || undefined,
        changes: chosen.map((d) => ({ path: d.path, after: d.after, baseHash: d.baseHash })),
      });
      setItems((prev) =>
        prev.map((it) =>
          it.type === 'agent' && it.id === agentId
            ? {
                ...it,
                diffs: it.diffs.map((d) =>
                  res.applied.includes(d.path) ? { ...d, status: 'applied' } : res.conflicts.includes(d.path) ? { ...d, status: 'conflict' } : res.skipped.includes(d.path) ? { ...d, status: 'skipped' } : d,
                ),
              }
            : it,
        ),
      );
      const parts = [`${res.applied.length} arquivo(s) aplicados no projeto`];
      if (res.conflicts.length) parts.push(`${res.conflicts.length} mudaram enquanto você revisava (peça de novo)`);
      if (res.skipped.length) parts.push(`${res.skipped.length} não aplicados (apagar arquivos se faz no Vibe Code)`);
      setNotice(parts.join(' · '));
    } catch (err) {
      setNotice(errorText(err instanceof Error ? err.message : ''));
    }
  };

  const onFiles = async (files: FileList | null) => {
    for (const f of Array.from(files ?? []).slice(0, 5)) {
      if (f.size > MAX_TEXT_BYTES) {
        setNotice(`${f.name} é grande demais (máx. 200 KB).`);
        continue;
      }
      const content = await readAs(f, 'text');
      setAttachments((prev) => [...prev.filter((a) => a.path !== f.name), { path: f.name, content }]);
    }
  };
  const onImages = async (files: FileList | null) => {
    for (const f of Array.from(files ?? []).slice(0, 4)) {
      if (!f.type.startsWith('image/') || f.size > MAX_IMAGE_BYTES) {
        setNotice(`${f.name}: só imagens até 4 MB.`);
        continue;
      }
      const url = await readAs(f, 'dataUrl');
      setImages((prev) => [...prev, url].slice(0, 4));
    }
  };

  return (
    <div className="flex h-[100dvh] flex-col bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/50 px-3">
        <button type="button" onClick={() => navigate(-1)} aria-label="Voltar" className="rounded-lg p-2 text-muted-foreground hover:bg-secondary">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <Sparkles className="h-5 w-5 text-primary" aria-hidden />
        <h1 className="flex-1 truncate text-sm font-semibold">{VERTAL_CODE_AI_NAME}</h1>
        <VertalProspectorEntryButton from="code" />
        <VertalGrowthEntryButton from="code" projectId={projectId || null} />
        <button type="button" aria-label="Visão, Ouvir e Novela" onClick={() => setSensesOpen(true)} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary">
          <Eye className="h-4 w-4" />
        </button>
        <select
          aria-label="Projeto"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="max-w-[40vw] truncate rounded-md border border-border/60 bg-background px-2 py-1 text-xs"
        >
          <option value="">Cofre pessoal</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
        {teamStatus?.memory && (
          <button type="button" aria-label="Memória da Equipe" onClick={() => setMemoryOpen(true)} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary">
            <Brain className="h-4 w-4" />
          </button>
        )}
        {items.length > 0 && (
          <button type="button" aria-label="Limpar conversa" onClick={() => setItems([])} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </header>

      <main className="flex-1 space-y-3 overflow-y-auto px-3 py-4">
        {items.length === 0 && (
          <div className="mx-auto mt-10 max-w-md space-y-2 text-center text-sm text-muted-foreground">
            <p className="text-base font-medium text-foreground">O que vamos construir?</p>
            <p>
              <b>Planejar</b> monta o passo a passo sem mexer em nada. <b>Construir</b> edita vários arquivos, roda a verificação e
              corrige sozinho antes de te mostrar as mudanças para aprovar.
            </p>
            {handoff.from === 'chat' && <p className="text-primary">Pedido vindo do Vertal Chat.</p>}
          </div>
        )}

        {items.map((it) =>
          it.type === 'user' ? (
            <div key={it.id} className="ml-auto max-w-[90%] rounded-2xl bg-primary/15 px-3 py-2 text-sm">
              <div className="mb-1 text-[10px] uppercase tracking-wide text-primary">{it.mode === 'plan' ? 'Planejar' : 'Construir'}</div>
              <div className="whitespace-pre-wrap">{it.text}</div>
              {(it.images > 0 || it.files.length > 0) && (
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {it.images > 0 && `${it.images} imagem(ns) `}
                  {it.files.length > 0 && `· ${it.files.join(', ')}`}
                </div>
              )}
            </div>
          ) : (
            <div key={it.id} className="max-w-full space-y-2 rounded-2xl border border-border/50 bg-secondary/30 p-3 text-sm">
              <ul className="space-y-1 text-xs text-muted-foreground">
                {it.steps.map((s, i) => (
                  <li key={i} className={cn(s.tone === 'bad' && 'text-rose-400', s.tone === 'good' && 'text-emerald-400')}>
                    {s.text}
                  </li>
                ))}
                {!it.done && (
                  <li className="flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> trabalhando…
                  </li>
                )}
              </ul>
              {it.team && <VertalTeamProgress team={it.team} live={!it.done} />}
              {it.reply && <p className="whitespace-pre-wrap">{it.reply}</p>}
              {it.media?.kind === 'image' &&
                it.media.urls.map((u, i) => <img key={i} src={u} alt="Imagem gerada" className="max-h-96 w-full rounded-xl object-contain" />)}
              {it.media?.kind === 'video' && it.media.urls[0] && (
                <video src={it.media.urls[0]} controls playsInline className="max-h-96 w-full rounded-xl" />
              )}
              {it.error && <p className="text-rose-400">{it.error}</p>}

              {it.plan && (
                <div className="space-y-2 rounded-xl border border-border/60 p-2">
                  {it.plan.goal && <p className="font-medium">{it.plan.goal}</p>}
                  <ol className="list-decimal space-y-1 pl-5">
                    {it.plan.steps.map((s, i) => (
                      <li key={i}>
                        {s.title}
                        {s.files.length > 0 && <span className="block text-[11px] text-muted-foreground">{s.files.join(', ')}</span>}
                      </li>
                    ))}
                  </ol>
                  {it.plan.risks.length > 0 && <p className="text-xs text-amber-400">Riscos: {it.plan.risks.join(' · ')}</p>}
                  {it.plan.questions.length > 0 && <p className="text-xs">Perguntas: {it.plan.questions.join(' · ')}</p>}
                  {it.done && (
                    <Button size="sm" className="w-full gap-2" disabled={running} onClick={() => run(it.prompt ?? 'Implemente o plano aprovado.', 'build', it.plan)}>
                      <Hammer className="h-4 w-4" /> Construir este plano
                    </Button>
                  )}
                </div>
              )}

              {it.diffs.length > 0 && (
                <div className="space-y-2">
                  {it.diffs.map((d) => (
                    <details key={d.path} className="rounded-xl border border-border/60">
                      <summary className="flex cursor-pointer items-center gap-2 px-2 py-2 text-xs">
                        <input
                          type="checkbox"
                          aria-label={`Incluir ${d.path}`}
                          checked={d.selected}
                          disabled={d.status !== 'pending'}
                          onChange={() => toggleDiff(it.id, d.path)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <FileCode2 className="h-3.5 w-3.5 shrink-0" />
                        <span className="min-w-0 flex-1 truncate font-mono">{d.path}</span>
                        <span className="text-emerald-400">+{d.added}</span>
                        <span className="text-rose-400">-{d.removed}</span>
                        {d.status === 'applied' && <Check className="h-3.5 w-3.5 text-emerald-400" aria-label="aplicado" />}
                        {d.status === 'conflict' && <X className="h-3.5 w-3.5 text-amber-400" aria-label="conflito" />}
                      </summary>
                      <DiffView diff={d.diff} />
                    </details>
                  ))}
                  {it.done && it.diffs.some((d) => d.status === 'pending') && (
                    <Button size="sm" className="w-full gap-2" onClick={() => apply(it.id, it.diffs)}>
                      <Check className="h-4 w-4" /> Aplicar selecionados no projeto
                    </Button>
                  )}
                </div>
              )}
            </div>
          ),
        )}
        <div ref={endRef} />
      </main>

      {notice && (
        <div role="status" className="mx-3 mb-2 rounded-lg border border-border/60 bg-secondary/50 px-3 py-2 text-xs">
          {notice}
        </div>
      )}

      <footer className="shrink-0 space-y-2 border-t border-border/50 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-2">
          <div className="flex rounded-full border border-border/60 p-0.5" role="group" aria-label="Modo">
            {(['plan', 'build'] as VcaUiMode[]).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={cn('flex items-center gap-1 rounded-full px-3 py-1 text-xs', mode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}
              >
                {m === 'plan' ? <ListChecks className="h-3.5 w-3.5" /> : <Hammer className="h-3.5 w-3.5" />}
                {m === 'plan' ? 'Planejar' : 'Construir'}
              </button>
            ))}
          </div>
          {teamStatus && !isMediaOption(option) && (
            <button
              type="button"
              aria-pressed={teamOn}
              aria-label="Equipe Vertal"
              title="Equipe Vertal: Gerente, Encarregado, Engenheiros, Revisor e Entregador"
              onClick={() => setTeamOn((v) => !v)}
              className={cn('flex items-center gap-1 rounded-full border px-2 py-1 text-xs', teamOn ? 'border-primary bg-primary text-primary-foreground' : 'border-border/60 text-muted-foreground')}
            >
              <Users className="h-3.5 w-3.5" /> Equipe
            </button>
          )}
          <select
            aria-label="Modelo Vertal"
            value={option}
            onChange={(e) => setOption(e.target.value as VcaUiOption)}
            className="max-w-[34vw] rounded-full border border-border/60 bg-background px-2 py-1 text-xs"
          >
            {options.map((k) => (
              <option key={k} value={k}>
                {VCA_UI_OPTION_LABEL[k]}
              </option>
            ))}
          </select>
          <select
            aria-label="Esforço de raciocínio"
            value={effort}
            onChange={(e) => setEffort(e.target.value as VcaUiEffort)}
            className="rounded-full border border-border/60 bg-background px-2 py-1 text-xs"
          >
            {(Object.keys(EFFORT_LABEL) as VcaUiEffort[]).map((k) => (
              <option key={k} value={k}>
                {EFFORT_LABEL[k]}
              </option>
            ))}
          </select>
          <div className="ml-auto flex gap-1">
            <button type="button" aria-label="Anexar arquivo" onClick={() => fileRef.current?.click()} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary">
              <Paperclip className="h-4 w-4" />
            </button>
            <button type="button" aria-label="Anexar imagem" onClick={() => imageRef.current?.click()} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary">
              <ImagePlus className="h-4 w-4" />
            </button>
          </div>
          <input ref={fileRef} type="file" multiple hidden onChange={(e) => onFiles(e.target.files)} />
          <input ref={imageRef} type="file" accept="image/*" multiple hidden onChange={(e) => onImages(e.target.files)} />
        </div>
        {(images.length > 0 || attachments.length > 0) && (
          <div className="flex flex-wrap gap-1 text-[11px]">
            {attachments.map((a) => (
              <span key={a.path} className="rounded-full bg-secondary px-2 py-0.5">
                {a.path}
              </span>
            ))}
            {images.length > 0 && <span className="rounded-full bg-secondary px-2 py-0.5">{images.length} imagem(ns)</span>}
          </div>
        )}
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={mode === 'plan' ? 'Descreva o que quer planejar…' : 'Descreva o que quer construir ou corrigir…'}
            rows={2}
            className="min-h-[44px] flex-1 resize-none text-base sm:text-sm"
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || !(e.metaKey || e.ctrlKey)) return;
              if (isMediaOption(option)) runMedia(input, option as 'imagem' | 'video');
              else run(input, mode);
            }}
          />
          {running ? (
            <Button size="icon" variant="outline" aria-label="Parar" onClick={() => abortRef.current?.abort()}>
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button size="icon" aria-label="Enviar" disabled={!input.trim()} onClick={() => {
                if (isMediaOption(option)) runMedia(input, option as 'imagem' | 'video');
                else run(input, mode);
              }}>
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </footer>
      {sensesOpen && <VertalSensesPanel token={sensesToken} onClose={() => setSensesOpen(false)} />}
      {memoryOpen && <VertalCodeAiMemoryPanel getToken={token} projectId={projectId || null} onClose={() => setMemoryOpen(false)} />}
    </div>
  );
}

/** Rota: só usuários liberados pelo servidor (VERTAL_CODE_AI_USER_IDS) veem a tela; os demais, "não encontrada". */
export default function VertalCodeAIPage() {
  return (
    <VertalCodeAiGate>
      <VertalCodeAIScreen />
    </VertalCodeAiGate>
  );
}
