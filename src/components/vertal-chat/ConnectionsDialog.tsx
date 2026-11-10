// "Minhas conexões": APIs e servidores MCP que o cliente liga ao Vertal Chat.
import { useState } from 'react';
import { KeyRound, Plus, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { UserConnection } from '@/lib/chatAgent/contract';
import { loadConnections, saveConnections } from '@/lib/chatAgent/connections';

const field = 'w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:border-primary/60';

export function ConnectionsDialog({ open, onOpenChange, onOpenVault }: { open: boolean; onOpenChange: (open: boolean) => void; onOpenVault: () => void }) {
  const [list, setList] = useState<UserConnection[]>(loadConnections);
  const [draft, setDraft] = useState({ name: '', kind: 'api' as 'api' | 'mcp', url: '', secret: '', notes: '' });
  const [error, setError] = useState<string | null>(null);

  const add = () => {
    const secret = draft.secret.trim().toUpperCase();
    if (!draft.name.trim()) return setError('Dê um nome para a conexão.');
    if (!/^https:\/\/\S+$/i.test(draft.url.trim())) return setError('O endereço precisa começar com https://');
    if (secret && !/^[A-Z][A-Z0-9_]{1,63}$/.test(secret)) return setError('O nome do segredo usa letras maiúsculas, números e _ (ex.: NOTION_API_KEY).');
    if (list.some((c) => c.name.toLowerCase() === draft.name.trim().toLowerCase())) return setError('Já existe uma conexão com esse nome.');
    setList(saveConnections([...list, { name: draft.name.trim(), kind: draft.kind, url: draft.url.trim(), secret: secret || undefined, notes: draft.notes.trim() || undefined }]));
    setDraft({ name: '', kind: 'api', url: '', secret: '', notes: '' });
    setError(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Minhas conexões</DialogTitle>
          <DialogDescription>
            Ligue ao chat qualquer API ou servidor MCP. O chat passa a usar a conexão quando você pedir, e pede sua permissão a cada chamada.
          </DialogDescription>
        </DialogHeader>

        {list.length > 0 && (
          <ul className="space-y-2">
            {list.map((c) => (
              <li key={c.name} className="flex items-start gap-3 rounded-xl border border-border/60 bg-card px-3 py-2.5">
                <span className="mt-0.5 rounded-md bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-primary">{c.kind}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{c.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{c.url}</p>
                  {c.secret && <p className="font-mono text-[11px] text-muted-foreground">segredo: {c.secret}</p>}
                </div>
                <button
                  type="button"
                  aria-label={`Remover ${c.name}`}
                  onClick={() => setList(saveConnections(list.filter((x) => x.name !== c.name)))}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <form
          className="space-y-3 rounded-xl border border-border/60 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nova conexão</p>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <label className="block text-xs text-muted-foreground">
              Nome
              <input className={`${field} mt-1`} value={draft.name} maxLength={40} placeholder="Ex.: Notion" onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </label>
            <label className="block text-xs text-muted-foreground">
              Tipo
              <select className={`${field} mt-1`} value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as 'api' | 'mcp' })}>
                <option value="api">API (HTTP)</option>
                <option value="mcp">Servidor MCP</option>
              </select>
            </label>
          </div>
          <label className="block text-xs text-muted-foreground">
            Endereço
            <input className={`${field} mt-1`} value={draft.url} maxLength={500} inputMode="url" placeholder={draft.kind === 'mcp' ? 'https://mcp.exemplo.com/mcp' : 'https://api.exemplo.com/v1'} onChange={(e) => setDraft({ ...draft, url: e.target.value })} />
          </label>
          <label className="block text-xs text-muted-foreground">
            Nome do segredo no Cofre (opcional)
            <input className={`${field} mt-1 font-mono`} value={draft.secret} maxLength={64} placeholder="NOTION_API_KEY" onChange={(e) => setDraft({ ...draft, secret: e.target.value })} />
          </label>
          <label className="block text-xs text-muted-foreground">
            Para que serve (ajuda o chat a usar)
            <input className={`${field} mt-1`} value={draft.notes} maxLength={200} placeholder="Ex.: páginas e bancos de dados do meu workspace" onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
          </label>
          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
              <Plus className="h-4 w-4" /> Adicionar
            </button>
            <button type="button" onClick={onOpenVault} className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-2 text-sm hover:bg-secondary">
              <KeyRound className="h-4 w-4" /> Guardar a chave no Cofre
            </button>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            A chave nunca é digitada aqui nem no chat: ela fica no Cofre de segredos e o chat usa só o nome. As conexões ficam salvas neste navegador.
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
