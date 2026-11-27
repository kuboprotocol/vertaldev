// VERTAL Code AI · tela "Memória" da Equipe Vertal: o usuário vê e apaga o que a equipe lembra dele e do projeto.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { surface } from '@/components/site/siteUi';
import { deleteTeamMemory, listTeamMemory, MEMORY_KIND_LABEL, type MemoryItem } from '@/lib/vertalCodeAi/team';

export function VertalCodeAiMemoryPanel({
  getToken,
  projectId,
  onClose,
}: {
  getToken: () => Promise<string>;
  projectId: string | null;
  onClose: () => void;
}) {
  const [items, setItems] = useState<MemoryItem[] | null>(null);
  const [available, setAvailable] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // getToken muda a cada render da tela: guarda num ref para não recarregar em loop.
  const tokenRef = useRef(getToken);
  tokenRef.current = getToken;

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await listTeamMemory(await tokenRef.current(), projectId);
      setAvailable(r.available);
      setItems(r.items ?? []);
    } catch {
      setError('Could not open the memory right now.');
      setItems([]);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (req: { ids?: string[]; clear?: boolean }) => {
    setBusy(true);
    try {
      await deleteTeamMemory(await tokenRef.current(), { ...req, projectId });
      await load();
    } catch {
      setError('Could not delete it right now.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="dialog" aria-label="Vertal Team memory" className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className={cn('flex h-14 items-center gap-2 border-b px-3', surface.bar)}>
        <h2 className="flex-1 text-[15px] font-semibold">Vertal Team memory</h2>
        <button type="button" aria-label="Close memory" onClick={onClose} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary">
          <X className="h-4 w-4" />
        </button>
      </header>
      <main className="flex-1 space-y-2 overflow-y-auto p-3 text-sm">
        <p className="text-xs text-muted-foreground">
          What the team remembers about you and this project (decisions, preferences, code facts and runs). Only you can see it. Delete anything you want.
        </p>
        {error && <p className="text-xs text-rose-400">{error}</p>}
        {!items && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> loading…
          </p>
        )}
        {items && !available && <p className="text-xs text-muted-foreground">Memory is not turned on on the server yet.</p>}
        {items && available && items.length === 0 && <p className="text-xs text-muted-foreground">Nothing saved yet.</p>}
        {items?.map((m) => (
          <div key={m.id} className="flex items-start gap-2 rounded-xl border border-border/60 p-2">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-wide text-primary">
                {MEMORY_KIND_LABEL[m.kind] ?? m.kind} · {m.scope === 'user' ? 'you' : 'project'}
              </div>
              <p className="whitespace-pre-wrap break-words">{m.content}</p>
            </div>
            <button
              type="button"
              aria-label={`Delete memory: ${m.content.slice(0, 40)}`}
              disabled={busy}
              onClick={() => remove({ ids: [m.id] })}
              className="rounded-lg p-2 text-muted-foreground hover:bg-secondary"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </main>
      {items && available && items.length > 0 && (
        <footer className="border-t border-border/50 p-3">
          <Button variant="outline" size="sm" className="w-full gap-2" disabled={busy} onClick={() => remove({ clear: true })}>
            <Trash2 className="h-4 w-4" /> Delete this project memory
          </Button>
        </footer>
      )}
    </div>
  );
}
