// Vertal CRM · negócios em Kanban, por funil (vários funis, etapas personalizadas).
// Agrupamento e reordenação adaptados do Atomic CRM (deals/stages.ts, DealListContent.tsx — MIT, Marmelab);
// arrastar e soltar com @dnd-kit (já usado no Vertal Dev).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DndContext, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { crmDb } from '@/lib/vertalCrm/client';
import { crmDate, type CrmLang } from '@/lib/vertalCrm/i18n';
import { getDealsByStage, moveDeal, type DealsByStage, type KanbanDeal } from '../../../supabase/functions/_shared/vertalCrm/core';
import { useCrm } from './crmState';
import { CrmRecordPanel } from './CrmRecordPanel';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Deal = KanbanDeal & Record<string, any>;

function DealCard({ deal, onOpen, money, disabled, lang }: { deal: Deal; onOpen: () => void; money: (n: unknown) => string; disabled: boolean; lang: CrmLang }) {
  const drag = useDraggable({ id: `deal:${deal.id}`, disabled });
  const drop = useDroppable({ id: `deal:${deal.id}` });
  const style = drag.transform ? { transform: `translate3d(${drag.transform.x}px, ${drag.transform.y}px, 0)`, zIndex: 50 } : undefined;
  return (
    <div ref={drop.setNodeRef} className={drop.isOver ? 'rounded-lg ring-2 ring-primary/40' : ''}>
      <div ref={drag.setNodeRef} style={style} {...drag.listeners} {...drag.attributes}
        className="cursor-grab touch-none rounded-lg border bg-card p-2.5 text-sm shadow-sm active:cursor-grabbing" data-testid="crm-deal-card"
        onClick={onOpen} onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
        <p className="font-medium leading-tight">{deal.name}</p>
        <p className="mt-1 text-xs text-muted-foreground">{money(deal.amount)}{deal.expected_closing_date ? ` · ${crmDate(deal.expected_closing_date, lang)}` : ''}</p>
      </div>
    </div>
  );
}

function Column({ id, label, children, total, count }: { id: string; label: string; children: React.ReactNode; total: string; count: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${id}` });
  return (
    <div ref={setNodeRef} className={`flex w-64 shrink-0 flex-col rounded-xl border bg-muted/30 p-2 ${isOver ? 'border-primary/50' : ''}`}>
      <div className="mb-2 flex items-baseline justify-between px-1">
        <p className="text-sm font-semibold">{label} <span className="text-xs font-normal text-muted-foreground">({count})</span></p>{' '}
        <p className="text-xs text-muted-foreground">{total}</p>
      </div>
      <div className="flex min-h-16 flex-col gap-2">{children}</div>
    </div>
  );
}

export function CrmDeals() {
  const { t, workspace, pipelines, canWrite, money, userId, lang } = useCrm();
  const [pipelineId, setPipelineId] = useState('');
  const [by, setBy] = useState<DealsByStage<Deal>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const db = crmDb();
  const ws = workspace?.id ?? '';
  const pipeline = useMemo(() => pipelines.find((p) => p.id === pipelineId) ?? pipelines.find((p) => p.is_default) ?? pipelines[0], [pipelines, pipelineId]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }));

  const load = useCallback(async () => {
    if (!ws || !pipeline) return;
    const { data } = await db.from('crm_deals').select('*').eq('workspace_id', ws).eq('pipeline_id', pipeline.id).is('archived_at', null).limit(1000);
    setBy(getDealsByStage((data ?? []) as Deal[], pipeline.stages));
  }, [db, ws, pipeline]);

  useEffect(() => {
    void load();
  }, [load]);

  const onDragEnd = async (e: DragEndEvent) => {
    const active = String(e.active.id).replace(/^deal:/, '');
    const over = e.over ? String(e.over.id) : null;
    if (!over || over === `deal:${active}`) return;
    let toStage: string;
    let toIndex: number;
    if (over.startsWith('col:')) {
      toStage = over.slice(4);
      toIndex = (by[toStage] ?? []).filter((d) => d.id !== active).length;
    } else {
      const overId = over.slice(5);
      toStage = Object.keys(by).find((s) => by[s].some((d) => d.id === overId)) ?? '';
      toIndex = (by[toStage] ?? []).filter((d) => d.id !== active).findIndex((d) => d.id === overId);
    }
    if (!toStage) return;
    const { next, updates } = moveDeal(by, active, toStage, toIndex);
    setBy(next);
    const results = await Promise.all(updates.map((u) => db.from('crm_deals').update({ stage: u.stage, index: u.index }).eq('workspace_id', ws).eq('id', u.id)));
    if (results.some((r: { error: unknown }) => r.error)) {
      toast.error(t.error);
      void load();
    }
  };

  const create = async () => {
    if (!name.trim() || !pipeline) return;
    const first = pipeline.stages.find((s) => s.kind === 'open') ?? pipeline.stages[0];
    const { data, error } = await db.from('crm_deals').insert({
      workspace_id: ws, pipeline_id: pipeline.id, stage: first.id, name: name.trim().slice(0, 200), amount: Number(amount) || 0,
      index: (by[first.id] ?? []).length, owner_id: userId, currency: workspace?.currency,
    }).select('id').single();
    if (error) return toast.error(t.error);
    setName('');
    setAmount('');
    void load();
    setOpen(data.id);
  };

  // Leitor de tela: nomes do negócio e da etapa no idioma do usuário (antes lia IDs internos "deal:… col:…").
  const dealName = (rawId: unknown) => {
    const did = String(rawId ?? '').replace(/^deal:/, '');
    return Object.values(by).flat().find((d) => d.id === did)?.name ?? '';
  };
  const overName = (rawId: unknown) => {
    const oid = String(rawId ?? '');
    if (oid.startsWith('col:')) return pipeline?.stages.find((s) => s.id === oid.slice(4))?.label ?? '';
    const did = oid.replace(/^deal:/, '');
    const stage = Object.keys(by).find((k) => by[k].some((d) => d.id === did));
    return pipeline?.stages.find((s) => s.id === stage)?.label ?? '';
  };
  const announcements = {
    onDragStart: ({ active }: { active: { id: unknown } }) => t.dnd.start(dealName(active.id)),
    onDragOver: ({ active, over }: { active: { id: unknown }; over: { id: unknown } | null }) => (over ? t.dnd.over(dealName(active.id), overName(over.id)) : undefined),
    onDragEnd: ({ active, over }: { active: { id: unknown }; over: { id: unknown } | null }) => (over ? t.dnd.end(dealName(active.id), overName(over.id)) : t.dnd.cancel(dealName(active.id))),
    onDragCancel: ({ active }: { active: { id: unknown } }) => t.dnd.cancel(dealName(active.id)),
  };

  if (!pipeline) return <p className="py-10 text-center text-sm text-muted-foreground">{t.empty}</p>;
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {pipelines.length > 1 && (
          <select className="h-10 rounded-md border bg-background px-2 text-sm" value={pipeline.id} onChange={(e) => setPipelineId(e.target.value)} aria-label={t.pipeline}>
            {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <p className="text-xs text-muted-foreground">{t.kanbanHint}</p>
        {canWrite && (
          <div className="flex gap-2 sm:ml-auto">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.dealName} />
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={t.amount} type="number" min={0} className="w-28" />
            <Button onClick={create} disabled={!name.trim()}><Plus className="h-4 w-4" />{t.new}</Button>
          </div>
        )}
      </div>
      <DndContext sensors={sensors} onDragEnd={onDragEnd} accessibility={{ announcements, screenReaderInstructions: { draggable: t.dnd.instructions } }}>
        <div className="flex gap-3 overflow-x-auto pb-4" data-testid="crm-kanban">
          {pipeline.stages.map((s) => {
            const list = by[s.id] ?? [];
            return (
              <Column key={s.id} id={s.id} label={s.label} count={list.length} total={money(list.reduce((a, d) => a + Number(d.amount ?? 0), 0))}>
                {list.map((d) => <DealCard key={d.id} deal={d} money={money} lang={lang} disabled={!canWrite} onOpen={() => setOpen(d.id)} />)}
              </Column>
            );
          })}
        </div>
      </DndContext>
      <CrmRecordPanel type="deal" id={open} onClose={() => setOpen(null)} onChanged={load}
        onDeleted={(id) => setBy((cur) => Object.fromEntries(Object.entries(cur).map(([k, v]) => [k, v.filter((d) => d.id !== id)])) as DealsByStage<Deal>)} />
    </div>
  );
}
