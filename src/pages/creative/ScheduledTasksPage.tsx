import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, CalendarClock, Download, ExternalLink, Loader2, Play, RotateCcw, Save, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  cancelCreativeExport, EXPORT_STATUS_LABEL, resolveExportUrl, retryCreativeExport,
} from "@/lib/creativeExports";

const INTERVALS = [
  { days: 1, label: "Diário" },
  { days: 7, label: "Semanal" },
  { days: 15, label: "Quinzenal" },
  { days: 30, label: "Mensal" },
];

const STATUS_CLASS: Record<string, string> = {
  completed: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  failed: "bg-destructive/10 text-destructive border-destructive/20",
  cancelled: "bg-muted text-muted-foreground",
  processing: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  queued: "bg-amber-500/10 text-amber-500 border-amber-500/20",
};

const EMAIL_RE = /^[^\s@<>"'()]+@[^\s@<>"'()]+\.[^\s@<>"'()]{2,}$/;

function browserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function timezoneOptions(current: string) {
  let zones: string[] = [];
  try {
    zones = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  } catch {
    zones = [];
  }
  const base = zones.length ? zones : ["UTC", "America/Sao_Paulo", "America/New_York", "Europe/Lisbon", "Europe/London"];
  return Array.from(new Set(["UTC", current, ...base]));
}

function fmt(iso: string | null | undefined, tz?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", ...(tz ? { timeZone: tz } : {}) });
}

type ScheduleForm = {
  is_active: boolean;
  email: string;
  schedule_time: string;
  timezone: string;
  export_interval_days: number;
  format: "json" | "csv";
};

export default function ScheduledTasksPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ScheduleForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const scheduleQuery = useQuery({
    queryKey: ["creative-schedule", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creative_audit_schedules").select("*").eq("user_id", user!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const historyQuery = useQuery({
    queryKey: ["creative-export-history", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creative_export_history")
        .select("id, status, format, item_count, period_start, period_end, created_at, error_message, file_url, retry_count")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: (q) =>
      (q.state.data ?? []).some((e) => e.status === "queued" || e.status === "processing") ? 5000 : false,
  });

  const schedule = scheduleQuery.data;

  useEffect(() => {
    if (scheduleQuery.isLoading || form) return;
    setForm({
      is_active: schedule?.is_active ?? true,
      email: schedule?.email ?? user?.email ?? "",
      schedule_time: (schedule?.schedule_time ?? "09:00").slice(0, 5),
      timezone: schedule?.timezone ?? browserTimezone(),
      export_interval_days: schedule?.export_interval_days ?? 7,
      format: schedule?.format === "csv" ? "csv" : "json",
    });
  }, [scheduleQuery.isLoading, schedule, user, form]);

  const zones = useMemo(() => timezoneOptions(form?.timezone ?? browserTimezone()), [form?.timezone]);
  const emailInvalid = !!form && !EMAIL_RE.test(form.email);
  const dirty = !!form && (!schedule
    || form.is_active !== schedule.is_active
    || form.email !== schedule.email
    || form.schedule_time !== schedule.schedule_time.slice(0, 5)
    || form.timezone !== schedule.timezone
    || form.export_interval_days !== schedule.export_interval_days
    || form.format !== schedule.format);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["creative-schedule", user?.id] });
    queryClient.invalidateQueries({ queryKey: ["creative-export-history", user?.id] });
  };

  async function save() {
    if (!user || !form || emailInvalid) return;
    setSaving(true);
    try {
      // Upsert reenviaria user_id no UPDATE (coluna sem grant); separa insert/update.
      const { error } = schedule
        ? await supabase.from("creative_audit_schedules").update(form).eq("id", schedule.id)
        : await supabase.from("creative_audit_schedules").insert({ ...form, user_id: user.id });
      if (error) throw error;
      toast.success(form.is_active ? "Agendamento salvo" : "Agendamento pausado");
      setForm(null); // recarrega com next_run_at calculado no banco
      refresh();
    } catch (e) {
      toast.error("Falha ao salvar: " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function runNow() {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("creative-scheduled-export", { body: { action: "run_now" } });
      if (error) {
        const ctx = (error as { context?: Response }).context;
        const body = ctx ? await ctx.json().catch(() => null) : null;
        throw new Error(body?.message ?? (body?.error === "rate_limited" ? "Aguarde a exportação atual terminar." : error.message));
      }
      if (data?.count === 0) toast.info("Nenhum evento no período — nada para enviar.");
      else toast.success(`Exportação enviada por e-mail (${data?.count ?? 0} eventos)`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRunning(false);
      refresh();
    }
  }

  async function act(id: string, kind: "cancel" | "retry" | "download", fileUrl?: string | null) {
    setBusyId(id);
    try {
      if (kind === "cancel") {
        await cancelCreativeExport(id);
        toast.info("Exportação cancelada");
      } else if (kind === "retry") {
        await retryCreativeExport(id);
        toast.success("Reenfileirada — será processada em até 15 minutos");
      } else {
        const url = await resolveExportUrl(fileUrl);
        // download=true no signed URL: baixa sem sair da página (e sem bloqueio de pop-up após o await).
        if (url) window.location.assign(url);
      }
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border p-4 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/creative")} aria-label="Voltar">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <CalendarClock className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold flex-1">Tarefas agendadas</h1>
      </header>

      <main className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
        <Card className="p-5 sm:p-6 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold">Exportação automática da trilha de auditoria</h2>
              <p className="text-sm text-muted-foreground">
                Gera o histórico de eventos do Painel Criativo e envia o link de download por e-mail.
              </p>
            </div>
            {form && (
              <div className="flex items-center gap-2 shrink-0">
                <Label htmlFor="sched-active" className="text-sm">{form.is_active ? "Ativo" : "Pausado"}</Label>
                <Switch id="sched-active" checked={form.is_active}
                  onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              </div>
            )}
          </div>

          {!form ? (
            <div className="space-y-3"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="sched-email">E-mail de entrega</Label>
                  <Input id="sched-email" type="email" value={form.email} aria-invalid={emailInvalid}
                    onChange={(e) => setForm({ ...form, email: e.target.value.trim() })} />
                  {emailInvalid && <p className="text-xs text-destructive">Informe um e-mail válido.</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sched-time">Horário</Label>
                  <Input id="sched-time" type="time" value={form.schedule_time}
                    onChange={(e) => setForm({ ...form, schedule_time: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sched-tz">Fuso horário</Label>
                  <select id="sched-tz" value={form.timezone}
                    onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    {zones.map((z) => <option key={z} value={z}>{z}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Frequência</Label>
                  <div className="flex flex-wrap gap-2">
                    {INTERVALS.map((i) => (
                      <Button key={i.days} type="button" size="sm"
                        variant={form.export_interval_days === i.days ? "default" : "outline"}
                        onClick={() => setForm({ ...form, export_interval_days: i.days })}>
                        {i.label}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Formato</Label>
                  <div className="flex gap-2">
                    {(["json", "csv"] as const).map((f) => (
                      <Button key={f} type="button" size="sm" variant={form.format === f ? "default" : "outline"}
                        onClick={() => setForm({ ...form, format: f })}>
                        {f.toUpperCase()}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/40 p-3 text-sm">
                <div className="space-y-0.5">
                  <div>Próxima execução: <strong>{schedule?.is_active ? fmt(schedule?.next_run_at, schedule?.timezone) : "pausado"}</strong></div>
                  <div className="text-muted-foreground">Última execução: {fmt(schedule?.last_run, schedule?.timezone)}</div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={runNow} disabled={running}>
                    {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    Executar agora
                  </Button>
                  <Button onClick={save} disabled={saving || !dirty || emailInvalid}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Salvar
                  </Button>
                </div>
              </div>
            </>
          )}
        </Card>

        <Card className="p-5 sm:p-6 space-y-4">
          <h2 className="font-semibold">Histórico de execuções</h2>
          {historyQuery.isLoading ? (
            <div className="space-y-2"><Skeleton className="h-14" /><Skeleton className="h-14" /></div>
          ) : (historyQuery.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma execução ainda. Use “Executar agora” para testar.</p>
          ) : (
            <ul className="divide-y divide-border">
              {historyQuery.data!.map((e) => (
                <li key={e.id} className="py-3 flex flex-wrap items-center gap-3">
                  <Badge variant="outline" className={STATUS_CLASS[e.status] ?? ""}>
                    {EXPORT_STATUS_LABEL[e.status] ?? e.status}
                  </Badge>
                  <div className="flex-1 min-w-[12rem] text-sm">
                    <div>{fmt(e.created_at)} · {e.format.toUpperCase()} · {e.item_count ?? 0} eventos</div>
                    <div className="text-xs text-muted-foreground">
                      Período {fmt(e.period_start)} – {fmt(e.period_end)}
                      {e.retry_count ? ` · ${e.retry_count} nova(s) tentativa(s)` : ""}
                    </div>
                    {e.error_message && e.status !== "cancelled" && (
                      <div className="text-xs text-destructive truncate">{e.error_message}</div>
                    )}
                  </div>
                  <div className="flex gap-1">
                    {e.status === "completed" && e.file_url && (
                      <Button size="icon" variant="ghost" aria-label="Baixar" disabled={busyId === e.id}
                        onClick={() => act(e.id, "download", e.file_url)}><Download className="h-4 w-4" /></Button>
                    )}
                    {(e.status === "queued" || e.status === "processing") && (
                      <Button size="icon" variant="ghost" aria-label="Cancelar" disabled={busyId === e.id}
                        onClick={() => act(e.id, "cancel")}><XCircle className="h-4 w-4" /></Button>
                    )}
                    {(e.status === "failed" || e.status === "cancelled") && (
                      <Button size="icon" variant="ghost" aria-label="Reprocessar" disabled={busyId === e.id}
                        onClick={() => act(e.id, "retry")}><RotateCcw className="h-4 w-4" /></Button>
                    )}
                    <Button size="icon" variant="ghost" asChild aria-label="Detalhes">
                      <Link to={`/creative/exports/${e.id}`}><ExternalLink className="h-4 w-4" /></Link>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </main>
    </div>
  );
}
