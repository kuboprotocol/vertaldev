import { useCallback, useEffect, useState } from 'react'
import { Brain, Loader2, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

type Kind = 'preference' | 'constraint' | 'architecture' | 'design' | 'integration' | 'decision' | 'note'

interface Memory {
  id: string
  scope: 'user' | 'project'
  kind: Kind
  content: string
  project_id: string | null
  source: 'user' | 'agent'
  created_at: string
}

const TABLE = 'prime_memories' as never

const KIND_LABEL: Record<Kind, string> = {
  preference: 'Preferência',
  constraint: 'Restrição',
  architecture: 'Arquitetura',
  design: 'Design',
  integration: 'Integração',
  decision: 'Decisão',
  note: 'Nota',
}

/**
 * Memória do Prime: o que o agente lembra sobre o usuário (vale para todos
 * os projetos) e sobre o projeto aberto. O agente também grava sozinho as
 * frases explícitas do chat ("sempre…", "prefiro…", "nunca use…").
 */
export function VibePrimeMemoryPanel({ projectId }: { projectId?: string }) {
  const { user } = useAuth()
  const [memories, setMemories] = useState<Memory[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [kind, setKind] = useState<Kind>('preference')
  const [forProject, setForProject] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    let query = supabase
      .from(TABLE)
      .select('id, scope, kind, content, project_id, source, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100)
    query = projectId ? query.or(`project_id.is.null,project_id.eq.${projectId}`) : query.is('project_id', null)
    const { data, error } = await query
    if (error) toast.error('Não foi possível carregar a memória.')
    setMemories(((data ?? []) as unknown) as Memory[])
    setLoading(false)
  }, [user, projectId])

  useEffect(() => {
    void load()
  }, [load])

  const add = async () => {
    const content = draft.trim()
    if (!user || content.length < 3 || saving) return
    setSaving(true)
    const scope = forProject && projectId ? 'project' : 'user'
    const { error } = await supabase.from(TABLE).insert({
      user_id: user.id,
      project_id: scope === 'project' ? projectId : null,
      scope,
      kind,
      content: content.slice(0, 500),
      source: 'user',
    } as never)
    setSaving(false)
    if (error) {
      toast.error(error.code === '23505' ? 'Essa memória já existe.' : 'Não foi possível salvar.')
      return
    }
    setDraft('')
    toast.success('O Prime vai lembrar disso.')
    void load()
  }

  const remove = async (id: string) => {
    const { error } = await supabase.from(TABLE).delete().eq('id', id)
    if (error) {
      toast.error('Não foi possível apagar.')
      return
    }
    setMemories((prev) => prev.filter((m) => m.id !== id))
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Brain className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Memória do Prime</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        O Prime usa estas memórias em todo pedido. Diga no chat &quot;sempre…&quot;, &quot;prefiro…&quot;,
        &quot;nunca use…&quot; ou &quot;este projeto usa…&quot; e ele grava sozinho.
      </p>

      <div className="rounded-2xl border border-border/40 bg-card/20 p-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void add()}
            placeholder="Ex.: Prefiro layout minimalista"
            maxLength={500}
          />
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as Kind)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            aria-label="Tipo de memória"
          >
            {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
              <option key={k} value={k}>{KIND_LABEL[k]}</option>
            ))}
          </select>
          <Button onClick={() => void add()} disabled={saving || draft.trim().length < 3} className="gap-1">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Lembrar
          </Button>
        </div>
        {projectId && (
          <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={forProject} onChange={(e) => setForProject(e.target.checked)} />
            Só para este projeto
          </label>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/40 bg-card/20">
        {loading ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Carregando…</p>
        ) : memories.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            O Prime ainda não tem memórias. Conte suas preferências e ele não esquece.
          </p>
        ) : (
          <ul className="divide-y divide-border/30">
            {memories.map((m) => (
              <li key={m.id} className="flex items-start gap-3 px-4 py-3 text-sm">
                <div className="flex shrink-0 flex-col gap-1">
                  <Badge variant="outline" className={cn('text-[10px]', m.kind === 'constraint' && 'border-destructive/50 text-destructive')}>
                    {KIND_LABEL[m.kind]}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">{m.scope === 'project' ? 'Projeto' : 'Você'}</Badge>
                </div>
                <span className="flex-1">{m.content}</span>
                <Button variant="ghost" size="icon" onClick={() => void remove(m.id)} aria-label="Apagar memória">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
