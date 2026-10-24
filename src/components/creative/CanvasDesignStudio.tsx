import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { AnimatePresence } from 'framer-motion';
import { getSnapshot, type Editor } from 'tldraw';
import { Download, FolderOpen, Globe, Loader2, Lock, Save, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import TLDrawEditor from '@/components/canvas/TLDrawEditor';
import CanvasInfoPanel from '@/components/canvas/CanvasInfoPanel';
import {
  DESIGN_REFERRAL_DAILY_CREDITS,
  DESIGN_REUSE_REWARD_CREDITS,
  designStorageCreditsPerDay,
} from '@/config/designLibraryPricing';

// Canvas do Design Premium: mesmo layout da página /canvas (cabeçalho, canvas infinito, painel de atalhos),
// com biblioteca do usuário e galeria de designs publicados. O canvas é carregado sob demanda pelo painel pai.

const SNAPSHOT_MAX_CHARS = 10_000_000;

interface LibraryItem {
  id: string;
  name: string;
  is_published: boolean;
  reuse_count: number;
  updated_at: string;
}

interface GalleryItem {
  id: string;
  name: string;
  reuse_count: number;
}

interface ReuseResult {
  success: boolean;
  rewarded: boolean;
  name: string;
  snapshot: unknown;
}

export function CanvasDesignStudio() {
  const editorRef = useRef<Editor | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [name, setName] = useState('Canvas sem título');
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [initialSnapshot, setInitialSnapshot] = useState<unknown>(undefined);
  const [showInfo, setShowInfo] = useState(true);
  const [saving, setSaving] = useState(false);
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadLibrary = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id ?? null;
    setUserId(uid);
    if (!uid) return;

    const [mine, published] = await Promise.all([
      supabase
        .from('design_library')
        .select('id,name,is_published,reuse_count,updated_at')
        .eq('user_id', uid)
        .order('updated_at', { ascending: false }),
      supabase
        .from('design_library')
        .select('id,name,reuse_count')
        .eq('is_published', true)
        .neq('user_id', uid)
        .order('reuse_count', { ascending: false })
        .limit(24),
    ]);

    if (mine.error) toast.error('Não foi possível carregar sua biblioteca.');
    if (mine.data) setLibrary(mine.data);
    if (published.data) setGallery(published.data);
  }, []);

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);

  // O atalho Ctrl+S do editor captura o callback da montagem; a ref garante que salve o estado atual.
  const saveRef = useRef<() => void>(() => {});

  const handleSave = async () => {
    const editor = editorRef.current;
    if (!editor || saving) return;
    if (!userId) {
      toast.error('Entre na sua conta para guardar designs.');
      return;
    }

    const snapshot = getSnapshot(editor.store) as unknown as Json;
    if (JSON.stringify(snapshot).length > SNAPSHOT_MAX_CHARS) {
      toast.error('Design muito pesado para guardar. Remova imagens grandes e tente de novo.');
      return;
    }

    const payload = {
      name: name.trim() || 'Sem título',
      snapshot,
      updated_at: new Date().toISOString(),
    };

    setSaving(true);
    const { data, error } = currentId
      ? await supabase.from('design_library').update(payload).eq('id', currentId).select('id').single()
      : await supabase
          .from('design_library')
          .insert({ ...payload, user_id: userId })
          .select('id')
          .single();
    setSaving(false);

    if (error || !data) {
      toast.error('Não foi possível guardar o design.');
      return;
    }
    setCurrentId(data.id);
    toast.success('Design guardado na sua biblioteca.');
    void loadLibrary();
  };
  saveRef.current = () => void handleSave();

  const openDesign = async (id: string) => {
    setBusyId(id);
    const { data, error } = await supabase
      .from('design_library')
      .select('id,name,snapshot')
      .eq('id', id)
      .single();
    setBusyId(null);
    if (error || !data) {
      toast.error('Não foi possível abrir este design.');
      return;
    }
    setName(data.name);
    setCurrentId(data.id);
    setInitialSnapshot(data.snapshot);
    setEditorKey((key) => key + 1);
  };

  const useGalleryDesign = async (id: string) => {
    if (!userId) {
      toast.error('Entre na sua conta para usar um design da galeria.');
      return;
    }
    setBusyId(id);
    const { data, error } = await supabase.rpc('reuse_published_design', { _design_id: id });
    setBusyId(null);
    if (error || !data) {
      toast.error('Não foi possível usar este design.');
      return;
    }
    const result = data as unknown as ReuseResult;
    // Abre uma cópia: nada muda no design original, e a cópia só entra na sua biblioteca quando você guardar.
    setName(`${result.name} (cópia)`);
    setCurrentId(null);
    setInitialSnapshot(result.snapshot);
    setEditorKey((key) => key + 1);
    if (result.rewarded) {
      toast.success(`Design aberto. O autor ganhou ${DESIGN_REUSE_REWARD_CREDITS} crédito.`);
    } else {
      toast.success('Design aberto. Você já tinha usado este design antes.');
    }
    void loadLibrary();
  };

  const togglePublished = async (item: LibraryItem) => {
    setBusyId(item.id);
    const { error } = await supabase
      .from('design_library')
      .update({ is_published: !item.is_published, updated_at: new Date().toISOString() })
      .eq('id', item.id);
    setBusyId(null);
    if (error) {
      toast.error('Não foi possível alterar a publicação.');
      return;
    }
    toast.success(item.is_published ? 'Design despublicado.' : 'Design publicado na galeria.');
    void loadLibrary();
  };

  const deleteDesign = async (item: LibraryItem) => {
    if (!window.confirm(`Excluir "${item.name}" da sua biblioteca?`)) return;
    setBusyId(item.id);
    const { error } = await supabase.from('design_library').delete().eq('id', item.id);
    setBusyId(null);
    if (error) {
      toast.error('Não foi possível excluir o design.');
      return;
    }
    if (currentId === item.id) setCurrentId(null);
    toast.success('Design excluído.');
    void loadLibrary();
  };

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    const editor = editorRef.current;
    if (!editor || files.length === 0) return;
    try {
      await editor.putExternalContent({ type: 'files', files });
    } catch {
      toast.error('Não foi possível adicionar a imagem.');
    }
  };

  const fileBaseName = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'design';

  const downloadBlob = (blob: Blob, extension: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fileBaseName}.${extension}`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownload = async (format: 'png' | 'svg') => {
    const editor = editorRef.current;
    if (!editor) return;
    const ids = [...editor.getCurrentPageShapeIds()];
    if (ids.length === 0) {
      toast.info('Adicione algo ao canvas antes de baixar.');
      return;
    }
    try {
      if (format === 'png') {
        const { blob } = await editor.toImage(ids, { format: 'png', background: true, scale: 2 });
        downloadBlob(blob, 'png');
      } else {
        const result = await editor.getSvgString(ids, { background: true });
        if (!result) throw new Error('svg_export_empty');
        downloadBlob(new Blob([result.svg], { type: 'image/svg+xml' }), 'svg');
      }
    } catch {
      toast.error('Não foi possível baixar o design.');
    }
  };

  const itemButton =
    'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-slate-700 bg-slate-800/60 text-xs text-slate-200 hover:border-slate-500 disabled:opacity-50 transition-colors';

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-amber-300/80">Canvas</p>
        <h2 className="mt-2 text-3xl font-bold text-white">Canvas infinito</h2>
        <p className="mt-2 text-slate-400">
          Monte sua arte livremente, com texto, formas e imagens. Guarde na sua biblioteca ou publique para outros usarem.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Nome do design"
          aria-label="Nome do design"
          maxLength={120}
          className="min-w-0 flex-1 sm:flex-none sm:w-64 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-300/70"
        />
        <label className={`${itemButton} cursor-pointer`}>
          <Upload className="h-3.5 w-3.5" />
          Enviar imagem
          <input type="file" accept="image/*" multiple className="sr-only" onChange={handleUpload} />
        </label>
        <button type="button" className={itemButton} onClick={() => handleDownload('png')}>
          <Download className="h-3.5 w-3.5" />
          PNG
        </button>
        <button type="button" className={itemButton} onClick={() => handleDownload('svg')}>
          <Download className="h-3.5 w-3.5" />
          SVG
        </button>
        <button
          type="button"
          onClick={() => saveRef.current()}
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-gradient-to-r from-amber-400 to-rose-500 text-sm font-semibold text-slate-950 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Guardando...' : currentId ? 'Salvar alterações' : 'Guardar na biblioteca'}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="relative h-[70vh] min-h-[480px] overflow-hidden rounded-xl border border-slate-700/60 bg-slate-900">
          <TLDrawEditor
            key={editorKey}
            initialSnapshot={initialSnapshot}
            onEditorReady={(editor) => {
              editorRef.current = editor;
            }}
            onSave={() => saveRef.current()}
          />
          <AnimatePresence>
            {showInfo && (
              <CanvasInfoPanel onClose={() => setShowInfo(false)} />
            )}
          </AnimatePresence>
        </div>

        <aside className="space-y-6">
          <section aria-label="Sua biblioteca" className="rounded-xl border border-slate-700/60 bg-slate-800/50 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Sua biblioteca</h3>
              <span className="text-xs text-slate-400">{library.length} salvos</span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {library.length === 0
                ? 'Nenhum design guardado ainda.'
                : `Custo de armazenamento: ${designStorageCreditsPerDay(library.length)} crédito(s) por dia.`}
            </p>
            {!userId && (
              <p className="mt-3 text-xs text-slate-400">Entre na sua conta para guardar designs.</p>
            )}
            <ul className="mt-3 space-y-2">
              {library.map((item) => (
                <li key={item.id} className="rounded-lg border border-slate-700/60 bg-slate-900/60 p-3">
                  <p className="truncate text-sm text-white">{item.name}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {item.is_published ? `Publicado · ${item.reuse_count} reuso(s)` : 'Privado'}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button type="button" className={itemButton} disabled={busyId === item.id} onClick={() => openDesign(item.id)}>
                      <FolderOpen className="h-3.5 w-3.5" />
                      Abrir
                    </button>
                    <button type="button" className={itemButton} disabled={busyId === item.id} onClick={() => togglePublished(item)}>
                      {item.is_published ? <Lock className="h-3.5 w-3.5" /> : <Globe className="h-3.5 w-3.5" />}
                      {item.is_published ? 'Despublicar' : 'Publicar'}
                    </button>
                    <button type="button" className={itemButton} disabled={busyId === item.id} onClick={() => deleteDesign(item)}>
                      <Trash2 className="h-3.5 w-3.5" />
                      Excluir
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
              Até 10 designs: 1 crédito/dia. Acima de 10: 2. Acima de 100: 3. Acima de 1000: 4, e assim por diante.
              Cada reuso de um design publicado dá {DESIGN_REUSE_REWARD_CREDITS} crédito ao autor.
              Indicados com primeiro pagamento ganham {DESIGN_REFERRAL_DAILY_CREDITS} créditos por dia.
              Os créditos são únicos: valem também para o agente e o Vibe Code. O armazenamento é descontado desse saldo; sem saldo, o valor fica como saldo devedor, e o saldo devedor bloqueia outros usos até ser pago.
            </p>
          </section>

          <section aria-label="Galeria de designs publicados" className="rounded-xl border border-slate-700/60 bg-slate-800/50 p-4">
            <h3 className="text-sm font-semibold text-white">Galeria</h3>
            <p className="mt-1 text-xs text-slate-400">Designs publicados por outras pessoas. Usar abre uma cópia.</p>
            {gallery.length === 0 ? (
              <p className="mt-3 text-xs text-slate-500">Nenhum design publicado ainda.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {gallery.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-700/60 bg-slate-900/60 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-white">{item.name}</p>
                      <p className="text-[11px] text-slate-400">{item.reuse_count} reuso(s)</p>
                    </div>
                    <button type="button" className={itemButton} disabled={busyId === item.id} onClick={() => useGalleryDesign(item.id)}>
                      Usar
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
