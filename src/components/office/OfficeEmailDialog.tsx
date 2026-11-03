// Enviar por e-mail com anexo, a partir do Vertal Office.
// Fluxo: escolher conta e destinatário → (opcional) IA prepara o texto, 1 crédito
// → revisar → marcar a confirmação → enviar. Nada sai sem a confirmação.
import React, { useEffect, useState } from 'react';
import { Mail, Sparkles, Loader2, X } from 'lucide-react';
import { OFFICE_AI_CREDIT_COST, runOfficeAi } from '@/services/officeAiService';
import { GmailAccountOption, listGmailAccounts, sendOfficeEmail } from '@/services/officeEmailService';

export interface EmailFormat {
  id: string;
  label: string;
  ext: string;
}

export interface OfficeEmailDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  formats: EmailFormat[];
  /** Gera o arquivo no formato escolhido. */
  buildFile: (formatId: string) => { bytes: Uint8Array };
  /** Texto usado pela IA como base para o rascunho. */
  sourceText: () => string;
  creditsAvailable: number;
}

const SIMPLE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function OfficeEmailDialog(props: OfficeEmailDialogProps) {
  const { open, onClose, title, formats, buildFile, sourceText, creditsAvailable } = props;
  const [accounts, setAccounts] = useState<GmailAccountOption[] | null>(null);
  const [accountId, setAccountId] = useState('');
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [formatId, setFormatId] = useState(formats[0]?.id ?? '');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<'ai' | 'send' | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setConfirmed(false);
    setMessage(null);
    setSubject((s) => s || title);
    listGmailAccounts()
      .then((list) => {
        setAccounts(list);
        setAccountId((id) => id || list[0]?.id || '');
      })
      .catch((e: Error) => {
        setAccounts([]);
        setMessage({ kind: 'err', text: e.message });
      });
  }, [open, title]);

  if (!open) return null;

  const validTo = SIMPLE_EMAIL.test(to.trim());
  const canSend =
    busy === null && !!accountId && validTo && subject.trim() !== '' && body.trim() !== '' && confirmed;

  const prepareWithAi = async () => {
    setBusy('ai');
    setMessage(null);
    try {
      const res = await runOfficeAi({
        action: 'email',
        prompt: `Escreva o e-mail para enviar o arquivo "${title}" em anexo${validTo ? ` para ${to.trim()}` : ''}.`,
        source: sourceText().slice(0, 12_000) || undefined,
      });
      if (res.action !== 'email') throw new Error('Resposta inesperada da IA.');
      setSubject(res.output.subject);
      setBody(res.output.body);
      setConfirmed(false);
      setMessage({ kind: 'ok', text: `Rascunho pronto (${OFFICE_AI_CREDIT_COST} crédito). Revise antes de enviar.` });
    } catch (e) {
      setMessage({ kind: 'err', text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const send = async () => {
    if (!canSend) return;
    setBusy('send');
    setMessage(null);
    try {
      const file = buildFile(formatId);
      const fmt = formats.find((f) => f.id === formatId);
      const filename = `${title.replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '') || 'arquivo'}.${fmt?.ext ?? 'txt'}`;
      await sendOfficeEmail({
        accountId,
        to: to.trim(),
        subject: subject.trim(),
        body: body.trim(),
        attachment: { filename, bytes: file.bytes },
      });
      setMessage({ kind: 'ok', text: `E-mail enviado para ${to.trim()}.` });
      setConfirmed(false);
    } catch (e) {
      setMessage({ kind: 'err', text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const inputClass =
    'w-full rounded-lg border border-white/10 bg-slate-950/60 p-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-400/50';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Enviar por e-mail">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-slate-900 p-5 text-slate-100 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-white">
            <Mail className="h-5 w-5" /> Enviar por e-mail
          </h3>
          <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-md p-1 text-slate-400 hover:bg-white/5">
            <X className="h-5 w-5" />
          </button>
        </div>

        {accounts && accounts.length === 0 ? (
          <div className="space-y-3 text-sm">
            <p className="text-slate-300">Nenhuma conta de e-mail conectada.</p>
            <a href="/connectors/gmail" className="inline-block rounded-lg bg-violet-500 px-4 py-2 font-semibold text-white">
              Conectar Gmail
            </a>
          </div>
        ) : (
          <div className="space-y-3">
            <label className="block text-xs text-slate-400">
              Conta de envio
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={`${inputClass} mt-1`} disabled={!accounts}>
                {(accounts ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.email}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs text-slate-400">
              Para
              <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="nome@exemplo.com" className={`${inputClass} mt-1`} />
            </label>

            <label className="block text-xs text-slate-400">
              Formato do anexo
              <select value={formatId} onChange={(e) => setFormatId(e.target.value)} className={`${inputClass} mt-1`}>
                {formats.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={prepareWithAi}
              disabled={busy !== null || creditsAvailable < OFFICE_AI_CREDIT_COST}
              className="inline-flex items-center gap-2 rounded-lg border border-violet-400/30 px-3 py-2 text-sm text-violet-200 disabled:opacity-40"
            >
              {busy === 'ai' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Preparar texto com IA · {OFFICE_AI_CREDIT_COST} crédito
            </button>

            <label className="block text-xs text-slate-400">
              Assunto
              <input value={subject} onChange={(e) => { setSubject(e.target.value); setConfirmed(false); }} className={`${inputClass} mt-1`} />
            </label>

            <label className="block text-xs text-slate-400">
              Mensagem
              <textarea value={body} onChange={(e) => { setBody(e.target.value); setConfirmed(false); }} rows={6} className={`${inputClass} mt-1`} />
            </label>

            <label className="flex items-start gap-2 rounded-lg border border-white/10 p-3 text-sm text-slate-200">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Revisei o e-mail e confirmo o envio para {validTo ? to.trim() : 'o destinatário'} com o arquivo em anexo.
              </span>
            </label>

            <button
              type="button"
              onClick={send}
              disabled={!canSend}
              className="w-full rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              {busy === 'send' ? 'Enviando…' : 'Confirmar envio'}
            </button>
            <p className="text-center text-xs text-slate-500">O envio não é cobrado em créditos.</p>
          </div>
        )}

        {message && (
          <p className={`mt-3 text-sm ${message.kind === 'ok' ? 'text-emerald-300' : 'text-red-300'}`} role="status">
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}

export default OfficeEmailDialog;
