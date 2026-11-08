// Dados da galeria do Vertal Office: carrega a lista do Supabase e executa as ações do usuário.
import React, { useCallback, useEffect, useState } from 'react';
import { OfficeGallery } from './OfficeGallery';
import {
  deleteOfficeItem,
  downloadPdfBytes,
  duplicateOfficeItem,
  getOfficeRecord,
  listOfficeItems,
  renameOfficeItem,
  type OfficeRecord,
} from '@/services/officeDocsService';
import type { OfficeItem, OfficeKind } from '@/lib/office/galleryModel';
import { safeTitle } from '@/lib/office/galleryModel';
import { download } from '@/lib/office/download';
import { docToDocx, deckToPptx } from '@/lib/office/officeFiles';
import { sheetToXlsx } from '@/lib/office/sheetModel';
import type { DocData } from '@/lib/office/documentModel';
import type { DeckData } from '@/lib/office/slidesModel';
import type { SheetData } from '@/lib/office/sheetModel';

export interface OfficeGalleryPanelProps {
  userId: string | undefined;
  /** Muda quando algo é salvo, para recarregar a lista. */
  refreshKey: number;
  onOpenRecord: (record: OfficeRecord) => Promise<void> | void;
  onNew: (kind: OfficeKind) => void;
  /** Título mudou na galeria: o editor aberto precisa refletir o novo nome. */
  onRenamed: (id: string, kind: OfficeKind, title: string) => void;
  onDeleted: (id: string, kind: OfficeKind) => void;
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Algo deu errado. Tente de novo.');

/** Baixa no formato nativo: Word, Excel, PowerPoint ou PDF. */
async function downloadRecord(record: OfficeRecord): Promise<void> {
  const name = safeTitle(record.title);
  if (record.kind === 'pdf') {
    download(await downloadPdfBytes(record.filePath ?? ''), `${name}.pdf`, 'application/pdf');
    return;
  }
  if (record.kind === 'doc') {
    const blob = await docToDocx(record.content as DocData);
    download(blob, `${name}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    return;
  }
  if (record.kind === 'sheet') {
    download(sheetToXlsx(record.content as SheetData), `${name}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return;
  }
  download(await deckToPptx(record.content as DeckData), `${name}.pptx`, 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
}

export function OfficeGalleryPanel(props: OfficeGalleryPanelProps) {
  const { userId, refreshKey } = props;
  const [items, setItems] = useState<OfficeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setItems(await listOfficeItems());
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  /** Busca o registro completo, executa a ação e mostra erro se algo falhar. */
  const withRecord = async (item: OfficeItem, action: (record: OfficeRecord) => Promise<void>) => {
    setBusyId(item.id);
    setError(null);
    try {
      await action(await getOfficeRecord(item.id));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusyId(null);
    }
  };

  if (!userId) {
    return (
      <section className="flex flex-1 items-center justify-center bg-slate-950 p-8 text-center text-sm text-slate-300">
        Entre na sua conta para ver e guardar seus documentos na galeria.
      </section>
    );
  }

  return (
    <div className="flex min-w-0 flex-1">
      <OfficeGallery
        items={items}
        loading={loading}
        error={error}
        busyId={busyId}
        onRetry={() => {
          setError(null);
          void load();
        }}
        onOpen={(item) => void withRecord(item, async (r) => { await props.onOpenRecord(r); })}
        onNew={props.onNew}
        onRename={(item, title) =>
          withRecord(item, async (r) => {
            const updated = await renameOfficeItem(r, title);
            props.onRenamed(item.id, item.kind, updated.title);
            await load();
          })
        }
        onDuplicate={(item) =>
          withRecord(item, async (r) => {
            if (!userId) return;
            await duplicateOfficeItem(r, userId);
            await load();
          })
        }
        onDownload={(item) => void withRecord(item, downloadRecord)}
        onDelete={(item) =>
          withRecord(item, async (r) => {
            await deleteOfficeItem(r);
            props.onDeleted(item.id, item.kind);
            await load();
          })
        }
      />
    </div>
  );
}

export default OfficeGalleryPanel;
