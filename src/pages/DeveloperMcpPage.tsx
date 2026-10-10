import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import {
  KNOWLEDGE_API_URL,
  KeyApiError,
  listApiKeys,
  createApiKey,
  revokeApiKey,
  type ApiKeyRow,
} from '@/lib/knowledgeApi'
import {
  LOCALE_STORAGE_KEY,
  SUPPORTED_LOCALES,
  getTexts,
  resolveLocale,
  type Locale,
} from '@/i18n/developerMcp'

const LOCALE_NAMES: Record<Locale, string> = { 'pt-BR': 'Português', en: 'English', es: 'Español' }

function errorMessage(err: unknown, t: ReturnType<typeof getTexts>): string {
  if (err instanceof KeyApiError) {
    if (err.code === 'missing_config') return t.apiMissing
    if (err.code === 'limit') return t.errorLimit
    if (err.code === 'forbidden') return t.errorForbidden
  }
  return t.errorGeneric
}

function readSavedLocale(): string | null {
  try {
    return localStorage.getItem(LOCALE_STORAGE_KEY)
  } catch {
    return null
  }
}

function saveLocale(locale: Locale) {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  } catch {
    // Storage blocked: the choice still applies for this visit
  }
}

export default function DeveloperMcpPage() {
  const navigate = useNavigate()
  const [locale, setLocale] = useState<Locale>(() =>
    resolveLocale(readSavedLocale(), typeof navigator !== 'undefined' ? navigator.languages : [])
  )
  const t = getTexts(locale)

  const [token, setToken] = useState<string | null>(null)
  const [keys, setKeys] = useState<ApiKeyRow[]>([])
  const [name, setName] = useState('')
  const [canWrite, setCanWrite] = useState(false)
  const [expiry, setExpiry] = useState<'never' | '30' | '90' | '365'>('never')
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    supabase.auth.getSession().then(async ({ data }) => {
      const accessToken = data.session?.access_token ?? null
      if (cancelled) return
      setToken(accessToken)
      if (!accessToken) return
      try {
        const rows = await listApiKeys(accessToken)
        if (!cancelled) setKeys(rows)
      } catch (err) {
        if (!cancelled) setError(errorMessage(err, t))
      }
    })
    return () => {
      cancelled = true
    }
    // Loads once per visit; the locale only changes the wording of error messages
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const changeLocale = (next: Locale) => {
    saveLocale(next)
    setLocale(next)
  }

  const handleCreate = async () => {
    if (!token || !name.trim()) return
    setBusy(true)
    setError(null)
    setCopied(false)
    try {
      const created = await createApiKey(token, {
        name: name.trim(),
        permissions: canWrite ? ['read', 'write'] : ['read'],
        expires_in_days: expiry === 'never' ? undefined : Number(expiry),
      })
      setCreated(created.key)
      setKeys((prev) => [created, ...prev])
      setName('')
    } catch (err) {
      setError(errorMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  const handleRevoke = async (id: string) => {
    if (!token) return
    setError(null)
    try {
      const updated = await revokeApiKey(token, id)
      setKeys((prev) => prev.map((k) => (k.id === id ? { ...k, status: updated.status } : k)))
    } catch (err) {
      setError(errorMessage(err, t))
    }
  }

  const copyKey = async () => {
    if (!created) return
    try {
      await navigator.clipboard.writeText(created)
      setCopied(true)
    } catch {
      setError(t.errorGeneric)
    }
  }

  const mcpUrl = `${KNOWLEDGE_API_URL ?? 'https://SEU-SERVIDOR'}/api/mcp`
  const configSnippet = JSON.stringify(
    {
      mcpServers: {
        vertal: {
          type: 'http',
          url: mcpUrl,
          headers: { Authorization: 'Key SUA_CHAVE' },
        },
      },
    },
    null,
    2
  )

  const toolKeys = Object.keys(t.tools) as (keyof typeof t.tools)[]

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8" lang={locale}>
      <div className="flex items-center justify-between gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          ←
        </Button>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          {t.languageLabel}
          <select
            className="rounded-md border bg-background px-2 py-1"
            value={locale}
            onChange={(e) => changeLocale(e.target.value as Locale)}
          >
            {SUPPORTED_LOCALES.map((code) => (
              <option key={code} value={code}>
                {LOCALE_NAMES[code]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">{t.title}</h1>
        <p className="text-muted-foreground">{t.intro}</p>
      </header>

      {error && (
        <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          {error}
        </div>
      )}

      {!token ? (
        <Card className="p-6">
          <p>{t.signInNotice}</p>
          <Button className="mt-4" onClick={() => navigate(`/auth?redirect=${encodeURIComponent('/developers/mcp')}`)}>
            {t.signIn}
          </Button>
        </Card>
      ) : (
        <>
          <section className="space-y-4">
            <h2 className="text-xl font-semibold">{t.keysTitle}</h2>
            <Card className="space-y-4 p-6">
              <label className="block space-y-1">
                <span className="text-sm font-medium">{t.keyName}</span>
                <Input
                  value={name}
                  maxLength={60}
                  placeholder={t.keyNamePlaceholder}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={canWrite} onChange={(e) => setCanWrite(e.target.checked)} />
                  {t.permissionWrite}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  {t.expiry}
                  <select
                    className="rounded-md border bg-background px-2 py-1"
                    value={expiry}
                    onChange={(e) => setExpiry(e.target.value as typeof expiry)}
                  >
                    <option value="never">{t.expiryNever}</option>
                    <option value="30">{t.expiry30}</option>
                    <option value="90">{t.expiry90}</option>
                    <option value="365">{t.expiry365}</option>
                  </select>
                </label>
              </div>
              <p className="text-xs text-muted-foreground">{t.permissionRead}</p>

              <Button onClick={handleCreate} disabled={busy || !name.trim()}>
                {busy ? t.creating : t.create}
              </Button>

              {created && (
                <div className="space-y-2 rounded-md border border-primary/40 bg-primary/5 p-4">
                  <p className="font-semibold">{t.keyOnceTitle}</p>
                  <p className="text-sm text-muted-foreground">{t.keyOnceBody}</p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <code className="flex-1 break-all rounded bg-muted p-2 text-sm">{created}</code>
                    <Button variant="outline" onClick={copyKey}>
                      {copied ? t.copied : t.copy}
                    </Button>
                  </div>
                </div>
              )}
            </Card>

            <h3 className="pt-2 font-semibold">{t.yourKeys}</h3>
            {keys.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.noKeys}</p>
            ) : (
              <ul className="divide-y rounded-md border">
                {keys.map((key) => (
                  <li key={key.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                    <div className="space-y-1">
                      <div className="font-medium">{key.name}</div>
                      <div className="font-mono text-xs text-muted-foreground">{key.key_prefix}</div>
                      <div className="text-xs text-muted-foreground">
                        {t.lastUsed}: {key.last_used_at ?? t.never}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={key.status === 'active' ? 'default' : 'secondary'}>
                        {key.status === 'active' ? t.active : t.revoked}
                      </Badge>
                      {key.status === 'active' && (
                        <Button variant="outline" size="sm" onClick={() => handleRevoke(key.id)}>
                          {t.revoke}
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">{t.configTitle}</h2>
            <p className="text-sm text-muted-foreground">{t.configBody}</p>
            <pre className="overflow-x-auto rounded-md bg-muted p-4 text-xs">{configSnippet}</pre>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">{t.toolsTitle}</h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {toolKeys.map((tool) => (
                <li key={tool} className="rounded-md border p-3 text-sm">
                  {t.tools[tool]}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  )
}
