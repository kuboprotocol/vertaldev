import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Globe, Search, ArrowLeftRight, Link2, ServerCog, Loader2, Check, X, Sparkles, Plus, Trash2, Shield, Zap, ArrowLeft, RefreshCw, Terminal, KeyRound, Rocket, Info, Ban, Download, Mail, Network, Copy, Handshake } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";

type Domain = {
  id: string; domain_name: string; tld: string; source: string;
  status: string; ssl_status: string; expires_at: string | null;
  project_id: string | null; credits_spent: number; created_at: string;
  nameservers: string[] | null; metadata?: { provider?: string; cf_zone_id?: string; registration_state?: string; price_usd?: number } | null;
};
type Subdomain = { id: string; hostname: string; kind: "vertal" | "custom"; target: string; status: string; domain_id: string | null; created_at: string };
type SearchResult = { domain: string; tld: string; available: boolean | null; price_credits: number; provider?: string; price_usd?: number | null; renewal_usd?: number | null; premium?: boolean; note?: string; reason?: string };
type DnsRecord = { id: string; record_type: string; name: string; value: string; ttl: number; priority: number | null; ionos_record_id: string | null };
type Transfer = {
  id: string; domain_name: string; status: string; status_message: string | null;
  ionos_transfer_id: string | null; current_registrar: string | null;
  started_at: string; completed_at: string | null; updated_at: string;
  notify_email: string | null; retry_count: number; next_retry_at: string | null;
  last_error: string | null; cancel_reason: string | null; cancel_requested_at: string | null;
  last_notified_at: string | null;
};
type DebugLog = {
  id: string; event_type: string; status: string; message: string;
  metadata: any; created_at: string;
};

const RECORD_TYPES = ["A", "AAAA", "CNAME", "TXT", "MX", "SRV", "NS"] as const;

const PARTNER_NAME = "Vertal Domínios - Parceiros";
const PROVIDER_LABEL: Record<string, string> = { cloudflare: "Cloudflare", ionos: "IONOS", manual: "Manual" };
const TABS = ["mine", "buy", "transfer", "connect", "subdomains", "dns", "debug"] as const;

function PartnerBadge({ provider }: { provider?: string | null }) {
  if (!provider || provider === "none") return null;
  return (
    <Badge variant="outline" className="text-[10px] gap-1 border-primary/30 text-primary">
      <Handshake className="w-3 h-3" /> {PARTNER_NAME.split(" - ")[1]} · {PROVIDER_LABEL[provider] ?? provider}
    </Badge>
  );
}

export default function DomainsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [domains, setDomains] = useState<Domain[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [d, t] = await Promise.all([
      supabase.from("kubo_domains").select("*").order("created_at", { ascending: false }),
      supabase.from("kubo_domain_transfers").select("*").order("started_at", { ascending: false }),
    ]);
    setDomains((d.data as Domain[]) ?? []);
    setTransfers((t.data as Transfer[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const showOnboarding = !loading && domains.length === 0 && transfers.length === 0;
  const tabParam = searchParams.get("tab");
  const requestedTab = (TABS as readonly string[]).includes(tabParam ?? "") ? tabParam! : null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b border-border/40 bg-gradient-to-b from-primary/5 via-background to-background">
        <div className="container mx-auto px-4 py-8">
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")} className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-1" /> Dashboard
          </Button>
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center shadow-lg shadow-primary/30">
              <Globe className="w-7 h-7 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-orbitron text-3xl font-bold tracking-tight">Vertal Domínios <span className="text-primary">- Parceiros</span></h1>
              <p className="text-muted-foreground">Compre, transfira, conecte e crie subdomínios para o seu app — infraestrutura Cloudflare.</p>
            </div>
          </motion.div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 space-y-6">
        {showOnboarding && <OnboardingBanner />}

        <Tabs key={loading ? "loading" : "ready"} defaultValue={requestedTab ?? (showOnboarding ? "buy" : "mine")} className="space-y-6">
          <TabsList className="flex w-full max-w-5xl overflow-x-auto justify-start bg-card/60 backdrop-blur border border-border/40">
            <TabsTrigger value="mine"><Globe className="w-4 h-4 mr-2" />Meus</TabsTrigger>
            <TabsTrigger value="buy"><Search className="w-4 h-4 mr-2" />Comprar</TabsTrigger>
            <TabsTrigger value="transfer"><ArrowLeftRight className="w-4 h-4 mr-2" />Transferir</TabsTrigger>
            <TabsTrigger value="connect"><Link2 className="w-4 h-4 mr-2" />Conectar</TabsTrigger>
            <TabsTrigger value="subdomains"><Network className="w-4 h-4 mr-2" />Subdomínios</TabsTrigger>
            <TabsTrigger value="dns"><ServerCog className="w-4 h-4 mr-2" />DNS</TabsTrigger>
            <TabsTrigger value="debug"><Terminal className="w-4 h-4 mr-2" />Debug</TabsTrigger>
          </TabsList>

          <TabsContent value="mine"><MineTab domains={domains} loading={loading} onChange={load} /></TabsContent>
          <TabsContent value="buy"><BuyTab onPurchased={load} /></TabsContent>
          <TabsContent value="transfer"><TransferTab transfers={transfers} onTransferred={load} /></TabsContent>
          <TabsContent value="connect"><ConnectTab onConnected={load} /></TabsContent>
          <TabsContent value="subdomains"><SubdomainsTab domains={domains} /></TabsContent>
          <TabsContent value="dns"><DnsTab domains={domains} /></TabsContent>
          <TabsContent value="debug"><DebugTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function OnboardingBanner() {
  return (
    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="border-primary/30 bg-gradient-to-br from-primary/10 via-card/60 to-card/40 backdrop-blur">
        <CardHeader>
          <CardTitle className="font-orbitron flex items-center gap-2"><Rocket className="w-5 h-5 text-primary" /> Bem-vindo ao {PARTNER_NAME}</CardTitle>
          <CardDescription>Crie seu app primeiro e depois coloque sua marca no ar — tudo pago com créditos Vertal.</CardDescription>
        </CardHeader>
        <CardContent className="grid md:grid-cols-3 gap-4">
          <Step icon={<Search className="w-5 h-5" />} title="1. Busque" body="Sugestões com IA + disponibilidade e preço em tempo real via Cloudflare." />
          <Step icon={<Zap className="w-5 h-5" />} title="2. Pague com créditos" body="Débito atômico — se o registro falhar, os créditos voltam automaticamente." />
          <Step icon={<Network className="w-5 h-5" />} title="3. DNS + Subdomínios" body="SSL, editor DNS e subdomínios (app.suamarca.com) prontos para usar." />
        </CardContent>
      </Card>
    </motion.div>
  );
}

function Step({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex gap-3 p-3 rounded-lg bg-background/40 border border-border/30">
      <div className="w-9 h-9 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">{icon}</div>
      <div>
        <div className="font-semibold text-sm">{title}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{body}</div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    completed: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    pending: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    processing: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    validating: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    transferring: "bg-purple-500/15 text-purple-400 border-purple-500/30",
    failed: "bg-red-500/15 text-red-400 border-red-500/30",
    error: "bg-red-500/15 text-red-400 border-red-500/30",
    success: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    info: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  };
  return <Badge variant="outline" className={map[status] ?? "bg-muted text-muted-foreground"}>{status}</Badge>;
}

function MineTab({ domains, loading, onChange }: { domains: Domain[]; loading: boolean; onChange: () => void }) {
  const [toDelete, setToDelete] = useState<Domain | null>(null);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const refreshStatus = async (d: Domain) => {
    setRefreshing(d.id);
    const { data, error } = await supabase.functions.invoke("domain-purchase", { body: { action: "status", domain_id: d.id } });
    setRefreshing(null);
    if (error || data?.error) { toast.error(error?.message ?? data.error); return; }
    toast.success(`Registro: ${data?.state ?? data?.domain?.status}`);
    onChange();
  };
  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  if (!domains.length) {
    return (
      <Card className="border-dashed border-border/40 bg-card/40">
        <CardContent className="py-16 text-center">
          <Globe className="w-12 h-12 mx-auto mb-4 text-muted-foreground/60" />
          <p className="text-muted-foreground mb-2">No domains yet.</p>
          <p className="text-sm text-muted-foreground/70">Go to <strong>Buy</strong> to register your brand.</p>
        </CardContent>
      </Card>
    );
  }
  const remove = async () => {
    if (!toDelete) return;
    await supabase.from("kubo_domains").delete().eq("id", toDelete.id);
    toast.success("Removed");
    setToDelete(null);
    onChange();
  };
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {domains.map((d) => (
          <motion.div key={d.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="group bg-card/60 backdrop-blur border-border/40 hover:border-primary/50 transition-all hover:shadow-lg hover:shadow-primary/10">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="font-orbitron text-lg break-all">{d.domain_name}</CardTitle>
                    <CardDescription className="text-xs mt-1 uppercase tracking-wide">{d.source} · .{d.tld}</CardDescription>
                    <div className="mt-2"><PartnerBadge provider={d.metadata?.provider} /></div>
                  </div>
                  <StatusBadge status={d.status} />
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground"><Shield className="w-3.5 h-3.5" /> SSL: <span className="text-foreground">{d.ssl_status}</span></div>
                <div className="flex items-center gap-2 text-muted-foreground"><Zap className="w-3.5 h-3.5" /> Créditos: <span className="text-foreground">{d.credits_spent}</span></div>
                {!!d.nameservers?.length && (
                  <div className="text-xs text-muted-foreground"><ServerCog className="w-3.5 h-3.5 inline mr-1" />NS: <span className="font-mono text-foreground">{d.nameservers.join(", ")}</span></div>
                )}
                {d.metadata?.provider === "cloudflare" && d.source === "purchase" && ["processing", "pending"].includes(d.status) && (
                  <Button size="sm" variant="outline" onClick={() => refreshStatus(d)} disabled={refreshing === d.id}>
                    {refreshing === d.id ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />} Atualizar status
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300 hover:bg-red-500/10" onClick={() => setToDelete(d)}>
                  <Trash2 className="w-3.5 h-3.5 mr-1" /> Remove
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {toDelete?.domain_name} from the dashboard?</AlertDialogTitle>
            <AlertDialogDescription>Isso só remove do painel Vertal. O registro do domínio no parceiro (Cloudflare/IONOS) não é cancelado.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove} className="bg-red-600 hover:bg-red-700">Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function BuyTab({ onPurchased }: { onPurchased: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [buying, setBuying] = useState<string | null>(null);
  const [confirmBuy, setConfirmBuy] = useState<SearchResult | null>(null);

  const search = async () => {
    if (query.trim().length < 2) return;
    setSearching(true); setResults([]);
    const { data, error } = await supabase.functions.invoke("domain-search", { body: { query } });
    setSearching(false);
    if (error) { toast.error(error.message); return; }
    setResults(data?.results ?? []);
    if (!data?.has_cloudflare && !data?.has_ionos) toast.warning("Nenhum parceiro configurado — disponibilidade indicativa.");
  };

  const doBuy = async () => {
    if (!confirmBuy) return;
    const r = confirmBuy;
    setConfirmBuy(null);
    setBuying(r.domain);
    const { data, error } = await supabase.functions.invoke("domain-purchase", { body: { domain: r.domain } });
    setBuying(null);
    if (error) { toast.error(error.message); return; }
    if (data?.error) { toast.error(data.error); return; }
    if (data?.state && data.state !== "succeeded") toast.info(`${r.domain}: registro em andamento (${data.state}). Acompanhe em "Meus".`);
    else toast.success(`✓ ${r.domain} registrado · saldo: ${data?.balance_after ?? "?"}`);
    onPurchased();
  };

  return (
    <>
      <Card className="bg-card/60 backdrop-blur border-border/40">
        <CardHeader>
          <CardTitle className="font-orbitron flex items-center gap-2"><Sparkles className="w-5 h-5 text-primary" /> Comprar domínio</CardTitle>
          <CardDescription>{PARTNER_NAME}: sugestões com IA + disponibilidade e preço em tempo real (Cloudflare Registrar, com IONOS para extensões como .com.br).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input placeholder="minhamarca ou minhamarca.com" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} className="bg-background/60" />
            <Button onClick={search} disabled={searching} className="bg-gradient-to-r from-primary to-purple-600">
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Buscar
            </Button>
          </div>
          <div className="grid gap-2">
            {results.map((r) => (
              <motion.div key={r.domain} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="flex items-center justify-between p-3 rounded-lg bg-background/40 border border-border/30 hover:border-primary/40 transition">
                <div className="flex items-center gap-3 min-w-0">
                  {r.available === true && <Check className="w-5 h-5 text-emerald-400 shrink-0" />}
                  {r.available === false && <X className="w-5 h-5 text-red-400 shrink-0" />}
                  {r.available === null && <span className="w-5 h-5 rounded-full bg-muted shrink-0" title={r.note ?? r.reason} />}
                  <div className="min-w-0">
                    <div className="font-mono text-sm truncate">{r.domain}</div>
                    <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-2">
                      <span>.{r.tld} · {r.price_credits} créditos{r.price_usd ? ` · renova US$ ${r.renewal_usd ?? r.price_usd}/ano` : ""}</span>
                      <PartnerBadge provider={r.provider} />
                    </div>
                  </div>
                </div>
                <Button size="sm" disabled={r.available === false || buying === r.domain} onClick={() => setConfirmBuy(r)} variant={r.available === true ? "default" : "secondary"}>
                  {buying === r.domain ? <Loader2 className="w-4 h-4 animate-spin" /> : "Comprar"}
                </Button>
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={!!confirmBuy} onOpenChange={(o) => !o && setConfirmBuy(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-orbitron">Confirmar registro</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>You are about to register:</p>
                <div className="p-3 rounded-lg bg-muted/40 border border-border/40">
                  <div className="font-mono text-lg text-foreground">{confirmBuy?.domain}</div>
                  <div className="text-sm text-muted-foreground mt-1">.{confirmBuy?.tld} · <span className="text-primary font-semibold">{confirmBuy?.price_credits} créditos</span></div>
                  <div className="mt-2"><PartnerBadge provider={confirmBuy?.provider} /></div>
                </div>
                <p className="text-xs">Registro por 1 ano via {PARTNER_NAME}. O débito é atômico e idempotente; se o registro falhar, os créditos são devolvidos automaticamente.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doBuy} className="bg-gradient-to-r from-primary to-purple-600">Confirmar e pagar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

const TLD_TRANSFER_CREDITS: Record<string, number> = {
  com: 15, "com.br": 25, net: 16, org: 16, dev: 18, app: 22,
  io: 50, ai: 80, co: 30, xyz: 8, tech: 20, store: 25, online: 18,
};
function tldOf(d: string) {
  const parts = d.toLowerCase().split(".");
  if (parts.length >= 3 && parts[parts.length - 2] === "com" && parts[parts.length - 1] === "br") return "com.br";
  return parts[parts.length - 1] ?? "com";
}

function TransferTab({ transfers, onTransferred }: { transfers: Transfer[]; onTransferred: () => void }) {
  const [domain, setDomain] = useState("");
  const [authCode, setAuthCode] = useState("");
  const [registrar, setRegistrar] = useState("");
  const [notifyEmail, setNotifyEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<Transfer | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [resendingEmail, setResendingEmail] = useState<string | null>(null);
  const [confirmResend, setConfirmResend] = useState<Transfer | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterQuery, setFilterQuery] = useState("");
  const [modalEvents, setModalEvents] = useState<Array<{ id: string; event_type: string; from_status: string | null; to_status: string | null; message: string | null; created_at: string }>>([]);
  const [modalEmails, setModalEmails] = useState<Array<{ id: string; status: string; created_at: string; message_id: string | null; error_message: string | null }>>([]);
  const [modalLoading, setModalLoading] = useState(false);

  const RESEND_COOLDOWN_SEC = 60;
  const cooldownLeft = (t: Transfer | null) => {
    if (!t?.last_notified_at) return 0;
    const elapsed = (Date.now() - new Date(t.last_notified_at).getTime()) / 1000;
    return Math.max(0, Math.ceil(RESEND_COOLDOWN_SEC - elapsed));
  };

  const filteredTransfers = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    return transfers.filter((t) => {
      if (filterStatus !== "all" && t.status !== filterStatus) return false;
      if (q && !t.domain_name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [transfers, filterStatus, filterQuery]);

  const openConfirmResend = async (t: Transfer) => {
    setConfirmResend(t);
    setModalLoading(true);
    setModalEvents([]); setModalEmails([]);
    const [ev, em] = await Promise.all([
      supabase.from("kubo_domain_transfer_events").select("id,event_type,from_status,to_status,message,created_at").eq("transfer_id", t.id).order("created_at", { ascending: false }).limit(20),
      supabase.from("email_send_log").select("id,status,created_at,message_id,error_message").like("message_id", `transfer-%${t.id}%`).order("created_at", { ascending: false }).limit(20),
    ]);
    setModalEvents((ev.data as any) ?? []);
    setModalEmails((em.data as any) ?? []);
    setModalLoading(false);
  };

  const exportCsv = () => {
    const rows = [
      ["domain", "status", "started_at", "completed_at", "retry_count", "last_notified_at", "last_notified_status", "current_registrar", "notify_email", "status_message", "last_error", "cancel_reason"],
      ...filteredTransfers.map((t: any) => [
        t.domain_name, t.status, t.started_at, t.completed_at ?? "", t.retry_count, t.last_notified_at ?? "", t.last_notified_status ?? "",
        t.current_registrar ?? "", t.notify_email ?? "", (t.status_message ?? "").replace(/\n/g, " "), (t.last_error ?? "").replace(/\n/g, " "), (t.cancel_reason ?? "").replace(/\n/g, " "),
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `transfers-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast.success(`${filteredTransfers.length} transfers exported`);
  };

  const tld = domain.includes(".") ? tldOf(domain) : null;
  const price = tld ? (TLD_TRANSFER_CREDITS[tld] ?? 20) : 20;

  const start = async () => {
    setConfirm(false);
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("domain-transfer", {
      body: { action: "start", domain, auth_code: authCode, current_registrar: registrar, notify_email: notifyEmail || undefined },
    });
    setBusy(false);
    if (error || data?.error) { toast.error(error?.message ?? data.error); return; }
    toast.success(`Transfer started · balance: ${data?.balance_after ?? "?"}`);
    setDomain(""); setAuthCode(""); setRegistrar(""); setNotifyEmail("");
    onTransferred();
  };

  const refresh = async (id: string) => {
    setRefreshing(id);
    const { data, error } = await supabase.functions.invoke("domain-transfer", { body: { action: "status", transfer_id: id } });
    setRefreshing(null);
    if (error || data?.error) { toast.error(error?.message ?? data.error); return; }
    toast.success(`Status: ${data?.transfer?.status ?? "?"}`);
    onTransferred();
  };

  const cancelNow = async () => {
    if (!cancelling) return;
    const t = cancelling;
    setCancelling(null);
    const { data, error } = await supabase.functions.invoke("domain-transfer", {
      body: { action: "cancel", transfer_id: t.id, reason: cancelReason || "Cancelado pelo usuário" },
    });
    setCancelReason("");
    if (error || data?.error) { toast.error(error?.message ?? data.error); return; }
    toast.success(`Transferência de ${t.domain_name} cancelada`);
    onTransferred();
  };

  const resendEmail = async (t: Transfer) => {
    const left = cooldownLeft(t);
    if (left > 0) { toast.error(`Wait ${left}s before resending the email.`); return; }
    setResendingEmail(t.id);
    const { error } = await supabase.functions.invoke("send-domain-transfer-status", {
      body: { transferId: t.id },
    });
    if (error) {
      setResendingEmail(null);
      toast.error(error.message);
      return;
    }

    setResendingEmail(null);
    toast.success("Status email resent");

    onTransferred();
  };

  const canSubmit = !!domain && authCode.length >= 4 && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain);

  return (
    <div className="space-y-6">
      <CloudflareTransferGuide onConnected={onTransferred} />
      <Card className="bg-card/60 backdrop-blur border-border/40 max-w-2xl">
        <CardHeader>
          <CardTitle className="font-orbitron flex items-center gap-2"><ArrowLeftRight className="w-5 h-5 text-primary" /> Transferir domínio (registro completo)</CardTitle>
          <CardDescription>Average time: 5–7 days. You need the AUTH/EPP code from the current registrar.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div><Label>Domain</Label><Input placeholder="mycompany.com" value={domain} onChange={(e) => setDomain(e.target.value.toLowerCase())} /></div>
          <div><Label>AUTH / EPP Code</Label><Input placeholder="xxxx-xxxx-xxxx" value={authCode} onChange={(e) => setAuthCode(e.target.value)} /></div>
          <div><Label>Current registrar (optional)</Label><Input placeholder="GoDaddy, Namecheap…" value={registrar} onChange={(e) => setRegistrar(e.target.value)} /></div>
          <div>
            <Label className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> Notification email (optional)</Label>
            <Input type="email" placeholder="you@company.com — uses your email if blank" value={notifyEmail} onChange={(e) => setNotifyEmail(e.target.value)} />
          </div>
          {tld && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground p-2 rounded bg-background/40 border border-border/30">
              <Info className="w-4 h-4 text-primary" /> Estimated cost: <span className="text-primary font-semibold">{price} créditos</span>
            </div>
          )}
          <Button onClick={() => setConfirm(true)} disabled={busy || !canSubmit} className="w-full bg-gradient-to-r from-primary to-purple-600">
            {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ArrowLeftRight className="w-4 h-4 mr-2" />} Start transfer
          </Button>
        </CardContent>
      </Card>

      {transfers.length > 0 && (
        <Card className="bg-card/60 backdrop-blur border-border/40">
          <CardHeader>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <CardTitle className="font-orbitron text-lg">Transfers</CardTitle>
                <CardDescription>Automatic update every 5 minutes. You can refresh manually or cancel at any time.</CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={exportCsv} title="Export audit as CSV">
                <Download className="w-3.5 h-3.5 mr-1.5" /> CSV
              </Button>
            </div>
            <div className="flex gap-2 mt-3 flex-wrap">
              <Input placeholder="Search by domain…" value={filterQuery} onChange={(e) => setFilterQuery(e.target.value)} className="max-w-xs h-9" />
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-48 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="validating">Validating</SelectItem>
                  <SelectItem value="transferring">Transferring</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground self-center">{filteredTransfers.length} of {transfers.length}</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {filteredTransfers.length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-6">No transfers match the current filters.</div>
            )}
            {filteredTransfers.map((t) => {
              const inProgress = ["pending", "validating", "transferring"].includes(t.status);
              const cdLeft = cooldownLeft(t);
              return (
                <div key={t.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-background/40 border border-border/30">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm">{t.domain_name}</span>
                      <StatusBadge status={t.status} />
                      {t.current_registrar && <span className="text-xs text-muted-foreground">from {t.current_registrar}</span>}
                      {t.retry_count > 0 && <Badge variant="outline" className="text-[10px]">retry {t.retry_count}</Badge>}
                    </div>
                    {t.status_message && <div className="text-xs text-muted-foreground mt-1 truncate">{t.status_message}</div>}
                    <div className="text-xs text-muted-foreground/70 mt-0.5 flex gap-3 flex-wrap">
                      <span>Iniciado {new Date(t.started_at).toLocaleString("pt-BR")}</span>
                      {t.next_retry_at && inProgress && <span>Próximo check: {new Date(t.next_retry_at).toLocaleTimeString("pt-BR")}</span>}
                      {t.notify_email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{t.notify_email}</span>}
                    </div>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => openConfirmResend(t)} disabled={resendingEmail === t.id || cdLeft > 0} title={cdLeft > 0 ? `Aguarde ${cdLeft}s para reenviar` : (t.last_notified_at ? `Último e-mail: ${new Date(t.last_notified_at).toLocaleString("pt-BR")}` : "Resend status email")}>
                      {resendingEmail === t.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => refresh(t.id)} disabled={refreshing === t.id} title="Atualizar status">
                      {refreshing === t.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    </Button>
                    {inProgress && (
                      <Button size="sm" variant="outline" onClick={() => setCancelling(t)} className="text-red-400 hover:bg-red-500/10 border-red-500/30" title="Cancel Transfer">
                        <Ban className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}


      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-orbitron">Confirm Transfer</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>You are about to start the transfer of:</p>
                <div className="p-3 rounded-lg bg-muted/40 border border-border/40">
                  <div className="font-mono text-lg text-foreground">{domain}</div>
                  <div className="text-sm text-muted-foreground mt-1">Cost: <span className="text-primary font-semibold">{price} credits</span></div>
                </div>
                <p className="text-xs">Credits are debited now. Tracking and email notification are automatic.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={start} className="bg-gradient-to-r from-primary to-purple-600">Confirm and start</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!cancelling} onOpenChange={(o) => !o && setCancelling(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-orbitron">Cancel Transfer</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>You are about to cancel the transfer of <strong className="font-mono">{cancelling?.domain_name}</strong>. The request will be cancelled at IONOS and the status saved with an audit trail.</p>
                <div>
                  <Label className="text-xs">Reason (optional)</Label>
                  <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="e.g., wrong domain" />
                </div>
                <p className="text-xs text-amber-500">⚠ Credits are not automatically refunded. Open a ticket if needed.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Back</AlertDialogCancel>
            <AlertDialogAction onClick={cancelNow} className="bg-red-500 hover:bg-red-600">Confirm cancellation</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmResend} onOpenChange={(o) => !o && setConfirmResend(null)}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-orbitron">Resend status email</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>You are about to resend the status email for the transfer:</p>
                <div className="p-3 rounded-lg bg-muted/40 border border-border/40">
                  <div className="font-mono text-lg text-foreground">{confirmResend?.domain_name}</div>
                  <div className="text-sm text-muted-foreground mt-1">Current status: <span className="text-primary font-semibold">{confirmResend?.status}</span></div>
                  <div className="text-sm text-muted-foreground mt-1">Recipient: {confirmResend?.notify_email || "logged-in user's email"}</div>
                  {confirmResend?.last_notified_at && (
                    <div className="text-xs text-muted-foreground mt-1">Last email sent: {new Date(confirmResend.last_notified_at).toLocaleString("pt-BR")}</div>
                  )}
                  {confirmResend && cooldownLeft(confirmResend) > 0 && (
                    <div className="text-xs text-amber-500 mt-1">⏳ Cooldown: wait {cooldownLeft(confirmResend)}s to resend.</div>
                  )}
                </div>

                <div>
                  <div className="text-xs font-semibold uppercase text-muted-foreground mb-1.5 flex items-center gap-1.5"><Mail className="w-3 h-3" /> Email History</div>
                  <div className="max-h-32 overflow-y-auto rounded border border-border/40 bg-background/40 text-xs divide-y divide-border/30">
                    {modalLoading && <div className="p-2 text-muted-foreground">Loading…</div>}
                    {!modalLoading && modalEmails.length === 0 && <div className="p-2 text-muted-foreground">No emails recorded yet.</div>}
                    {modalEmails.map((m) => (
                      <div key={m.id} className="p-2 flex justify-between gap-2">
                        <span className="font-mono">{m.status}</span>
                        <span className="text-muted-foreground">{new Date(m.created_at).toLocaleString("pt-BR")}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold uppercase text-muted-foreground mb-1.5 flex items-center gap-1.5"><Terminal className="w-3 h-3" /> Audit Logs</div>
                  <div className="max-h-40 overflow-y-auto rounded border border-border/40 bg-background/40 text-xs divide-y divide-border/30">
                    {modalLoading && <div className="p-2 text-muted-foreground">Loading…</div>}
                    {!modalLoading && modalEvents.length === 0 && <div className="p-2 text-muted-foreground">No events recorded.</div>}
                    {modalEvents.map((e) => (
                      <div key={e.id} className="p-2">
                        <div className="flex justify-between gap-2">
                          <span className="font-mono text-primary">{e.event_type}</span>
                          <span className="text-muted-foreground">{new Date(e.created_at).toLocaleString("pt-BR")}</span>
                        </div>
                        {(e.from_status || e.to_status) && (
                          <div className="text-muted-foreground/80 mt-0.5">{e.from_status ?? "—"} → {e.to_status ?? "—"}</div>
                        )}
                        {e.message && <div className="text-muted-foreground/70 mt-0.5 truncate">{e.message}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmResend(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (confirmResend) resendEmail(confirmResend); setConfirmResend(null); }}
              disabled={!!confirmResend && cooldownLeft(confirmResend) > 0}
              className="bg-gradient-to-r from-primary to-purple-600"
            >
              Confirmar reenvio
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}

function ConnectTab({ onConnected }: { onConnected: () => void }) {
  const [domain, setDomain] = useState("");
  const [ns, setNs] = useState("");
  const [busy, setBusy] = useState(false);
  const [assignedNs, setAssignedNs] = useState<string[]>([]);

  const connect = async () => {
    setBusy(true);
    const nameservers = ns.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
    const { data, error } = await supabase.functions.invoke("domain-connect", { body: { domain, nameservers } });
    setBusy(false);
    if (error || data?.error) { toast.error(error?.message ?? data.error); return; }
    toast.success(data?.provider === "cloudflare" ? "Domínio adicionado à Cloudflare — atualize os nameservers no seu registrador" : "Domínio conectado");
    setAssignedNs(data?.provider === "cloudflare" ? (data?.nameservers ?? []) : []);
    setDomain(""); setNs("");
    onConnected();
  };

  return (
    <Card className="bg-card/60 backdrop-blur border-border/40 max-w-2xl">
      <CardHeader>
        <CardTitle className="font-orbitron flex items-center gap-2"><Link2 className="w-5 h-5 text-primary" /> Conectar domínio existente</CardTitle>
        <CardDescription>Já tem domínio? Ele entra na rede Cloudflare do {PARTNER_NAME}: você recebe os nameservers, troca no seu registrador e passa a gerenciar DNS e subdomínios aqui.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div><Label>Domínio</Label><Input placeholder="meudominio.com" value={domain} onChange={(e) => setDomain(e.target.value)} /></div>
        <div><Label>Nameservers (opcional)</Label><Input placeholder="ns1.kubo.dev, ns2.kubo.dev" value={ns} onChange={(e) => setNs(e.target.value)} /></div>
        <Button onClick={connect} disabled={busy || !domain} className="w-full bg-gradient-to-r from-primary to-purple-600">
          {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Link2 className="w-4 h-4 mr-2" />} Conectar
        </Button>
        {!!assignedNs.length && <NameserverBox nameservers={assignedNs} />}
      </CardContent>
    </Card>
  );
}

function DnsTab({ domains }: { domains: Domain[] }) {
  const [selected, setSelected] = useState<string>("");
  const [records, setRecords] = useState<DnsRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ type: "A", name: "@", value: "", ttl: 3600, priority: "" });
  const [creating, setCreating] = useState(false);
  const selectedDomain = useMemo(() => domains.find((d) => d.id === selected), [domains, selected]);

  useEffect(() => { if (domains.length && !selected) setSelected(domains[0].id); }, [domains, selected]);

  const load = async (id: string) => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("domain-dns", { body: { action: "list", domain_id: id } });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setRecords(data?.records ?? []);
  };
  useEffect(() => { if (selected) load(selected); }, [selected]);

  const create = async () => {
    if (!form.value) { toast.error("Valor obrigatório"); return; }
    setCreating(true);
    const { data, error } = await supabase.functions.invoke("domain-dns", {
      body: { action: "create", domain_id: selected, record: { ...form, priority: form.priority ? Number(form.priority) : null } },
    });
    setCreating(false);
    if (error || data?.error) { toast.error(error?.message ?? data.error); return; }
    toast.success(data?.synced ? `Registro criado e sincronizado (${PROVIDER_LABEL[data?.provider] ?? "parceiro"})` : "Registro salvo (sem sync com o parceiro)");
    setForm({ type: "A", name: "@", value: "", ttl: 3600, priority: "" });
    load(selected);
  };

  const del = async (id: string) => {
    const { error } = await supabase.functions.invoke("domain-dns", { body: { action: "delete", domain_id: selected, record_id: id } });
    if (error) { toast.error(error.message); return; }
    toast.success("Removed");
    load(selected);
  };

  if (!domains.length) return <Card className="bg-card/60 border-border/40"><CardContent className="py-12 text-center text-muted-foreground">Você precisa de pelo menos um domínio para gerenciar DNS.</CardContent></Card>;

  return (
    <div className="space-y-4">
      <Card className="bg-card/60 backdrop-blur border-border/40">
        <CardHeader>
          <CardTitle className="font-orbitron text-lg">Editor DNS</CardTitle>
          <CardDescription>Gerencie registros A / AAAA / CNAME / TXT / MX / SRV / NS.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Domínio</Label>
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{domains.map((d) => <SelectItem key={d.id} value={d.id}>{d.domain_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-6 gap-2 p-3 rounded-lg bg-background/40 border border-border/30">
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>{RECORD_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Nome</Label><Input className="h-9" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="md:col-span-2"><Label className="text-xs">Valor</Label><Input className="h-9" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder={form.type === "A" ? "192.0.2.1" : form.type === "CNAME" ? "target.example.com" : ""} /></div>
            <div><Label className="text-xs">TTL</Label><Input className="h-9" type="number" value={form.ttl} onChange={(e) => setForm({ ...form, ttl: Number(e.target.value) })} /></div>
            <div className="flex items-end"><Button onClick={create} disabled={creating} className="w-full h-9">{creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-1" />Add</>}</Button></div>
          </div>

          {loading ? <div className="py-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-primary" /></div> : (
            <div className="overflow-hidden rounded-lg border border-border/30">
              <table className="w-full text-sm">
                <thead className="bg-background/60"><tr className="text-left text-xs text-muted-foreground"><th className="px-3 py-2">Tipo</th><th className="px-3 py-2">Nome</th><th className="px-3 py-2">Valor</th><th className="px-3 py-2">TTL</th><th></th></tr></thead>
                <tbody>{records.length ? records.map((r) => (
                  <tr key={r.id} className="border-t border-border/20 hover:bg-background/30">
                    <td className="px-3 py-2 font-mono text-xs"><Badge variant="outline">{r.record_type}</Badge></td>
                    <td className="px-3 py-2 font-mono">{r.name}</td>
                    <td className="px-3 py-2 font-mono truncate max-w-xs">{r.value}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.ttl}s</td>
                    <td className="px-3 py-2 text-right"><Button size="sm" variant="ghost" onClick={() => del(r.id)} className="text-red-400 hover:bg-red-500/10"><Trash2 className="w-3.5 h-3.5" /></Button></td>
                  </tr>
                )) : <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">Sem registros para {selectedDomain?.domain_name}.</td></tr>}</tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DebugTab() {
  const [logs, setLogs] = useState<DebugLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("connector_activity_logs")
      .select("id, event_type, status, message, metadata, created_at")
      .in("connector_slug", ["cloudflare", "ionos"])
      .order("created_at", { ascending: false })
      .limit(100);
    setLogs((data as DebugLog[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const exportCSV = () => {
    const headers = ["created_at", "event_type", "status", "message", "metadata"];
    const rows = logs.map((l) => [
      new Date(l.created_at).toISOString(),
      l.event_type,
      l.status,
      JSON.stringify(l.message ?? ""),
      JSON.stringify(l.metadata ?? {}),
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `domain-partner-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${logs.length} log(s) exportados`);
  };

  return (
    <Card className="bg-card/60 backdrop-blur border-border/40">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="font-orbitron flex items-center gap-2"><Terminal className="w-5 h-5 text-primary" /> Debug logs — Parceiros</CardTitle>
            <CardDescription>Últimos 100 eventos: busca, compra, transferência, status, retry, cancelamento.</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={exportCSV} disabled={!logs.length}>
              <Download className="w-4 h-4 mr-1" /> Exportar CSV
            </Button>
            <Button size="sm" variant="outline" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="py-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-primary" /></div>
        ) : !logs.length ? (
          <div className="py-12 text-center text-muted-foreground">
            <KeyRound className="w-10 h-10 mx-auto mb-3 opacity-50" />
            Sem eventos ainda. Tente uma busca ou compra para gerar logs.
          </div>
        ) : (
          <div className="space-y-1.5 font-mono text-xs">
            {logs.map((l) => (
              <div key={l.id} className="border border-border/30 rounded bg-background/30">
                <button onClick={() => setExpanded(expanded === l.id ? null : l.id)} className="w-full text-left p-2 flex items-center gap-2 hover:bg-background/50 transition">
                  <span className="text-muted-foreground shrink-0">{new Date(l.created_at).toLocaleTimeString("pt-BR")}</span>
                  <StatusBadge status={l.status} />
                  <span className="text-muted-foreground shrink-0">[{l.event_type}]</span>
                  <span className="text-foreground truncate flex-1">{l.message}</span>
                </button>
                {expanded === l.id && (
                  <pre className="p-3 border-t border-border/30 bg-background/60 overflow-x-auto text-[10px] text-muted-foreground whitespace-pre-wrap break-all">
                    {JSON.stringify(l.metadata, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function NameserverBox({ nameservers }: { nameservers: string[] }) {
  const copy = () => { navigator.clipboard?.writeText(nameservers.join("\n")); toast.success("Nameservers copiados"); };
  return (
    <div className="p-3 rounded-lg bg-primary/5 border border-primary/30 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">Troque os nameservers no seu registrador atual para:</div>
        <Button size="sm" variant="ghost" onClick={copy}><Copy className="w-3.5 h-3.5 mr-1" />Copiar</Button>
      </div>
      {nameservers.map((n) => <div key={n} className="font-mono text-sm text-primary">{n}</div>)}
      <p className="text-xs text-muted-foreground">A propagação leva de alguns minutos até 24h. Depois disso DNS, SSL e subdomínios ficam ativos no painel.</p>
    </div>
  );
}

function CloudflareTransferGuide({ onConnected }: { onConnected: () => void }) {
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState(false);
  const [ns, setNs] = useState<string[]>([]);

  const start = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("domain-connect", { body: { domain: domain.trim().toLowerCase() } });
    setBusy(false);
    if (error || data?.error) { toast.error(error?.message ?? data.error); return; }
    if (data?.provider !== "cloudflare") { toast.warning("Cloudflare não configurado — domínio conectado em modo manual."); onConnected(); return; }
    setNs(data?.nameservers ?? []);
    toast.success(`${domain} adicionado à rede ${PARTNER_NAME}`);
    onConnected();
  };

  return (
    <Card className="bg-gradient-to-br from-primary/10 via-card/60 to-card/40 backdrop-blur border-primary/30 max-w-2xl">
      <CardHeader>
        <CardTitle className="font-orbitron flex items-center gap-2"><Handshake className="w-5 h-5 text-primary" /> Transferir para {PARTNER_NAME}</CardTitle>
        <CardDescription>Traga seu domínio de qualquer registrador para a infraestrutura Cloudflare da Vertal, sem tirar o site do ar.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="space-y-2 text-sm">
          <li><strong>1.</strong> Adicione o domínio abaixo — geramos a zona DNS e os nameservers Cloudflare.</li>
          <li><strong>2.</strong> Troque os nameservers no registrador atual. DNS e subdomínios já passam a funcionar pelo painel.</li>
          <li><strong>3.</strong> Desbloqueie o domínio e envie o código AUTH/EPP no formulário abaixo para concluir a transferência do registro.</li>
        </ol>
        <div className="flex gap-2">
          <Input placeholder="meudominio.com" value={domain} onChange={(e) => setDomain(e.target.value)} className="bg-background/60" />
          <Button onClick={start} disabled={busy || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(domain.trim())} className="bg-gradient-to-r from-primary to-purple-600">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowLeftRight className="w-4 h-4 mr-1" />} Iniciar
          </Button>
        </div>
        {!!ns.length && <NameserverBox nameservers={ns} />}
      </CardContent>
    </Card>
  );
}

function SubdomainsTab({ domains }: { domains: Domain[] }) {
  const [subs, setSubs] = useState<Subdomain[]>([]);
  const [meta, setMeta] = useState<{ root_domain: string | null; vertal_enabled: boolean; free_limit: number }>({ root_domain: null, vertal_enabled: false, free_limit: 3 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<"vertal" | "custom">("custom");
  const [domainId, setDomainId] = useState("");
  const [label, setLabel] = useState("");
  const [target, setTarget] = useState("");
  const [manual, setManual] = useState<{ type: string; name: string; value: string } | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("domain-subdomains", { body: { action: "list" } });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setSubs(data?.subdomains ?? []);
    setMeta({ root_domain: data?.root_domain ?? null, vertal_enabled: !!data?.vertal_enabled, free_limit: data?.free_limit ?? 3 });
    if (!domains.length && data?.vertal_enabled) setKind("vertal");
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { if (domains.length && !domainId) setDomainId(domains[0].id); }, [domains, domainId]);

  const parent = kind === "vertal" ? meta.root_domain : domains.find((d) => d.id === domainId)?.domain_name;
  const cleanLabel = label.trim().toLowerCase();

  const create = async () => {
    setBusy(true); setManual(null);
    const { data, error } = await supabase.functions.invoke("domain-subdomains", {
      body: { action: "create", kind, label: cleanLabel, domain_id: kind === "custom" ? domainId : undefined, target: target.trim() || undefined },
    });
    setBusy(false);
    if (error || data?.error) { toast.error(error?.message ?? data.error); return; }
    if (data?.manual_record) setManual(data.manual_record);
    toast.success(data?.synced ? `${data.subdomain.hostname} ativo` : `${data.subdomain.hostname} criado — falta o registro DNS`);
    setLabel(""); setTarget("");
    load();
  };

  const remove = async (id: string) => {
    const { data, error } = await supabase.functions.invoke("domain-subdomains", { body: { action: "delete", id } });
    if (error || data?.error) { toast.error(error?.message ?? data.error); return; }
    toast.success("Subdomínio removido");
    load();
  };

  const vertalCount = subs.filter((s) => s.kind === "vertal").length;

  return (
    <div className="space-y-4">
      <Card className="bg-card/60 backdrop-blur border-border/40">
        <CardHeader>
          <CardTitle className="font-orbitron flex items-center gap-2"><Network className="w-5 h-5 text-primary" /> Subdomínios</CardTitle>
          <CardDescription>Publique seu app em <span className="font-mono">app.suamarca.com</span> ou, antes de comprar um domínio, num subdomínio grátis Vertal.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={kind === "custom" ? "default" : "outline"} onClick={() => setKind("custom")} disabled={!domains.length}>No meu domínio</Button>
            <Button size="sm" variant={kind === "vertal" ? "default" : "outline"} onClick={() => setKind("vertal")} disabled={!meta.vertal_enabled}>
              Grátis Vertal {meta.root_domain ? `(.${meta.root_domain})` : ""} · {vertalCount}/{meta.free_limit}
            </Button>
          </div>

          {kind === "custom" && !domains.length ? (
            <p className="text-sm text-muted-foreground">Compre, transfira ou conecte um domínio para criar subdomínios nele.</p>
          ) : (
            <div className="grid gap-2 md:grid-cols-[1fr_auto_1fr_auto] items-end">
              <div><Label className="text-xs">Subdomínio</Label><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="app" /></div>
              <div className="pb-2 font-mono text-sm text-muted-foreground">
                {kind === "custom" ? (
                  <Select value={domainId} onValueChange={setDomainId}>
                    <SelectTrigger className="h-9 min-w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>{domains.map((d) => <SelectItem key={d.id} value={d.id}>.{d.domain_name}</SelectItem>)}</SelectContent>
                  </Select>
                ) : <>.{meta.root_domain}</>}
              </div>
              <div><Label className="text-xs">Destino (CNAME, opcional)</Label><Input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="padrão: app Vertal publicado" /></div>
              <Button onClick={create} disabled={busy || !cleanLabel || !parent} className="bg-gradient-to-r from-primary to-purple-600">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-1" />Criar</>}
              </Button>
            </div>
          )}
          {cleanLabel && parent && <p className="text-xs text-muted-foreground">Vai ficar: <span className="font-mono text-foreground">{cleanLabel}.{parent}</span></p>}

          {manual && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm">
              <div className="font-semibold mb-1"><Info className="w-4 h-4 inline mr-1" />Adicione este registro no DNS do seu domínio:</div>
              <div className="font-mono text-xs">{manual.type} · {manual.name} → {manual.value}</div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card/60 backdrop-blur border-border/40">
        <CardContent className="pt-6">
          {loading ? <div className="py-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-primary" /></div> : !subs.length ? (
            <p className="py-8 text-center text-muted-foreground">Nenhum subdomínio ainda.</p>
          ) : (
            <div className="space-y-2">
              {subs.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-background/40 border border-border/30">
                  <div className="min-w-0">
                    <a href={`https://${s.hostname}`} target="_blank" rel="noopener noreferrer" className="font-mono text-sm hover:text-primary truncate block">{s.hostname}</a>
                    <div className="text-xs text-muted-foreground truncate">CNAME → {s.target} · {s.kind === "vertal" ? "grátis Vertal" : "domínio próprio"}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge status={s.status} />
                    <Button size="sm" variant="ghost" onClick={() => remove(s.id)} className="text-red-400 hover:bg-red-500/10"><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
