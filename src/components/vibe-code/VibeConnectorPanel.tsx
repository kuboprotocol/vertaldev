import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Github, Database, CreditCard, Globe, Plug, CheckCircle2, Circle, KeyRound } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { VibeConnectorState } from "@/lib/vibeCodeAgentTypes";
import { fetchPlanForKeys } from "@/hooks/useKuboSecrets";
import { newSecretPath, SECRETS_PATH } from "@/lib/secretsVaultLinks";

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
  // Chaves exigidas que já estão no Cofre de segredos (null = cofre não respondeu).
  const [inVault, setInVault] = useState<Set<string> | null>(null);

  useEffect(() => {
    const keys = [...new Set(pending.flatMap((r) => r.secrets))].slice(0, 50);
    if (keys.length === 0) {
      setInVault(null);
      return;
    }
    let active = true;
    fetchPlanForKeys(keys)
      .then((plan) => {
        if (active) setInVault(new Set(plan.entries.filter((e) => e.status === "ready").map((e) => e.env_key)));
      })
      .catch(() => {
        if (active) setInVault(null);
      });
    return () => {
      active = false;
    };
  }, [pending]);

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
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {r.secrets.map((s) =>
                    inVault?.has(s) ? (
                      <span
                        key={s}
                        className="inline-flex items-center gap-1 rounded border border-emerald-500/30 px-1.5 py-0.5 font-mono text-[10px] text-emerald-400"
                      >
                        <CheckCircle2 className="h-2.5 w-2.5" /> {s} no cofre
                      </span>
                    ) : (
                      <Link
                        key={s}
                        to={newSecretPath(s, r.name)}
                        className="inline-flex items-center gap-1 rounded border border-amber-500/30 px-1.5 py-0.5 font-mono text-[10px] text-amber-300 hover:bg-amber-500/10"
                      >
                        <KeyRound className="h-2.5 w-2.5" /> Guardar {s}
                      </Link>
                    ),
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
        <KeyRound className="h-4 w-4 mt-0.5 text-primary shrink-0" />
        <div className="min-w-0 flex-1">
          <span className="text-sm font-medium">Cofre de segredos</span>
          <p className="text-xs text-muted-foreground leading-snug">
            Onde ficam as chaves de API, tokens e senhas do app. Separado dos conectores.
          </p>
        </div>
        <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
          <Link to={SECRETS_PATH}>Abrir</Link>
        </Button>
      </div>

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
