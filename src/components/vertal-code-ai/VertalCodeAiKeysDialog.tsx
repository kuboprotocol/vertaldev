import { useEffect, useState } from "react";
import { Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { keysApi, type ApiKeyRecord } from "@/lib/vertalCodeAi/platformApi";

/** Chaves da API VERTAL (compatível com OpenAI) do próprio desenvolvedor. */
export function VertalCodeAiKeysDialog({ open, onOpenChange, api = keysApi }: { open: boolean; onOpenChange: (v: boolean) => void; api?: typeof keysApi }) {
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [name, setName] = useState("");
  const [cap, setCap] = useState("100");
  const [fresh, setFresh] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFresh(null);
    api.list().then((r) => setKeys(r.keys)).catch((e) => setError(e instanceof Error ? e.message : "Indisponível."));
  }, [open, api]);

  const create = async () => {
    try {
      const r = await api.create(name.trim(), cap.trim() === "" ? null : Number(cap));
      setFresh(r.key);
      setKeys((prev) => [r.record, ...prev]);
      setName("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falhou.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Chaves da API VERTAL</DialogTitle>
          <DialogDescription>
            Use o VERTAL Code AI nos seus apps com qualquer SDK compatível com o formato de chat da OpenAI. O uso é cobrado em frações de crédito da sua conta Vertal.
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-amber-300">{error}</p>}
        {fresh && (
          <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-2 text-xs">
            <p className="mb-1 font-medium">Copie agora: a chave não aparece de novo.</p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all">{fresh}</code>
              <Button size="icon" variant="ghost" aria-label="Copiar chave" onClick={() => navigator.clipboard?.writeText(fresh)}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
        <ul className="space-y-2">
          {keys.map((k) => (
            <li key={k.id} className="flex items-center gap-2 rounded-md border border-border/60 p-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{k.name}{k.revoked_at ? " (revogada)" : ""}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {k.key_prefix}… · teto {k.monthly_cap_credits ?? "sem"} créditos/mês · gasto {(k.spent_micro / 1e6).toFixed(3)}
                </p>
              </div>
              {!k.revoked_at && (
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Revogar ${k.name}`}
                  onClick={async () => {
                    await api.revoke(k.id).catch(() => toast.error("Não consegui revogar."));
                    setKeys((prev) => prev.map((x) => (x.id === k.id ? { ...x, revoked_at: new Date().toISOString() } : x)));
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
        <div className="grid gap-2">
          <Label htmlFor="vcai-key-name">Nome da chave</Label>
          <Input id="vcai-key-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="meu-app" />
          <Label htmlFor="vcai-key-cap">Teto mensal (créditos; vazio = sem teto)</Label>
          <Input id="vcai-key-cap" inputMode="decimal" value={cap} onChange={(e) => setCap(e.target.value)} />
          <Button onClick={create} disabled={!name.trim()}>Criar chave</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
