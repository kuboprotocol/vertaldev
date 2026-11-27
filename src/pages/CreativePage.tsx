import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  MessageSquare, Download, Scissors, User2,
  Video, Music, BookOpen, Sparkles, Loader2, Coins, ArrowLeft, RotateCw, AlertTriangle, Upload,
  FileDown, History, Search, ArrowRight, X, AlertCircle, ListTodo, Clapperboard, FileText, NotebookPen, Clock } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { ManusLauncher } from "@/components/creative/ManusLauncher";
import { CreativeToolInterface } from "@/components/creative/CreativeToolInterface";
import { EBOOK_DEFAULT_CHAPTERS, EBOOK_MIN_CHAPTERS, ebookCost } from "@/config/ebookPricing";
import { SkillExecutionsList } from "@/components/creative/SkillExecutionsList";
import { ApiStatusPanel } from "@/components/creative/ApiStatusPanel";
import { CreativeSheets } from "@/components/CreativeSheets";
import { OfficeSuite } from "@/components/office/OfficeSuite";
import { VibePayPromo } from "@/components/vibepay/VibePayPromo";
// O Notebook (pdf.js, leitor de fontes, estúdio) só carrega quando é aberto.
const VertalNotebook = React.lazy(() => import("@/components/notebook/VertalNotebook").then((m) => ({ default: m.VertalNotebook })));
// O Clock (relógio, alarmes, cronômetro, timer) carrega quando a aba é aberta.
const VertalClock = React.lazy(() => import("@/components/clock/VertalClock"));
import { CreativeDesign } from "@/components/CreativeDesign";
import { AppTopBar, SITE_FONT, siteRoot, surface } from "@/components/site";

type ToolKey = "dashboard" | "chat" | "downloader" | "clips" | "avatar" | "shorts" | "music" | "ebook" | "emo" | "video_studio" | "unified_history" | "sheet" | "design" | "office" | "notebook" | "clock";

/**
 * Criar imagem, editar imagem e criar slides saíram do painel criativo: ficam só no Design Premium.
 * Links e atalhos antigos (/creative/slides, /creative/nano_banana, /creative/image_editor) abrem lá.
 */
const MOVED_TO_DESIGN: Record<string, DesignOpen> = {
  slides: { mode: "slides" },
  nano_banana: { mode: "studio", studioPage: "nano_banana" },
  image_editor: { mode: "studio", studioPage: "image_editor" },
};
type DesignOpen = NonNullable<React.ComponentProps<typeof CreativeDesign>["open"]>;

/** Nomes no histórico para execuções antigas dessas ferramentas. */
const LEGACY_TOOL_TITLES: Record<string, string> = { nano_banana: "Nano Banana", image_editor: "Image Editor" };

const TOOLS: { key: ToolKey; title: string; desc: string; icon: any; cost: string }[] = [
  { key: "clock", title: "Vertal Clock", desc: "World clock, alarms, stopwatch and timer, with a city finder", icon: Clock, cost: "Free" },
  { key: "notebook", title: "Vertal Notebook", desc: "Chat with PDFs, links and videos, with citations. AI podcast, quiz and mind map", icon: NotebookPen, cost: "Free (AI: from 1 credit)" },
  { key: "office", title: "Vertal Office", desc: "Free documents and spreadsheets. Only the AI is paid", icon: FileText, cost: "Free (AI: 1 credit)" },
  { key: "video_studio", title: "Vertal Video Studio", desc: "Turn 1 to 10 photos into a music clip, meme or ad with AI", icon: Clapperboard, cost: "from 2 credits" },
  { key: "chat", title: "Vertal Chat", desc: "Chat, summaries, translations and text writing", icon: MessageSquare, cost: "1 credit per message" },
  { key: "downloader", title: "Universal Downloader", desc: "YouTube, Instagram, TikTok, Facebook, Kwai", icon: Download, cost: "2 credits" },
  { key: "clips", title: "Vertal Clips", desc: "AI finds the best moments, reframes to 9:16 and adds word-by-word captions", icon: Scissors, cost: "1 credit per 5 min" },
  { key: "avatar", title: "Vertal Avatar AI", desc: "Talking avatars with AI voice-over", icon: User2, cost: "4 credits per second of video" },
  { key: "shorts", title: "Vertal Shorts", desc: "Short vertical videos from text", icon: Video, cost: "3 credits" },
  { key: "music", title: "Vertal Music AI", desc: "Original music with MusKAI", icon: Music, cost: "1 credit" },
  { key: "ebook", title: "Vertal Ebook AI", desc: "Full eBooks with a cover and chapters", icon: BookOpen, cost: `from ${ebookCost(EBOOK_MIN_CHAPTERS).credits} credits` },
  { key: "emo", title: "Vertal EMO AI", desc: "Animate a photo from a video", icon: Sparkles, cost: "5 credits" },
];

function fnUrl(name: string) {
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`;
}

async function authedFetch(name: string, body: unknown, idempotencyKey?: string) {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
  };
  if (idempotencyKey) headers["X-Idempotency-Key"] = idempotencyKey;
  const r = await fetch(fnUrl(name), { method: "POST", headers, body: JSON.stringify(body) });
  return r;
}

const RERUN_MAP: Record<string, { fn: string; build: (a: any) => any }> = {
  chat: { fn: "creative-chat", build: (a) => ({ messages: [{ role: "user", content: a.prompt }] }) },
  nano_banana: { fn: "creative-image", build: (a) => ({ prompt: a.prompt, size: a.metadata?.size }) },
  downloader: { fn: "creative-download", build: (a) => ({ url: a.metadata?.url ?? a.prompt, format: a.metadata?.format ?? "mp4" }) },
  clips: { fn: "creative-clips", build: (a) => ({ transcript: a.prompt, source_url: a.metadata?.source_url }) },
  avatar: { fn: "creative-video", build: (a) => ({ mode: "avatar", prompt: a.prompt, voice: a.metadata?.voice, image_url: a.metadata?.image_url ?? undefined }) },
  shorts: { fn: "creative-video", build: (a) => ({ mode: "shorts", prompt: a.prompt, duration: 30 }) },
  music: { fn: "creative-music", build: (a) => ({ action: "generate", prompt: a.prompt, instrumental: a.metadata?.instrumental ?? false }) },
  ebook: { fn: "creative-ebook", build: (a) => ({ topic: a.prompt, chapters: a.metadata?.chapters ?? EBOOK_DEFAULT_CHAPTERS }) },
  emo: { fn: "emo-animate", build: (a) => ({ source_image: a.metadata?.source_image, driving_video: a.metadata?.driving_video }) },
};

const cooldowns = new Map<string, number>(); 
const cooldownListeners = new Set<() => void>();
function setCooldown(tool: string, seconds: number) {
  cooldowns.set(tool, Date.now() + seconds * 1000);
  cooldownListeners.forEach((cb) => cb());
}
function useCooldown(tool?: string) {
  const [, force] = useState(0);
  useEffect(() => {
    const cb = () => force((x) => x + 1);
    cooldownListeners.add(cb);
    const t = setInterval(cb, 1000);
    return () => { cooldownListeners.delete(cb); clearInterval(t); };
  }, []);
  if (!tool) {
    let max = 0;
    for (const [, until] of cooldowns) max = Math.max(max, until - Date.now());
    return Math.max(0, Math.ceil(max / 1000));
  }
  const until = cooldowns.get(tool) ?? 0;
  return Math.max(0, Math.ceil((until - Date.now()) / 1000));
}

function parseRetryAfter(errStr: unknown): { tool?: string; seconds: number } | null {
  if (typeof errStr !== "string") return null;
  const m = errStr.match(/rate_limit_exceeded:([^:]+):\d+\/(\d+)s/);
  if (!m) return null;
  return { tool: m[1], seconds: Number(m[2]) };
}

function handleFnError(d: any, fallback = "Error") {
  const msg = d?.error || fallback;
  const rl = parseRetryAfter(msg);
  if (rl) {
    setCooldown(rl.tool ?? "global", rl.seconds);
    toast.error(`Limit reached. Wait ${rl.seconds}s`, {
      description: rl.tool ? `Tool: ${rl.tool}` : undefined,
    });
  } else if (typeof msg === "string" && msg.includes("insufficient_credits")) {
    toast.error("Not enough credits for this action.");
  } else {
    toast.error(typeof msg === "string" ? msg : fallback);
  }
}

import CSVExportModal from "@/components/builder/CSVExportModal";

function CSVExportModalWrapper() {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [fallbackOnly, setFallbackOnly] = useState(false);

  useEffect(() => {
    const handler = (e: any) => {
      setLogs((window as any).__exportLogsToCSV || []);
      setFallbackOnly(!!e.detail?.filterFallback);
      setOpen(true);
    };
    window.addEventListener('open-audit-export', handler);
    return () => window.removeEventListener('open-audit-export', handler);
  }, []);

  return (
    <CSVExportModal 
      open={open} 
      onOpenChange={setOpen} 
      logs={logs} 
      filterFallbackOnly={fallbackOnly}
    />
  );
}

export default function CreativePage() {
  const { tool } = useParams<{ tool?: ToolKey }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { subscription, editsRemaining, refetch } = useSubscription();
  const [active, setActiveRaw] = useState<ToolKey>(() => (tool && MOVED_TO_DESIGN[tool] ? "design" : (tool as ToolKey) || "dashboard"));
  const [designOpen, setDesignOpen] = useState<DesignOpen | undefined>(() => (tool ? MOVED_TO_DESIGN[tool] : undefined));
  // Toda troca de ferramenta passa por aqui: as que foram para o Design Premium abrem lá.
  const setActive = (key: string) => {
    const moved = MOVED_TO_DESIGN[key];
    if (moved) {
      setDesignOpen({ ...moved });
      setActiveRaw("design");
      return;
    }
    setActiveRaw(key as ToolKey);
  };
  const [history, setHistory] = useState<any[]>([]);
  const [filter, setFilter] = useState<"all" | "queued" | "processing" | "completed" | "failed">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 600);
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [realtimeStatus, setRealtimeStatus] = useState<"connecting" | "live" | "reconnecting" | "offline">("connecting");
  const [selected, setSelected] = useState<any | null>(null);
  const [rerunningId, setRerunningId] = useState<string | null>(null);
  const [isBatchRetrying, setIsBatchRetrying] = useState(false);
  const [showExportOptions, setShowExportOptions] = useState(false);
  const [showAuditExportOptions, setShowAuditExportOptions] = useState(false);
  const [exportColumns, setExportColumns] = useState<string[]>(["ID", "Tool", "Status", "Prompt", "Credits", "Created At", "Error Message", "Config"]);
  const alertedRef = useRef<{ low?: boolean; empty?: boolean }>({});
  const [isExporting, setIsExporting] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isCancelling, setIsCancelling] = useState<string | null>(null);
  const [errorState, setErrorState] = useState<{ 
    step: string; 
    message: string; 
    correlationId?: string; 
    traceId?: string; 
    stack?: string;
    originalAction?: () => void 
  } | null>(null);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [simulationMode, setSimulationMode] = useState<"none" | "selection" | "config" | "execution">("none");
  const globalCooldown = useCooldown();
  const PAGE_SIZE = 20;
  const [showAuditSchedule, setShowAuditSchedule] = useState(false);
  const [auditEmail, setAuditEmail] = useState("");
  const [auditTime, setAuditTime] = useState("09:00");
  const [auditInterval, setAuditInterval] = useState(7);
  const [presets, setPresets] = useState<any[]>([]);
  const [showPresetDialog, setShowPresetDialog] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");
  const [exports, setExports] = useState<any[]>([]);
  const [exportLogs, setExportLogs] = useState<any[]>([]);
  const [showExportHistory, setShowExportHistory] = useState(false);
  const [selectedExport, setSelectedExport] = useState<any | null>(null);
  const [auditDateStart, setAuditDateStart] = useState("");
  const [auditDateEnd, setAuditDateEnd] = useState("");

  const logAuditAction = useCallback(async (step: string, action: string, params: any = {}, correlationId?: string, traceId?: string) => {
    if (!user) return;
    try {
      await supabase.from("creative_audit_trail").insert({
        user_id: user.id,
        step,
        action,
        params,
        correlation_id: correlationId,
        trace_id: traceId
      });
    } catch (e) {
      console.error("Failed to log audit trail:", e);
    }
  }, [user]);
  const [selectedAssetForInvestigation, setSelectedAssetForInvestigation] = useState<any | null>(null);
  const [investigationSearch, setInvestigationSearch] = useState("");
  const [investigationDateStart, setInvestigationDateStart] = useState("");
  const [investigationDateEnd, setInvestigationDateEnd] = useState("");
  const [exportAuditLogs, setExportAuditLogs] = useState<any[]>([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);
  const [auditPage, setAuditPage] = useState(1);
  const [auditSortOrder, setAuditSortOrder] = useState<"desc" | "asc">("desc");
  const [notificationPrefs, setNotificationPrefs] = useState({
    notify_cancel: true,
    notify_retry: true,
    include_investigation_link: true
  });
  const [selectedTimezone, setSelectedTimezone] = useState("UTC");



  useEffect(() => {
    if (!tool) return;
    if (MOVED_TO_DESIGN[tool]) {
      setDesignOpen({ ...MOVED_TO_DESIGN[tool] });
      setActiveRaw("design");
      navigate("/creative/design", { replace: true });
      return;
    }
    setActiveRaw(tool as ToolKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);

  async function loadHistory(before: string | null = null) {
    if (!user) return;
    if (simulationMode === "selection") {
      setIsLoadingHistory(true);
      setTimeout(() => {
        setIsLoadingHistory(false);
        const cId = crypto.randomUUID().slice(0, 8);
        logAuditAction("Selection", "load_history_failed_simulated", { before }, cId);
        setErrorState({
          step: "Selection (simulated)",
          message: "Simulated failure while loading the history.",
          correlationId: cId,
          originalAction: () => loadHistory(before)
        });
      }, 1000);
      return;
    }
    setIsLoadingHistory(true);
    await logAuditAction("Selection", "load_history_start", { before });
    try {
      let q = supabase.from("creative_assets")
        .select("*", { count: "exact" })
        .eq("user_id", user.id);
      
      if (filter !== "all") {
        if (filter === "failed") {
          q = q.in("status", ["failed", "error"]);
        } else {
          q = q.eq("status", filter);
        }
      }

      if (debouncedSearch) {
        q = q.or(`prompt.ilike.%${debouncedSearch}%,tool.ilike.%${debouncedSearch}%,error_message.ilike.%${debouncedSearch}%`);
      }

      q = q.order("created_at", { ascending: sortOrder === "asc" })
        .limit(PAGE_SIZE + 1);
      
      if (before) {
        if (sortOrder === "desc") {
          q = q.lt("created_at", before);
        } else {
          q = q.gt("created_at", before);
        }
      }

      const { data, count } = await q;
      const rows = data ?? [];
      const hasMore = rows.length > PAGE_SIZE;
      const visible = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
      setHistory(visible);
      setNextCursor(hasMore ? visible[visible.length - 1].created_at : null);
    setTotalCount(count ?? 0);
    } catch (e: any) {
      console.error("[CreativePanel:Selection] history_load_failed", { error: e.message, userId: user.id });
      setErrorState({
        step: "Selection (history)",
        message: "Could not load your creation history.",
        originalAction: () => loadHistory(before)
      });
    } finally {
      setIsLoadingHistory(false);
    }
  }

  async function loadPresets() {
    if (!user) return;
    const { data: p } = await supabase.from("creative_filter_presets").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    setPresets(p || []);
  }

  async function openAuditTrail() {
    navigate("/creative/audit");
  }

  async function renamePreset(id: string, newName: string) {
    const { error } = await supabase.from("creative_filter_presets").update({ name: newName }).eq("id", id);
    if (!error) {
      toast.success("Preset renamed");
      loadPresets();
    }
  }

  useEffect(() => {
    if (!user) return;
    const savePrefs = async () => {
      await supabase.from("creative_user_settings").upsert({
        user_id: user.id,
        filter,
        search_query: debouncedSearch,
        sort_order: sortOrder,
        timezone: selectedTimezone
      });
    };
    const t = setTimeout(savePrefs, 2000);
    return () => clearTimeout(t);
  }, [user, filter, debouncedSearch, sortOrder, selectedTimezone]);



  useEffect(() => {
    if (!user) return;
    const loadData = async () => {
      const { data: prefs } = await supabase.from("creative_user_settings").select("*").eq("user_id", user.id).single();
      if (prefs) {
        setFilter(prefs.filter as any);
        setSearchQuery(prefs.search_query);
        setSortOrder(prefs.sort_order as any);
        if (prefs.timezone) setSelectedTimezone(prefs.timezone);
      }

      
      const { data: p } = await supabase.from("creative_filter_presets").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
      setPresets(p || []);

      const { data: sch } = await supabase.from("creative_audit_schedules").select("*").eq("user_id", user.id).single();
      if (sch) {
        setAuditEmail(sch.email);
        setAuditTime(sch.schedule_time);
        setAuditInterval(sch.export_interval_days || 7);
      }

      const { data: nPrefs } = await supabase.from("creative_notification_preferences").select("*").eq("user_id", user.id).single();
      if (nPrefs) {
        setNotificationPrefs({
          notify_cancel: nPrefs.notify_cancel,
          notify_retry: nPrefs.notify_retry,
          include_investigation_link: nPrefs.include_investigation_link
        });
      }
      loadExportHistory();
      
      const { data: logs } = await supabase.from("creative_export_logs")
        .select("*, creative_export_history(status)")
        .eq("user_id", user.id)
        .eq("level", "error")
        .order("created_at", { ascending: false })
        .limit(5);
      
      if (logs && logs.length > 0) {
        setExportLogs(logs);
      }
    };
    loadData();
  }, [user]);

  useEffect(() => {
    setCursorStack([]);
    setCurrentPage(1);
    loadHistory(null);
  }, [user, active, filter, debouncedSearch, sortOrder]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const investigateId = params.get("investigate");
    if (investigateId && history.length > 0) {
      const asset = history.find(h => h.id === investigateId);
      if (asset) setSelectedAssetForInvestigation(asset);
    }
  }, [history]);

  async function rerun(asset: any, isBatch = false) {
    const cfg = RERUN_MAP[asset.tool];
    if (!cfg) { 
      if (!isBatch) toast.error("Run again is not available for this tool."); 
      return; 
    }
    const attempt = (asset.retry_count || 0) + 1;
    const idemKey = `rerun:${asset.id}:${attempt}`;
    if (!isBatch) setRerunningId(asset.id);
    try {
      if (simulationMode === "execution") {
        const cId = crypto.randomUUID().slice(0, 8);
        await logAuditAction("Execution", "rerun_failed_simulated", { assetId: asset.id }, cId);
        throw new Error("Simulated execution failure");
      }
      const r = await authedFetch(cfg.fn, cfg.build(asset), idemKey);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { 
        const cId = r.headers.get("x-correlation-id") || undefined;
        const tId = r.headers.get("x-trace-id") || undefined;
        console.error("[CreativePanel:Execution] tool_retry_failed", { 
          assetId: asset.id, 
          error: d.error, 
          correlationId: cId,
          traceId: tId 
        });
        if (!isBatch) {
          setErrorState({
            step: "Execution (retry)",
            message: d.error || "Could not run the tool again.",
            correlationId: cId,
            traceId: tId,
            stack: d.stack || "No stack trace available",
            originalAction: () => rerun(asset, isBatch)
          });
          handleFnError(d); 
        }
        return false; 
      }
      
      if (!isBatch && user) {
        await supabase.from("creative_audit_logs").insert({
          user_id: user.id,
          asset_id: asset.id,
          event_type: 'retry',
          tool: asset.tool,
          metadata: { attempt }
        });
        
        // Notify via email for retry
        await authedFetch("creative-status-email", {
          asset_id: asset.id,
          status: "retrying",
          user_id: user.id,
          tool: asset.tool,
          reason: "Reiniciado manualmente"
        });
      }
      
      return true;
    } catch (e: any) {
      console.error("[CreativePanel:Execution] tool_retry_exception", { assetId: asset.id, error: e.message, stack: e.stack });
      if (!isBatch) toast.error(e?.message ?? "Could not run it again");
      return false;
    } finally {
      if (!isBatch) {
        setRerunningId(null);
        refetch();
        loadHistory(cursorStack.length === 0 ? null : cursorStack[cursorStack.length - 1]);
        setSelected(null);
      }
    }
  }

  async function cancelExecution(assetId: string) {
    if (!user || isCancelling) return;
    setIsCancelling(assetId);
    try {
      const asset = history.find(h => h.id === assetId);
      const { error } = await supabase
        .from("creative_assets")
        .update({ 
          status: "failed", 
          error_message: "Cancelado pelo usuário", 
          cancelled_by: user.id,
          metadata: { ...asset?.metadata, cancelled_at: new Date().toISOString() } 
        })
        .eq("id", assetId);
      
      if (error) throw error;
      
      await supabase.from("creative_audit_logs").insert({
        user_id: user.id,
        asset_id: assetId,
        event_type: 'cancel',
        tool: asset?.tool,
        metadata: { reason: "Cancelado via UI" }
      });

      // Notify via email for cancellation
      await authedFetch("creative-status-email", {
        asset_id: assetId,
        status: "cancelled",
        user_id: user.id,
        tool: asset?.tool,
        reason: "Cancelado manualmente"
      });

      toast.success("Run canceled");
      loadHistory(cursorStack.length === 0 ? null : cursorStack[cursorStack.length - 1]);
    } catch (e: any) {
      console.error("[CreativePanel:Execution] cancel_failed", { assetId, error: e.message, userId: user.id });
      toast.error("Could not cancel: " + e.message);
    } finally {
      setIsCancelling(null);
    }
  }

  async function batchRetryFailed() {
    const failed = history.filter(h => h.status === "failed" || h.status === "error");
    if (!failed.length || !user) return;
    setIsBatchRetrying(true);
    let success = 0;
    for (const asset of failed) {
      const ok = await rerun(asset, true);
      if (ok) {
        success++;
        await supabase.from("creative_audit_logs").insert({
          user_id: user.id,
          asset_id: asset.id,
          event_type: 'retry',
          tool: asset.tool,
          metadata: { batch: true, attempt: (asset.retry_count || 0) + 1 }
        });
      }
    }
    setIsBatchRetrying(false);
    toast.success(`${success} items run again in a batch.`);
    refetch();
    loadHistory(cursorStack.length === 0 ? null : cursorStack[cursorStack.length - 1]);
  }

  async function exportStepReport(step: "Selection" | "Configuration" | "Execution") {
    if (!history.length || !user) return;
    setIsExporting(true);
    try {
      const timestamp = new Date().toLocaleString('sv-SE', { timeZone: selectedTimezone }).replace(/[: ]/g, '-');
      const correlationId = crypto.randomUUID().slice(0, 8);
      const filename = `creative-${step.toLowerCase()}-report-${correlationId}-${timestamp}.json`;
      
      let filteredHistory = [...history];
      if (step === "Execution") {
        filteredHistory = history.filter(h => h.status === "processing" || h.status === "completed" || h.status === "failed");
      }

      const report = {
        meta: {
          step,
          generated_at: new Date().toISOString(),
          user_id: user.id,
          correlation_id: correlationId
        },
        logs: filteredHistory.map(h => ({
          asset_id: h.id,
          tool: h.tool,
          status: h.status,
          error: h.error_message,
          config: h.metadata,
          correlation_id: h.metadata?.correlation_id || correlationId,
          timestamp: h.created_at
        }))
      };

      const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
      toast.success(`${step} report exported`);
    } catch (e) {
      toast.error("Export failed");
    } finally {
      setIsExporting(false);
    }
  }

  async function exportFullPanelReport(format: "json" | "csv" = "json") {
    if (!history.length || !user) return;
    setIsExporting(true);
    try {
      const timestamp = new Date().toLocaleString('sv-SE', { timeZone: selectedTimezone }).replace(/[: ]/g, '-');
      const correlationId = crypto.randomUUID().slice(0, 8);
      const filename = `creative-panel-full-report-${correlationId}-${timestamp}.${format}`;
      
      const reportData = history.map(h => ({
        id: h.id,
        tool: h.tool,
        status: h.status,
        prompt: h.prompt,
        error: h.error_message,
        created_at: h.created_at,
        metadata: h.metadata,
        retry_count: h.retry_count,
        correlation_id: h.metadata?.correlation_id,
        trace_id: h.metadata?.trace_id
      }));

      if (format === "json") {
        const report = {
          meta: {
            generated_at: new Date().toISOString(),
            timezone: selectedTimezone,
            user_id: user.id,
            total_items: totalCount,
            correlation_id: correlationId
          },
          steps: {
            selection: { status: "active", items_count: history.length },
            configuration: { status: active === "dashboard" ? "pending" : "active", current_tool: active },
            execution: { 
              status: history.some(h => h.status === "processing") ? "active" : "idle",
              processing_count: history.filter(h => h.status === "processing").length
            }
          },
          history: reportData
        };
        const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
      } else {
        const headers = ["ID", "Tool", "Status", "Prompt", "Error", "CreatedAt", "RetryCount", "CorrelationID"];
        const rows = reportData.map(d => [d.id, d.tool, d.status, d.prompt, d.error, d.created_at, d.retry_count, d.correlation_id]);
        const csvContent = [headers.join(","), ...rows.map(r => r.map(v => `"${String(v || "").replace(/"/g, '""')}"`).join(","))].join("\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
      }
      toast.success(`Full report (${format.toUpperCase()}) exported`);
    } catch (e: any) {
      toast.error("Could not export the report");
    } finally {
      setIsExporting(false);
    }
  }

  async function exportHistory(format: "csv" | "json") {
    if (!history.length || !user) return;
    setIsExporting(true);
    try {
      const timestamp = new Date().toLocaleString('sv-SE', { timeZone: selectedTimezone }).replace(/[: ]/g, '-');
      const correlationId = crypto.randomUUID().slice(0, 8);
      const filename = `creative-history-${correlationId}-${timestamp}.${format}`;
      let content = "";
      
      const tzHeader = `Timezone applied: ${selectedTimezone}\n`;

      if (format === "json") {
        content = JSON.stringify({ 
          metadata: { 
            timezone: selectedTimezone, 
            generated_at: new Date().toISOString(),
            user_id: user.id
          }, 
          data: history 
        }, null, 2);
      } else {
        const headers = exportColumns.join(",");
        const rows = history.map(h => exportColumns.map(c => {
          let val = h[c.toLowerCase().replace(/ /g, "_")];
          if (c === "Config") val = JSON.stringify(h.metadata || {});
          if (c === "Created At") val = new Date(val).toLocaleString('sv-SE', { timeZone: selectedTimezone });
          return `"${String(val ?? "").replace(/"/g, '""')}"`;
        }).join(","));
        content = tzHeader + headers + "\n" + rows.join("\n");
      }
      
      const blob = new Blob([content], { type: format === "json" ? "application/json" : "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      await supabase.from("creative_audit_logs").insert({
        user_id: user.id,
        event_type: 'export',
        metadata: { format, filename, correlationId, columns: exportColumns }
      });
      
      toast.success("Report exported");
    } catch (e: any) {
      toast.error("Could not export the report: " + e.message);
      // System logging for errors
      console.error("[CreativePanel Export Error]", { error: e, userId: user.id });
    } finally {
      setIsExporting(false);
    }
  }


  async function exportAuditTrail(format: "csv" | "json") {
    if (!user || !exportAuditLogs.length) {
      toast.info("No audit data to export.");
      return;
    }
    const timestamp = new Date().toLocaleString('sv-SE', { timeZone: selectedTimezone }).replace(/[: ]/g, '-');
    const correlationId = crypto.randomUUID().slice(0, 8);
    const filename = `creative-audit-trail-${correlationId}-${timestamp}.${format}`;
    let content = "";
    
    const tzHeader = `Timezone applied: ${selectedTimezone}\n`;

    if (format === "json") {
      content = JSON.stringify({ metadata: { timezone: selectedTimezone, generated_at: new Date().toISOString() }, data: exportAuditLogs }, null, 2);
    } else {
      const headers = ["ID", "Action", "Created At", "User", "Details"];
      const rows = exportAuditLogs.map(log => [
        log.id,
        log.action || log.event_type,
        new Date(log.created_at).toLocaleString('pt-BR', { timeZone: selectedTimezone }),
        log.profiles?.email || log.user_id,
        JSON.stringify(log.details || log.metadata).replace(/"/g, '""')
      ].map(v => `"${v}"`).join(","));
      content = tzHeader + [headers.join(","), ...rows].join("\n");
    }

    const blob = new Blob([content], { type: format === "json" ? "application/json" : "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Audit trail exported");
  }

  async function scheduleAuditExport() {
    if (!user || !auditEmail || !auditTime) return;
    try {
      const { error } = await supabase.from("creative_audit_schedules").upsert({
        user_id: user.id,
        email: auditEmail,
        schedule_time: auditTime,
        export_interval_days: auditInterval,
        is_active: true
      });
      if (error) throw error;
      toast.success("Audit export scheduled");
      setShowAuditSchedule(false);
    } catch (e: any) {
      toast.error("Could not schedule: " + e.message);
    }
  }

  async function cancelExport(id: string) {
    if (!user) return;
    const { error } = await supabase.from("creative_export_history").update({ status: "failed", error_message: "Cancelado pelo usuário", cancelled_at: new Date().toISOString(), cancelled_by: user.id }).eq("id", id);
    if (!error) {
      await supabase.from("creative_export_audit_log").insert({ export_id: id, user_id: user.id, action: 'cancel', details: { reason: "Cancelado via UI" } });
      toast.info("Export canceled");
      loadExportHistory();
    }
  }

  async function retryExport(id: string) {
    if (!user) return;
    const exportToRetry = exports.find(e => e.id === id);
    const { error } = await supabase.from("creative_export_history").update({ 
      status: "queued", 
      error_message: null,
      retry_count: (exportToRetry?.retry_count || 0) + 1,
      last_retry_at: new Date().toISOString()
    }).eq("id", id);
    
    if (!error) {
      await supabase.from("creative_export_audit_log").insert({
        export_id: id,
        user_id: user.id,
        action: 'retry',
        details: { attempt: (exportToRetry?.retry_count || 0) + 1 }
      });
      toast.success("Export queued again");
      loadExportHistory();
    }
  }

  async function loadExportHistory() {
    if (!user) return;
    const { data } = await supabase.from("creative_export_history").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    setExports(data || []);
  }

  async function loadInvestigationLogs(exportId: string) {
    if (!user) return;
    setIsLoadingAudit(true);
    try {
      const isExport = !!selectedAssetForInvestigation.asset_id || (selectedAssetForInvestigation.id && selectedAssetForInvestigation.user_id && !selectedAssetForInvestigation.tool);
      const auditTable = isExport ? "creative_export_audit_log" : "creative_audit_logs";
      const idField = isExport ? "export_id" : "asset_id";
      
      const { data, error } = await supabase.rpc('get_creative_audit_logs', {
        p_table: auditTable,
        p_id_field: idField,
        p_id_value: exportId,
        p_search: investigationSearch || null,
        p_start_date: investigationDateStart || null,
        p_end_date: investigationDateEnd || null
      });
      
      if (error) throw error;
      
      let sorted = [...((data as any[]) || [])];
      sorted.sort((a, b) => {
        const da = new Date(a.created_at).getTime();
        const db = new Date(b.created_at).getTime();
        return auditSortOrder === 'desc' ? db - da : da - db;
      });
      
      setExportAuditLogs(sorted);
    } catch (e: any) {
      toast.error("Could not load the logs: " + e.message);
    } finally {
      setIsLoadingAudit(false);
    }
  }

  const AUDIT_PAGE_SIZE = 10;
  const paginatedAuditLogs = useMemo(() => {
    const start = (auditPage - 1) * AUDIT_PAGE_SIZE;
    return exportAuditLogs.slice(start, start + AUDIT_PAGE_SIZE);
  }, [exportAuditLogs, auditPage]);

  async function updateNotificationPrefs(key: string, val: boolean) {
    if (!user) return;
    const newPrefs = { ...notificationPrefs, [key]: val };
    setNotificationPrefs(newPrefs);
    const { error } = await supabase.from("creative_notification_preferences").upsert({
      user_id: user.id,
      ...newPrefs
    });
    if (error) toast.error("Could not save preferences");
  }


  useEffect(() => {
    if (selectedExport) {
      loadInvestigationLogs(selectedExport.id);
    }
  }, [selectedExport, investigationSearch, investigationDateStart, investigationDateEnd, auditSortOrder]);

  async function savePreset() {
    if (!user || !newPresetName.trim()) return;
    try {
      const filters = { filter, searchQuery, sortOrder };
      const { data, error } = await supabase.from("creative_filter_presets").insert({ user_id: user.id, name: newPresetName, filters }).select().single();
      if (error) throw error;
      const savedPreset: any = data;
      setPresets([savedPreset, ...presets]);
      setNewPresetName("");
      setShowPresetDialog(false);
      toast.success(`Preset "${newPresetName}" saved`);
    } catch (e: any) {
      toast.error("Could not save the preset: " + e.message);
    }
  }

  function applyPreset(p: any) {
    const f = p.filters;
    setFilter(f.filter || "all");
    setSearchQuery(f.searchQuery || "");
    setSortOrder(f.sortOrder || "desc");
    toast.success(`Preset "${p.name}" applied`);
  }

  async function deletePreset(id: string) {
    const { error } = await supabase.from("creative_filter_presets").delete().eq("id", id);
    if (!error) {
      setPresets(presets.filter(p => p.id !== id));
      toast.info("Preset removed");
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full p-8 text-center space-y-4 border-border/40">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
          <h2 className="text-xl font-semibold">Sign in required</h2>
          <p className="text-muted-foreground text-sm">Sign in to open the Creative Economy panel.</p>
          <Button onClick={() => navigate("/auth")} className="w-full rounded-full">Sign in</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${siteRoot}`} style={SITE_FONT}>
      <AppTopBar
        back={{ to: "/dashboard", label: "Dashboard" }}
        title={<span className="inline-flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" aria-hidden />Vertal Creative Economy</span>}
        actions={<span className="hidden font-mono text-[13px] text-muted-foreground sm:inline">{editsRemaining} credits</span>}
      />
      <div className={`border-b ${surface.hairline}`}>
        <div className="nav-carousel mx-auto flex max-w-7xl items-center gap-1 px-4 py-2 sm:px-6">
          <Button variant="ghost" size="sm" className="rounded-full" onClick={() => navigate("/creative/investigation")}>
            <AlertTriangle className="h-4 w-4 mr-1" /> Investigation
          </Button>
          <Button variant="ghost" size="sm" className="rounded-full" onClick={() => navigate("/creative/presets")}>Presets</Button>
          <Button variant="ghost" size="sm" className="rounded-full" onClick={() => navigate("/creative/notifications")}>Notifications</Button>
          <span className="ml-2 font-mono text-[13px] text-muted-foreground sm:hidden">{editsRemaining} credits</span>
          <div className="ml-auto flex items-center gap-1 border-l border-white/[0.06] pl-4">
            <label htmlFor="creative-simulate" className="mr-1 text-[11px] font-medium text-muted-foreground">Simulate failure</label>
            <select
              id="creative-simulate"
              value={simulationMode}
              onChange={(e) => setSimulationMode(e.target.value as any)}
              className="rounded-md border-none bg-muted px-1 py-0.5 text-[11px] outline-none focus:ring-0"
            >
              <option value="none">Off</option>
              <option value="selection">Selection</option>
              <option value="config">Config</option>
              <option value="execution">Execution</option>
            </select>
          </div>
        </div>
      </div>
      <main id="main" className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <h1 className="sr-only">Vertal Creative Economy</h1>
        {errorState && (
          <Alert variant="destructive" className="mb-6 bg-destructive/10 border-destructive/30 animate-in fade-in slide-in-from-top-4 duration-300">
            <AlertCircle className="h-5 w-5" />
            <div className="flex-1 ml-3">
              <AlertTitle className="font-semibold">Error in step: {errorState.step}</AlertTitle>
              <AlertDescription className="mt-1">
                <p>{errorState.message}</p>
                {(errorState.correlationId || errorState.traceId) && (
                  <div className="mt-2 text-[10px] font-mono opacity-70 space-y-0.5">
                    {errorState.correlationId && <p>CorrelationID: {errorState.correlationId}</p>}
                    {errorState.traceId && <p>TraceID: {errorState.traceId}</p>}
                  </div>
                )}
                <div className="mt-4 flex gap-3">
                  {errorState.originalAction && (
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="bg-background/50 hover:bg-background border-destructive/20 text-destructive"
                      onClick={() => {
                        const action = errorState.originalAction;
                        setErrorState(null);
                        action?.();
                      }}
                    >
                      <RotateCw className="h-3.5 w-3.5 mr-2" /> Try again
                    </Button>
                  )}
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="hover:bg-destructive/5"
                    onClick={() => setShowErrorModal(true)}
                  >
                    View details
                  </Button>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="hover:bg-destructive/5"
                    onClick={() => setErrorState(null)}
                  >
                    Close
                  </Button>
                </div>
              </AlertDescription>
            </div>
          </Alert>
        )}

        <Dialog open={showErrorModal} onOpenChange={setShowErrorModal}>
          <DialogContent className="max-w-2xl bg-card border-border/40">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" /> Error details
              </DialogTitle>
              <DialogDescription>
                Technical details for support and debugging.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-1">
                  <p className="text-muted-foreground text-[11px] font-medium">Step</p>
                  <p className="font-semibold">{errorState?.step}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground text-[11px] font-medium">Message</p>
                  <p className="text-foreground/80">{errorState?.message}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground text-[11px] font-medium">Correlation ID</p>
                  <p className="font-mono text-xs">{errorState?.correlationId || "N/A"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground text-[11px] font-medium">Trace ID</p>
                  <p className="font-mono text-xs">{errorState?.traceId || "N/A"}</p>
                </div>
              </div>
              {errorState?.stack && (
                <div className="space-y-1 mt-4">
                  <p className="text-muted-foreground text-[11px] font-medium">Stack trace</p>
                  <pre className="p-3 bg-muted/50 rounded-lg text-[10px] font-mono overflow-auto max-h-[200px] border border-border/20">
                    {errorState.stack}
                  </pre>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <Tabs value={active} onValueChange={(v) => { setActive(v as ToolKey); navigate(v === "dashboard" ? "/creative" : `/creative/${v}`); }}>
          <TabsList className="mb-6 grid grid-cols-2 max-w-md mx-auto rounded-full">
            <TabsTrigger value="dashboard" className="rounded-full">Tools</TabsTrigger>
            <TabsTrigger value="unified_history" className="rounded-full">History</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard">
             <div className="space-y-6">
               <button
                 type="button"
                 onClick={() => navigate("/creative/chat")}
                 className="group flex w-full items-center gap-4 rounded-2xl border border-white/[0.06] bg-card/50 p-4 text-left transition-colors hover:border-white/[0.14] hover:bg-card/70 sm:p-5"
               >
                 <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                   <MessageSquare className="h-6 w-6" aria-hidden />
                 </span>
                 <span className="min-w-0 flex-1">
                   <span className="block text-[15px] font-semibold" translate="no">Vertal Chat</span>
                   <span className="block text-sm text-muted-foreground">Ask in one sentence and the chat creates it in Office, Design Premium, Canvas or Dev Code. Every panel opens inside the chat.</span>
                 </span>
                 <ArrowRight className="h-5 w-5 shrink-0 text-primary transition group-hover:translate-x-0.5" aria-hidden />
               </button>
               <VibePayPromo variant="compact" />
               <ApiStatusPanel />
               <ManusLauncher setActive={(k) => { setActive(k); navigate(k === "dashboard" ? "/creative" : `/creative/${MOVED_TO_DESIGN[k] ? "design" : k}`); }} />
               
               <div className="pt-6 border-t border-white/[0.06]">
                 <div className="flex flex-wrap gap-4 items-end mb-4">
                   <div className="space-y-1">
                     <label className="text-[13px] font-medium text-muted-foreground">Status</label>
                     <select 
                      value={filter} 
                      onChange={(e) => setFilter(e.target.value as any)}
                      className="flex h-10 w-[180px] rounded-md border border-input bg-background/50 px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                     >
                       <option value="all">All statuses</option>
                       <option value="queued">Queued</option>
                       <option value="processing">Processing</option>
                       <option value="completed">Completed</option>
                       <option value="failed">Failed</option>
                     </select>
                   </div>
                   <div className="flex-1 min-w-[200px] space-y-1">
                     <label className="text-[13px] font-medium text-muted-foreground">Search</label>
                     <div className="relative">
                       <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                       <Input 
                        value={searchQuery} 
                        onChange={(e) => setSearchQuery(e.target.value)} 
                        placeholder="Prompt, tool or error" 
                        className="pl-9 bg-background/50"
                       />
                     </div>
                   </div>
                    <div className="flex flex-wrap gap-2">
                      <div className="space-y-1">
                        <label className="text-[13px] font-medium text-muted-foreground">Time zone</label>
                        <select 
                          value={selectedTimezone} 
                          onChange={(e) => setSelectedTimezone(e.target.value)}
                          className="flex h-10 w-[120px] rounded-md border border-input bg-background/50 px-2 py-2 text-xs"
                        >
                          <option value="UTC">UTC</option>
                          <option value="America/Sao_Paulo">Brasília (BRT)</option>
                          <option value="Europe/London">London (GMT)</option>
                          <option value="America/New_York">NY (EST)</option>
                        </select>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button 
                          variant="outline" 
                          onClick={() => { setFilter("all"); setSearchQuery(""); setSortOrder("desc"); setSelectedTimezone("UTC"); }}
                          disabled={isLoadingHistory}
                        >
                          Reset
                        </Button>
                        <Button 
                          variant="secondary" 
                          onClick={() => {
                             const auditLogs = history.map(h => ({
                               id: h.id,
                               ts: new Date(h.created_at).getTime(),
                               kind: 'TOOL_EXECUTION',
                               message: h.prompt,
                               model: h.metadata?.model || 'default',
                               credits: h.metadata?.credits || 0,
                               duration: h.metadata?.duration || '0s',
                               status: h.status
                             }));
                             (window as any).__exportLogsToCSV = auditLogs;
                             window.dispatchEvent(new CustomEvent('open-audit-export', { detail: { filterFallback: false } }));
                          }}
                          disabled={isExporting || history.length === 0}
                          title="Export everything as CSV"
                        >
                          {isExporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileDown className="h-4 w-4 mr-2" />}
                          Export audit (CSV)
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={openAuditTrail}
                          title="View the full audit trail"
                        >
                          <History className="h-4 w-4 mr-2" />
                          Audit trail
                        </Button>
                        <div className="flex gap-1">
                          {["Selection", "Configuration", "Execution"].map((step) => (
                            <Button 
                              key={step}
                              variant="ghost" 
                              size="sm"
                              className="text-[10px] h-8"
                              onClick={() => exportStepReport(step as any)}
                              disabled={isExporting}
                            >
                              {step[0]}
                            </Button>
                          ))}
                        </div>
                      </div>

                     {filter === "failed" && history.some(h => h.status === "failed") && (
                       <Button variant="secondary" onClick={batchRetryFailed} disabled={isBatchRetrying}>
                         {isBatchRetrying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RotateCw className="h-4 w-4 mr-2" />}
                         Run failed items again
                       </Button>
                     )}
                   </div>
                 </div>

                 <Card className="overflow-hidden rounded-2xl border-white/[0.06] bg-card/50">
                    <div className="divide-y divide-white/[0.06]">
                      {isLoadingHistory ? (
                        <div className="p-10 flex flex-col items-center justify-center text-muted-foreground gap-3">
                          <Loader2 className="h-6 w-6 animate-spin text-primary/60" />
                          <p className="text-sm font-medium">Loading history…</p>
                        </div>
                      ) : history.length === 0 ? (
                        <div className="p-10 text-center text-muted-foreground">
                          <p>No items found.</p>
                        </div>
                      ) : history.map((h: any) => (
                        <div key={h.id} className="p-4 flex flex-wrap items-center justify-between gap-4 transition hover:bg-muted/30">
                           <div className="flex items-start gap-4 flex-1 min-w-[300px]">
                             <div className={`p-2 rounded-xl bg-background/60 border border-border/40`}>
                               {(() => {
                                 const toolInfo = TOOLS.find(t => t.key === h.tool);
                                 const Icon = toolInfo?.icon || Sparkles;
                                 return <Icon className="h-5 w-5 text-foreground/70" />;
                               })()}
                             </div>
                             <div className="space-y-1">
                               <div className="flex items-center gap-2">
                                 <Badge variant={h.status === 'completed' ? 'default' : h.status === 'failed' ? 'destructive' : 'outline'} className="capitalize">
                                   {h.status}
                                 </Badge>
                                 <span className="font-semibold text-sm">{TOOLS.find(t => t.key === h.tool)?.title || LEGACY_TOOL_TITLES[h.tool] || h.tool}</span>
                                 <span className="text-[10px] text-muted-foreground font-mono">{new Date(h.created_at).toLocaleString()}</span>
                               </div>
                               <p className="text-sm text-foreground/80 line-clamp-1 italic">"{h.prompt || "No prompt"}"</p>
                               {h.error_message && (
                                 <p className="text-[10px] text-destructive flex items-center gap-1">
                                   <AlertTriangle className="h-3 w-3" /> {h.error_message}
                                 </p>
                               )}
                             </div>
                           </div>
                           <div className="flex items-center gap-2">
                              <Button size="sm" variant="ghost" onClick={() => navigate(`/creative/investigation?investigate=${h.id}`)}>
                                <AlertCircle className="h-4 w-4 mr-2" /> Investigate
                              </Button>
                             {(h.status === 'queued' || h.status === 'processing') && (
                               <Button 
                                size="sm" 
                                variant="outline" 
                                className="text-destructive hover:bg-destructive/10" 
                                onClick={() => cancelExecution(h.id)}
                                disabled={isCancelling === h.id}
                               >
                                 {isCancelling === h.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <X className="h-4 w-4 mr-2" />} 
                                 Cancel
                               </Button>
                             )}
                             {(h.status === 'failed' || h.status === 'error' || h.status === 'completed') && (
                               <Button size="sm" variant="secondary" disabled={rerunningId === h.id} onClick={() => rerun(h)}>
                                 {rerunningId === h.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
                               </Button>
                             )}
                           </div>
                        </div>
                      ))}
                    </div>
                 </Card>
               </div>
             </div>
           </TabsContent>
          
          <TabsContent value="unified_history">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-semibold tracking-[-0.01em]">Skill history</h2>
                  <p className="text-sm text-muted-foreground">One record of every tool you ran.</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => { setActive("dashboard"); navigate("/creative"); }}>
                   <ArrowLeft className="h-4 w-4 mr-2" /> Back
                </Button>
              </div>
              <SkillExecutionsList />
            </div>
          </TabsContent>

          <TabsContent value="sheet">
            <div className="space-y-6">
              <Button variant="ghost" size="sm" onClick={() => { setActive("dashboard"); navigate("/creative"); }} className="mb-2">
                <ArrowLeft className="h-4 w-4 mr-2" /> Back to tools
              </Button>
              <CreativeSheets creditsAvailable={editsRemaining} />
            </div>
          </TabsContent>

          <TabsContent value="office">
            <div className="space-y-6">
              <Button variant="ghost" size="sm" onClick={() => { setActive("dashboard"); navigate("/creative"); }} className="mb-2">
                <ArrowLeft className="h-4 w-4 mr-2" /> Back to tools
              </Button>
              <OfficeSuite creditsAvailable={editsRemaining} userId={user?.id} />
            </div>
          </TabsContent>

          <TabsContent value="design">
            <div className="space-y-6">
              <Button variant="ghost" size="sm" onClick={() => { setActive("dashboard"); navigate("/creative"); }} className="mb-2">
                <ArrowLeft className="h-4 w-4 mr-2" /> Back to tools
              </Button>
              <CreativeDesign creditsAvailable={editsRemaining} open={designOpen} />
            </div>
          </TabsContent>

          <TabsContent value="notebook">
            <div className="space-y-6">
              <Button variant="ghost" size="sm" onClick={() => { setActive("dashboard"); navigate("/creative"); }} className="mb-2">
                <ArrowLeft className="h-4 w-4 mr-2" /> Back to tools
              </Button>
              <React.Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" aria-label="Loading" /></div>}>
                <VertalNotebook />
              </React.Suspense>
            </div>
          </TabsContent>

          <TabsContent value="clock">
            <div className="space-y-6">
              <Button variant="ghost" size="sm" onClick={() => { setActive("dashboard"); navigate("/creative"); }} className="mb-2">
                <ArrowLeft className="h-4 w-4 mr-2" /> Back to tools
              </Button>
              <React.Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" aria-label="Loading" /></div>}>
                <div className="mx-auto max-w-3xl">
                  <VertalClock />
                </div>
              </React.Suspense>
            </div>
          </TabsContent>

          {/* "office", "notebook" and "clock" have their own tab; the generic one has no config for them. */}
          {TOOLS.filter((t) => t.key !== "office" && t.key !== "notebook" && t.key !== "clock").map((t) => (
            <TabsContent key={t.key} value={t.key}>
              <div className="space-y-6">
                <Button variant="ghost" size="sm" onClick={() => { setActive("dashboard"); navigate("/creative"); }} className="mb-2">
                  <ArrowLeft className="h-4 w-4 mr-2" /> Back to tools
                </Button>
                <CreativeToolInterface 
                  toolKey={t.key as any} 
                  onSuccess={() => {
                    setActive("dashboard");
                    navigate("/creative");
                    loadHistory(null);
                  }} 
                />
              </div>
            </TabsContent>
          ))}
        </Tabs>

        {(() => {
          const CSVExportModal = React.lazy(() => import('@/components/builder/CSVExportModal'));
          return (
            <React.Suspense fallback={null}>
              <CSVExportModalWrapper />
            </React.Suspense>
          );
        })()}
      </main>
    </div>
  );
}
