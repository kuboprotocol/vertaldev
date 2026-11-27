import { useState, useEffect } from 'react'
import { Loader2, Copy, Check, Trash2, Plus, ExternalLink, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { supabase } from '@/integrations/supabase/client'

interface Install {
  id: string
  embed_code: string
  domain: string
  description?: string
  status: string
  created_at: string
  last_activity_at?: string
}

interface Stats {
  id: string
  domain: string
  total_clicks: number
  total_signups: number
  total_conversions: number
  conversion_rate: number
  last_activity_at?: string
}

export default function AffiliateInstallsManager() {
  const [installs, setInstalls] = useState<Install[]>([])
  const [stats, setStats] = useState<Stats[]>([])
  const [loading, setLoading] = useState(true)
  const [creatingId, setCreatingId] = useState<string | null>(null)
  const [newDomain, setNewDomain] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [showCode, setShowCode] = useState<string | null>(null)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [installsRes, statsRes] = await Promise.all([
        supabase.functions.invoke('affiliate-installs', {
          body: {},
          method: 'POST',
          headers: { 'X-Action': 'list' },
        }),
        supabase.functions.invoke('affiliate-installs', {
          body: {},
          method: 'POST',
          headers: { 'X-Action': 'stats' },
        }),
      ])

      if (installsRes.error) throw installsRes.error
      if (statsRes.error) throw statsRes.error

      setInstalls(installsRes.data.installs || [])
      setStats(statsRes.data.stats || [])
    } catch (e: any) {
      toast.error(`Error: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateInstall = async () => {
    if (!newDomain.trim()) {
      toast.error('Enter the domain')
      return
    }

    setCreatingId('creating')
    try {
      const { data, error } = await supabase.functions.invoke('affiliate-installs', {
        body: { domain: newDomain, description: newDescription },
        method: 'POST',
        headers: { 'X-Action': 'create' },
      })
      if (error) throw error

      // Verificar se há erro anti-fraude
      if (data.error === 'affiliate_not_allowed') {
        toast.error(`${data.reason}\n${data.details}`)
        return
      }

      if (data.error) {
        toast.error(`Error: ${data.error}`)
        return
      }

      setInstalls([data.install, ...installs])
      setNewDomain('')
      setNewDescription('')
      toast.success('Website added')
    } catch (e: any) {
      toast.error(`Error: ${e.message}`)
    } finally {
      setCreatingId(null)
    }
  }

  const handleCopyCode = async (code: string, type: 'embed' | 'html') => {
    let text = code
    if (type === 'html') {
      text = `<script>
window.__VERTAL_AFFILIATE = {
  code: "${code}",
  domain: "https://vertal.app"
};
</script>
<script src="https://vertal.app/embed/affiliate.js"><\/script>`
    }

    try {
      await navigator.clipboard.writeText(text)
      setCopiedCode(code)
      setTimeout(() => setCopiedCode(null), 2000)
      toast.success('Copied')
    } catch {
      toast.error('We could not copy the code')
    }
  }

  const handleDeleteInstall = async (installId: string) => {
    if (!confirm('Remove this website? Its code will stop tracking.')) return

    try {
      const { error } = await supabase.functions.invoke('affiliate-installs', {
        body: { install_id: installId },
        method: 'POST',
        headers: { 'X-Action': 'delete' },
      })
      if (error) throw error

      setInstalls(installs.filter(i => i.id !== installId))
      toast.success('Website removed')
    } catch (e: any) {
      toast.error(`Error: ${e.message}`)
    }
  }

  const getStatForDomain = (domain: string) => {
    return stats.find(s => s.domain === domain)
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-foreground">Embed installs</h3>
        <p className="text-sm text-muted-foreground">
          Manage the embed codes you add to your websites and blogs. Each website has its own tracking code.
        </p>
      </div>

      <Tabs defaultValue="create" className="space-y-4">
        <TabsList>
          <TabsTrigger value="create">Add a website</TabsTrigger>
          <TabsTrigger value="list">My websites ({installs.length})</TabsTrigger>
        </TabsList>

        {/* Criar novo */}
        <TabsContent value="create">
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle className="text-base">Add a new website</CardTitle>
              <CardDescription>Register a website where you will add the Vertal embed</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="domain" className="text-sm">Domain</Label>
                <Input
                  id="domain"
                  placeholder="example.com (without https://)"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  disabled={creatingId !== null}
                />
                <p className="text-xs text-muted-foreground">Only the domain, without https://</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description" className="text-sm">Description (optional)</Label>
                <Input
                  id="description"
                  placeholder="For example: tech blog, review site"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  disabled={creatingId !== null}
                />
              </div>

              <Button
                onClick={handleCreateInstall}
                disabled={creatingId !== null || !newDomain.trim()}
                className="w-full"
              >
                {creatingId ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Adding…
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Add website
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* List of installs */}
        <TabsContent value="list">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : installs.length === 0 ? (
            <Alert>
              <AlertDescription>
                You have not added a website yet. Add one to start tracking.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-4">
              {installs.map((install) => {
                const stat = getStatForDomain(install.domain)
                return (
                  <Card key={install.id} className={install.status === 'removed' ? 'opacity-50' : ''}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <CardTitle className="text-base">{install.domain}</CardTitle>
                            {install.status !== 'active' && (
                              <Badge variant="secondary">{install.status}</Badge>
                            )}
                          </div>
                          {install.description && (
                            <CardDescription className="mt-1">{install.description}</CardDescription>
                          )}
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-4">
                      {/* Stats */}
                      {stat && (
                        <div className="grid grid-cols-4 gap-3 rounded-lg bg-secondary/30 p-3">
                          <div className="text-center">
                            <p className="text-xs text-muted-foreground">Clicks</p>
                            <p className="text-lg font-semibold">{stat.total_clicks}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-muted-foreground">Sign-ups</p>
                            <p className="text-lg font-semibold">{stat.total_signups}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-muted-foreground">Sales</p>
                            <p className="text-lg font-semibold">{stat.total_conversions}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-muted-foreground">Rate</p>
                            <p className="text-lg font-semibold">{stat.conversion_rate}%</p>
                          </div>
                        </div>
                      )}

                      {/* Embed code */}
                      <div className="space-y-2">
                        <Label className="text-sm flex items-center gap-2">
                          Embed code
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={showCode === install.id ? 'Hide code' : 'Show code'}
                            onClick={() => setShowCode(showCode === install.id ? null : install.id)}
                          >
                            {showCode === install.id ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                        </Label>
                        {showCode === install.id ? (
                          <div className="space-y-2">
                            <div className="rounded-lg bg-muted p-3">
                              <pre className="text-xs font-mono text-muted-foreground overflow-x-auto">
{`<script>
window.__VERTAL_AFFILIATE = {
  code: "${install.embed_code}",
  domain: "https://vertal.app"
};
</script>
<script src="https://vertal.app/embed/affiliate.js"><\/script>`}
                              </pre>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full"
                              onClick={() => handleCopyCode(install.embed_code, 'html')}
                            >
                              {copiedCode === install.embed_code ? (
                                <>
                                  <Check className="h-4 w-4 mr-2" />
                                  Copied
                                </>
                              ) : (
                                <>
                                  <Copy className="h-4 w-4 mr-2" />
                                  Copy the full code
                                </>
                              )}
                            </Button>
                          </div>
                        ) : (
                          <Input
                            value={install.embed_code}
                            readOnly
                            className="text-xs font-mono"
                          />
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2 pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          asChild
                          className="flex-1"
                        >
                          <a
                            href={`https://${install.domain}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="h-4 w-4 mr-2" />
                            Visit
                          </a>
                        </Button>
                        {install.status === 'active' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label="Remove website"
                            onClick={() => handleDeleteInstall(install.id)}
                            className="text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
