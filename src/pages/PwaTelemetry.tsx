/** @type {any} */
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getCsrfToken } from "@/utils/pwaTelemetry";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Download, Trash2, Image as ImageIcon, FileCode, Type, Search, ChevronLeft, ChevronRight,
  LayoutGrid, List, X, AlertTriangle, ShieldAlert, ShieldCheck, History, Ban, Settings, BarChart3, Database
} from "lucide-react";
import { toast } from "sonner";
import AppShell, { AppTopBar, PanelHeader } from "@/components/site/AppShell";
import { SITE_FONT, siteRoot } from "@/components/site/siteUi";
import { MetricsView } from "@/components/pwa-telemetry/MetricsView";
import { AuditView } from "@/components/pwa-telemetry/AuditView";
import { ExportJobsView } from "@/components/pwa-telemetry/ExportJobsView";

type RemoteEvent = {
  id: string;
  user_id: string | null;
  session_id: string;
  canvas_id: string | null;
  type: string;
  url: string;
  created_at: string;
};
type SessionAgg = { session_id: string; count: number; first: string; last: string; types: Record<string, number> };

const PAGE_SIZE = 25;
const READER_ROLES = ["admin", "analyst", "viewer"];
const ADMIN_ROLES = ["admin", "analyst"];
const FUNCTIONS_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.functions.supabase.co`;

const typeBadge = (t: string) => {
  switch (t) {
    case "image": return <Badge variant="secondary" className="gap-1"><ImageIcon className="w-3 h-3" /> PNG</Badge>;
    case "svg":   return <Badge variant="outline"  className="gap-1"><FileCode  className="w-3 h-3" /> SVG</Badge>;
    case "font":  return <Badge variant="default"  className="gap-1"><Type      className="w-3 h-3" /> WOFF2</Badge>;
    default:      return <Badge variant="outline">{t}</Badge>;
  }
};

const PwaTelemetry = () => {
  const { hasAnyRole, roles, loading: authLoading } = useAuth();
  const canRead = hasAnyRole(READER_ROLES);
  const canManage = hasAnyRole(ADMIN_ROLES);

  const [params, setParams] = useSearchParams();
  const filters = {
    type:      params.get("type")      ?? "all",
    q:         params.get("q")         ?? "",
    canvasId:  params.get("canvasId")  ?? "",
    userId:    params.get("userId")    ?? "",
    sessionId: params.get("sessionId") ?? "",
    sort:      (params.get("sort") as "asc" | "desc") ?? "desc",
    page:      parseInt(params.get("page") ?? "1"),
    sigma:     parseFloat(params.get("sigma") ?? "2"),
  };

  const updateParam = (patch: Record<string, string | number | null>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => {
      if (v === null || v === "" || (k === "type" && v === "all")) next.delete(k);
      else next.set(k, String(v));
    });
    if (!("page" in patch)) next.delete("page");
    setParams(next, { replace: true });
  };

  const [events, setEvents] = useState<RemoteEvent[]>([]);
  const [summary, setSummary] = useState<SessionAgg[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [isCapped, setIsCapped] = useState(false);

  const fetchData = useCallback(async () => {
    if (!canRead) return;
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const qs = new URLSearchParams();
      qs.set("page", String(filters.page));
      qs.set("pageSize", String(PAGE_SIZE));
      qs.set("sort", filters.sort);
      qs.set("sigma", String(filters.sigma));
      if (filters.type !== "all") qs.set("type", filters.type);
      if (filters.q) qs.set("q", filters.q);
      if (filters.canvasId) qs.set("canvasId", filters.canvasId);
      if (filters.userId) qs.set("userId", filters.userId);
      if (filters.sessionId) qs.set("sessionId", filters.sessionId);

      const res = await fetch(`${FUNCTIONS_URL}/pwa-telemetry?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
      if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
      const json = await res.json();
      setEvents(json.events ?? []);
      setSummary(json.summary ?? []);
      setTotal(json.total ?? 0);
      setIsCapped(json.isCapped ?? false);
      
      if (json.appliedSigma !== undefined && json.appliedSigma !== filters.sigma) {
        updateParam({ sigma: json.appliedSigma });
      }
    } catch (e: any) {
      toast.error(`Could not load: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [canRead, filters.page, filters.sort, filters.type, filters.q, filters.canvasId, filters.userId, filters.sessionId, filters.sigma]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const anomaly = useMemo(() => {
    const eligible = summary.filter((s) => s.count >= 5);
    if (eligible.length < 3) return null;
    const counts = eligible.map((s) => s.count);
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    const variance = counts.reduce((a, b) => a + (b - mean) ** 2, 0) / counts.length;
    const sd = Math.sqrt(variance);
    const threshold = mean + filters.sigma * sd;
    const anomalous = eligible.filter((s) => s.count > threshold);
    return anomalous.length ? { anomalous, threshold: Math.round(threshold), mean: Math.round(mean) } : null;
  }, [summary, filters.sigma]);

  const [exportOpen, setExportOpen] = useState(false);
  const [exportStart, setExportStart] = useState("");
  const [exportEnd, setExportEnd] = useState("");
  const [exportFmt, setExportFmt] = useState<"csv" | "json">("csv");
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const pollIntervalRef = useRef<number | null>(null);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  const cancelExport = async () => {
    if (!currentJobId) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch(`${FUNCTIONS_URL}/pwa-telemetry`, {
        method: "POST",
        headers: { 
          Authorization: `Bearer ${session?.access_token ?? ""}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ action: "cancel", jobId: currentJobId }),
      });
      toast.info("Export cancelled.");
    } catch (e) {
      console.error("Cancel error:", e);
    } finally {
      stopPolling();
      setExporting(false);
      setExportProgress(0);
      setCurrentJobId(null);
    }
  };

  const startPolling = useCallback((jobId: string) => {
    stopPolling();
    setCurrentJobId(jobId);
    pollIntervalRef.current = window.setInterval(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`${FUNCTIONS_URL}/pwa-telemetry?jobId=${jobId}`, {
          headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
        });
        const { job } = await res.json();
        if (job) {
          setExportProgress(job.progress || 0);
          if (job.status === "completed") {
            stopPolling();
            setExporting(false);
            setExportProgress(100);
            toast.success("Background export finished.");
            setCurrentJobId(null);
          } else if (job.status === "failed") {
            stopPolling();
            setExporting(false);
            toast.error(`Export failed: ${job.error_message}`);
            setCurrentJobId(null);
          } else if (job.status === "cancelled") {
            stopPolling();
            setExporting(false);
            setCurrentJobId(null);
          }
        }
      } catch (e) {
        console.error("Poll error:", e);
      }
    }, 2000);
  }, [stopPolling]);

  const doExport = async () => {
    if (!canRead) return;
    setExporting(true);
    setExportProgress(5);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const qs = new URLSearchParams();
      qs.set("export", exportFmt);
      qs.set("background", "true");
      if (exportStart) qs.set("start", new Date(exportStart).toISOString());
      if (exportEnd) qs.set("end", new Date(exportEnd).toISOString());
      if (filters.type !== "all") qs.set("type", filters.type);
      if (filters.canvasId) qs.set("canvasId", filters.canvasId);
      if (filters.userId) qs.set("userId", filters.userId);
      if (filters.sessionId) qs.set("sessionId", filters.sessionId);
      
      const res = await fetch(`${FUNCTIONS_URL}/pwa-telemetry?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
      
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Export failed" }));
        throw new Error(err.message || err.error || "Export failed");
      }
      
      const { jobId } = await res.json();
      if (jobId) {
        startPolling(jobId);
      } else {
        const blob = await res.blob();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `pwa-telemetry-${Date.now()}.${exportFmt}`;
        a.click();
        URL.revokeObjectURL(a.href);
        setExporting(false);
        setExportProgress(100);
        setExportOpen(false);
      }
    } catch (e: any) {
      console.error("Export error:", e);
      toast.error(`Export error: ${e.message}`);
      setExporting(false);
      setExportProgress(0);
    }
  };

  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const fetchAuditLogs = async () => {
    if (!hasAnyRole(["admin"])) return;
    const { data } = await supabase
      .from("pwa_telemetry_audit_logs" as any)
      .select("*, actor:actor_id(email)")
      .order("created_at", { ascending: false })
      .limit(50);
    setAuditLogs(data || []);
  };

  const [metrics, setMetrics] = useState<any[]>([]);
  const fetchMetrics = async () => {
    if (!hasAnyRole(["admin"])) return;
    const { data } = await supabase
      .from("pwa_telemetry_metrics" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    setMetrics(data || []);
  };

  const [settings, setSettings] = useState<any>(null);
  const fetchSettings = async () => {
    const { data } = await supabase
      .from("pwa_telemetry_settings")
      .select("*")
      .maybeSingle();
    setSettings(data);
  };

  const toggleNotifications = async (enabled: boolean, webhookUrl?: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${FUNCTIONS_URL}/pwa-telemetry`, {
        method: "POST",
        headers: { 
          Authorization: `Bearer ${session?.access_token ?? ""}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ 
          action: "toggle_notifications", 
          enabled, 
          webhookUrl: webhookUrl || settings?.webhook_url 
        }),
      });
      if (!res.ok) throw new Error("Failed to update settings");
      toast.success(enabled ? "Notifications on" : "Notifications off");
      fetchSettings();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  useEffect(() => {
    if (hasAnyRole(["admin"])) {
      fetchAuditLogs();
      fetchMetrics();
      fetchSettings();
    }
  }, [hasAnyRole]);

  const [clearOpen, setClearOpen] = useState(false);
  const [clearScope, setClearScope] = useState<"filtered" | "all">("filtered");
  const [clearing, setClearing] = useState(false);

  const doClear = async () => {
    if (!canManage) return;
    setClearing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const csrf = getCsrfToken();
      const body: any = { csrfToken: csrf };
      if (clearScope === "all") body.all = true;
      else {
        body.scope = {};
        if (filters.type !== "all") body.scope.type = filters.type;
        if (filters.sessionId) body.scope.sessionId = filters.sessionId;
        if (Object.keys(body.scope).length === 0) body.all = true;
      }
      const res = await fetch(`${FUNCTIONS_URL}/pwa-telemetry-clear`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session?.access_token ?? ""}`,
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
        },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Could not clear");
      toast.success(`Removed ${j.deleted} events`);
      setClearOpen(false);
      fetchData();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setClearing(false);
    }
  };

  if (authLoading) return <div className={`min-h-screen px-6 py-10 ${siteRoot}`} style={SITE_FONT}>Loading...</div>;

  if (!canRead) {
    return (
      <div className={`min-h-screen ${siteRoot}`} style={SITE_FONT}><div className="mx-auto max-w-2xl px-4 py-10">
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Access restricted</AlertTitle>
          <AlertDescription>
            You need the <strong>admin</strong>, <strong>analyst</strong> or <strong>viewer</strong> role to
            see PWA telemetry. Your roles: {roles.join(", ") || "none"}.
          </AlertDescription>
        </Alert>
      </div></div>
    );
  }

  const activeChips: Array<{ key: string; label: string }> = [];
  if (filters.type !== "all") activeChips.push({ key: "type", label: `Type: ${filters.type}` });
  if (filters.canvasId)       activeChips.push({ key: "canvasId", label: `Canvas: ${filters.canvasId}` });
  if (filters.userId)         activeChips.push({ key: "userId", label: `User: ${filters.userId.slice(0, 8)}…` });
  if (filters.sessionId)      activeChips.push({ key: "sessionId", label: `Session: ${filters.sessionId.slice(0, 8)}…` });
  if (filters.q)              activeChips.push({ key: "q", label: `Search: ${filters.q}` });
  if (filters.sigma !== 2)    activeChips.push({ key: "sigma", label: `Nσ: ${filters.sigma}` });

  return (
    <AppShell width="wide" topBar={<AppTopBar back={{ to: "/dashboard", label: "Dashboard" }} title="PWA telemetry" />}>
      <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <PanelHeader
          title="PWA audit and telemetry"
          description={
            <>
              Offline fallback events, with access by role. Your roles:{" "}
              <Badge variant="outline" className="gap-1 rounded-full"><ShieldCheck className="w-3 h-3" /> {roles.join(", ") || "-"}</Badge>
            </>
          }
        />
        <div className="flex flex-wrap gap-2 md:pb-8">
          {exporting && currentJobId && (
            <div className="flex items-center gap-3 bg-muted px-4 py-2 rounded-lg border">
              <div className="text-xs font-medium">Exporting in the background ({exportProgress}%)</div>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={cancelExport}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          <Dialog open={exportOpen} onOpenChange={setExportOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" disabled={exporting}><Download className="w-4 h-4 mr-2" />Export</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Export telemetry</DialogTitle>
                <DialogDescription className="space-y-2">
                  <p>Choose a time range to export. Large exports run in the background.</p>
                  <div className="text-xs bg-muted p-2 rounded border space-y-1">
                    <p className="font-semibold">Active filters:</p>
                    <ul className="list-disc list-inside">
                      {activeChips.length > 0 ? activeChips.map(c => <li key={c.key}>{c.label}</li>) : <li>No filters</li>}
                      {exportStart && <li>Start: {new Date(exportStart).toLocaleString()}</li>}
                      {exportEnd && <li>End: {new Date(exportEnd).toLocaleString()}</li>}
                    </ul>
                  </div>
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="start">Start</Label>
                  <Input id="start" type="datetime-local" value={exportStart} onChange={(e) => setExportStart(e.target.value)} disabled={exporting} />
                </div>
                <div>
                  <Label htmlFor="end">End</Label>
                  <Input id="end" type="datetime-local" value={exportEnd} onChange={(e) => setExportEnd(e.target.value)} disabled={exporting} />
                </div>
                <div className="col-span-2">
                  <Label>Format</Label>
                  <Select value={exportFmt} onValueChange={(v: any) => setExportFmt(v)} disabled={exporting}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="csv">CSV</SelectItem>
                      <SelectItem value="json">JSON</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {exporting && (
                <div className="space-y-2 mt-4">
                  <div className="flex justify-between text-xs font-medium">
                    <span>{currentJobId ? 'Processing in the background...' : 'Preparing download...'}</span>
                    <span>{exportProgress}%</span>
                  </div>
                  <Progress value={exportProgress} className="h-2" />
                </div>
              )}

              <DialogFooter className="gap-2">
                {exporting ? (
                  <Button variant="outline" className="gap-2" onClick={cancelExport}>
                    <Ban className="w-4 h-4" /> Cancel
                  </Button>
                ) : (
                  <Button onClick={doExport}>Start export</Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {canManage && (
            <Dialog open={clearOpen} onOpenChange={setClearOpen}>
              <DialogTrigger asChild>
                <Button variant="destructive"><Trash2 className="w-4 h-4 mr-2" />Clear</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Clear telemetry</DialogTitle>
                  <DialogDescription>This cannot be undone. Choose what to clear.</DialogDescription>
                </DialogHeader>
                <Select value={clearScope} onValueChange={(v: any) => setClearScope(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="filtered">Only active filters (type and session)</SelectItem>
                    <SelectItem value="all">Everything</SelectItem>
                  </SelectContent>
                </Select>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setClearOpen(false)} disabled={clearing}>Cancel</Button>
                  <Button variant="destructive" onClick={doClear} disabled={clearing}>
                    {clearing ? "Clearing..." : "Confirm"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <Tabs defaultValue="events" className="w-full">
        <TabsList className="flex h-auto w-full max-w-[700px] flex-wrap justify-start">
          <TabsTrigger value="events">Events</TabsTrigger>
          <TabsTrigger value="summary">Sessions</TabsTrigger>
          <TabsTrigger value="jobs">
            <Database className="w-4 h-4 mr-2" /> Jobs
          </TabsTrigger>
          <TabsTrigger value="metrics" disabled={!hasAnyRole(['admin'])}>
            <BarChart3 className="w-4 h-4 mr-2" /> Metrics
          </TabsTrigger>
          <TabsTrigger value="settings" disabled={!hasAnyRole(['admin'])}>
            <Settings className="w-4 h-4 mr-2" /> Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="events" className="space-y-6 pt-6">
          {anomaly && (
            <Alert role="alert" aria-live="polite">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Anomaly detected</AlertTitle>
              <AlertDescription>
                {anomaly.anomalous.length} sessions above the statistical limit ({anomaly.threshold}, mean {anomaly.mean}).{" "}
                {anomaly.anomalous.slice(0, 5).map((s) => (
                  <Link key={s.session_id} to={`?sessionId=${s.session_id}`} className="underline mr-2">
                    {s.session_id.slice(0, 8)}… ({s.count})
                  </Link>
                ))}
              </AlertDescription>
            </Alert>
          )}

          <Card className="rounded-xl border-white/[0.06] bg-card/50">
            <CardHeader className="space-y-4">
              <CardTitle>Filters</CardTitle>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                <div className="relative md:col-span-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search..."
                    className="pl-9"
                    defaultValue={filters.q}
                    onKeyDown={(e) => { if (e.key === "Enter") updateParam({ q: (e.target as HTMLInputElement).value }); }}
                  />
                </div>
                <Input
                  placeholder="canvasId"
                  defaultValue={filters.canvasId}
                  onKeyDown={(e) => { if (e.key === "Enter") updateParam({ canvasId: (e.target as HTMLInputElement).value }); }}
                />
                <Input
                  placeholder="userId"
                  defaultValue={filters.userId}
                  onKeyDown={(e) => { if (e.key === "Enter") updateParam({ userId: (e.target as HTMLInputElement).value }); }}
                />
                <div className="flex gap-2">
                  <Select value={filters.type} onValueChange={(v) => updateParam({ type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="image">PNG</SelectItem>
                      <SelectItem value="svg">SVG</SelectItem>
                      <SelectItem value="font">WOFF2</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>Session</TableHead>
                      <TableHead>Canvas</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>File</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow><TableCell colSpan={5} className="text-center py-10">Loading...</TableCell></TableRow>
                    ) : events.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center py-10">No events.</TableCell></TableRow>
                    ) : events.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="text-xs font-mono">{new Date(e.created_at).toLocaleString()}</TableCell>
                        <TableCell className="text-xs">
                          <button className="underline" onClick={() => updateParam({ sessionId: e.session_id })}>
                            {e.session_id.slice(0, 8)}…
                          </button>
                        </TableCell>
                        <TableCell className="text-xs">
                          {e.canvas_id ? (
                            <button className="underline" onClick={() => updateParam({ canvasId: e.canvas_id! })}>
                              {e.canvas_id.slice(0, 8)}
                            </button>
                          ) : "-"}
                        </TableCell>
                        <TableCell>{typeBadge(e.type)}</TableCell>
                        <TableCell className="font-medium truncate max-w-[200px]" title={e.url}>
                          {e.url.split("/").pop()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-center justify-end gap-2 py-4">
                <Button variant="outline" size="sm" disabled={filters.page <= 1} onClick={() => updateParam({ page: filters.page - 1 })}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="text-sm">Page {filters.page} of {totalPages}</div>
                <Button variant="outline" size="sm" disabled={filters.page >= totalPages} onClick={() => updateParam({ page: filters.page + 1 })}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="jobs" className="pt-6">
          <ExportJobsView />
        </TabsContent>

        <TabsContent value="summary" className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {summary.map((s) => (
              <Card key={s.session_id} className="rounded-xl border-white/[0.06] bg-card/50">
                <CardHeader>
                  <CardTitle className="text-sm truncate">
                    <button className="underline" onClick={() => updateParam({ sessionId: s.session_id })}>
                      {s.session_id}
                    </button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{s.count}</div>
                  <div className="text-xs text-muted-foreground">Recorded fallbacks</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="metrics" className="pt-6 space-y-6">
          <MetricsView metrics={metrics} />
          <AuditView logs={auditLogs} />
        </TabsContent>

        <TabsContent value="settings" className="pt-6">
          <Card className="rounded-xl border-white/[0.06] bg-card/50">
            <CardHeader>
              <CardTitle>Telemetry settings</CardTitle>
              <CardDescription>Anomaly and notification settings.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between space-x-2 border-b pb-4">
                <div className="space-y-0.5">
                  <Label>Webhook notifications</Label>
                  <p className="text-sm text-muted-foreground">Get an alert when the fallback rate goes above Nσ.</p>
                </div>
                <div className="flex items-center gap-4">
                  <Input 
                    placeholder="https://webhook.site/..." 
                    className="w-full sm:w-[300px]" 
                    defaultValue={settings?.webhook_url}
                    onBlur={(e) => toggleNotifications(settings?.is_notifications_enabled, e.target.value)}
                  />
                  <Switch 
                    checked={settings?.is_notifications_enabled} 
                    onCheckedChange={(v) => toggleNotifications(v)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="sigma-settings">Anomaly threshold (Nσ)</Label>
                <Input
                  id="sigma-settings"
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="10"
                  defaultValue={filters.sigma}
                  className="w-24"
                  onBlur={(e) => updateParam({ sigma: parseFloat(e.target.value) || 2 })}
                />
                <p className="text-xs text-muted-foreground">Values between 1.5 and 3.0 work well.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      </div>
    </AppShell>
  );
};

export default PwaTelemetry;
