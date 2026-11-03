import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Check, Globe, Loader2, Search, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

interface ProjectSummary {
  id: string;
  title: string | null;
  is_published: boolean | null;
  published_url: string | null;
}

interface DomainResult {
  name: string;
  tld: string;
  registrable: boolean;
  reason: string | null;
  price: string | null;
  currency: string | null;
  renewal_price: string | null;
}

const ERROR_MESSAGES: Record<string, string> = {
  registrar_not_configured: "A busca de domínios ainda não está configurada.",
  registrar_permission_missing: "A conta de registro não tem permissão para consultar domínios. Avise o suporte.",
  registrar_unavailable: "Não conseguimos consultar a Cloudflare agora. Tente novamente em instantes.",
  query_too_short: "Digite pelo menos 2 caracteres.",
};

function reasonLabel(reason: string | null): string {
  switch (reason) {
    case "domain_unavailable":
      return "Indisponível";
    case "extension_not_supported_via_api":
    case "extension_not_supported":
      return "Extensão não disponível";
    case "extension_disallows_registration":
      return "Registro não permitido";
    default:
      return "Indisponível";
  }
}

export default function PublishDomainPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { user } = useAuth();
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [loadingProject, setLoadingProject] = useState(true);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<DomainResult[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId || !user) return;
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("projects")
        .select("id, title, is_published, published_url")
        .eq("id", projectId)
        .maybeSingle();
      if (!active) return;
      setProject((data as ProjectSummary) ?? null);
      setLoadingProject(false);
    })();
    return () => {
      active = false;
    };
  }, [projectId, user]);

  const runSearch = async () => {
    const term = query.trim();
    if (term.length < 2) {
      setSearchError(ERROR_MESSAGES.query_too_short);
      return;
    }
    setSearching(true);
    setSearchError(null);
    const { data, error } = await supabase.functions.invoke("cloudflare-domains", {
      body: { action: "search", query: term },
    });
    setSearching(false);
    if (error || !data?.results) {
      const ctx = (error as { context?: Response } | null)?.context;
      const detail = await ctx?.json?.().catch(() => null);
      const code: string | undefined = detail?.error ?? data?.error;
      setSearchError(ERROR_MESSAGES[code ?? ""] ?? "Não foi possível buscar domínios agora.");
      setResults(null);
      return;
    }
    setResults(data.results as DomainResult[]);
  };

  const handleCopyUrl = async () => {
    if (!project?.published_url) return;
    await navigator.clipboard.writeText(project.published_url);
    toast.success("URL copiada!");
  };

  if (loadingProject) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-muted-foreground">Projeto não encontrado.</p>
        <Button asChild variant="ghost" className="mt-4">
          <Link to="/dashboard">Voltar ao painel</Link>
        </Button>
      </div>
    );
  }

  const published = !!project.is_published && !!project.published_url;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 md:py-12">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" className="h-8 w-8 rounded-lg">
          <Link to={`/builder/${project.id}`} aria-label="Voltar ao projeto">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Publicação</p>
          <h1 className="font-display text-2xl font-semibold text-foreground">Domínio personalizado</h1>
        </div>
      </div>

      <Card className="flex items-center gap-3 border-border/50 bg-card/40 p-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Globe className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">
            {project.title ?? "Projeto"} · {published ? "Publicado" : "Ainda não publicado"}
          </p>
          <p className="truncate font-mono text-sm text-foreground">
            {published ? project.published_url : "Publique o projeto para liberar o domínio personalizado."}
          </p>
        </div>
        {published && (
          <Button variant="ghost" size="sm" className="h-8 shrink-0 text-xs" onClick={handleCopyUrl}>
            Copiar
          </Button>
        )}
      </Card>

      <Tabs defaultValue="buy" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="buy">Comprar</TabsTrigger>
          <TabsTrigger value="transfer">Transferir</TabsTrigger>
          <TabsTrigger value="existing">Já tenho um</TabsTrigger>
        </TabsList>

        <TabsContent value="buy" className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Veja se o nome está livre e quanto custa, direto na Cloudflare Registrar, que cobra preço de custo.
          </p>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void runSearch();
            }}
          >
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ex.: meuprojeto ou meuprojeto.dev"
              aria-label="Nome do domínio"
              maxLength={63}
              autoComplete="off"
            />
            <Button type="submit" disabled={searching} className="shrink-0 rounded-xl">
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              <span className="ml-1.5">Buscar</span>
            </Button>
          </form>

          {searchError && <p className="text-sm text-destructive">{searchError}</p>}

          {results && (
            <>
              <div className="flex items-start gap-2 rounded-xl border border-border/50 bg-secondary/40 p-3 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                <span>
                  A compra com cobrança ainda não está ativa nesta versão. Aqui você só confere disponibilidade e preço.
                </span>
              </div>
              <ul className="space-y-2">
                {results.map((r) => (
                  <li
                    key={r.name}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-card/40 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{r.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.registrable && r.price
                          ? `${r.price} ${r.currency ?? "USD"} / ano`
                          : reasonLabel(r.reason)}
                      </p>
                    </div>
                    {r.registrable ? (
                      <Badge className="gap-1 bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/15">
                        <Check className="h-3 w-3" /> Disponível
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        Indisponível
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </TabsContent>

        <TabsContent value="transfer" className="mt-4 space-y-4">
          <Card className="space-y-3 border-border/50 bg-card/40 p-5">
            <h2 className="font-semibold text-foreground">Antes de transferir, confirme</h2>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
              <li>O domínio já precisa existir como zona na conta Cloudflare, com os nameservers apontados para ela.</li>
              <li>O DNSSEC do domínio precisa estar desativado no registrador atual.</li>
              <li>Tenha em mãos o código de autorização (EPP / auth code) que o registrador atual fornece.</li>
              <li>A transferência leva de 1 a 10 dias e depende da aprovação do registrador atual.</li>
            </ul>
            <p className="text-xs text-muted-foreground">
              O envio pela plataforma ainda não está disponível. Quando estiver, ele aparece aqui.
            </p>
          </Card>
        </TabsContent>

        <TabsContent value="existing" className="mt-4 space-y-4">
          <Card className="space-y-3 border-border/50 bg-card/40 p-5">
            <h2 className="font-semibold text-foreground">Usar um domínio que você já tem</h2>
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
              <li>Adicione o domínio como zona na sua conta Cloudflare.</li>
              <li>No registrador atual, troque os nameservers para os que a Cloudflare indicar.</li>
              <li>Quando a zona estiver ativa, ligue o domínio ao projeto. Essa ligação automática ainda não está disponível.</li>
            </ol>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
