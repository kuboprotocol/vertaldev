import { useCallback, useEffect, useRef, useState } from 'react';
import { emptyWorkspace, type Workspace } from '@/lib/notebook/model';
import { loadWorkspace, saveWorkspace } from '@/lib/notebook/storage';

export type UpdateWorkspace = (fn: (ws: Workspace) => Workspace) => void;

/** Estado do Vertal Notebook, carregado do navegador e salvo 400 ms depois de cada mudança. */
export function useNotebookWorkspace() {
  const [ws, setWs] = useState<Workspace>(emptyWorkspace);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(ws);
  const dirty = useRef(false);

  useEffect(() => {
    let alive = true;
    loadWorkspace().then((loaded) => {
      if (!alive) return;
      latest.current = loaded;
      setWs(loaded);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const flush = useCallback(() => {
    if (!dirty.current) return;
    dirty.current = false;
    setSaving(true);
    saveWorkspace(latest.current).finally(() => setSaving(false));
  }, []);

  // Salva o que estiver pendente ao sair.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      flush();
    },
    [flush],
  );

  const update: UpdateWorkspace = useCallback(
    (fn) => {
      setWs((prev) => {
        const next = fn(prev);
        latest.current = next;
        return next;
      });
      dirty.current = true;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 400);
    },
    [flush],
  );

  return { ws, ready, saving, update };
}
