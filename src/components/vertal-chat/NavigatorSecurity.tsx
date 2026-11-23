// Aba "Segurança" do Vertal Navigator (fase 2):
//  * Aprovação de pagamento: por padrão SEMPRE pedir. O usuário pode ligar
//    "aprovar automático até R$X" (teto de R$ 1.000); vale só quando o total foi
//    lido com confiança, em reais. Cada decisão vai para a auditoria.
//  * Autenticador (TOTP): o usuário guarda a chave do app autenticador de um site
//    no cofre kubo-secrets (segredo *_TOTP vinculado ao site), com consentimento
//    explícito. O código é gerado no servidor e digitado direto, sem passar pela IA.
import { useEffect, useState } from 'react';
import { CreditCard, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { NAVIGATOR_LIMITS, formatCents } from '@/lib/navigator/navigatorCore';
import { loadNavigatorSettings, recordTotpConsent, saveNavigatorSettings } from '@/lib/navigator/store';
import { validateTotpForm } from '@/lib/navigator/totpForm';
import { saveSecretValue } from '@/hooks/useKuboSecrets';

const primary = 'inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50';
const inputCls = 'w-full rounded-lg border border-border/60 bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

function AutoApproveSettings() {
  const [loaded, setLoaded] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [reais, setReais] = useState('');
  const [saved, setSaved] = useState<{ enabled: boolean; cents: number }>({ enabled: false, cents: 0 });
  const [sending, setSending] = useState(false);
  const [periodReais, setPeriodReais] = useState('');
  const [merchants, setMerchants] = useState('');
  const [recurring, setRecurring] = useState(false);
  const cap = NAVIGATOR_LIMITS.autoApproveMaxCentsCap;

  useEffect(() => {
    void loadNavigatorSettings().then((res) => {
      setLoaded(true);
      if (!res.ok || !res.settings) return;
      setEnabled(res.settings.autoApproveEnabled);
      setSaved({ enabled: res.settings.autoApproveEnabled, cents: res.settings.autoApproveMaxCents });
      if (res.settings.autoApproveMaxCents > 0) setReais(String(res.settings.autoApproveMaxCents / 100).replace('.', ','));
      const x = res.settings as typeof res.settings & { periodMaxCents?: number; merchants?: string[]; allowRecurring?: boolean };
      if (x.periodMaxCents) setPeriodReais(String(x.periodMaxCents / 100).replace('.', ','));
      if (x.merchants?.length) setMerchants(x.merchants.join(', '));
      setRecurring(!!x.allowRecurring);
    });
  }, []);

  const cents = Math.round(Number(reais.replace(/\./g, '').replace(',', '.')) * 100);
  const periodCents = periodReais.trim() ? Math.round(Number(periodReais.replace(/\./g, '').replace(',', '.')) * 100) : 0;
  const merchantList = merchants.split(/[,\s]+/).map((m) => m.trim().toLowerCase()).filter(Boolean).slice(0, 10);
  const valid = !enabled || (Number.isFinite(cents) && cents > 0 && cents <= cap && Number.isFinite(periodCents) && periodCents >= 0 && periodCents <= 500_000);

  const save = async () => {
    if (!valid) return;
    setSending(true);
    const res = await saveNavigatorSettings(enabled, enabled ? cents : 0, enabled ? { periodMaxCents: periodCents, periodDays: 30, merchants: merchantList, allowRecurring: recurring } : undefined);
    setSending(false);
    if (!res.ok) {
      toast.error(res.message ?? 'Não consegui salvar.');
      return;
    }
    setSaved({ enabled, cents: enabled ? cents : 0 });
    toast.success(enabled ? `Aprovação automática até ${formatCents(cents)}.` : 'Pagamentos sempre pedem a sua aprovação.');
  };

  return (
    <section className="space-y-2 rounded-xl border border-border/60 p-3">
      <p className="flex items-center gap-1.5 text-sm font-semibold"><CreditCard className="h-4 w-4" aria-hidden /> Aprovação de pagamento</p>
      <p className="text-xs text-muted-foreground">
        Agora: {saved.enabled ? <>aprovar automático até <strong>{formatCents(saved.cents)}</strong></> : <strong>sempre pedir a sua aprovação</strong>}.
      </p>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={enabled} disabled={!loaded} onChange={(e) => setEnabled(e.target.checked)} />
        <span>Aprovar automaticamente compras de até
          <input
            className={`${inputCls} mx-1 inline-block w-28`} inputMode="decimal" value={reais} disabled={!enabled}
            onChange={(e) => setReais(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="50,00" aria-label="Limite em reais"
          />
          reais (máximo {formatCents(cap)}).
        </span>
      </label>
      {enabled && (
        <div className="space-y-1.5 pl-6 text-sm">
          <label className="block">Teto por loja a cada 30 dias (opcional)
            <input className={`${inputCls} mt-1 w-28`} inputMode="decimal" value={periodReais} onChange={(e) => setPeriodReais(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="200,00" aria-label="Teto por loja em 30 dias" />
          </label>
          <label className="block">Só nestas lojas (opcional, separadas por vírgula)
            <input className={`${inputCls} mt-1`} value={merchants} onChange={(e) => setMerchants(e.target.value)} placeholder="folha.uol.com.br, ifood.com.br" aria-label="Lojas permitidas" />
          </label>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} /> Incluir assinaturas recorrentes (padrão: sempre perguntar)</label>
        </div>
      )}
      <p className="text-[11px] leading-snug text-muted-foreground">
        Só vale quando o valor total foi lido com segurança na página (rótulo de total, em reais). Sem isso, ou acima do limite, o cartão de aprovação aparece como sempre. Cada aprovação automática fica na Atividade.
      </p>
      <button type="button" className={primary} disabled={!loaded || sending || !valid} onClick={() => void save()}>
        {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null} Salvar
      </button>
    </section>
  );
}

function TotpVault() {
  const [site, setSite] = useState('');
  const [seed, setSeed] = useState('');
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const v = validateTotpForm({ site, seed, consent });
    if (!v.ok || !v.envKey || !v.boundTo) {
      setError(v.error ?? 'Dados inválidos.');
      return;
    }
    setError(null);
    setSending(true);
    try {
      await saveSecretValue({
        name: `Autenticador ${v.boundTo.replace(/-/g, '.')}`,
        env_key: v.envKey,
        value: seed.trim(),
        group_name: 'navigator',
        bound_to: v.boundTo,
        description: `Semente TOTP (2FA) do Vertal Navigator para ${v.boundTo.replace(/-/g, '.')}. Consentimento explícito em ${new Date().toISOString().slice(0, 10)}.`,
      });
      await recordTotpConsent(v.envKey, v.boundTo);
      setSeed('');
      setConsent(false);
      toast.success(`Autenticador salvo como ${v.envKey}. O Navigator gera os códigos deste site sozinho.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não consegui salvar no cofre.');
    } finally {
      setSending(false);
    }
  };

  return (
    <form className="space-y-2 rounded-xl border border-border/60 p-3" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <p className="flex items-center gap-1.5 text-sm font-semibold"><KeyRound className="h-4 w-4" aria-hidden /> Autenticador (TOTP) — opcional</p>
      <p className="text-xs text-muted-foreground">
        Sem isto, o Navigator continua pedindo o código de verificação a você. Com isto, ele gera o código de 6 dígitos do site no servidor e digita direto no campo — a chave e o código não passam pela IA.
      </p>
      <input className={inputCls} value={site} onChange={(e) => setSite(e.target.value)} placeholder="Site (ex.: github.com)" aria-label="Site" maxLength={200} />
      <input
        className={inputCls} value={seed} onChange={(e) => setSeed(e.target.value)} type="password" autoComplete="off" spellCheck={false}
        placeholder="Chave do autenticador (texto base32) ou otpauth://totp/…" aria-label="Chave do autenticador" maxLength={1024}
      />
      <label className="flex items-start gap-2 text-xs">
        <input type="checkbox" className="mt-0.5" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>
          Autorizo a Vertal a guardar esta chave cifrada no meu Cofre de segredos e a gerar códigos 2FA <strong>somente para este site</strong>, quando eu pedir uma tarefa ao Navigator. Entendo que quem controla a chave consegue gerar códigos, e que posso apagá-la no Cofre a qualquer momento.
        </span>
      </label>
      {error && <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs">{error}</p>}
      <button type="submit" className={primary} disabled={sending || !site.trim() || !seed.trim() || !consent}>
        {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ShieldCheck className="h-4 w-4" aria-hidden />} Guardar no cofre
      </button>
    </form>
  );
}

export function NavigatorSecurity() {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <AutoApproveSettings />
      <TotpVault />
    </div>
  );
}

export default NavigatorSecurity;
