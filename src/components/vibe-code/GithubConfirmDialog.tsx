// Confirmação do comando /github do Vibe Code (fase 3): criar repositório, issue,
// branch ou PR só acontece depois do clique em "Confirmar". Fechar = cancelar.
import { Github } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { decideGithubAction, useGithubConfirm } from '@/lib/github/confirm';

export function GithubConfirmDialog() {
  const current = useGithubConfirm();
  return (
    <Dialog open={!!current} onOpenChange={(open) => { if (!open && current) decideGithubAction(false); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Github className="h-5 w-5" aria-hidden /> Confirmar no GitHub?</DialogTitle>
          <DialogDescription>Esta ação usa a sua conta do GitHub conectada.</DialogDescription>
        </DialogHeader>
        <p className="rounded-lg border border-border/50 px-3 py-2 text-sm">{current?.text}</p>
        <DialogFooter className="gap-2 sm:gap-2">
          <button type="button" onClick={() => decideGithubAction(false)} className="rounded-lg border border-border/60 px-4 py-2 text-sm font-medium hover:bg-secondary">Cancelar</button>
          <button type="button" onClick={() => decideGithubAction(true)} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">Confirmar</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
