// Painel "Meu conhecimento" do Vertal Chat: duas raízes (ideias e negócio), subpastas e notas.
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, FolderPlus, FilePlus, Folder, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { containsSecret } from "@/lib/payments/policy";
import {
  buildFolderTree,
  canCreateChild,
  isReadableByCustomers,
  labelsFor,
  validateFolderName,
  MAX_NOTE_BODY_LENGTH,
  MAX_NOTE_TITLE_LENGTH,
  type KnowledgeFolderNode,
} from "@/lib/knowledge/folders";
import {
  createFolder,
  deleteFolder,
  deleteNote,
  ensureRootFolders,
  listFolders,
  listNotes,
  saveNote,
  type KnowledgeNote,
} from "@/lib/knowledge/repository";

const browserTag = () => (typeof navigator !== "undefined" ? navigator.language : null);

export function KnowledgePanel({ userId }: { userId?: string }) {
  const labels = useMemo(() => labelsFor(browserTag()), []);
  const [roots, setRoots] = useState<KnowledgeFolderNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState<KnowledgeNote[]>([]);
  const [editing, setEditing] = useState<{ id?: string; title: string; body: string } | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reloadFolders = useCallback(async () => {
    if (!userId) return;
    const flat = await listFolders(userId);
    setRoots(buildFolderTree(flat));
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        await ensureRootFolders(userId, { personal: labels.personalRoot, business: labels.businessRoot });
        if (!cancelled) await reloadFolders();
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, labels, reloadFolders]);

  const selected = useMemo(() => {
    const walk = (nodes: KnowledgeFolderNode[]): KnowledgeFolderNode | null => {
      for (const n of nodes) {
        if (n.id === selectedId) return n;
        const hit = walk(n.children);
        if (hit) return hit;
      }
      return null;
    };
    return selectedId ? walk(roots) : null;
  }, [roots, selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setNotes([]);
      return;
    }
    let cancelled = false;
    listNotes(selectedId)
      .then((rows) => !cancelled && setNotes(rows))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const addFolder = async () => {
    if (!userId || !selected) return;
    if (!canCreateChild(selected.depth)) {
      setError(labels.maxDepthReached);
      return;
    }
    const check = validateFolderName(newFolderName);
    if (!check.ok) {
      setError(labels.invalidName);
      return;
    }
    try {
      await createFolder({ userId, parentId: selected.id, name: check.name });
      setNewFolderName("");
      setExpanded((prev) => new Set(prev).add(selected.id));
      await reloadFolders();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const removeFolder = async (node: KnowledgeFolderNode) => {
    if (node.parentId === null) return; // raízes não se apagam
    if (typeof window !== "undefined" && !window.confirm(`${labels.delete} "${node.name}"?`)) return;
    try {
      await deleteFolder(node.id);
      if (selectedId === node.id) setSelectedId(null);
      await reloadFolders();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const persistNote = async () => {
    if (!userId || !selectedId || !editing) return;
    const title = editing.title.trim();
    if (!title) return;
    // Chave ou token numa nota seria lido pelo agente e poderia sair para clientes.
    if (containsSecret(`${title}\n${editing.body}`)) {
      setError(labels.secretBlocked);
      return;
    }
    try {
      await saveNote({ userId, folderId: selectedId, id: editing.id, title, body: editing.body });
      setEditing(null);
      setNotes(await listNotes(selectedId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const removeNote = async (id: string) => {
    try {
      await deleteNote(id);
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const renderNode = (node: KnowledgeFolderNode) => {
    const isOpen = expanded.has(node.id);
    const hasChildren = node.children.length > 0;
    return (
      <li key={node.id}>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={isOpen ? "Recolher" : "Expandir"}
            onClick={() => toggle(node.id)}
            className="h-6 w-6 shrink-0 rounded text-muted-foreground hover:bg-secondary disabled:opacity-30"
            disabled={!hasChildren}
          >
            {isOpen ? <ChevronDown className="mx-auto h-3.5 w-3.5" /> : <ChevronRight className="mx-auto h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => setSelectedId(node.id)}
            aria-current={selectedId === node.id ? "true" : undefined}
            className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition hover:bg-secondary ${
              selectedId === node.id ? "bg-secondary text-foreground" : "text-foreground/85"
            }`}
          >
            <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{node.name}</span>
          </button>
          {node.parentId !== null && (
            <button
              type="button"
              aria-label={labels.delete}
              onClick={() => void removeFolder(node)}
              className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {isOpen && hasChildren && <ul className="ml-5 border-l border-border/60 pl-2">{node.children.map(renderNode)}</ul>}
      </li>
    );
  };

  return (
    <div className="mx-auto grid max-w-5xl gap-4 p-3 sm:p-4 md:grid-cols-[260px_1fr]">
      <aside className="space-y-4">
        {roots.map((root) => (
          <section key={root.id} className="rounded-xl border border-border/70 p-2">
            <h2 className="px-2 pb-1 text-sm font-semibold">{root.name}</h2>
            <p className="px-2 pb-2 text-xs text-muted-foreground">
              {root.scope === "business" ? labels.businessHint : labels.personalHint}
            </p>
            <ul className="space-y-0.5">{renderNode(root)}</ul>
          </section>
        ))}
      </aside>

      <main className="min-w-0 space-y-3">
        {error && (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        {!selected ? (
          <p className="text-sm text-muted-foreground">{labels.empty}</p>
        ) : (
          <>
            <header className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold">{selected.name}</h3>
                {isReadableByCustomers(selected) && (
                  <p className="text-xs text-muted-foreground">{labels.customersNotice}</p>
                )}
              </div>
              <Button size="sm" variant="secondary" onClick={() => setEditing({ title: "", body: "" })}>
                <FilePlus className="mr-1.5 h-4 w-4" />
                {labels.newNote}
              </Button>
            </header>

            <div className="flex gap-2">
              <Input
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder={labels.folderNamePlaceholder}
                maxLength={80}
                aria-label={labels.folderNamePlaceholder}
              />
              <Button size="sm" variant="secondary" onClick={() => void addFolder()} disabled={!newFolderName.trim()}>
                <FolderPlus className="mr-1.5 h-4 w-4" />
                {labels.newFolder}
              </Button>
            </div>

            {editing && (
              <div className="space-y-2 rounded-xl border border-border/70 p-3">
                <Input
                  value={editing.title}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                  placeholder={labels.noteTitlePlaceholder}
                  maxLength={MAX_NOTE_TITLE_LENGTH}
                  aria-label={labels.noteTitlePlaceholder}
                />
                <Textarea
                  value={editing.body}
                  onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                  placeholder={labels.noteBodyPlaceholder}
                  maxLength={MAX_NOTE_BODY_LENGTH}
                  rows={6}
                  aria-label={labels.noteBodyPlaceholder}
                />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                    {labels.cancel}
                  </Button>
                  <Button size="sm" onClick={() => void persistNote()} disabled={!editing.title.trim()}>
                    {labels.save}
                  </Button>
                </div>
              </div>
            )}

            {notes.length === 0 && !editing && <p className="text-sm text-muted-foreground">{labels.empty}</p>}
            <ul className="space-y-2">
              {notes.map((n) => (
                <li key={n.id} className="rounded-xl border border-border/70 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => setEditing({ id: n.id, title: n.title, body: n.body })}
                    >
                      <p className="truncate text-sm font-medium">{n.title}</p>
                      <p className="line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                    </button>
                    <button
                      type="button"
                      aria-label={labels.delete}
                      onClick={() => void removeNote(n.id)}
                      className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}
