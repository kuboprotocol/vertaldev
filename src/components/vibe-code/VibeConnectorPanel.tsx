import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Github, Database, CreditCard, Globe, Plug, CheckCircle2, Circle, KeyRound } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { VibeConnectorState } from "@/lib/vibeCodeAgentTypes";

const ICONS = {
  github: Github,
  supabase: Database,
  stripe: CreditCard,
  ionos: Globe,
  mcp: Plug,
} as const;

// Cada botão leva à página real do serviço (não a uma rota de conector inexistente).
const TARGETS: Record<VibeConnectorState["slug"], { to: string; action: string }> = {
  github: { to: "/connectors/github", action: "Connect" },
  supabase: { to: "/connectors/supabase", action: "Open" },
  stripe: { to: "/connect", action: "Connect" },
  ionos: { to: "/domains", action: "Open" },
  mcp: { to: "/docs/mcp", action: "Docs" },
};

const BASE: VibeConnectorState[] = [
  { slug: "github", label: "GitHub", description: "Commits every agent edit into your repository.", connected: false },
  { slug: "supabase", label: "Cloud", description: "Database, auth and edge functions.", connected: true },
  { slug: "stripe", label: "Stripe", description: "Billing and credit top-ups.", connected: false },
  { slug: "ionos", label: "IONOS", description: "Domains and DNS automation.", connected: false },
  { slug: "mcp", label: "MCP", description: "External tool servers for the agent.", connected: false },
];

interface PendingRequirement {
  id: string;
  slug: string;
  name: string;
  reason: string | null;
  secrets: string[];
}

const REQUIREMENTS = "vibe_requirements" as never;

export function VibeConnectorPanel({ projectId }: { projectId?: string }) {
  const [connectors, setConnectors] = useState<VibeConnectorState[]>(BASE);
  const [pending, setPending] = useState<PendingRequirement[]>([]);

  // Conectores e APIs que o agente detectou como necessários para os apps do usuário.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        let query = supabase
          .from(REQUIREMENTS)
          .select("id, slug, name, reason, secrets")
          .eq("status", "needed")
          .order("updated_at", { ascending: false })
          .limit(20);
        if (projectId) query = query.eq("project_id", projectId);
        const { data } = await query;
        if (active) setPending((data ?? []) as unknown as PendingRequirement[]);
      } catch {
        // Sem a lista de exigências o painel continua útil; só não mostra o aviso.
        if (active) setPending([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [projectId]);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!active || !data?.user) return;
      const { data: rows } = await supabase
        .from("github_connections_safe")
        .select("id")
        .limit(1);
      const githubConnected = (rows ?? []).length > 0;
      if (!active) return;
      setConnectors((prev) =>
        prev.map((c) => (c.slug === "github" ? { ...c, connected: githubConnected } : c)),
      );
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <Card className="p-4 space-y-3 bg-card/60 backdrop-blur border-border/60">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
          Connectors
        </h3>
        <Badge variant="outline" className="text-[10px]">
          {connectors.filter((c) => c.connected).length}/{connectors.length}
        </Badge>
      </div>

      {pending.length > 0 && (
        <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3" data-testid="pending-requirements">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-400">
            <KeyRound className="h-3.5 w-3.5" /> Exigidos pelo seu app ({pending.length})
          </p>
          {pending.map((r) => (
            <div key={r.id} className="text-xs">
              <span className="font-medium">{r.name}</span>
              {r.reason && <span className="text-muted-foreground"> — {r.reason}</span>}
              {r.secrets.length > 0 && (
                <span className="ml-1 font-mono text-[10px] text-muted-foreground">({r.secrets.join(", ")})</span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {connectors.map((c) => {
          const Icon = ICONS[c.slug];
          return (
            <div
              key={c.slug}
              className="flex items-start gap-3 rounded-lg border border-border/50 bg-background/40 p-3"
            >
              <Icon className="h-4 w-4 mt-0.5 text-primary shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{c.label}</span>
                  {c.connected ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                  ) : (
                    <Circle className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground leading-snug">{c.description}</p>
              </div>
              {!c.connected && (
                <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
                  <Link to={TARGETS[c.slug].to}>{TARGETS[c.slug].action}</Link>
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export default VibeConnectorPanel;
