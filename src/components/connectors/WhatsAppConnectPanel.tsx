import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, ExternalLink, Info, Loader2, Plug, ShieldCheck, Stethoscope, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { callFluxosApps, type FluxosDescribe } from '@/lib/fluxos/apps'
import { useSchedulerUiLang } from '@/lib/chatScheduler/client'
import { FluxosConnectPanel } from '@/components/connectors/FluxosConnectPanel'
import {
  cleanWhatsAppValues, validateWhatsAppToken, waLang, waTestErrorText, WA_UI,
  WHATSAPP_OAUTH_APP, WHATSAPP_TOKEN_APP, type WaField, type WaValues,
} from '@/lib/fluxos/whatsappToken'

interface TestOk { id: string; displayPhoneNumber: string | null; verifiedName: string | null; qualityRating: string | null; wabaName: string | null }

const EMPTY: WaValues = { accessToken: '', phoneNumberId: '', wabaId: '' }
const FIELDS: WaField[] = ['accessToken', 'phoneNumberId', 'wabaId']

/**
 * WhatsApp (Cloud API oficial da Meta) por token: guia, "Testar conexão" e salvar.
 * O login pelo Facebook (Embedded Signup) aparece como "Em breve" até o Vertal ter o app da Meta (FLUXOS_OAUTH_META_*).
 */
export function WhatsAppConnectPanel() {
  const [params] = useSearchParams()
  const uiLang = useSchedulerUiLang()
  const lang = waLang(params.get('lang') || uiLang)
  const t = WA_UI[lang]

  const [tokenInfo, setTokenInfo] = useState<FluxosDescribe | null>(null)
  const [oauthInfo, setOauthInfo] = useState<FluxosDescribe | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [tab, setTab] = useState<'token' | 'oauth'>('token')
  const [values, setValues] = useState<WaValues>(EMPTY)
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState<'test' | 'save' | 'disconnect' | null>(null)
  const [testOk, setTestOk] = useState<TestOk | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [tok, oa] = await Promise.all([
      callFluxosApps<FluxosDescribe>({ op: 'describe', app: WHATSAPP_TOKEN_APP }),
      callFluxosApps<FluxosDescribe>({ op: 'describe', app: WHATSAPP_OAUTH_APP }),
    ])
    if (tok.ok && tok.data) { setTokenInfo(tok.data); setLoadError(null) } else setLoadError(tok.message)
    setOauthInfo(oa.ok && oa.data ? oa.data : null)
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const fieldErrors = touched ? validateWhatsAppToken(values) : {}
  const oauthReady = !!oauthInfo?.app.oauth && oauthInfo.platformClient === true
  const tokenConnected = tokenInfo?.connection?.status === 'connected'
  const oauthConnected = oauthInfo?.connection?.status === 'connected'
  const connected = tokenConnected || oauthConnected
  const showForm = !tokenConnected || editing

  const set = (k: WaField, v: string) => {
    setValues((s) => ({ ...s, [k]: v }))
    setTestOk(null)
    setError(null)
  }

  const validOrStop = (): boolean => {
    setTouched(true)
    return Object.keys(validateWhatsAppToken(values)).length === 0
  }

  const test = async () => {
    if (!validOrStop()) return
    setBusy('test')
    setError(null)
    setTestOk(null)
    const res = await callFluxosApps<{ ok: true; result: TestOk }>({ op: 'test', app: WHATSAPP_TOKEN_APP, fields: cleanWhatsAppValues(values) })
    setBusy(null)
    if (res.ok && res.data?.result) setTestOk(res.data.result)
    else setError(waTestErrorText(lang, res.code, res.hint))
  }

  const save = async () => {
    if (!validOrStop()) return
    setBusy('save')
    setError(null)
    const res = await callFluxosApps({ op: 'start', app: WHATSAPP_TOKEN_APP, fields: cleanWhatsAppValues(values) })
    setBusy(null)
    if (!res.ok) { setError(res.message || t.testErrors.generic); return }
    toast.success(t.saved)
    setValues(EMPTY)
    setTouched(false)
    setTestOk(null)
    setEditing(false)
    void load()
  }

  const disconnect = async () => {
    setBusy('disconnect')
    const res = await callFluxosApps({ op: 'disconnect', app: WHATSAPP_TOKEN_APP })
    setBusy(null)
    if (!res.ok) { toast.error(res.message); return }
    toast.success(t.disconnected)
    void load()
  }

  if (loading) {
    return <Card className="p-6 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> WhatsApp…</Card>
  }

  const testName = testOk ? [testOk.verifiedName, testOk.displayPhoneNumber].filter(Boolean).join(' · ') || testOk.id : ''

  return (
    <div className="space-y-4" data-testid="whatsapp-connect-panel">
      <Card className="p-6 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Plug className="w-4 h-4 text-primary" />
            <h2 className="font-semibold">{t.title}</h2>
          </div>
          {connected
            ? <Badge className="gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> {t.connected}</Badge>
            : <Badge variant="outline">{t.notConnected}</Badge>}
        </div>

        <div className="flex flex-wrap gap-2" role="tablist">
          <Button role="tab" aria-selected={tab === 'token'} size="sm" variant={tab === 'token' ? 'default' : 'outline'} onClick={() => setTab('token')}>
            {t.tabToken}
          </Button>
          <Button role="tab" aria-selected={tab === 'oauth'} size="sm" variant={tab === 'oauth' ? 'default' : 'outline'} onClick={() => setTab('oauth')} disabled={!oauthReady && !oauthConnected}>
            {t.tabOAuth}
            {!oauthReady && !oauthConnected && <Badge variant="outline" className="ml-2 text-[10px]">{t.soon}</Badge>}
          </Button>
        </div>

        {tab === 'oauth' && (oauthReady || oauthConnected) ? (
          <FluxosConnectPanel app={WHATSAPP_OAUTH_APP} name="WhatsApp" />
        ) : (
          <div className="space-y-4">
            {!oauthReady && <p className="text-xs text-muted-foreground">{t.oauthSoon}</p>}
            {loadError && <p className="text-sm text-destructive">{loadError}</p>}

            {tokenConnected && !editing && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {t.account}: <span className="text-foreground font-medium">{tokenInfo?.connection?.screen_name ?? 'WhatsApp'}</span>
                </p>
                <p className="text-sm text-muted-foreground">{t.canDo}</p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={disconnect} disabled={busy !== null}>
                    {busy === 'disconnect' ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />} {t.disconnect}
                  </Button>
                  <Button variant="ghost" onClick={() => setEditing(true)} disabled={busy !== null}>{t.replace}</Button>
                </div>
              </div>
            )}

            {showForm && !loadError && (
              <form className="space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); void save() }}>
                <p className="text-sm text-muted-foreground">{t.intro}</p>
                {FIELDS.map((k) => {
                  const f = t.fields[k]
                  const err = fieldErrors[k]
                  return (
                    <div key={k} className="space-y-1.5">
                      <Label htmlFor={`wa-${k}`}>
                        {f.label}{k === 'wabaId' ? <span className="text-muted-foreground font-normal"> ({t.optional})</span> : ' *'}
                      </Label>
                      <Input
                        id={`wa-${k}`}
                        name={k}
                        type={k === 'accessToken' ? 'password' : 'text'}
                        inputMode={k === 'accessToken' ? undefined : 'numeric'}
                        autoComplete="off"
                        spellCheck={false}
                        placeholder={f.placeholder}
                        value={values[k]}
                        aria-invalid={!!err}
                        aria-describedby={`wa-${k}-help`}
                        onChange={(e) => set(k, e.target.value)}
                      />
                      {err
                        ? <p id={`wa-${k}-help`} className="text-xs text-destructive" role="alert">{t.errors[err]}</p>
                        : <p id={`wa-${k}-help`} className="text-xs text-muted-foreground">{f.help}</p>}
                    </div>
                  )
                })}

                {testOk && (
                  <p className="text-sm text-emerald-400 flex items-center gap-2" data-testid="wa-test-ok">
                    <CheckCircle2 className="w-4 h-4" /> {t.testOk(testName)}{testOk.wabaName ? ` (${testOk.wabaName})` : ''}
                  </p>
                )}
                {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={test} disabled={busy !== null}>
                    {busy === 'test' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Stethoscope className="w-4 h-4" />}
                    {busy === 'test' ? t.testing : t.test}
                  </Button>
                  <Button type="submit" disabled={busy !== null}>
                    {busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />}
                    {busy === 'save' ? t.saving : t.save}
                  </Button>
                  {editing && <Button type="button" variant="ghost" onClick={() => { setEditing(false); setValues(EMPTY); setTouched(false); setError(null) }}>×</Button>}
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> {t.securityNote}</p>
              </form>
            )}
          </div>
        )}
      </Card>

      <Card className="p-6 space-y-4">
        <h3 className="font-semibold text-sm">{t.guideTitle}</h3>
        <ol className="space-y-3 text-sm">
          {t.steps.map((s, i) => (
            <li key={s.title} className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-primary/15 text-primary text-xs flex items-center justify-center font-semibold">{i + 1}</span>
              <div className="space-y-1">
                <p className="font-medium">{s.title}</p>
                <p className="text-muted-foreground">{s.body}</p>
                {s.link && (
                  <a href={s.link.href} target="_blank" rel="noopener noreferrer" className="text-primary text-xs inline-flex items-center gap-1 hover:underline">
                    {s.link.label} <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </li>
          ))}
        </ol>
        <div className="space-y-2 border-t border-border pt-3 text-xs text-muted-foreground">
          <p className="flex gap-2"><Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" /> {t.testNumberNote}</p>
          <p className="flex gap-2"><Info className="w-3.5 h-3.5 shrink-0 mt-0.5" /> <span>{t.pricingNote.text} <a href={t.pricingNote.link} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">developers.facebook.com/docs/whatsapp/pricing</a></span></p>
          <p className="flex gap-2"><Info className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {t.inboundNote}</p>
        </div>
      </Card>
    </div>
  )
}

export default WhatsAppConnectPanel
