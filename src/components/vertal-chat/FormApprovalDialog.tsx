// Cartão de revisão do agente de formulários: mostra cada campo com o valor que vai
// ser enviado e a captura de tela da página preenchida. O envio só acontece no
// clique em "Enviar" (o agente nunca envia sozinho). "Editar" libera os campos.
import { useEffect, useState } from 'react';
import { AlertTriangle, Globe, Pencil, Send, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { PendingFormApproval } from '@/hooks/useVertalChat';
import type { FormField, FormValues } from '@/lib/browserForm/formCore';

const inputCls = 'w-full rounded-lg border border-border/60 bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

function shown(field: FormField, value: string | boolean | undefined): string {
  if (value === undefined || value === '') return field.current ? `${field.current} (já estava na página)` : '—';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (field.type === 'password') return '••••••';
  const option = field.options?.find((o) => o.value === value);
  return option ? option.label : value;
}

function FieldEditor({ field, value, onChange }: { field: FormField; value: string | boolean | undefined; onChange: (v: string | boolean) => void }) {
  const id = `form-approval-${field.key}`;
  if (field.unsupported) return <p className="text-xs text-muted-foreground">Upload de arquivo: envie pelo site.</p>;
  if (field.type === 'checkbox') {
    return (
      <label htmlFor={id} className="inline-flex items-center gap-2 text-sm">
        <input id={id} type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} /> Marcado
      </label>
    );
  }
  if ((field.type === 'select' || field.type === 'radio') && field.options?.length) {
    return (
      <select id={id} className={inputCls} value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {field.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  }
  if (field.type === 'textarea') {
    return <textarea id={id} rows={3} className={inputCls} value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} />;
  }
  const type = ['email', 'tel', 'url', 'number', 'date', 'time', 'password'].includes(field.type) ? field.type : 'text';
  return <input id={id} type={type} className={inputCls} value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} />;
}

export function FormApprovalDialog({ approval }: { approval: PendingFormApproval | null }) {
  const [values, setValues] = useState<FormValues>({});
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setValues(approval?.values ?? {});
    setEditing(false);
  }, [approval]);

  const missing = approval
    ? approval.fields.filter((f) => f.required && !f.unsupported && (values[f.key] === undefined || values[f.key] === '' || (f.type === 'checkbox' && values[f.key] !== true)) && !(f.type !== 'checkbox' && f.current))
    : [];

  return (
    <Dialog open={!!approval} onOpenChange={(open) => !open && approval?.resolve({ action: 'cancel' })}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" aria-hidden /> Revisar antes de enviar
          </DialogTitle>
          <DialogDescription>
            O formulário de <strong>{approval?.host}</strong> foi preenchido no navegador na nuvem e ainda <strong>não foi enviado</strong>.
            Confira cada campo. Enviar custa {approval?.credits ?? 0} créditos.
          </DialogDescription>
        </DialogHeader>

        {approval && (
          <div className="grid gap-4 md:grid-cols-[1fr_minmax(0,280px)]">
            <dl className="space-y-2.5 text-sm">
              {approval.fields.map((f) => (
                <div key={f.key} className="rounded-lg border border-border/40 px-3 py-2">
                  <dt className="text-xs text-muted-foreground">
                    {f.label}{f.required && <span className="text-destructive"> *</span>}
                  </dt>
                  <dd className="mt-0.5 break-words">
                    {editing
                      ? <FieldEditor field={f} value={values[f.key]} onChange={(v) => setValues((prev) => ({ ...prev, [f.key]: v }))} />
                      : <span className={values[f.key] === undefined ? 'text-muted-foreground' : 'font-medium'}>{shown(f, values[f.key])}</span>}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="space-y-3">
              {approval.screenshot
                ? <img src={approval.screenshot} alt={`Página preenchida em ${approval.host}`} className="w-full rounded-lg border border-border/50" />
                : <div className="rounded-lg border border-dashed border-border/60 p-4 text-xs text-muted-foreground">Sem captura de tela.</div>}
              <a href={approval.url} target="_blank" rel="noreferrer noopener" className="block break-all text-xs text-primary underline">{approval.url}</a>
              {(approval.errors.length > 0 || missing.length > 0) && (
                <div className="space-y-1 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                  <p className="flex items-center gap-1 font-semibold"><AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Atenção</p>
                  {approval.errors.map((e, i) => <p key={i}>{e}</p>)}
                  {missing.length > 0 && <p>Obrigatórios em branco: {missing.map((f) => f.label).join(', ')}</p>}
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <button type="button" onClick={() => approval?.resolve({ action: 'cancel' })} className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-4 py-2 text-sm font-medium hover:bg-secondary">
            <X className="h-4 w-4" aria-hidden /> Cancelar
          </button>
          <button type="button" onClick={() => setEditing((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-4 py-2 text-sm font-medium hover:bg-secondary">
            <Pencil className="h-4 w-4" aria-hidden /> {editing ? 'Concluir edição' : 'Editar'}
          </button>
          <button
            type="button"
            disabled={missing.length > 0}
            onClick={() => approval?.resolve({ action: 'submit', values })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="h-4 w-4" aria-hidden /> Enviar
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
