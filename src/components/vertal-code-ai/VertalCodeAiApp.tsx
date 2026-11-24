import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, ClipboardList, Hammer, ImagePlus, KeyRound, Loader2, Paperclip, Send, Settings2, ShieldCheck, Square, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useWorkspaceProject } from "@/hooks/useWorkspaceProject";
import { vcaiApi, VcaiError, type ProposedFile, type StatusResponse, type VcaiApi, type PollResponse } from "@/lib/vertalCodeAi/api";
import { type Attachment, type CustomProvider, type ProfileId, type ReasoningEffort, type VcaiPlan } from "@/lib/vertalCodeAi/core";
import { takeHandoff } from "@/lib/vertalCodeAi/handoff";
import { loadCustomProviders, saveCustomProviders } from "@/lib/vertalCodeAi/customProviders";
import { runBuildLoop, type LoopEvent } from "@/lib/vertalCodeAi/loop";
import { VERTAL_CODE_AI_NAME } from "@/lib/vertalCodeAi/flags";
import { VertalCodeAiDiffReview } from "./VertalCodeAiDiffReview";
import { VertalCodeAiProvidersDialog } from "./VertalCodeAiProvidersDialog";
import { VertalCodeAiKeysDialog } from "./VertalCodeAiKeysDialog";
import { VertalCodeAiOpsPanel } from "./VertalCodeAiOpsPanel";

type Mode = "plan" | "build";

type Entry =
  | { id: string; kind: "user"; text: string; attachments: string[]; mode: Mode }
  | { id: string; kind: "plan"; plan: VcaiPlan; prompt: string }
  | { id: string; kind: "build"; summary: string; notes: string[]; ok: boolean; reason: string; poll: PollResponse | null; tested: boolean }
  | { id: string; kind: "error"; text: string }
  | { id: string; kind: "progress"; text: string };

const EFFORTS: Array<{ id: ReasoningEffort; label: string }> = [
  { id: "off", label: "Sem raciocínio" },
  { id: "low", label: "Raciocínio baixo" },
  { id: "medium", label: "Raciocínio médio" },
  { id: "high", label: "Raciocínio alto" },
];

const TEXT_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|json|md|txt|css|scss|html|py|sql|ya?ml|toml|csv|log|env\.example|sh|go|rs|java|kt|swift|vue|svelte)$/i;
const MAX_IMAGE = 4_000_000;
const MAX_TEXT = 200_000;

const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random()));

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

const STEP_LABEL: Record<string, string> = { install: "Instalar", typecheck: "Tipos", test: "Testes", build: "Build", custom: "Comando" };

export function VertalCodeAiApp({ api = vcaiApi }: { api?: VcaiApi }) {
  const { projectId, projects, loadProjects } = useWorkspaceProject();
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("plan");
  const [profileKey, setProfileKey] = useState<string>("auto");
  const [effort, setEffort] = useState<ReasoningEffort>("medium");
  const [testInSandbox, setTestInSandbox] = useState(true);
  const [maxFix, setMaxFix] = useState(2);
  const [prompt, setPrompt] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [running, setRunning] = useState(false);
  const [proposal, setProposal] = useState<ProposedFile[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [providers, setProviders] = useState<CustomProvider[]>(() => (typeof localStorage !== "undefined" ? loadCustomProviders() : []));
  const [providersOpen, setProvidersOpen] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  const [view, setView] = useState<"code" | "ops">("code");
  const [lastPlan, setLastPlan] = useState<{ plan: VcaiPlan; prompt: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    let alive = true;
    api
      .status()
      .then((s) => {
        if (!alive) return;
        setStatus(s);
        if (!s.sandbox) setTestInSandbox(false);
      })
      .catch((e) => alive && setStatusError(e instanceof Error ? e.message : "Indisponível."));
    return () => {
      alive = false;
    };
  }, [api]);

  // Vindo do Vertal Chat: abre em modo Plano com o pedido e o contexto da conversa.
  useEffect(() => {
    const h = takeHandoff();
    if (!h) return;
    setMode("plan");
    setPrompt(h.prompt);
    if (h.context) setAttachments([{ name: "conversa-do-vertal-chat.txt", kind: "text", data: h.context }]);
    toast.message("Pedido trazido do Vertal Chat. Revise e envie.");
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
  }, [entries.length, proposal.length]);

  const projectTitle = useMemo(() => projects.find((p) => p.id === projectId)?.title, [projects, projectId]);

  const profileOptions = useMemo(() => {
    const base = (status?.profiles ?? []).map((p) => ({ key: p.id as string, label: p.label }));
    const custom = providers.map((p) => ({ key: `custom:${p.label}`, label: `Provedor próprio · ${p.label}` }));
    return [...base, ...custom];
  }, [status, providers]);

  const resolveProfile = (): { profile: ProfileId; customProvider?: CustomProvider } => {
    if (profileKey.startsWith("custom:")) {
      const p = providers.find((x) => `custom:${x.label}` === profileKey);
      if (p) return { profile: "custom", customProvider: p };
    }
    return { profile: (profileKey as ProfileId) || "auto" };
  };

  const push = (e: Entry) => setEntries((prev) => [...prev.filter((x) => x.kind !== "progress"), e]);
  const progress = (text: string) => setEntries((prev) => [...prev.filter((x) => x.kind !== "progress"), { id: "progress", kind: "progress", text }]);
  const clearProgress = () => setEntries((prev) => prev.filter((x) => x.kind !== "progress"));

  type Turn = { role: "user" | "assistant"; content: string };
  const history = useMemo<Turn[]>(
    () =>
      entries
        .flatMap((e): Turn[] =>
          e.kind === "user"
            ? [{ role: "user" as const, content: e.text }]
            : e.kind === "plan"
              ? [{ role: "assistant" as const, content: `Plano: ${e.plan.summary}` }]
              : e.kind === "build"
                ? [{ role: "assistant" as const, content: `Construído: ${e.summary}` }]
                : [],
        )
        .slice(-6),
    [entries],
  );

  const onPickFiles = async (list: FileList | null) => {
    if (!list) return;
    const next: Attachment[] = [];
    for (const f of Array.from(list).slice(0, 8)) {
      try {
        if (f.type.startsWith("image/")) {
          if (f.size > MAX_IMAGE) {
            toast.error(`${f.name}: imagem maior que 4 MB.`);
            continue;
          }
          next.push({ name: f.name, kind: "image", data: await readAsDataUrl(f) });
        } else if (f.type.startsWith("text/") || TEXT_EXT.test(f.name) || f.type === "application/json") {
          if (f.size > MAX_TEXT) {
            toast.error(`${f.name}: arquivo de texto maior que 200 KB.`);
            continue;
          }
          next.push({ name: f.name, kind: "text", data: await f.text() });
        } else {
          toast.error(`${f.name}: tipo não suportado (use imagens ou arquivos de texto/código).`);
        }
      } catch {
        toast.error(`Não consegui ler ${f.name}.`);
      }
    }
    setAttachments((prev) => [...prev, ...next].slice(0, 8));
    if (fileInput.current) fileInput.current.value = "";
  };

  const handleError = (e: unknown) => {
    if (e instanceof DOMException && e.name === "AbortError") {
      push({ id: uid(), kind: "error", text: "Cancelado." });
      return;
    }
    push({ id: uid(), kind: "error", text: e instanceof VcaiError || e instanceof Error ? e.message : "Algo deu errado." });
  };

  const runBuild = useCallback(
    async (text: string, plan: VcaiPlan | null, atts: Attachment[]) => {
      const { profile, customProvider } = resolveProfile();
      const controller = new AbortController();
      abortRef.current = controller;
      const willTest = testInSandbox && !!status?.sandbox;
      progress("Escrevendo as mudanças…");
      const onEvent = (ev: LoopEvent) => {
        if (ev.kind === "build" && ev.round > 0) progress(`Correção ${ev.round}: novas mudanças prontas.`);
        if (ev.kind === "sandbox") progress(ev.status === "starting" ? "Subindo o sandbox e instalando dependências…" : "Rodando os testes de novo…");
        if (ev.kind === "poll") {
          const cur = ev.poll.steps.filter((s) => s.code === null).map((s) => STEP_LABEL[s.name] ?? s.name).pop();
          if (cur) progress(`Sandbox: ${cur}…`);
        }
        if (ev.kind === "fixing") progress(`${ev.reason} (rodada ${ev.round} de ${maxFix})`);
      };
      const result = await runBuildLoop({
        api,
        request: { projectId: projectId || undefined, prompt: text, profile, effort, attachments: atts, history, customProvider },
        plan,
        test: willTest,
        maxFixRounds: maxFix,
        onEvent,
        signal: controller.signal,
      });
      push({ id: uid(), kind: "build", summary: result.summary, notes: result.notes, ok: result.ok, reason: result.reason, poll: result.lastPoll, tested: willTest });
      setProposal(result.files);
      setSelected(new Set(result.files.filter((f) => f.problems.length === 0).map((f) => f.path)));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [api, projectId, effort, history, maxFix, testInSandbox, status, profileKey, providers],
  );

  const send = async () => {
    const text = prompt.trim();
    if (!text || running) return;
    const atts = attachments;
    push({ id: uid(), kind: "user", text, attachments: atts.map((a) => a.name), mode });
    setPrompt("");
    setAttachments([]);
    setRunning(true);
    try {
      if (mode === "plan") {
        const { profile, customProvider } = resolveProfile();
        const controller = new AbortController();
        abortRef.current = controller;
        progress("Lendo o projeto e planejando…");
        const res = await api.plan({ projectId: projectId || undefined, prompt: text, profile, effort, attachments: atts, history, customProvider }, controller.signal);
        push({ id: uid(), kind: "plan", plan: res.plan, prompt: text });
        setLastPlan({ plan: res.plan, prompt: text });
      } else {
        await runBuild(text, lastPlan?.plan ?? null, atts);
      }
    } catch (e) {
      handleError(e);
    } finally {
      clearProgress();
      setRunning(false);
      abortRef.current = null;
    }
  };

  const buildPlan = async (plan: VcaiPlan, text: string) => {
    if (running) return;
    setMode("build");
    setRunning(true);
    push({ id: uid(), kind: "user", text: "Construir este plano", attachments: [], mode: "build" });
    try {
      await runBuild(text, plan, []);
    } catch (e) {
      handleError(e);
    } finally {
      clearProgress();
      setRunning(false);
      abortRef.current = null;
    }
  };

  const apply = async () => {
    const files = proposal.filter((f) => selected.has(f.path));
    if (!files.length || applying) return;
    setApplying(true);
    try {
      const res = await api.apply({ projectId: projectId || undefined, files: files.map((f) => ({ path: f.path, content: f.after, baseHash: f.baseHash })) });
      if (res.ok) {
        toast.success(`${files.length} arquivo(s) aplicado(s).`);
        setProposal((prev) => prev.filter((f) => !selected.has(f.path)));
        setSelected(new Set());
      } else {
        toast.error(res.message);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui aplicar.");
    } finally {
      setApplying(false);
    }
  };

  const toggle = (path: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const disabled = !!statusError;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#030303] text-foreground">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border/40 bg-background/70 px-3 backdrop-blur-xl">
        <Link to="/vibe-code" className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Voltar ao Vibe Code">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold">{VERTAL_CODE_AI_NAME}</h1>
          <p className="truncate text-[11px] text-muted-foreground">
            {projectTitle ? `Projeto: ${projectTitle}` : "Projeto atual do Vibe Code"}
            {status?.freeRequestsLeft != null ? ` · ${status.freeRequestsLeft} pedidos grátis hoje` : ""}
          </p>
        </div>
        {status?.operator && (
          <Button variant={view === "ops" ? "secondary" : "ghost"} size="icon" aria-label="Modo Operação" onClick={() => setView(view === "ops" ? "code" : "ops")}>
            <ShieldCheck className="h-5 w-5" />
          </Button>
        )}
        <Button variant="ghost" size="icon" aria-label="Chaves da API" onClick={() => setKeysOpen(true)} disabled={disabled}>
          <KeyRound className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Provedores próprios" onClick={() => setProvidersOpen(true)} disabled={disabled}>
          <Settings2 className="h-5 w-5" />
        </Button>
      </header>

      {view === "ops" && status?.operator ? (
        <main className="mx-auto w-full max-w-3xl flex-1 px-3 py-3">
          <VertalCodeAiOpsPanel />
        </main>
      ) : (
      <>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-3 px-3 py-3 pb-56">
        {statusError && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200" role="alert">
            {statusError}
          </div>
        )}
        {!statusError && entries.length === 0 && (
          <div className="rounded-xl border border-border/50 bg-card/40 p-4 text-sm text-muted-foreground">
            <p className="mb-1 font-medium text-foreground">Planeje, construa e teste na nuvem.</p>
            <p>
              <b>Plano</b> lê o projeto e propõe os passos sem mexer em nada. <b>Construir</b> escreve as mudanças, testa no sandbox e corrige
              sozinho. Nada é gravado até você revisar os diffs e tocar em <b>Aplicar</b>.
            </p>
          </div>
        )}

        {entries.map((e) => {
          if (e.kind === "user")
            return (
              <div key={e.id} className="ml-auto max-w-[90%] rounded-2xl rounded-br-sm bg-primary/15 px-3 py-2 text-sm">
                <span className="mb-1 block text-[10px] uppercase tracking-wide text-primary">{e.mode === "plan" ? "Plano" : "Construir"}</span>
                <p className="whitespace-pre-wrap break-words">{e.text}</p>
                {e.attachments.length > 0 && <p className="mt-1 text-[11px] text-muted-foreground">📎 {e.attachments.join(", ")}</p>}
              </div>
            );
          if (e.kind === "progress")
            return (
              <div key={e.id} className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
                <Loader2 className="h-4 w-4 animate-spin" />
                {e.text}
              </div>
            );
          if (e.kind === "error")
            return (
              <div key={e.id} className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200" role="alert">
                {e.text}
              </div>
            );
          if (e.kind === "plan")
            return (
              <div key={e.id} className="rounded-xl border border-border/60 bg-card/50 p-3 text-sm">
                <p className="mb-2 flex items-center gap-2 font-medium">
                  <ClipboardList className="h-4 w-4 text-primary" /> Plano
                </p>
                <p className="mb-2">{e.plan.summary}</p>
                <ol className="mb-2 list-decimal space-y-1.5 pl-5">
                  {e.plan.steps.map((s, i) => (
                    <li key={i}>
                      <span className="font-medium">{s.title}</span>
                      {s.detail && <span className="text-muted-foreground"> — {s.detail}</span>}
                      {s.files.length > 0 && <span className="block font-mono text-[11px] text-sky-400">{s.files.join(", ")}</span>}
                    </li>
                  ))}
                </ol>
                {e.plan.questions.length > 0 && (
                  <div className="mb-2 text-amber-200">
                    <p className="text-xs font-medium uppercase">Perguntas</p>
                    <ul className="list-disc pl-5">{e.plan.questions.map((q, i) => <li key={i}>{q}</li>)}</ul>
                  </div>
                )}
                {e.plan.risks.length > 0 && (
                  <div className="mb-2 text-muted-foreground">
                    <p className="text-xs font-medium uppercase">Riscos</p>
                    <ul className="list-disc pl-5">{e.plan.risks.map((q, i) => <li key={i}>{q}</li>)}</ul>
                  </div>
                )}
                <Button size="sm" className="mt-1 w-full gap-2 sm:w-auto" disabled={running || disabled} onClick={() => buildPlan(e.plan, e.prompt)}>
                  <Hammer className="h-4 w-4" /> Construir este plano
                </Button>
              </div>
            );
          return (
            <div key={e.id} className="rounded-xl border border-border/60 bg-card/50 p-3 text-sm">
              <p className="mb-1 flex items-center gap-2 font-medium">
                {e.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <XCircle className="h-4 w-4 text-amber-400" />}
                {e.reason}
              </p>
              {e.summary && <p className="mb-1">{e.summary}</p>}
              {e.notes.length > 0 && <ul className="mb-1 list-disc pl-5 text-muted-foreground">{e.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
              {e.tested && e.poll && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {e.poll.steps.map((s, i) => (
                    <span
                      key={i}
                      className={cn("rounded-full border px-2 py-0.5 text-[11px]", s.code === 0 ? "border-emerald-500/40 text-emerald-300" : "border-rose-500/40 text-rose-300")}
                    >
                      {STEP_LABEL[s.name] ?? s.name} {s.code === 0 ? "ok" : "falhou"}
                    </span>
                  ))}
                </div>
              )}
              {e.poll?.failure && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-muted-foreground">Ver erros do sandbox</summary>
                  <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-black/60 p-2 text-[11px]">{e.poll.failure}</pre>
                </details>
              )}
            </div>
          );
        })}

        {proposal.length > 0 && (
          <section className="rounded-xl border border-primary/30 bg-card/60 p-3" aria-label="Revisão das mudanças">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Revisar mudanças ({proposal.length})</p>
              <Button size="sm" onClick={apply} disabled={!selected.size || applying || running || status?.canApply === false} className="gap-2">
                {applying && <Loader2 className="h-4 w-4 animate-spin" />}
                Aplicar {selected.size ? `(${selected.size})` : ""}
              </Button>
            </div>
            {status?.canApply === false && (
              <p className="mb-2 text-xs text-amber-300">Neste servidor, aplicar no projeto ainda não está liberado para a sua conta. Copie as mudanças pelo diff.</p>
            )}
            <VertalCodeAiDiffReview files={proposal} selected={selected} onToggle={toggle} />
            <button type="button" className="mt-2 text-xs text-muted-foreground underline" onClick={() => setProposal([])}>
              Descartar todas
            </button>
          </section>
        )}
        <div ref={bottomRef} />
      </main>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/40 bg-background/90 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl">
        <div className="mx-auto max-w-3xl space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="inline-flex rounded-full border border-border/60 p-0.5" role="tablist" aria-label="Modo">
              {(["plan", "build"] as Mode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => setMode(m)}
                  className={cn("rounded-full px-3 py-1.5 font-medium", mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
                >
                  {m === "plan" ? "Plano" : "Construir"}
                </button>
              ))}
            </div>
            <select
              aria-label="Modelo"
              value={profileKey}
              onChange={(e) => setProfileKey(e.target.value)}
              className="max-w-[60vw] rounded-full border border-border/60 bg-background px-2 py-1.5"
              disabled={disabled}
            >
              {profileOptions.length === 0 && <option value="auto">{VERTAL_CODE_AI_NAME} · Auto</option>}
              {profileOptions.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
            <select aria-label="Esforço de raciocínio" value={effort} onChange={(e) => setEffort(e.target.value as ReasoningEffort)} className="rounded-full border border-border/60 bg-background px-2 py-1.5">
              {EFFORTS.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
            {mode === "build" && (
              <>
                <label className={cn("inline-flex items-center gap-1.5", !status?.sandbox && "opacity-50")}>
                  <input type="checkbox" className="h-4 w-4 accent-primary" checked={testInSandbox && !!status?.sandbox} disabled={!status?.sandbox} onChange={(e) => setTestInSandbox(e.target.checked)} />
                  Testar no sandbox
                </label>
                <select aria-label="Correções automáticas" value={maxFix} onChange={(e) => setMaxFix(Number(e.target.value))} className="rounded-full border border-border/60 bg-background px-2 py-1.5">
                  {[0, 1, 2, 3].map((n) => (
                    <option key={n} value={n}>
                      {n === 0 ? "Sem auto-correção" : `Até ${n} correção(ões)`}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>

          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {attachments.map((a, i) => (
                <span key={`${a.name}-${i}`} className="inline-flex max-w-full items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-[11px]">
                  {a.kind === "image" ? <ImagePlus className="h-3 w-3" /> : <Paperclip className="h-3 w-3" />}
                  <span className="max-w-[40vw] truncate">{a.name}</span>
                  <button type="button" aria-label={`Remover ${a.name}`} onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2">
            <input ref={fileInput} type="file" multiple className="hidden" accept="image/*,text/*,.ts,.tsx,.js,.jsx,.json,.md,.css,.html,.py,.sql,.yml,.yaml,.toml,.csv,.log" onChange={(e) => onPickFiles(e.target.files)} />
            <Button variant="outline" size="icon" className="h-11 w-11 shrink-0" aria-label="Anexar arquivos ou imagens" onClick={() => fileInput.current?.click()} disabled={disabled}>
              <Paperclip className="h-5 w-5" />
            </Button>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
              }}
              placeholder={mode === "plan" ? "O que você quer fazer? Eu planejo antes de mexer em qualquer coisa." : "Descreva a mudança. Eu escrevo, testo e corrijo."}
              className="max-h-40 min-h-[44px] flex-1 resize-none text-base sm:text-sm"
              rows={2}
              disabled={disabled}
              aria-label="Pedido"
            />
            {running ? (
              <Button size="icon" variant="destructive" className="h-11 w-11 shrink-0" aria-label="Parar" onClick={() => abortRef.current?.abort()}>
                <Square className="h-5 w-5" />
              </Button>
            ) : (
              <Button size="icon" className="h-11 w-11 shrink-0" aria-label="Enviar" onClick={() => void send()} disabled={!prompt.trim() || disabled}>
                <Send className="h-5 w-5" />
              </Button>
            )}
          </div>
        </div>
      </div>

      </>
      )}

      <VertalCodeAiKeysDialog open={keysOpen} onOpenChange={setKeysOpen} />
      <VertalCodeAiProvidersDialog
        open={providersOpen}
        onOpenChange={setProvidersOpen}
        providers={providers}
        onChange={(list) => {
          setProviders(list);
          saveCustomProviders(list);
        }}
      />
    </div>
  );
}
