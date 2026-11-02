import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, ExternalLink, KeyRound, Lock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { getCatalogEntry } from "@/config/connectorCatalog";

interface StoredKey {
  connector_slug: string;
  masked_hint: string | null;
  updated_at: string | null;
}

function ReplaceForm({ slug, onDone }: { slug: string; onDone: () => void }) {
  const [value, setValue] = useState("");
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
        body: { connector_slug: slug, api_key: key },
      });
      if (error) throw error;
      toast.success("Chave substituída");
      setValue("");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível substituir a chave.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="mt-3 flex items-center gap-2">
      <Input
        type="password"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Cole a nova chave"
        className="h-8 font-mono text-xs"
        autoComplete="off"
      />
      <Button size="sm" className="h-8 text-xs" onClick={() => void save()} disabled={saving || !value.trim()}>
        {saving ? "Guardando…" : "Substituir"}
      </Button>
    </div>
  );
}

/** Cofre: as chaves guardadas, sempre mascaradas. O valor completo nunca volta para a tela. */
export function VibeSecretsVault() {
  const [keys, setKeys] = useState<StoredKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [replacing, setReplacing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("api_credentials_safe")
        .select("connector_slug, masked_hint, updated_at")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      setKeys((data ?? []) as StoredKey[]);
    } catch {
      setKeys([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8">
      <div className="space-y-2">
        <Link to="/vibe-code" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Voltar ao Vibe Code
        </Link>
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-primary" />
          <h1 className="text-lg font-semibold">Cofre de API e Secrets</h1>
        </div>
        <p className="text-xs text-muted-foreground">
          Chaves guardadas criptografadas. Aqui aparecem só as últimas letras de cada chave; o valor completo não é exibido.
        </p>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Carregando…</p>
      ) : keys.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground">
          Nenhuma chave guardada ainda. Quando um app pedir uma API, ela é colocada na caixinha "API e Secrets" e depois vem para cá.
        </div>
      ) : (
        <ul className="space-y-2">
          {keys.map((k) => {
            const entry = getCatalogEntry(k.connector_slug);
            const label = entry?.label ?? k.connector_slug;
            return (
              <li key={k.connector_slug} className="rounded-xl border border-border/40 bg-card/30 p-4">
                <div className="flex items-center gap-3">
                  <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{label}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {k.masked_hint ?? "••••"}
                      {k.updated_at && <span className="ml-2 font-sans text-muted-foreground/70">atualizada {new Date(k.updated_at).toLocaleDateString("pt-BR")}</span>}
                    </p>
                  </div>
                  {entry?.keysUrl && (
                    <Button asChild size="sm" variant="ghost" className="h-7 gap-1 text-[11px]">
                      <a href={entry.keysUrl} target="_blank" rel="noopener noreferrer">
                        Site <ExternalLink className="h-3 w-3" />
                      </a>
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 text-[11px]"
                    onClick={() => setReplacing(replacing === k.connector_slug ? null : k.connector_slug)}
                  >
                    <RefreshCw className="h-3 w-3" /> Substituir
                  </Button>
                </div>
                {replacing === k.connector_slug && <ReplaceForm slug={k.connector_slug} onDone={() => { setReplacing(null); void load(); }} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default VibeSecretsVault;
