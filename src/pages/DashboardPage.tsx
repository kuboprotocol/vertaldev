import AnimatedLogo from '@/components/branding/AnimatedLogo'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useState, useEffect, forwardRef } from 'react'
import { Button } from '@/components/ui/button'
import { Plus, FileText, Trash2, LogOut, Code, Pencil, UserCircle, Search, MoreHorizontal, Zap, Globe, BarChart3, CreditCard, Gift, Mail, BookOpen } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { motion } from 'framer-motion'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { useSubscription } from '@/hooks/useSubscription'
import { toast } from 'sonner'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Progress } from '@/components/ui/progress'
import { PromoCards } from '@/components/dashboard/PromoCards'
import CreditLedger from '@/components/CreditLedger'
import { VibePayPromo } from '@/components/vibepay/VibePayPromo'
import { Gamepad2, Sparkles, Palette, Bot, NotebookPen, Mic2, Wallet } from 'lucide-react'
import { useCreativeEconomyEntry } from '@/components/creative/CreativeEconomyComingSoon'
import { SITE_FONT, siteRoot } from '@/components/site/siteUi'

interface Project {
  id: string
  title: string
  description: string | null
  generated_code: string | null
  updated_at: string
  is_published: boolean
}

const DashboardPage = forwardRef<HTMLDivElement, any>((props, ref) => {


  const navigate = useNavigate()
  const { open: openCreativeEconomy, dialog: creativeEconomyDialog } = useCreativeEconomyEntry()
  const { user, signOut } = useAuth()
  const { subscription, loading: subLoading, editsRemaining } = useSubscription()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [renameProject, setRenameProject] = useState<Project | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [search, setSearch] = useState('')

  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(() => {
    if (searchParams.get('checkout') === 'success') {
      const plan = searchParams.get('plan') || ''
      const period = searchParams.get('period') || ''
      const planLabel = plan.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      const periodLabel = period === 'monthly' ? 'Monthly' : period === 'annual' ? 'Yearly' : 'Lifetime'
      toast.success(`Your ${planLabel} plan is active.`, {
        description: `Your credits are ready to use. Billing period: ${periodLabel}.`,
        duration: 8000,
      })
      setSearchParams({})
    }
    if (searchParams.get('checkout') === 'cancelled') {
      toast.info('Checkout canceled. You can subscribe at any time.')
      setSearchParams({})
    }
  }, [searchParams, setSearchParams])

  useEffect(() => { loadProjects() }, [])

  const loadProjects = async () => {
    const { data, error } = await supabase
      .from('projects')
      .select('id, title, description, generated_code, updated_at, is_published')
      .order('updated_at', { ascending: false })
    if (error) { toast.error('We could not load your projects'); console.error(error) }
    else setProjects(data || [])
    setLoading(false)
  }

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('projects').delete().eq('id', id)
    if (error) toast.error('We could not delete the project')
    else setProjects(prev => prev.filter(p => p.id !== id))
  }

  const handleRename = async () => {
    if (!renameProject || !newTitle.trim()) return
    const { error } = await supabase.from('projects').update({ title: newTitle.trim() }).eq('id', renameProject.id)
    if (error) toast.error('We could not rename the project')
    else {
      setProjects(prev => prev.map(p => p.id === renameProject.id ? { ...p, title: newTitle.trim() } : p))
      toast.success('Project renamed')
    }
    setRenameProject(null)
  }

  const handleSignOut = async () => { await signOut(); navigate('/') }

  const filtered = projects.filter(p => p.title.toLowerCase().includes(search.toLowerCase()))
  const publishedCount = projects.filter(p => p.is_published).length
  const withCodeCount = projects.filter(p => p.generated_code).length
  const usagePercent = subscription ? Math.round((subscription.edits_used / subscription.edits_limit) * 100) : 0

  return (
    <div ref={ref} style={SITE_FONT} className={`min-h-screen relative ${siteRoot}`}>
      {creativeEconomyDialog}

      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-background/70 backdrop-blur-xl backdrop-saturate-150">
        <div className="max-w-6xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 shrink-0">
            <AnimatedLogo size={17} />
          </div>
          {/* Horizontal swipe carousel: scrolls both ways when the row does not fit. */}
          <div className="nav-carousel flex-1">
            <Button variant="ghost" size="sm" onClick={() => navigate('/docs')} className="rounded-xl gap-2 text-muted-foreground hover:text-foreground">
              <BookOpen className="h-4 w-4" /> Docs
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate('/pwa/telemetry')} className="rounded-xl gap-2 text-muted-foreground hover:text-foreground">
              <BarChart3 className="h-4 w-4" /> PWA audit
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate('/emails')} className="rounded-xl gap-2 text-muted-foreground hover:text-foreground">
              <Mail className="h-4 w-4" /> Emails
            </Button>

            <Button variant="outline" size="sm" onClick={openCreativeEconomy} className="rounded-xl gap-2 border-primary/30 text-primary hover:bg-primary/10">
              <Palette className="h-4 w-4" /> Creative economy
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/vibe-agents')} className="rounded-xl gap-2 border-primary/30 text-primary hover:bg-primary/10">
              <Bot className="h-4 w-4" /> Vibe Agents
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/recompensas')} className="rounded-xl gap-2 border-primary/20 text-primary hover:bg-primary/10">
              <Gift className="h-4 w-4" /> Earn credits
            </Button>
            <Button variant="hero" size="sm" onClick={() => navigate('/builder')} className="rounded-xl gap-2">
              <Plus className="h-4 w-4" /> New project
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/pay')} title="Vertal Vibe Pay" aria-label="Vertal Vibe Pay" className="rounded-xl gap-2 border-violet-400/40 text-violet-200 hover:bg-violet-500/10">
              <Wallet className="h-4 w-4" /> Vibe Pay
            </Button>
            <Button variant="ghost" size="icon" onClick={() => navigate('/profile')} title="Profile" aria-label="Profile" className="rounded-xl text-muted-foreground hover:text-foreground">
              <UserCircle className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleSignOut} title="Sign out" aria-label="Sign out" className="rounded-xl text-muted-foreground hover:text-foreground">
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 md:px-6 py-10 relative z-10">
        {/* Stats Cards */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          <div className="rounded-2xl border border-white/[0.06] bg-card/50 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <FileText className="h-4 w-4 text-primary" />
              </div>
              <span className="text-xs text-muted-foreground">Projects</span>
            </div>
            <p className="text-2xl font-semibold tracking-[-0.02em] text-foreground">{projects.length}</p>
          </div>
          <div className="rounded-2xl border border-white/[0.06] bg-card/50 p-4">
            <div className="flex items-center gap-2 mb-2">
            <div className="h-8 w-8 rounded-lg bg-accent/50 flex items-center justify-center">
                <Globe className="h-4 w-4 text-accent-foreground" />
              </div>
              <span className="text-xs text-muted-foreground">Published</span>
            </div>
            <p className="text-2xl font-semibold tracking-[-0.02em] text-foreground">{publishedCount}</p>
          </div>
          <div className="rounded-2xl border border-white/[0.06] bg-card/50 p-4">
            <div className="flex items-center gap-2 mb-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Zap className="h-4 w-4 text-primary" />
              </div>
              <span className="text-xs text-muted-foreground">Credits</span>
            </div>
            <p className="text-2xl font-semibold tracking-[-0.02em] text-foreground">{editsRemaining ?? '…'}</p>
            {subscription && (
              <Progress value={usagePercent} className="mt-2 h-1.5" />
            )}
          </div>
          <div className="rounded-2xl border border-white/[0.06] bg-card/50 p-4 cursor-pointer hover:border-primary/30 transition-colors" onClick={() => navigate('/pricing')}>
            <div className="flex items-center gap-2 mb-2">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <CreditCard className="h-4 w-4 text-primary" />
              </div>
              <span className="text-xs text-muted-foreground">Plan</span>
            </div>
            <p className="text-lg font-semibold text-foreground capitalize">{subscription?.plan ?? 'None'}</p>
            <p className="text-[11px] text-primary mt-1">Upgrade</p>
          </div>
        </motion.div>

        {/* Vertal Vibe Pay promo */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.02 }} className="mb-8">
          <VibePayPromo />
        </motion.div>

        {/* Promo Cards */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 }}>
          <PromoCards />
        </motion.div>

        {/* Creative Economy + Quantum Engine entries */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }}
          className="grid lg:grid-cols-[1fr_1fr_360px] gap-4 mb-8 mt-6">
          <div
            onClick={openCreativeEconomy}
            className="rounded-2xl border border-white/[0.06] transition-colors hover:border-white/[0.14] p-6 cursor-pointer relative overflow-hidden group bg-gradient-to-br from-primary/10 via-background to-accent/10"
          >
                        <div className="relative z-10 flex items-start justify-between h-full">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-3">
                  <Palette className="w-5 h-5 text-primary" />
                  <span className="text-xs tracking-[0.3em] text-muted-foreground">VERTAL CREATIVE STUDIO</span>
                </div>
                <h3 className="text-2xl font-semibold tracking-[-0.015em] mb-2">
                  Creative economy <span className="text-primary">dashboard</span>
                </h3>
                <p className="text-sm text-muted-foreground max-w-md mb-4">
                  AI chat · Images (Nano Banana) · Downloader · Clips · Avatar · Shorts · Music (Suno) · Ebooks · EMO Animate
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {['Chat', 'Image', 'Video', 'Music', 'Ebook', '+4'].map((t) => (
                    <span key={t} className="text-[10px] px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20 font-mono">{t}</span>
                  ))}
                </div>
              </div>
              <Sparkles className="w-8 h-8 text-primary opacity-60 group-hover:opacity-100 group-hover:scale-110 transition-all" />
            </div>
          </div>
          <div
            onClick={() => navigate('/game')}
            className="rounded-2xl border border-white/[0.06] transition-colors hover:border-white/[0.14] p-6 cursor-pointer gradient-aurora animate-aurora-shift relative overflow-hidden group"
          >
            <div className="relative z-10 flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Gamepad2 className="w-5 h-5 text-primary" />
                  <span className="text-xs tracking-[0.3em] text-muted-foreground">VERTAL QUANTUM ENGINE</span>
                </div>
                <h3 className="text-2xl font-semibold tracking-[-0.015em] mb-2">
                  Build <span className="text-primary">living worlds</span> with AI
                </h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  Procedural worlds · NPCs with memory · ECS · WebGL/Three.js · Safe WGSL sandbox
                </p>
              </div>
              <Sparkles className="w-8 h-8 text-primary opacity-60 group-hover:opacity-100 group-hover:scale-110 transition-all" />
            </div>
          </div>
          {user && <CreditLedger userId={user.id} />}
        </motion.div>

        {/* Promo banner: Vertal Notebook (Creative panel) */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.042 }} className="mb-8">
          <div
            onClick={() => navigate('/creative/notebook')}
            role="link"
            tabIndex={0}
            aria-label="Open Vertal Notebook"
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/creative/notebook') } }}
            className="rounded-2xl border border-white/[0.06] transition-colors hover:border-white/[0.14] p-6 md:p-8 cursor-pointer relative overflow-hidden group border border-amber-300/20 bg-gradient-to-br from-orange-500/20 via-background to-violet-600/20"
          >
                        <div className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full bg-orange-500/25 blur-3xl transition-opacity group-hover:opacity-80" />
            <div className="pointer-events-none absolute -bottom-28 left-1/3 h-56 w-56 rounded-full bg-violet-600/25 blur-3xl" />
            <div className="relative z-10 grid gap-6 md:grid-cols-[1fr_minmax(240px,320px)] md:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <NotebookPen className="w-5 h-5 text-amber-300" />
                  <span className="text-xs tracking-[0.3em] text-muted-foreground">VERTAL NOTEBOOK</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-200 border border-rose-300/40 font-mono animate-pulse">NEW</span>
                </div>
                <h3 className="text-2xl md:text-3xl font-semibold tracking-[-0.02em] mb-2">
                  Now you can <span className="text-primary">talk with your PDFs</span>
                </h3>
                <p className="text-sm text-muted-foreground max-w-xl mb-4">
                  Add PDFs, links, YouTube videos and notes. KUBO AI answers with the source of each sentence,
                  turns everything into a podcast with up to 4 voices, and makes flashcards, quizzes and mind maps. Creating notebooks is free.
                </p>
                <div className="flex flex-wrap gap-1.5 mb-5">
                  {['Chat with sources', 'AI podcast', 'Flashcards', 'Quiz', 'Mind map', 'PDF · Word · YouTube'].map((t) => (
                    <span key={t} className="text-[10px] px-2 py-0.5 rounded-md bg-amber-400/10 text-amber-100 border border-amber-300/20 font-mono">{t}</span>
                  ))}
                </div>
                <Button className="rounded-xl gap-2 bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 text-white hover:opacity-90 font-semibold shadow-lg shadow-orange-500/30">
                  <Sparkles className="w-4 h-4" /> Create a free notebook
                </Button>
              </div>
              {/* Product preview: question, answer with sources and podcast */}
              <div aria-hidden className="rounded-2xl border border-white/10 bg-black/40 p-4 backdrop-blur-md shadow-2xl transition-transform duration-500 group-hover:-translate-y-1 group-hover:rotate-[-1deg]">
                <div className="ml-auto mb-3 w-fit max-w-[85%] rounded-2xl rounded-br-md bg-gradient-to-br from-amber-400 to-orange-500 px-3 py-1.5 text-xs font-medium text-slate-950">
                  Summarize the whitepaper in 3 points
                </div>
                <div className="rounded-2xl rounded-bl-md border border-white/10 bg-white/5 px-3 py-2 text-[11px] leading-relaxed text-slate-200">
                  Lower issuance in each epoch <span className="mx-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-400/20 text-[9px] text-amber-200 ring-1 ring-amber-300/40">1</span>,
                  burning of marketplace fees <span className="mx-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-400/20 text-[9px] text-amber-200 ring-1 ring-amber-300/40">2</span>
                  and 12-month vesting <span className="mx-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-400/20 text-[9px] text-amber-200 ring-1 ring-amber-300/40">3</span>.
                </div>
                <div className="mt-3 flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-slate-950">
                    <Mic2 className="h-4 w-4" />
                  </span>
                  <div className="flex h-6 flex-1 items-end gap-[3px]">
                    {[40, 75, 55, 90, 35, 65, 85, 50, 70, 30, 60, 80, 45, 95, 55, 40].map((h, i) => (
                      <span
                        key={i}
                        className="w-full rounded-full bg-gradient-to-t from-orange-500 to-amber-200 animate-pulse"
                        style={{ height: `${h}%`, animationDelay: `${i * 90}ms` }}
                      />
                    ))}
                  </div>
                  <span className="text-[10px] text-slate-400">Lia · Rafa</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Promo banner: Premium design (Creative panel) */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.045 }} className="mb-8">
          <div
            onClick={() => navigate('/creative/design')}
            role="link"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') navigate('/creative/design') }}
            className="rounded-2xl border border-white/[0.06] transition-colors hover:border-white/[0.14] p-6 md:p-8 cursor-pointer relative overflow-hidden group bg-gradient-to-r from-amber-400/15 via-background to-rose-500/15"
          >
                        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-3">
                  <Palette className="w-5 h-5 text-amber-300" />
                  <span className="text-xs tracking-[0.3em] text-muted-foreground">PREMIUM DESIGN</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-400/15 text-amber-300 border border-amber-300/30 font-mono">NEW</span>
                </div>
                <h3 className="text-2xl md:text-3xl font-semibold tracking-[-0.02em] mb-2">
                  <span className="text-primary">Professional</span> designs in seconds
                </h3>
                <p className="text-sm text-muted-foreground max-w-xl">
                  Posts, stories, banners and posters with agency-style art direction. Simple costs 1 credit, Premium costs 2 credits.
                </p>
              </div>
              <Button className="rounded-xl gap-2 bg-gradient-to-r from-amber-400 to-rose-500 text-slate-900 hover:opacity-90 font-semibold">
                <Sparkles className="w-4 h-4" /> Create a design
              </Button>
            </div>
          </div>
        </motion.div>

        {/* Promo banner: free Vertal Office (Creative panel) */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.048 }} className="mb-8">
          <div
            onClick={() => navigate('/creative/office')}
            role="link"
            tabIndex={0}
            aria-label="Open the free Vertal Office"
            onKeyDown={(e) => { if (e.key === 'Enter') navigate('/creative/office') }}
            className="rounded-2xl border border-white/[0.06] transition-colors hover:border-white/[0.14] p-6 md:p-8 cursor-pointer relative overflow-hidden group bg-gradient-to-r from-violet-500/15 via-background to-fuchsia-500/15"
          >
                        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="w-5 h-5 text-violet-300" />
                  <span className="text-xs tracking-[0.3em] text-muted-foreground">VERTAL OFFICE</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-400/15 text-emerald-300 border border-emerald-300/30 font-mono">FREE</span>
                </div>
                <h3 className="text-2xl md:text-3xl font-semibold tracking-[-0.02em] mb-2">
                  A full office suite, <span className="text-primary">free of charge</span>
                </h3>
                <p className="text-sm text-muted-foreground max-w-xl mb-4">
                  Write documents and build spreadsheets in your browser, with nothing to install and no subscription.
                  Download them as Word and Excel files or send them by email. Short on time? The AI writes for you for 1 credit.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {['Documents', 'Spreadsheets', 'Word (.docx)', 'Excel (.xlsx)', 'Send by email'].map((t) => (
                    <span key={t} className="text-[10px] px-2 py-0.5 rounded-md bg-violet-400/10 text-violet-200 border border-violet-300/20 font-mono">{t}</span>
                  ))}
                </div>
              </div>
              <Button className="rounded-xl gap-2 bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white hover:opacity-90 font-semibold">
                <FileText className="w-4 h-4" /> Use it for free
              </Button>
            </div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-[-0.02em] text-foreground mb-1">Your projects</h1>
              <p className="text-muted-foreground text-[15px]">Open a project to keep working on it.</p>
            </div>
            {projects.length > 0 && (
              <div className="relative w-64">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search projects"
                  aria-label="Search projects" value={search} onChange={e => setSearch(e.target.value)}
                  className="pl-10 h-10 rounded-full bg-white/[0.04] border-white/[0.08] focus-visible:ring-primary/30" />
              </div>
            )}
          </div>
        </motion.div>

        {loading ? (
          <div className="text-center py-20 text-muted-foreground">Loading…</div>
        ) : projects.length === 0 ? (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center py-24">
            <div className="rounded-3xl border border-white/[0.06] bg-card/50 p-12 max-w-md mx-auto">
              <div className="h-16 w-16 rounded-2xl bg-primary/15 flex items-center justify-center mx-auto mb-6">
                <FileText className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-2xl font-semibold tracking-[-0.015em] text-foreground mb-2">No projects yet</h2>
              <p className="text-muted-foreground text-[15px] mb-8">Create your first project to start building.</p>
              <Button size="lg" onClick={() => navigate('/builder')} className="rounded-full gap-2">
                <Plus className="h-4 w-4" /> Create your first project
              </Button>
            </div>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((project, index) => (
              <motion.div key={project.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }}>
                <div className="group cursor-pointer rounded-2xl border border-white/[0.06] bg-card/50 p-5 transition-colors duration-200 hover:border-white/[0.14] hover:bg-card/70"
                  onClick={() => navigate(`/builder/${project.id}`)}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground truncate text-[15px]">{project.title}</h3>
                      {project.description && <p className="text-xs text-muted-foreground mt-1 truncate">{project.description}</p>}
                      <div className="flex items-center gap-2 mt-3">
                        {project.is_published && (
                          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg bg-accent/50 text-accent-foreground font-medium">
                            <Globe className="h-2.5 w-2.5" /> Published
                          </span>
                        )}
                        {project.generated_code && !project.is_published && (
                          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg bg-accent/80 text-accent-foreground font-medium">
                            <Code className="h-2.5 w-2.5" /> Has code
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(project.updated_at).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-all"
                          onClick={e => e.stopPropagation()}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={e => e.stopPropagation()}>
                        <DropdownMenuItem onClick={e => { e.stopPropagation(); setRenameProject(project); setNewTitle(project.title) }}>
                          <Pencil className="h-3.5 w-3.5 mr-2" /> Rename
                        </DropdownMenuItem>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <DropdownMenuItem onSelect={e => e.preventDefault()} className="text-destructive focus:text-destructive">
                              <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                            </DropdownMenuItem>
                          </AlertDialogTrigger>
                          <AlertDialogContent onClick={e => e.stopPropagation()}>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete this project?</AlertDialogTitle>
                              <AlertDialogDescription>You cannot undo this. The project "{project.title}" will be deleted for good.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={e => { e.stopPropagation(); handleDelete(project.id) }}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl">Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </main>

      <Dialog open={!!renameProject} onOpenChange={open => !open && setRenameProject(null)}>
        <DialogContent className="rounded-2xl" onClick={e => e.stopPropagation()}>
          <DialogHeader><DialogTitle>Rename project</DialogTitle></DialogHeader>
          <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="New project name"
            onKeyDown={e => e.key === 'Enter' && handleRename()} className="h-11 rounded-xl" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameProject(null)} className="rounded-xl">Cancel</Button>
            <Button variant="hero" onClick={handleRename} disabled={!newTitle.trim()} className="rounded-xl">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
})

export default DashboardPage
