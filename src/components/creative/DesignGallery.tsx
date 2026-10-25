import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { DESIGN_REUSE_REWARD_CREDITS } from '@/config/designLibraryPricing';

/** Cópia de um design publicado, pronta para abrir no editor. O original não muda. */
export interface DesignCopy {
  name: string;
  snapshot: unknown;
}

interface GalleryItem {
  id: string;
  name: string;
  preview_data: string | null;
  reuse_count: number;
}

interface ReuseResult {
  success: boolean;
  rewarded: boolean;
  name: string;
  snapshot: unknown;
}

const itemButton =
  'inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-xs text-slate-200 transition-colors hover:border-slate-500 disabled:opacity-50';

// null = sem conta.
async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

function Thumb({ src }: { src: string | null }) {
  return src ? (
    <img src={src} alt="" className="h-16 w-16 shrink-0 rounded-lg bg-white object-cover" />
  ) : (
    <div className="h-16 w-16 shrink-0 rounded-lg bg-slate-800" aria-hidden="true" />
  );
}

function Message({ children }: { children: string }) {
  return <p className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-6 text-sm text-slate-400">{children}</p>;
}

/** Feed da galeria: designs publicados por outras pessoas. Usar um design abre uma cópia no editor e paga 1 crédito ao autor. */
export function DesignGalleryFeed({ onOpenCopy }: { onOpenCopy: (copy: DesignCopy) => void }) {
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const uid = await currentUserId();
    setUserId(uid);
    if (!uid) return;
    const { data, error } = await supabase
      .from('design_library')
      .select('id,name,preview_data,reuse_count')
      .eq('is_published', true)
      .neq('user_id', uid)
      .order('reuse_count', { ascending: false })
      .limit(24);
    if (error) {
      setFailed(true);
      return;
    }
    setItems(data ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const reuseDesign = async (item: GalleryItem) => {
    setBusyId(item.id);
    const { data, error } = await supabase.rpc('reuse_published_design', { _design_id: item.id });
    setBusyId(null);
    if (error || !data) {
      toast.error('Não foi possível usar este design.');
      return;
    }
    const result = data as unknown as ReuseResult;
    onOpenCopy({ name: `${result.name} (cópia)`, snapshot: result.snapshot });
    toast.success(
      result.rewarded
        ? `Design aberto. O autor ganhou ${DESIGN_REUSE_REWARD_CREDITS} crédito.`
        : 'Design aberto. Você já tinha usado este design antes.',
    );
    void load();
  };

  if (userId === undefined) {
    return <Loader2 className="h-6 w-6 animate-spin text-amber-300" aria-label="Carregando" />;
  }
  if (userId === null) return <Message>Entre na sua conta para ver a galeria.</Message>;
  if (failed) return <Message>Não foi possível carregar a galeria agora. Tente de novo em instantes.</Message>;
  if (items.length === 0) return <Message>Nenhum design publicado ainda. Quando alguém publicar, o design aparece aqui.</Message>;

  return (
    <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <li key={item.id} className="flex items-center gap-4 rounded-xl border border-slate-700/60 bg-slate-800/50 p-4">
          <Thumb src={item.preview_data} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-white">{item.name}</p>
            <p className="text-xs text-slate-400">{item.reuse_count} uso(s)</p>
            <button type="button" className={`${itemButton} mt-2`} disabled={busyId === item.id} onClick={() => reuseDesign(item)}>
              Usar como modelo
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Designs que você publicou. Despublicar tira o design do feed; ele continua na sua biblioteca. */
export function MyPublishedDesigns() {
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const uid = await currentUserId();
    setUserId(uid);
    if (!uid) return;
    const { data } = await supabase
      .from('design_library')
      .select('id,name,preview_data,reuse_count')
      .eq('user_id', uid)
      .eq('is_published', true)
      .order('updated_at', { ascending: false });
    setItems(data ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const unpublish = async (item: GalleryItem) => {
    setBusyId(item.id);
    const { error } = await supabase
      .from('design_library')
      .update({ is_published: false, updated_at: new Date().toISOString() })
      .eq('id', item.id);
    setBusyId(null);
    if (error) {
      toast.error('Não foi possível despublicar este design.');
      return;
    }
    toast.success('Design despublicado.');
    void load();
  };

  if (userId === undefined) {
    return <Loader2 className="h-6 w-6 animate-spin text-amber-300" aria-label="Carregando" />;
  }
  if (userId === null) return <Message>Entre na sua conta para ver os seus publicados.</Message>;
  if (items.length === 0) return <Message>Você ainda não publicou nenhum design. Publique um design pelo Canvas para ele aparecer aqui.</Message>;

  return (
    <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <li key={item.id} className="flex items-center gap-4 rounded-xl border border-slate-700/60 bg-slate-800/50 p-4">
          <Thumb src={item.preview_data} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-white">{item.name}</p>
            <p className="text-xs text-slate-400">{item.reuse_count} uso(s)</p>
            <button type="button" className={`${itemButton} mt-2`} disabled={busyId === item.id} onClick={() => unpublish(item)}>
              Despublicar
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
