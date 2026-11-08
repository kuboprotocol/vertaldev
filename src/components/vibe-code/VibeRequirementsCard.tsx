import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Circle, Copy, ExternalLink, KeyRound, Loader2, Lock, Plug } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { VibeRequirement } from "@/lib/vibeCodeAgentTypes";
import { saveSecretValue } from "@/hooks/useKuboSecrets";
import { SECRETS_PATH } from "@/lib/secretsVaultLinks";

function ExternalHint({ href, children, suggested }: { href: string; children: string; suggested?: boolean }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
      title={suggested ? "Link sugerido pelo agente: confira se é o site oficial" : undefined}
    >
      {children}
      {suggested ? " (sugestão)" : ""} <ExternalLink className="h-3 w-3" />
    </a>
  );
}

/**
 * Campo para colar uma chave de API ali mesmo, no chat. O valor vai direto para
 * o Cofre de segredos (cifrado) e o campo se limpa; nada fica na conversa.
 */
function SecretField({ envKey, label, onSaved }: { envKey: string; label: string; onSaved: (key: string) => void }) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!value || saving) return;
    setSaving(true);
    try {
      await saveSecretValue({ name: `${label} · ${envKey}`, env_key: envKey, value });
      setValue("");
      onSaved(envKey);
      toast.success(`${envKey} guardada no Cofre de segredos`);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Não foi possível guardar.";
      if (/já tem um segredo/i.test(message)) {
        onSaved(envKey);
        toast.message(`${envKey} já estava no seu cofre`);
      } else {
        toast.error(message);
      }
    } finally {
      setSaving(false);
    }
  };
  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <Input
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={`Cole aqui ${envKey}`}
        aria-label={`Valor de ${envKey}`}
        className="h-7 flex-1 bg-black/40 font-mono text-[11px]"
      />
      <Button type="submit" size="sm" variant="outline" className="h-7 shrink-0 gap-1 text-xs" disabled={!value || saving}>
        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Lock className="h-3 w-3" />} Guardar no cofre
      </Button>
    </form>
  );
}

/**
 * "O que esta aplicação precisa": os conectores e APIs que o agente detectou,
 * com o motivo, o estado, onde pegar cada chave e onde guardá-la.
 */
export function VibeRequirementsCard({ requirements }: { requirements: VibeRequirement[] }) {
  const [saved, setSaved] = useState<Set<string>>(() => new Set());
  const markSaved = (key: string) => setSaved((prev) => new Set(prev).add(key));

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${text} copiado`);
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  return (
    <ul className="mt-3 space-y-2" data-testid="vibe-requirements">
      {requirements.map((r) => {
        const inVault = new Set([...(r.inVault ?? []), ...r.secrets.filter((s) => saved.has(s))]);
        const usesVault = !r.connectPath && r.secrets.length > 0;
        const allSaved = usesVault && r.secrets.every((s) => inVault.has(s));
        const connected = r.status === "connected" || allSaved;
        const suggested = r.linkSource === "agent";
        return (
          <li key={r.slug} className="rounded-lg border border-border/50 bg-background/50 p-3">
            <div className="flex items-start gap-2">
              {connected ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              ) : (
                <Circle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{r.label}</span>
                  <Badge variant="outline" className="h-4 px-1.5 text-[9px] uppercase">
                    {r.kind === "connector" ? "conector" : "API"}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={`h-4 px-1.5 text-[9px] uppercase ${connected ? "border-emerald-500/30 text-emerald-400" : "border-amber-500/30 text-amber-400"}`}
                  >
                    {r.builtin ? "da plataforma" : connected ? (allSaved ? "no cofre" : "conectado") : "falta conectar"}
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{r.reason}</p>

                {r.secrets.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <KeyRound className="h-3 w-3 text-muted-foreground" />
                    {r.secrets.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => void copy(s)}
                        className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] hover:text-primary ${
                          inVault.has(s) ? "border-emerald-500/30 text-emerald-400" : "border-border/50 bg-black/40 text-muted-foreground"
                        }`}
                        title="Copiar nome do segredo"
                      >
                        {inVault.has(s) && <CheckCircle2 className="h-2.5 w-2.5" />} {s} <Copy className="h-2.5 w-2.5" />
                      </button>
                    ))}
                  </div>
                )}

                {!connected && (r.siteUrl || r.keyUrl) && (
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    {r.siteUrl && (
                      <ExternalHint href={r.siteUrl} suggested={suggested}>
                        Criar conta
                      </ExternalHint>
                    )}
                    {r.keyUrl && (
                      <ExternalHint href={r.keyUrl} suggested={suggested}>
                        Onde pegar a chave
                      </ExternalHint>
                    )}
                  </div>
                )}

                {!connected && usesVault && (
                  <div className="mt-2 space-y-1.5" data-testid="vibe-secret-fields">
                    {r.secrets
                      .filter((s) => !inVault.has(s))
                      .map((s) => (
                        <SecretField key={s} envKey={s} label={r.label} onSaved={markSaved} />
                      ))}
                    <p className="text-[10px] text-muted-foreground">
                      A chave vai cifrada para o{" "}
                      <Link to={SECRETS_PATH} className="text-primary hover:underline">
                        Cofre de segredos
                      </Link>{" "}
                      e não aparece de novo nesta conversa.
                    </p>
                  </div>
                )}
              </div>

              {!connected && r.connectPath && (
                <Button asChild size="sm" variant="outline" className="h-7 shrink-0 gap-1 text-xs">
                  <Link to={r.connectPath}>
                    <Plug className="h-3 w-3" /> Conectar
                  </Link>
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default VibeRequirementsCard;
