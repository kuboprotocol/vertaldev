// "Memória": o que o Vertal Chat lembra do usuário entre conversas.
// O usuário vê tudo, apaga item por item (ou tudo) e pode desligar a memória.
// As operações passam pela creative-router (tool "agent_op"), que confere o dono.
import { useCallback, useEffect, useState } from 'react';
import { Brain, Loader2, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { MEMORY_KINDS, MEMORY_KIND_LABEL, type MemoryKind } from '@/lib/chatAgent/brain';

interface MemoryItem {
  id: string;
  kind: MemoryKind;
  content: string;
  importance: number;
  updated_at: string;
}

async function memoryOp<T>(op_input: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('creative-router', { body: { tool: 'agent_op', op_input } });
  if (error) throw error;
  return data as T;
}

export function MemoryDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await memoryOp<{ enabled?: boolean; items?: MemoryItem[] }>({ op: 'memory_list' });
      setItems(data.items ?? []);
      setEnabled(data.enabled !== false);
    } catch {
      setError('A memória não está disponível agora.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const toggle = async (value: boolean) => {
    setEnabled(value);
    try {
      await memoryOp({ op: 'memory_settings', enabled: value });
    } catch {
      setEnabled(!value);
      setError('Não foi possível mudar a configuração.');
    }
  };

  const remove = async (id: string) => {
    const before = items;
    setItems((list) => list.filter((m) => m.id !== id));
    try {
      await memoryOp({ op: 'memory_forget', id });
    } catch {
      setItems(before);
      setError('Não foi possível apagar esta memória.');
    }
  };

  const removeAll = async () => {
    if (!window.confirm('Apagar tudo o que o Vertal Chat lembra de você, incluindo os resumos das conversas? Isso não pode ser desfeito.')) return;
    try {
      await memoryOp({ op: 'memory_forget', all: true });
      setItems([]);
    } catch {
      setError('Não foi possível apagar a memória.');
    }
  };

  const groups = MEMORY_KINDS.map((kind) => ({ kind, list: items.filter((m) => m.kind === kind) })).filter((g) => g.list.length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Brain className="h-5 w-5 text-primary" aria-hidden /> Memória</DialogTitle>
          <DialogDescription>
            O que o Vertal Chat lembra de você para responder melhor em todas as conversas. Senhas, cartões, CPF e chaves nunca são guardados. Você pode apagar qualquer item ou desligar a memória.
          </DialogDescription>
        </DialogHeader>

        <label className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card px-3 py-2.5">
          <span className="text-sm">
            <span className="block font-medium">Lembrar de mim</span>
            <span className="block text-xs text-muted-foreground">Desligada, o chat não usa nem guarda memórias novas.</span>
          </span>
          <Switch checked={enabled} onCheckedChange={(v) => void toggle(v)} aria-label="Ligar ou desligar a memória" />
        </label>

        {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

        {loading ? (
          <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground" role="status">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Carregando…
          </p>
        ) : items.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            Nada guardado ainda. Conte ao chat sobre você, seus projetos e como prefere as respostas — ele passa a lembrar.
          </p>
        ) : (
          <div className="space-y-3">
            {groups.map((g) => (
              <section key={g.kind}>
                <p className="pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{MEMORY_KIND_LABEL[g.kind]}</p>
                <ul className="space-y-1.5">
                  {g.list.map((m) => (
                    <li key={m.id} className="group flex items-start gap-2 rounded-lg border border-border/50 bg-card px-3 py-2">
                      <span className="flex-1 text-sm leading-snug">{m.content}</span>
                      <button
                        type="button"
                        aria-label={`Esquecer: ${m.content}`}
                        onClick={() => void remove(m.id)}
                        className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            <button
              type="button"
              onClick={() => void removeAll()}
              className="w-full rounded-lg border border-destructive/30 px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
            >
              Apagar toda a memória
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
