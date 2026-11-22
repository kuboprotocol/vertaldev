// Cartões seguros do Vertal Navigator ("bloquinhos", como no Hark), mostrados INLINE na
// conversa quando o site pede login, senha, código 2FA/autenticador ou telefone.
// Os valores vão do cartão direto ao Worker (answerNavigatorAuth) e o estado local é
// limpo no envio: nada passa pelo modelo, pelo histórico do chat ou pela auditoria.
import { useState } from 'react';
import { CreditCard, KeyRound, Loader2, Lock, Mail, Phone, ShieldCheck, Smartphone } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { NavigatorPending } from '@/lib/navigator/navigatorCore';
import { answerNavigatorAuth, type NavigatorAuthAnswer } from '@/lib/navigator/store';
import { composePhone, PHONE_COUNTRIES } from '../../../supabase/functions/_shared/navigatorAuthForms';
import { navBtn, navBtnSm, navInput, navPrimary, navPrimarySm } from './navigatorUi';
import { NavigatorPendingInput } from './NavigatorParts';

const OTP_TITLE: Record<string, string> = {
  totp: 'Código do app autenticador',
  sms: 'Código recebido por SMS',
  email: 'Código recebido por e-mail',
  unknown: 'Código de verificação',
};

const DETAIL_MESSAGE: Record<string, string> = {
  number: 'Número do cartão inválido.', exp: 'Validade inválida (use MM/AA).', expired: 'Cartão vencido.', cvv: 'CVV inválido.',
  holder: 'Confira o nome do titular.', zip: 'Confira o CEP de cobrança.', no_card: 'Nenhum cartão salvo: preencha o cartão.',
  phone: 'Confira o telefone.', totp_seed: 'A chave do autenticador não é válida.', code_format: 'Código inválido.',
  username: 'Preencha o usuário.', password: 'Preencha a senha.',
};

function useSubmit() {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const submit = async (p: NavigatorPending, answer: NavigatorAuthAnswer, after?: () => void) => {
    setSending(true);
    setError(null);
    const res = await answerNavigatorAuth(p, answer);
    setSending(false);
    after?.();
    if (!res.ok) setError((res.detail && DETAIL_MESSAGE[res.detail]) || res.message || 'Não consegui enviar. Tente de novo.');
    else if (res.saveError) setNotice(res.saveError);
    else if (res.saved?.length) setNotice(`Guardado no Cofre: ${res.saved.join(', ')}`);
  };
  return { sending, error, notice, submit };
}

function Shell({ icon, title, subtitle, compact, children }: { icon: React.ReactNode; title: string; subtitle?: string; compact?: boolean; children: React.ReactNode }) {
  return (
    <section
      className={`space-y-2 rounded-xl border border-primary/40 bg-primary/5 ${compact ? 'p-2.5' : 'p-3'}`}
      data-sentry-mask data-testid="navigator-secure-form" aria-label={title}
    >
      <header className="flex items-start gap-2">
        <span className="mt-0.5 text-primary">{icon}</span>
        <div className="min-w-0">
          <p className={`font-semibold ${compact ? 'text-xs' : 'text-sm'}`}>{title}</p>
          {subtitle && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}
        </div>
      </header>
      {children}
      <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <Lock className="h-3 w-3" aria-hidden /> Vai cifrado direto para o site. A IA nunca vê o valor.
      </p>
    </section>
  );
}

function SaveToggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 text-[11px]">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-3.5 w-3.5 accent-primary" />
      {label}
    </label>
  );
}

/** Cartão do Gmail: conector (OAuth do Google) no lugar da senha no navegador. */
function GmailConnectorOffer({ pending, compact }: { pending: NavigatorPending; compact?: boolean }) {
  const [opened, setOpened] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { sending, submit } = useSubmit();
  const connect = async () => {
    setErr(null);
    // Abre o login do Google numa janela própria: a conversa continua aqui, sem trocar de página.
    const { data, error } = await supabase.functions.invoke('gmail-oauth-start', { body: { returnUrl: '/connectors/gmail', origin: window.location.origin } });
    if (error || !data?.url) {
      setErr('Não consegui iniciar a conexão com o Gmail agora.');
      return;
    }
    window.open(String(data.url), 'vertal-gmail-connect', 'popup,width=520,height=680');
    setOpened(true);
  };
  return (
    <div className="space-y-2 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-2.5">
      <p className="flex items-center gap-1.5 text-xs font-semibold"><Mail className="h-3.5 w-3.5 text-emerald-500" aria-hidden /> Recomendado: conectar o Gmail</p>
      <p className="text-[11px] text-muted-foreground">Leio e resumo seus e-mails pelo conector oficial do Google, sem digitar senha no navegador.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={compact ? navPrimarySm : navPrimary} onClick={() => void connect()}>Conectar Gmail</button>
        {opened && (
          <button type="button" className={compact ? navBtnSm : navBtn} disabled={sending} onClick={() => void submit(pending, { kind: 'connector', connector: 'gmail' })}>
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null} Já conectei — usar o conector
          </button>
        )}
      </div>
      {err && <p className="text-[11px] text-destructive">{err}</p>}
    </div>
  );
}

export function NavigatorLoginForm({ pending, compact = false }: { pending: NavigatorPending; compact?: boolean }) {
  const fields = pending.loginFields?.length ? pending.loginFields : ['username', 'password'];
  const [username, setUsername] = useState(pending.prefillUsername ?? '');
  const [password, setPassword] = useState('');
  const [save, setSave] = useState(true);
  const { sending, error, notice, submit } = useSubmit();
  const domain = pending.domain || pending.host || 'este site';
  const onlyPassword = fields.length === 1 && fields[0] === 'password';
  const title = pending.retry ? `${domain} recusou o login — confira e tente de novo` : onlyPassword ? `Senha de ${domain}` : `Entrar em ${domain}`;
  const ready = fields.every((f) => (f === 'username' ? username.trim() : password));
  const send = () => submit(pending, {
    kind: 'login', save,
    ...(fields.includes('username') ? { username: username.trim() } : {}),
    ...(fields.includes('password') ? { password } : {}),
  }, () => setPassword(''));
  return (
    <Shell icon={<KeyRound className="h-4 w-4" aria-hidden />} title={title} subtitle={pending.host && pending.host !== domain ? pending.host : undefined} compact={compact}>
      {pending.connector === 'gmail' && <GmailConnectorOffer pending={pending} compact={compact} />}
      <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (ready) void send(); }} autoComplete="on">
        {fields.includes('username') && (
          <input className={navInput} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" placeholder="E-mail ou usuário" aria-label="E-mail ou usuário" maxLength={254} autoFocus={!pending.prefillUsername} />
        )}
        {fields.includes('password') && (
          <input className={navInput} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="Senha" aria-label="Senha" maxLength={256} autoFocus={onlyPassword || !!pending.prefillUsername} />
        )}
        <SaveToggle checked={save} onChange={setSave} label={`Guardar no Cofre para ${domain}`} />
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={compact ? navPrimarySm : navPrimary} disabled={sending || !ready}>
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null} {onlyPassword ? 'Continuar' : 'Entrar'}
          </button>
          <button type="button" className={compact ? navBtnSm : navBtn} disabled={sending} onClick={() => void submit(pending, { kind: 'login', cancel: true })}>Cancelar</button>
        </div>
      </form>
      {error && <p className="text-[11px] text-destructive">{error}</p>}
      {notice && <p className="text-[11px] text-emerald-500">{notice}</p>}
    </Shell>
  );
}

export function NavigatorCodeForm({ pending, compact = false }: { pending: NavigatorPending; compact?: boolean }) {
  const kind = pending.otpKind ?? 'unknown';
  const [code, setCode] = useState('');
  const [showSeed, setShowSeed] = useState(false);
  const [seed, setSeed] = useState('');
  const [consent, setConsent] = useState(false);
  const { sending, error, notice, submit } = useSubmit();
  const domain = pending.domain || pending.host || 'este site';
  const useSeed = showSeed && seed.trim() && consent;
  const ready = !!code.trim() || !!useSeed;
  const send = () => submit(pending, {
    kind: 'code', ...(code.trim() ? { value: code.trim() } : {}), ...(useSeed ? { totpSeed: seed.trim(), confirmed: true } : {}),
  }, () => { setCode(''); setSeed(''); });
  return (
    <Shell icon={kind === 'sms' ? <Smartphone className="h-4 w-4" aria-hidden /> : <ShieldCheck className="h-4 w-4" aria-hidden />} title={OTP_TITLE[kind] ?? OTP_TITLE.unknown} subtitle={pending.question || domain} compact={compact}>
      <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (ready) void send(); }}>
        <input className={navInput} value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" placeholder="123456" aria-label="Código de verificação" maxLength={32} autoFocus />
        {kind === 'totp' && (
          <div className="space-y-1.5">
            <SaveToggle checked={showSeed} onChange={setShowSeed} label="Guardar no Cofre a chave do autenticador (os próximos códigos saem sozinhos)" />
            {showSeed && (
              <>
                <input className={navInput} type="password" value={seed} onChange={(e) => setSeed(e.target.value)} autoComplete="off" placeholder="Chave (texto base32) ou otpauth://totp/…" aria-label="Chave do autenticador" maxLength={512} />
                <label className="flex items-start gap-2 text-[11px]">
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-3.5 w-3.5 accent-primary" />
                  Autorizo a Vertal a guardar esta chave cifrada no Cofre, somente para {domain}, e gerar os códigos no servidor.
                </label>
              </>
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={compact ? navPrimarySm : navPrimary} disabled={sending || !ready}>
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null} Enviar código
          </button>
          <button type="button" className={compact ? navBtnSm : navBtn} disabled={sending} onClick={() => void submit(pending, { kind: 'code', cancel: true })}>Cancelar</button>
        </div>
      </form>
      {error && <p className="text-[11px] text-destructive">{error}</p>}
      {notice && <p className="text-[11px] text-emerald-500">{notice}</p>}
    </Shell>
  );
}

export function NavigatorPhoneForm({ pending, compact = false }: { pending: NavigatorPending; compact?: boolean }) {
  const [cc, setCc] = useState('55');
  const [area, setArea] = useState('');
  const [number, setNumber] = useState('');
  const [save, setSave] = useState(false);
  const { sending, error, notice, submit } = useSubmit();
  const domain = pending.domain || pending.host || 'este site';
  const country = PHONE_COUNTRIES.find((c) => c.code === cc) ?? PHONE_COUNTRIES[0];
  const e164 = composePhone(cc, area, number);
  const send = () => e164 && submit(pending, { kind: 'phone', value: e164, save }, () => setNumber(''));
  return (
    <Shell icon={<Phone className="h-4 w-4" aria-hidden />} title={`Telefone para ${domain}`} subtitle={pending.question} compact={compact}>
      <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <div className="flex gap-2">
          <select className={`${navInput} w-36 shrink-0`} value={cc} onChange={(e) => setCc(e.target.value)} aria-label="País">
            {PHONE_COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
          </select>
          {country.areaDigits > 0 && (
            <input className={`${navInput} w-16 shrink-0`} value={area} onChange={(e) => setArea(e.target.value.replace(/\D/g, '').slice(0, 3))} inputMode="numeric" placeholder="DDD" aria-label="DDD" />
          )}
          <input className={navInput} value={number} onChange={(e) => setNumber(e.target.value.replace(/[^\d\s-]/g, '').slice(0, 16))} inputMode="tel" autoComplete="tel-national" placeholder="99999-8888" aria-label="Número" />
        </div>
        {(area || number) && !e164 && <p className="text-[11px] text-amber-500">Confira o DDD e o número.</p>}
        <SaveToggle checked={save} onChange={setSave} label={`Guardar no Cofre para ${domain}`} />
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={compact ? navPrimarySm : navPrimary} disabled={sending || !e164}>
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null} Enviar
          </button>
          <button type="button" className={compact ? navBtnSm : navBtn} disabled={sending} onClick={() => void submit(pending, { kind: 'phone', cancel: true })}>Cancelar</button>
        </div>
      </form>
      {error && <p className="text-[11px] text-destructive">{error}</p>}
      {notice && <p className="text-[11px] text-emerald-500">{notice}</p>}
    </Shell>
  );
}

/** Formatação enquanto digita: 4111 1111 1111 1111 / MM/AA. */
const groupCard = (v: string) => v.replace(/\D/g, '').slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 ');
const formatExp = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
};

export function NavigatorCardForm({ pending, compact = false }: { pending: NavigatorPending; compact?: boolean }) {
  const fields = pending.cardFields ?? ['number'];
  const [number, setNumber] = useState('');
  const [exp, setExp] = useState('');
  const [cvv, setCvv] = useState('');
  const [holder, setHolder] = useState('');
  const [zip, setZip] = useState('');
  const [save, setSave] = useState(true);
  const [saveCvv, setSaveCvv] = useState(false);
  const { sending, error, notice, submit } = useSubmit();
  const domain = pending.domain || pending.host || 'este site';
  const clear = () => { setNumber(''); setCvv(''); setExp(''); };
  if (pending.cvvOnlyFor) {
    return (
      <Shell icon={<CreditCard className="h-4 w-4" aria-hidden />} title={`CVV do ${pending.cvvOnlyFor}`} subtitle={`Pagamento em ${domain}`} compact={compact}>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (/^\d{3,4}$/.test(cvv)) void submit(pending, { kind: 'card', useSaved: true, cvv }, () => setCvv('')); }}>
          <input className={navInput} type="password" inputMode="numeric" autoComplete="cc-csc" value={cvv} onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="CVV" aria-label="CVV" autoFocus />
          <button type="submit" className={compact ? navPrimarySm : navPrimary} disabled={sending || !/^\d{3,4}$/.test(cvv)}>Usar cartão</button>
        </form>
        {error && <p className="text-[11px] text-destructive">{error}</p>}
      </Shell>
    );
  }
  const digits = number.replace(/\D/g, '');
  const ready = digits.length >= 12 && /^\d{2}\/\d{2}$/.test(exp) && holder.trim().length >= 2 && zip.trim().length >= 3 && (!fields.includes('cvv') || /^\d{3,4}$/.test(cvv));
  const title = pending.retry ? 'Precisa de um cartão válido — o site recusou o cartão' : 'Precisa de um cartão válido';
  return (
    <Shell icon={<CreditCard className="h-4 w-4" aria-hidden />} title={title} subtitle={`Pagamento em ${domain}. Preencher o cartão não paga nada: o pagamento ainda pede a sua aprovação.`} compact={compact}>
      <form className="space-y-2" autoComplete="on" onSubmit={(e) => {
        e.preventDefault();
        if (ready) void submit(pending, { kind: 'card', number: digits, exp, ...(cvv ? { cvv } : {}), holder: holder.trim(), zip: zip.trim(), save, saveCvv }, clear);
      }}>
        <input className={navInput} value={number} onChange={(e) => setNumber(groupCard(e.target.value))} inputMode="numeric" autoComplete="cc-number" placeholder="Número do cartão" aria-label="Número do cartão" autoFocus />
        <div className="flex gap-2">
          <input className={navInput} value={exp} onChange={(e) => setExp(formatExp(e.target.value))} inputMode="numeric" autoComplete="cc-exp" placeholder="MM/AA" aria-label="Validade" />
          <input className={navInput} type="password" value={cvv} onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" autoComplete="cc-csc" placeholder="CVV" aria-label="CVV" />
        </div>
        <input className={navInput} value={holder} onChange={(e) => setHolder(e.target.value.slice(0, 80))} autoComplete="cc-name" placeholder="Nome impresso no cartão" aria-label="Titular" />
        <input className={navInput} value={zip} onChange={(e) => setZip(e.target.value.slice(0, 10))} autoComplete="postal-code" placeholder="CEP de cobrança" aria-label="CEP de cobrança" />
        <SaveToggle checked={save} onChange={setSave} label="Guardar no Cofre (carteira) para os próximos pagamentos" />
        {save && <SaveToggle checked={saveCvv} onChange={setSaveCvv} label="Guardar também o CVV (senão peço só o CVV a cada pagamento)" />}
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={compact ? navPrimarySm : navPrimary} disabled={sending || !ready}>
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null} Usar este cartão
          </button>
          <button type="button" className={compact ? navBtnSm : navBtn} disabled={sending} onClick={() => void submit(pending, { kind: 'card', cancel: true })}>Cancelar</button>
        </div>
      </form>
      {error && <p className="text-[11px] text-destructive">{error}</p>}
      {notice && <p className="text-[11px] text-emerald-500">{notice}</p>}
    </Shell>
  );
}

/** Escolhe o cartão certo para o pedido do agente (login, senha, código, telefone, pergunta). */
export function NavigatorRequestCard({ pending, compact = false }: { pending: NavigatorPending; compact?: boolean }) {
  if (pending.kind === 'login') return <NavigatorLoginForm pending={pending} compact={compact} />;
  if (pending.kind === 'code') return <NavigatorCodeForm pending={pending} compact={compact} />;
  if (pending.kind === 'phone') return <NavigatorPhoneForm pending={pending} compact={compact} />;
  if (pending.kind === 'card') return <NavigatorCardForm pending={pending} compact={compact} />;
  if (pending.kind === 'text') return <NavigatorPendingInput pending={pending} compact={compact} />;
  return null;
}
