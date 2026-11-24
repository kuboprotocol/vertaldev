import { useState } from "react";
import { CheckCircle2, FileText, Loader2, Send, ShieldAlert, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { opsApi, type ApprovalCard, type OpsAskResponse, type OpsAttachment } from "@/lib/vertalCodeAi/platformApi";

type Ops = typeof opsApi;

/**
 * Modo Operação (só o operador). Leitura roda direto; qualquer ação vem como
 * cartão e só executa depois do toque em "Aprovar".
 */
export function VertalCodeAiOpsPanel({ api = opsApi }: { api?: Ops }) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [answers, setAnswers] = useState<Array<{ q: string; a: OpsAskResponse }>>([]);
  const [cardState, setCardState] = useState<Record<string, "approving" | "done" | "rejected" | "failed">>({});
  const [report, setReport] = useState<string | null>(null);
  const [files, setFiles] = useState<OpsAttachment[]>([]);

  const ask = async () => {
    const q = prompt.trim();
    if (!q || busy) return;
    setBusy(true);
    try {
      const a = await api.ask(q, files);
      setAnswers((prev) => [...prev, { q, a }]);
      setPrompt("");
      setFiles([]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falhou.");
    } finally {
      setBusy(false);
    }
  };

  const decide = async (card: ApprovalCard, decision: "approve" | "reject") => {
    setCardState((s) => ({ ...s, [card.approvalId]: "approving" }));
    try {
      await api.decide(card, decision);
      setCardState((s) => ({ ...s, [card.approvalId]: decision === "approve" ? "done" : "rejected" }));
      toast.success(decision === "approve" ? "Ação executada." : "Ação recusada.");
    } catch (e) {
      setCardState((s) => ({ ...s, [card.approvalId]: "failed" }));
      toast.error(e instanceof Error ? e.message : "Falhou.");
    }
  };

  const loadReport = async (period: "daily" | "weekly") => {
    setBusy(true);
    try {
      setReport((await api.report(period)).report);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falhou.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-100">
        <p className="flex items-center gap-1.5 font-medium">
          <ShieldAlert className="h-4 w-4" /> Modo Operação
        </p>
        Só leitura por padrão. Qualquer mudança, dinheiro, deploy ou e-mail aparece como cartão e só acontece se você aprovar. Tudo fica na auditoria.
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => loadReport("daily")} className="gap-1.5">
          <FileText className="h-4 w-4" /> Relatório do dia
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => loadReport("weekly")} className="gap-1.5">
          <FileText className="h-4 w-4" /> Relatório da semana
        </Button>
      </div>
      {report && <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-black/50 p-3 text-xs">{report}</pre>}

      {answers.map(({ q, a }, i) => (
        <div key={i} className="space-y-2 rounded-xl border border-border/60 bg-card/50 p-3 text-sm">
          <p className="text-xs text-muted-foreground">{q}</p>
          <p className="whitespace-pre-wrap">{a.reply}</p>
          {a.approvals.map((c) => {
            const st = cardState[c.approvalId];
            return (
              <div key={c.approvalId} className="rounded-lg border border-primary/40 bg-primary/5 p-2 text-xs" aria-label={`Aprovação ${c.tool}`}>
                <p className="mb-2 whitespace-pre-wrap">{c.text}</p>
                {st === "done" ? (
                  <p className="flex items-center gap-1 text-emerald-400"><CheckCircle2 className="h-4 w-4" /> Executado</p>
                ) : st === "rejected" ? (
                  <p className="flex items-center gap-1 text-muted-foreground"><XCircle className="h-4 w-4" /> Recusado</p>
                ) : (
                  <div className="flex gap-2">
                    <Button size="sm" disabled={st === "approving"} onClick={() => decide(c, "approve")}>Aprovar</Button>
                    <Button size="sm" variant="outline" disabled={st === "approving"} onClick={() => decide(c, "reject")}>Recusar</Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      <div className="flex items-end gap-2">
        <label className="shrink-0 cursor-pointer rounded-md border border-border/60 px-2 py-2 text-xs" title="Enviar um relatório para análise">
          Relatório…
          <input
            type="file"
            className="hidden"
            accept=".txt,.md,.csv,.json,text/*"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (f.size > 200_000) return toast.error("Arquivo maior que 200 KB.");
              setFiles([{ name: f.name, kind: "text", data: await f.text() }]);
            }}
          />
        </label>
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={files.length ? `Pergunte sobre ${files[0].name}` : "Ex.: quanto gastaram de créditos hoje? quais erros mais aparecem?"}
          className="min-h-[44px] flex-1 resize-none text-base sm:text-sm"
          rows={2}
          aria-label="Pergunta de operação"
        />
        <Button size="icon" className="h-11 w-11 shrink-0" onClick={ask} disabled={busy || !prompt.trim()} aria-label="Perguntar">
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        </Button>
      </div>
    </div>
  );
}
