import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Github, Database, CreditCard, Globe, Plug, CheckCircle2, Circle, KeyRound, ExternalLink, Lock, Eye, EyeOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { getCatalogEntry } from "@/config/connectorCatalog";
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
  github: { to: "/connectors/github", action: "Conectar" },
  supabase: { to: "/connectors/supabase", action: "Abrir" },
  stripe: { to: "/connect", action: "Conectar" },
  ionos: { to: "/domains", action: "Abrir" },
  mcp: { to: "/docs/mcp", action: "Docs" },
};

// Conectores do grupo Vertal que o usuário pode ligar ao app.
const VERTAL_CONNECTORS: VibeConnectorState[] = [
  { slug: "github", label: "GitHub", description: "Commits de cada edição do agente no seu repositório.", connected: false },
  { slug: "supabase", label: "Cloud", description: "Banco, login e edge functions.", connected: true },
  { slug: "stripe", label: "Cobrança Vertal", description: "Créditos e assinaturas da plataforma.", connected: false },
  { slug: "ionos", label: "IONOS", description: "Domínios e DNS pela Vertal.", connected: false },
  { slug: "mcp", label: "MCP", description: "Servidores de ferramentas para o agente.", connected: false },
];


export interface PendingRequirement {
  id: string;
  slug: string;
  name: string;
  reason: string | null;
  secrets: string[];
  kind: "connector" | "api";
  status: "needed" | "connected" | "dismissed";
}

/** Caixinha "API e Secrets": cola a chave, guarda criptografada e some da lista ativa. */
function ApiKeyBox({
  requirement,
  onSaved,
  placeholder,
}: {
  requirement: PendingRequirement;
  onSaved: () => void;
  placeholder?: string;
}) {
  const [value, setValue] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const key = value.trim();
    if (key.length < 8) {
      toast.error("Cole a chave completa (mínimo 8 caracteres).");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.functions.invoke("connector-credentials-save", {
        body: { connector_slug: requirement.slug, api_key: key },
      });
      if (error) throw error;
      await supabase
        .from("vibe_requirements")
        .update({ status: "connected", updated_at: new Date().toISOString() })
        .eq("id", requirement.id);
      setValue("");
      toast.success(`${requirement.name} guardado no cofre`);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível guardar a chave.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-border/50 bg-black/30 p-3">
      <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <KeyRound className="h-3 w-3" /> API e Secrets
        {requirement.secrets.length > 0 && (
          <span className="font-mono text-[10px] text-muted-foreground/70">({requirement.secrets.join(", ")})</span>
        )}
      </p>
      <div className="flex items-center gap-1.5">
        <Input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder ?? "Cole a chave aqui"}
          className="h-8 font-mono text-xs"
          autoComplete="off"
          spellCheck={false}
        />
        <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => setShow((v) => !v)} aria-label={show ? "Ocultar" : "Mostrar"}>
          {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </Button>
      </div>
      {requirement.secrets.length > 1 && (
        <p className="text-[10px] text-amber-400/80">
          Este conector pede mais de um segredo. Por enquanto a caixinha guarda a chave principal; os demais entram depois.
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1 text-[10px] text-muted-foreground/70">
          <Lock className="h-2.5 w-2.5" /> Criptografada. Depois de guardada, some daqui e fica no cofre.
        </p>
        <Button size="sm" className="h-7 text-xs" onClick={() => void save()} disabled={saving || !value.trim()}>
          {saving ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </div>
  );
}

function RequirementCard({ row, onChanged }: { row: PendingRequirement; onChanged: () => void }) {
  const entry = getCatalogEntry(row.slug);
  const providerName = entry?.label ?? row.name;
  const [confirmingVertal, setConfirmingVertal] = useState(false);

  const markConnected = async () => {
    const { error } = await supabase
      .from("vibe_requirements")
      .update({ status: "connected", updated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (error) toast.error("Não foi possível atualizar o conector.");
    else onChanged();
  };

  return (
    <li className="space-y-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.04] p-3" data-testid="pending-requirement">
      <div className="flex items-start gap-2">
        <Circle className="mt-1 h-3 w-3 shrink-0 text-amber-400" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium">{providerName}</span>
            <Badge variant="outline" className="h-4 px-1.5 text-[9px] uppercase">{row.kind === "connector" ? "conector" : "API"}</Badge>
          </div>
          {row.reason && <p className="mt-0.5 text-xs text-muted-foreground">{row.reason}</p>}
        </div>
      </div>

      {entry?.vertalOffer ? (
        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground">A Vertal já tem este conector. Use o nosso, sem configurar nada:</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild size="sm" className="h-7 gap-1.5 text-xs">
              <Link to={entry.vertalOffer.to}>
                <Plug className="h-3 w-3" /> {entry.vertalOffer.label}
              </Link>
            </Button>
            {!confirmingVertal ? (
              <Button size="sm" variant="ghost" className="h-7 text-[11px] text-muted-foreground" onClick={() => setConfirmingVertal(true)}>
                Já conectei
              </Button>
            ) : (
              <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => void markConnected()}>
                Confirmar conexão
              </Button>
            )}
          </div>
          {entry.keysUrl && (
            <details className="text-[11px] text-muted-foreground">
              <summary className="cursor-pointer hover:text-foreground">Prefiro usar a minha própria conta em {providerName}</summary>
              <div className="mt-2 space-y-2">
                <a href={entry.keysUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                  Criar a chave em {providerName} <ExternalLink className="h-3 w-3" />
                </a>
                <ApiKeyBox requirement={row} onSaved={onChanged} placeholder={`Chave de ${providerName}`} />
              </div>
            </details>
          )}
        </div>
      ) : entry?.connectPath ? (
        <Button asChild size="sm" className="h-7 gap-1.5 text-xs">
          <Link to={entry.connectPath}>
            <Plug className="h-3 w-3" /> Conectar {providerName}
          </Link>
        </Button>
      ) : (
        <div className="space-y-2">
          {entry?.keysUrl ? (
            <>
              <p className="text-[11px] text-muted-foreground">
                1. Abra o site de {providerName} e crie a sua chave de API.
              </p>
              <Button asChild size="sm" variant="outline" className="h-7 gap-1.5 text-xs">
                <a href={entry.keysUrl} target="_blank" rel="noopener noreferrer">
                  Abrir {providerName} <ExternalLink className="h-3 w-3" />
                </a>
              </Button>
              <p className="text-[11px] text-muted-foreground">2. Cole a chave na caixinha abaixo.</p>
            </>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Gere a chave de {providerName} no painel do serviço e cole na caixinha abaixo.
            </p>
          )}
          <ApiKeyBox requirement={row} onSaved={onChanged} placeholder={`Chave de ${providerName}`} />
        </div>
      )}
    </li>
  );
}

export function VibeConnectorPanel({ projectId }: { projectId?: string }) {
  const [pending, setPending] = useState<PendingRequirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [githubConnected, setGithubConnected] = useState(false);
  const [storedCount, setStoredCount] = useState(0);

  const load = useCallback(async () => {
    try {
      let query = supabase
        .from("vibe_requirements")
        .select("id, slug, name, reason, secrets, kind, status")
        .eq("status", "needed")
        .order("updated_at", { ascending: false })
        .limit(30);
      if (projectId) query = query.eq("project_id", projectId);
      const { data } = await query;
      // Conectores da plataforma (builtin) não pedem nada ao usuário.
      const rows = ((data ?? []) as unknown as PendingRequirement[]).filter((r) => !getCatalogEntry(r.slug)?.builtin);
      setPending(rows);
    } catch {
      setPending([]);
    }
    try {
      const { data } = await supabase.from("api_credentials_safe").select("connector_slug");
      setStoredCount((data ?? []).length);
    } catch {
      setStoredCount(0);
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data: rows } = await supabase.from("github_connections_safe").select("id").limit(1);
        if (active) setGithubConnected((rows ?? []).length > 0);
      } catch {
        /* sem GitHub conectado */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const connectors = VERTAL_CONNECTORS.map((c) => (c.slug === "github" ? { ...c, connected: githubConnected } : c));

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border/40 bg-card/30 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Conectores do app</h3>
        {pending.length > 0 && <Badge variant="outline" className="text-[10px] text-amber-400">{pending.length} pendente{pending.length > 1 ? "s" : ""}</Badge>}
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Carregando…</p>
      ) : pending.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nenhum conector pendente. Quando o agente precisar de um serviço para o seu app, ele aparece aqui com o caminho para conectar.
        </p>
      ) : (
        <ul className="space-y-3" data-testid="pending-requirements">
          {pending.map((r) => (
            <RequirementCard key={r.id} row={r} onChanged={() => void load()} />
          ))}
        </ul>
      )}

      <div className="space-y-2 border-t border-border/30 pt-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">Grupo Vertal</p>
        {connectors.map((c) => {
          const Icon = ICONS[c.slug];
          return (
            <div key={c.slug} className="flex items-start gap-2.5 rounded-lg px-1 py-1.5">
              <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium">{c.label}</span>
                  {c.connected ? <CheckCircle2 className="h-3 w-3 text-emerald-400" /> : <Circle className="h-3 w-3 text-muted-foreground/60" />}
                </div>
              </div>
              {!c.connected && (
                <Button asChild size="sm" variant="ghost" className="h-6 px-2 text-[11px]">
                  <Link to={TARGETS[c.slug].to}>{TARGETS[c.slug].action}</Link>
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <Link
        to="/vibe-code/cofre"
        className="flex items-center justify-between rounded-lg border border-border/40 bg-black/20 px-3 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className="flex items-center gap-2">
          <Lock className="h-3.5 w-3.5" /> Cofre de API e Secrets
        </span>
        <span className="font-mono text-[10px]">{storedCount}</span>
      </Link>
    </div>
  );
}

export default VibeConnectorPanel;
