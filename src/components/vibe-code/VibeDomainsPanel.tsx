import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Globe, Search, ArrowRightLeft, Link2, Network, CheckCircle2, Clock, ChevronRight, Handshake } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type Row = { id: string; name: string; type: string; active: boolean; expires: string | null };
type DomainRow = { id: string; domain_name: string; status: string; source: string; expires_at: string | null };
type SubdomainRow = { id: string; hostname: string; status: string; kind: string };
type SubdomainQuery = { from: (t: string) => { select: (c: string) => { order: (c: string, o: { ascending: boolean }) => Promise<{ data: SubdomainRow[] | null }> } } };

const ACTIONS = [
  { tab: "buy", icon: Search, title: "Comprar Domínio", body: "Registre um domínio para o seu app com preço em tempo real.", cta: "Registrar agora", primary: true },
  { tab: "transfer", icon: ArrowRightLeft, title: "Transferir Domínio", body: "Traga um domínio de outro registrador para a Vertal.", cta: "Iniciar transferência" },
  { tab: "connect", icon: Link2, title: "Conectar Existente", body: "Use um domínio que você já possui trocando os nameservers.", cta: "Configurar DNS" },
  { tab: "subdomains", icon: Network, title: "Subdomínios", body: "Publique em app.suamarca.com ou num subdomínio grátis Vertal.", cta: "Criar subdomínio" },
] as const;

export function VibeDomainsPanel() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [d, s] = await Promise.all([
        supabase.from("kubo_domains").select("id, domain_name, status, source, expires_at").order("created_at", { ascending: false }),
        // kubo_subdomains is newer than the generated types
        (supabase as unknown as SubdomainQuery).from("kubo_subdomains").select("id, hostname, status, kind").order("created_at", { ascending: false }),
      ]);
      setRows([
        ...((d.data ?? []) as DomainRow[]).map((x) => ({ id: x.id, name: x.domain_name, type: x.source === "purchase" ? "Registrado" : x.source === "transfer" ? "Transferido" : "Conectado", active: x.status === "active", expires: x.expires_at })),
        ...(s.data ?? []).map((x) => ({ id: x.id, name: x.hostname, type: x.kind === "vertal" ? "Subdomínio Vertal" : "Subdomínio", active: x.status === "active", expires: null })),
      ]);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Handshake className="h-5 w-5 text-primary" />
        <h2 className="font-semibold text-foreground">Vertal Domínios - Parceiros</h2>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {ACTIONS.map((a) => (
          <Card key={a.tab} className={cn("group relative overflow-hidden p-4 transition-all", "primary" in a && a.primary ? "border-primary/20 bg-primary/5 hover:bg-primary/10" : "border-border/60 bg-card/30 hover:bg-card/50")}>
            <div className={cn("mb-3 flex h-10 w-10 items-center justify-center rounded-lg", "primary" in a && a.primary ? "bg-primary/20 text-primary" : "bg-white/5 text-foreground")}>
              <a.icon className="h-5 w-5" />
            </div>
            <h3 className="font-semibold text-foreground">{a.title}</h3>
            <p className="mt-1 text-[10px] leading-tight text-muted-foreground">{a.body}</p>
            <Button variant="ghost" className="mt-4 h-8 w-full justify-between text-xs font-medium" onClick={() => navigate(`/domains?tab=${a.tab}`)}>
              {a.cta} <ChevronRight className="h-3 w-3" />
            </Button>
          </Card>
        ))}
      </div>

      <div className="rounded-xl border border-border/40 bg-card/30 p-4 backdrop-blur-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Meus domínios</h3>
          <Badge variant="outline" className="text-[10px]">{rows.length} Total</Badge>
        </div>

        {!loading && !rows.length && (
          <p className="text-xs text-muted-foreground">Seu app ainda não tem domínio. Compre um ou crie um subdomínio grátis.</p>
        )}
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-lg border border-border/40 bg-background/40 p-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", r.active ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500")}>
                  <Globe className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{r.name}</span>
                    <Badge variant="secondary" className="h-4 px-1 text-[9px] uppercase tracking-tighter">{r.type}</Badge>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    {r.active ? (
                      <span className="flex items-center gap-1"><CheckCircle2 className="h-2.5 w-2.5" /> DNS Verified</span>
                    ) : (
                      <span className="flex animate-pulse items-center gap-1"><Clock className="h-2.5 w-2.5" /> Propagating DNS...</span>
                    )}
                    {r.expires && <><span>•</span><span>Expira {r.expires.slice(0, 10)}</span></>}
                  </div>
                </div>
              </div>
              <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={() => navigate("/domains?tab=dns")}>Edit</Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
