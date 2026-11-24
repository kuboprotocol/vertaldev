import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validateCustomProvider, type CustomProvider } from "@/lib/vertalCodeAi/core";

/** Provedores próprios compatíveis com OpenAI. A chave fica no Cofre de Segredos; aqui só o nome dela. */
export function VertalCodeAiProvidersDialog({
  open,
  onOpenChange,
  providers,
  onChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  providers: CustomProvider[];
  onChange: (list: CustomProvider[]) => void;
}) {
  const [form, setForm] = useState({ label: "", baseUrl: "", model: "", keyEnv: "", vision: false });
  const [error, setError] = useState<string | null>(null);

  const add = () => {
    const v = validateCustomProvider({ ...form, keyEnv: form.keyEnv.trim() || undefined });
    if (v.ok === false) {
      setError((v as { error: string }).error);
      return;
    }
    const provider = (v as { provider: CustomProvider }).provider;
    onChange([...providers.filter((p) => p.label !== provider.label), provider]);
    setForm({ label: "", baseUrl: "", model: "", keyEnv: "", vision: false });
    setError(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Provedores próprios</DialogTitle>
          <DialogDescription>
            Qualquer API compatível com o formato de chat da OpenAI. Guarde a chave no Cofre de Segredos e informe aqui só o nome dela.
          </DialogDescription>
        </DialogHeader>

        {providers.length > 0 && (
          <ul className="space-y-2">
            {providers.map((p) => (
              <li key={p.label} className="flex items-center gap-2 rounded-md border border-border/60 p-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{p.label}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.model} · {new URL(p.baseUrl).host}
                    {p.keyEnv ? ` · ${p.keyEnv}` : ""}
                  </p>
                </div>
                <Button variant="ghost" size="icon" aria-label={`Remover ${p.label}`} onClick={() => onChange(providers.filter((x) => x.label !== p.label))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="vcai-p-label">Nome</Label>
            <Input id="vcai-p-label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Meu servidor" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="vcai-p-url">URL base (https)</Label>
            <Input id="vcai-p-url" inputMode="url" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder="https://api.exemplo.com/v1" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="vcai-p-model">Modelo</Label>
            <Input id="vcai-p-model" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="nome-do-modelo" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="vcai-p-key">Nome da chave no Cofre (opcional)</Label>
            <Input
              id="vcai-p-key"
              value={form.keyEnv}
              onChange={(e) => setForm({ ...form, keyEnv: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_") })}
              placeholder="MEU_PROVEDOR_KEY"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-primary" checked={form.vision} onChange={(e) => setForm({ ...form, vision: e.target.checked })} />
            Entende imagens
          </label>
          {error && <p className="text-sm text-rose-400">{error}</p>}
          <Button onClick={add}>Adicionar provedor</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
