// Cartão de aprovação do Vertal Navigator (mesmo estilo do FormApprovalDialog).
// Regra dura: clique de pagar/comprar/confirmar pedido só acontece depois do
// "Aprovar" aqui. O modelo não tem como aprovar: o Worker exige confirmed: true,
// que só este botão envia. Sem nenhum painel aberto, também pede aqui o código 2FA.
// Fase 2: o cartão mostra loja, itens e total lidos da página (no servidor) e a
// captura do momento do pedido; cada aprovação/recusa vai para a auditoria.
import { useState } from 'react';
import { CreditCard, KeyRound, Send, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { answerNavigator, getNavigatorState, useNavigator } from '@/lib/navigator/store';
import { NavigatorApprovalDetails } from '@/components/navigator/NavigatorParts';
import { NavigatorRequestCard } from '@/components/navigator/NavigatorSecureForms';
import { approvalCopy, hostOf, navInput as inputCls } from '@/components/navigator/navigatorUi';

export function NavigatorApprovalDialog() {
  const nav = useNavigator();
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  // Fase 4: com o cartão do navegador aberto no chat do Vibe Code, a aprovação aparece lá (inline).
  const approval = nav.inlineApprovalHosts > 0 ? null : nav.pending.find((p) => p.kind === 'approval') ?? null;
  const ask = !approval && nav.panelsMounted === 0 ? nav.pending.find((p) => p.kind === 'code' || p.kind === 'text') ?? null : null;
  // Cartão seguro (login/senha/telefone) quando nenhum cartão inline nem painel está montado.
  const secure = !approval && !ask && nav.panelsMounted === 0 ? nav.pending.find((p) => p.kind === 'login' || p.kind === 'phone') ?? null : null;
  const current = approval ?? ask ?? secure;

  const decide = async (approve: boolean) => {
    if (!approval) return;
    setSending(true);
    await answerNavigator(approval, { approve });
    setSending(false);
  };
  const sendCode = async () => {
    if (!ask || !code.trim()) return;
    setSending(true);
    await answerNavigator(ask, { value: code.trim() });
    setCode('');
    setSending(false);
  };

  return (
    <Dialog
      open={!!current}
      onOpenChange={(open) => {
        // Fechar o cartão (pagamento ou envio) = recusar (nunca aprova por omissão).
        if (!open && approval && getNavigatorState().pending.some((p) => p.id === approval.id)) void decide(false);
      }}
    >
      <DialogContent className="max-w-lg" data-sentry-mask>
        {approval ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {approvalCopy(approval).isWrite
                  ? <><Send className="h-5 w-5 text-primary" aria-hidden /> {approvalCopy(approval).title}</>
                  : <><CreditCard className="h-5 w-5 text-primary" aria-hidden /> Aprovar ação de pagamento?</>}
              </DialogTitle>
              {approvalCopy(approval).isWrite ? (
                <DialogDescription>
                  {approvalCopy(approval).description}{hostOf(approval.url) ? <> Página: <strong>{hostOf(approval.url)}</strong>.</> : null}
                </DialogDescription>
              ) : (
                <DialogDescription>
                  O navegador na nuvem parou antes de clicar num botão que pode <strong>pagar, comprar ou confirmar um pedido</strong>
                  {hostOf(approval.url) ? <> em <strong>{hostOf(approval.url)}</strong></> : null}. Nada foi clicado ainda.
                </DialogDescription>
              )}
            </DialogHeader>
            <NavigatorApprovalDetails approval={approval} screenshot={nav.screenshot} />
            <DialogFooter className="gap-2 sm:gap-2">
              <button type="button" disabled={sending} onClick={() => void decide(false)} className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-4 py-2 text-sm font-medium hover:bg-secondary">
                <X className="h-4 w-4" aria-hidden /> Recusar
              </button>
              <button type="button" disabled={sending} onClick={() => void decide(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {approvalCopy(approval).isWrite ? <Send className="h-4 w-4" aria-hidden /> : <CreditCard className="h-4 w-4" aria-hidden />} {approvalCopy(approval).approveLabel}
              </button>
            </DialogFooter>
          </>
        ) : ask ? (
          <form onSubmit={(e) => { e.preventDefault(); void sendCode(); }}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-primary" aria-hidden /> {ask.kind === 'code' ? 'Código de verificação' : 'O navegador perguntou'}
              </DialogTitle>
              <DialogDescription>{ask.question}</DialogDescription>
            </DialogHeader>
            <input
              className={`${inputCls} my-4`} value={code} onChange={(e) => setCode(e.target.value)} autoFocus maxLength={ask.kind === 'code' ? 32 : 500}
              {...(ask.kind === 'code' ? { inputMode: 'numeric' as const, autoComplete: 'one-time-code' } : {})}
              aria-label={ask.kind === 'code' ? 'Código de verificação' : 'Resposta'}
            />
            <DialogFooter>
              <button type="submit" disabled={sending || !code.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                Enviar
              </button>
            </DialogFooter>
          </form>
        ) : secure ? (
          <>
            <DialogHeader>
              <DialogTitle>O site pediu seus dados</DialogTitle>
              <DialogDescription>Preencha no cartão seguro: vai direto ao site e a IA não vê.</DialogDescription>
            </DialogHeader>
            <NavigatorRequestCard pending={secure} />
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
