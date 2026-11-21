// Cartão do termo de uso (consent gate) dentro do chat: o usuário LÊ o documento e assina
// com nome completo, documento (CPF, passaporte ou documento nacional — pré-preenchido do
// cadastro de compra/Stripe e travado só quando existir e for válido; senão o campo vem VAZIO e
// editável, com validação do CPF pelos dígitos verificadores e do formato do passaporte),
// endereço (pré-preenchido, editável),
// organização opcional e localização: a exata do navegador SÓ com consentimento explícito;
// sem ele, o servidor registra a aproximada pelo IP, marcada como "aproximada".
// O servidor calcula o SHA-256 do documento + dados e carimba no Bitcoin (OpenTimestamps).
import { useEffect, useState } from 'react';
import { FileSignature, Loader2, MapPin, ShieldCheck, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { consentHostMounted, resolveConsent, useConsentRequest } from '@/lib/consent/store';
import { callConsent, type ConsentStatusResponse } from '@/lib/scrape/client';
import { navInput, navPrimary, navBtn } from '@/components/navigator/navigatorUi';
import { documentInputError, formatCpfInput } from '../../../supabase/functions/_shared/consentGate';

type DocType = 'cpf' | 'passport' | 'national_id';
type Geo = { lat: number; lon: number; accuracyM?: number; capturedAt: string } | null;

export const GEO_LGPD_TEXT =
  'Finalidade: registrar onde o termo foi assinado, como prova da assinatura eletrônica (LGPD, art. 7º, I e VI). ' +
  'Usamos a localização só neste registro; ela fica cifrada e só a administração da Vertal acessa, com registro de cada acesso. ' +
  'Se você não autorizar, registramos apenas a localização aproximada pelo seu IP, marcada como "aproximada".';

export function ConsentTermsDialog() {
  const { open } = useConsentRequest();
  const [data, setData] = useState<ConsentStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [docType, setDocType] = useState<DocType>('cpf');
  const [docNumber, setDocNumber] = useState('');
  const [docCountry, setDocCountry] = useState('BR');
  const [addr, setAddr] = useState({ line1: '', line2: '', city: '', region: '', postalCode: '', country: 'BR' });
  const [organization, setOrganization] = useState('');
  const [geoConsent, setGeoConsent] = useState(false);
  const [geo, setGeo] = useState<Geo>(null);
  const [geoMsg, setGeoMsg] = useState('');
  const [read, setRead] = useState(false);
  const [sending, setSending] = useState(false);
  const [docTouched, setDocTouched] = useState(false);

  useEffect(() => {
    consentHostMounted(1);
    return () => consentHostMounted(-1);
  }, []);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    setRead(false);
    setGeo(null);
    setGeoConsent(false);
    setGeoMsg('');
    setDocNumber('');
    setDocTouched(false);
    void callConsent('status', { category: open.category }).then((res) => {
      setLoading(false);
      if (!res.ok) {
        setError(res.message ?? 'Não consegui carregar o termo.');
        return;
      }
      setData(res);
      const p = res.prefill;
      setFullName(p?.fullName ?? '');
      setOrganization(p?.organization ?? '');
      if (p?.document) {
        setDocType(p.document.type as DocType);
        setDocCountry(p.document.country);
      }
      if (p?.address) setAddr({ line1: p.address.line1, line2: p.address.line2 ?? '', city: p.address.city, region: p.address.region ?? '', postalCode: p.address.postalCode ?? '', country: p.address.country });
    });
  }, [open]);

  const locked = !!data?.prefill?.documentLocked;
  // Documento digitado pelo usuário: mesma validação do servidor (CPF com dígitos verificadores; passaporte com formato básico).
  const docError = locked ? null : documentInputError(docType, docNumber, docType === 'cpf' ? 'BR' : docCountry);

  const askGeo = () => {
    if (!geoConsent) return;
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setGeoMsg('Seu navegador não oferece localização; vamos registrar a aproximada pelo IP.');
      return;
    }
    setGeoMsg('Pedindo a localização ao navegador…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({ lat: pos.coords.latitude, lon: pos.coords.longitude, accuracyM: pos.coords.accuracy, capturedAt: new Date(pos.timestamp).toISOString() });
        setGeoMsg('Localização exata registrada para a assinatura.');
      },
      () => {
        setGeo(null);
        setGeoMsg('Localização negada: vamos registrar a aproximada pelo IP, marcada como "aproximada".');
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  const sign = async () => {
    if (!open || !data?.version) return;
    setSending(true);
    setError(null);
    const res = await callConsent('accept', {
      category: open.category, version: data.version, agree: true, fullName,
      // Documento travado: o servidor usa o do cadastro de compra (o número não sai do servidor).
      document: locked ? { type: docType, country: docCountry } : { type: docType, number: docNumber, country: docType === 'cpf' ? 'BR' : docCountry },
      address: addr, organization,
      ...(geoConsent && geo ? { location: { kind: 'precise', consent: true, lat: geo.lat, lon: geo.lon, accuracyM: geo.accuracyM, capturedAt: geo.capturedAt } } : {}),
    });
    setSending(false);
    if (!res.ok) {
      setError(res.detail ? `Confira o campo: ${FIELD_LABEL[res.detail] ?? res.detail}.` : res.message ?? 'Não foi possível assinar.');
      return;
    }
    resolveConsent(true);
  };

  const canSign = read && fullName.trim().split(/\s+/).length >= 2 && (locked || !docError) && addr.line1.trim().length >= 4 && addr.city.trim().length >= 2 && /^[A-Za-z]{2}$/.test(addr.country);

  return (
    <Dialog open={!!open} onOpenChange={(v) => { if (!v) resolveConsent(false); }}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileSignature className="h-5 w-5 text-primary" aria-hidden /> {data?.title ?? open?.title ?? 'Termo de uso'}</DialogTitle>
          <DialogDescription>Leia o termo e assine para seguir. Pedidos proibidos continuam bloqueados mesmo com o termo assinado.</DialogDescription>
        </DialogHeader>
        {loading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Carregando o termo…</p>}
        {data?.document && (
          <div
            className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border/60 bg-muted/30 p-3 text-xs leading-relaxed"
            tabIndex={0} aria-label="Texto do termo" data-testid="consent-document"
          >
            {data.document}
          </div>
        )}
        {data && (
          <form className="grid gap-2 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); if (canSign) void sign(); }}>
            <label className="text-xs sm:col-span-2">Nome completo
              <input className={navInput} value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={120} required />
            </label>
            <label className="text-xs">Documento
              <select className={navInput} value={docType} disabled={locked} onChange={(e) => { setDocType(e.target.value as DocType); setDocNumber(''); setDocTouched(false); }}>
                <option value="cpf">CPF</option>
                <option value="passport">Passaporte</option>
                <option value="national_id">Documento nacional</option>
              </select>
            </label>
            <label className="text-xs">Número
              {locked
                ? <input className={navInput} value={data.prefill?.document?.masked ?? ''} readOnly aria-readonly title="Documento do cadastro da compra do plano" />
                : <input
                    className={navInput} value={docNumber} maxLength={docType === 'cpf' ? 14 : 40} inputMode={docType === 'cpf' ? 'numeric' : 'text'} required
                    placeholder={docType === 'cpf' ? '000.000.000-00' : docType === 'passport' ? 'Ex.: AB123456' : ''}
                    aria-invalid={docTouched && !!docError} aria-describedby="consent-doc-error" data-testid="consent-doc-number"
                    onChange={(e) => setDocNumber(docType === 'cpf' ? formatCpfInput(e.target.value) : e.target.value.toUpperCase())}
                    onBlur={() => setDocTouched(true)}
                  />}
              {!locked && docTouched && docError && <span id="consent-doc-error" role="alert" className="mt-0.5 block text-[11px] text-destructive">{docError}</span>}
              {!locked && !docNumber && <span className="mt-0.5 block text-[11px] text-muted-foreground">Não encontramos o documento no seu cadastro: preencha aqui.</span>}
            </label>
            {docType !== 'cpf' && (
              <label className="text-xs">País emissor (ISO, ex.: PT)
                <input className={navInput} value={docCountry} disabled={locked} onChange={(e) => setDocCountry(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2))} maxLength={2} />
              </label>
            )}
            <label className="text-xs sm:col-span-2">Endereço
              <input className={navInput} value={addr.line1} onChange={(e) => setAddr({ ...addr, line1: e.target.value })} maxLength={160} placeholder="Rua, número" required />
            </label>
            <input className={navInput} aria-label="Complemento" value={addr.line2} onChange={(e) => setAddr({ ...addr, line2: e.target.value })} maxLength={120} placeholder="Complemento" />
            <input className={navInput} aria-label="Cidade" value={addr.city} onChange={(e) => setAddr({ ...addr, city: e.target.value })} maxLength={80} placeholder="Cidade" required />
            <input className={navInput} aria-label="Estado" value={addr.region} onChange={(e) => setAddr({ ...addr, region: e.target.value })} maxLength={60} placeholder="Estado" />
            <input className={navInput} aria-label="CEP" value={addr.postalCode} onChange={(e) => setAddr({ ...addr, postalCode: e.target.value })} maxLength={16} placeholder="CEP" />
            <input className={navInput} aria-label="País" value={addr.country} onChange={(e) => setAddr({ ...addr, country: e.target.value.toUpperCase().slice(0, 2) })} maxLength={2} placeholder="País (BR)" required />
            <label className="text-xs sm:col-span-2">Organização (opcional)
              <input className={navInput} value={organization} onChange={(e) => setOrganization(e.target.value)} maxLength={120} />
            </label>
            <div className="space-y-1 rounded-lg border border-border/60 p-2 text-xs sm:col-span-2">
              <label className="flex items-start gap-2">
                <input type="checkbox" checked={geoConsent} onChange={(e) => { setGeoConsent(e.target.checked); if (!e.target.checked) setGeo(null); }} className="mt-0.5" />
                <span><MapPin className="mr-1 inline h-3.5 w-3.5" aria-hidden />Autorizo usar a localização exata do meu navegador nesta assinatura.</span>
              </label>
              <p className="text-[11px] text-muted-foreground">{GEO_LGPD_TEXT}</p>
              {geoConsent && <button type="button" className={navBtn} onClick={askGeo}>Usar minha localização</button>}
              {geoMsg && <p className="text-[11px]">{geoMsg}</p>}
            </div>
            <label className="flex items-start gap-2 text-xs sm:col-span-2">
              <input type="checkbox" checked={read} onChange={(e) => setRead(e.target.checked)} className="mt-0.5" />
              <span>Li o termo inteiro, entendi e aceito.</span>
            </label>
            {error && <p className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs sm:col-span-2">{error}</p>}
            <DialogFooter className="gap-2 sm:col-span-2 sm:gap-2">
              <button type="button" className={navBtn} onClick={() => resolveConsent(false)}><X className="h-4 w-4" aria-hidden /> Agora não</button>
              <button type="submit" className={navPrimary} disabled={!canSign || sending}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ShieldCheck className="h-4 w-4" aria-hidden />} Li e assino
              </button>
            </DialogFooter>
            <p className="text-[10px] text-muted-foreground sm:col-span-2">
              Ao assinar, registramos nome, documento, endereço, localização, IP, navegador, data e hora (cifrados). O resumo SHA-256 do termo e dos dados vai para o Bitcoin via OpenTimestamps.
            </p>
          </form>
        )}
        {error && !data && <p className="text-sm text-destructive">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}

const FIELD_LABEL: Record<string, string> = { full_name: 'nome completo', document: 'documento', address: 'endereço', version: 'versão do termo (recarregue)', agree: 'aceite', category: 'categoria' };

export default ConsentTermsDialog;
