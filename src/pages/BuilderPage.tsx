import AnimatedLogo from '@/components/branding/AnimatedLogo'
import { useState, useRef, useEffect, useCallback, useMemo, forwardRef } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ArrowUp, Eye, Loader2, Copy, Check, Code, Film, MessageSquare } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { streamChat, streamClone, type Msg } from '@/lib/streamChat'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { useSubscription } from '@/hooks/useSubscription'
import { toast } from 'sonner'
import TemplateGallery, { type Template } from '@/components/builder/TemplateGallery'
import PromptAttachMenu from '@/components/landing/PromptAttachMenu'
import BuilderToolbar, { type DeviceFrame } from '@/components/builder/BuilderToolbar'
import CloneDialog from '@/components/builder/CloneDialog'
import AILoadingAnimation, { detectLanguage } from '@/components/builder/AILoadingAnimation'
import FilePreview from '@/components/builder/FilePreview'
import KuboFlowSelector, { autoDetectMode, type KuboFlowMode } from '@/components/builder/KuboFlowSelector'
import { uploadFile, validateFile, getAllAllowedTypes, type UploadedFile } from '@/lib/fileUpload'
import { Progress } from '@/components/ui/progress'
import { subscribePreviewLogs, type PreviewLogEntry } from '@/lib/iframePreview'
import PreviewAuditPanel from '@/components/builder/PreviewAuditPanel'
import PreviewFrame from '@/components/builder/PreviewFrame'
import RunwayDialog from '@/components/runway/RunwayDialog'
import BuilderChat from '@/components/builder/chat/BuilderChat'
import { splitProseAndCode } from '@/lib/builderTurn'



const DEVICE_LS_KEY = 'kubo:previewDevice:v1'
function loadDevicePref(): { frame: DeviceFrame; landscape: boolean } {
  try {
    const raw = localStorage.getItem(DEVICE_LS_KEY)
    if (raw) {
      const p = JSON.parse(raw)
      if (p && typeof p === 'object') return { frame: p.frame || 'desktop', landscape: !!p.landscape }
    }
  } catch {}
  return { frame: 'desktop', landscape: false }
}

const BuilderPage = forwardRef<HTMLDivElement, any>((props, ref) => {
  const navigate = useNavigate()
  const { projectId } = useParams<{ projectId?: string }>()
  const location = useLocation()
  const { user } = useAuth()
  const { subscription, canEdit, editsRemaining, incrementEdit } = useSubscription()
  const initialPrompt = (location.state as any)?.initialPrompt as string | undefined

  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [generatedCode, setGeneratedCode] = useState('')
  const [activeTab, setActiveTab] = useState<'preview' | 'code'>('preview')
  // Layout mobile: chat e preview ocupam a tela inteira, um de cada vez,
  // trocados por uma barra de abas embaixo — o layout desktop (lado a
  // lado) continua igual, sem nenhuma mudança de comportamento acima do
  // breakpoint md.
  const [mobileView, setMobileView] = useState<'chat' | 'preview'>('chat')
  // Versão nova pronta enquanto a pessoa está na conversa (ponto na aba Preview).
  const [previewUnseen, setPreviewUnseen] = useState(false)
  // Falha da última geração, mostrada dentro da conversa.
  const [turnError, setTurnError] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (mobileView === 'preview' && activeTab === 'preview') setPreviewUnseen(false)
  }, [mobileView, activeTab, generatedCode])
  const openPanel = useCallback((tab: 'preview' | 'code') => {
    setActiveTab(tab)
    setMobileView('preview')
    if (tab === 'preview') setPreviewUnseen(false)
  }, [])
  const [copied, setCopied] = useState(false)
  const [projectTitle, setProjectTitle] = useState('Untitled Project')
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(projectId || null)
  const [saving, setSaving] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [showCloneDialog, setShowCloneDialog] = useState(false)
  const [showRunway, setShowRunway] = useState(false)
  const [isCloning, setIsCloning] = useState(false)
  const _devicePref = loadDevicePref()
  const [deviceFrame, setDeviceFrame] = useState<DeviceFrame>(_devicePref.frame)
  const [landscape, setLandscape] = useState(_devicePref.landscape)
  useEffect(() => {
    try { localStorage.setItem(DEVICE_LS_KEY, JSON.stringify({ frame: deviceFrame, landscape })) } catch {}
  }, [deviceFrame, landscape])
  const [previewLogs, setPreviewLogs] = useState<PreviewLogEntry[]>([])
  const [previewKey, setPreviewKey] = useState(0)
  const previewId = `builder:${currentProjectId ?? 'draft'}`
  // Subscribe to runtime errors / console messages from the iframe
  useEffect(() => {
    return subscribePreviewLogs((entry) => {
      setPreviewLogs((prev) => {
        const next = [...prev, entry]
        return next.length > 500 ? next.slice(-500) : next
      })
    }, { previewId })
  }, [previewId])
  // Reset logs whenever the preview is reloaded or the code changes
  useEffect(() => { setPreviewLogs([]) }, [previewKey, currentProjectId])
  const [attachedFiles, setAttachedFiles] = useState<UploadedFile[]>([])
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [isPublished, setIsPublished] = useState(false)
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [flowMode, setFlowMode] = useState<KuboFlowMode>('flow')
  const [autoDetectedMode, setAutoDetectedMode] = useState(false)
  const manualModeRef = useRef(false)

  const userPlan = subscription?.plan || 'free'

  // Auto-detect mode as user types (unless manually overridden)
  // Clamp to highest allowed mode for current plan
  useEffect(() => {
    if (manualModeRef.current || !input.trim()) return
    let detected = autoDetectMode(input)
    const plan = userPlan.toLowerCase()
    // Downgrade if locked
    if (detected === 'ship' && !['ultra'].includes(plan)) detected = ['pro', 'starter'].includes(plan) ? 'think' : 'flow'
    if (detected === 'think' && !['pro', 'ultra', 'starter'].includes(plan)) detected = 'flow'
    if (detected !== flowMode) {
      setFlowMode(detected)
      setAutoDetectedMode(true)
    }
  }, [input])

  const handleModeChange = (mode: KuboFlowMode) => {
    manualModeRef.current = true
    setAutoDetectedMode(false)
    setFlowMode(mode)
    // Reset manual flag after 10s so auto-detect resumes
    setTimeout(() => { manualModeRef.current = false }, 10000)
  }

  const handleFileUpload = useCallback(async (file: File) => {
    const validationError = validateFile(file)
    if (validationError) { toast.error(validationError); return }
    if (!user) { toast.error('Please log in first'); return }
    try {
      setUploadProgress(0)
      const uploaded = await uploadFile(file, user.id, setUploadProgress)
      setAttachedFiles(prev => [...prev, uploaded])
      const fmt = (bytes: number) => bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
      if (uploaded.originalSize > uploaded.size) {
        const saved = Math.round((1 - uploaded.size / uploaded.originalSize) * 100)
        toast.success(`"${file.name}" uploaded!`, {
          description: `${fmt(uploaded.originalSize)} → ${fmt(uploaded.size)} (${saved}% smaller)`,
        })
      } else {
        toast.success(`"${file.name}" uploaded!`)
      }
    } catch (err: any) {
      toast.error(err.message || 'Upload error')
    } finally {
      setUploadProgress(null)
    }
  }, [user])

  // Minimum loading duration: 8 seconds (reduced from 95s — users were
  // seeing a "black screen" because the overlay sat on top of the empty
  // preview long after generation completed). The Ready CTA inside the
  // animation lets users skip immediately when generation finishes early.
  const MIN_LOADING_MS = 8_000
  const loadingStartRef = useRef<number>(0)
  const [showLoading, setShowLoading] = useState(false)
  const generationDoneRef = useRef(false)
  const pendingSaveRef = useRef<(() => void) | null>(null)
  const pendingPreviewHtmlRef = useRef('')

  const queuePreviewHtml = useCallback((html: string) => {
    if (!html.includes('<')) return
    pendingPreviewHtmlRef.current = html
  }, [])

  const flushPreviewHtml = useCallback(() => {
    const nextHtml = pendingPreviewHtmlRef.current
    if (!nextHtml || nextHtml === generatedCode) return
    setGeneratedCode(nextHtml)
    setPreviewUnseen(true)
  }, [generatedCode])

  // Detect chat language from user messages
  const chatLanguage = useMemo(() => {
    const userMessages = messages.filter(m => m.role === 'user')
    if (userMessages.length === 0) return 'pt'
    const lastMsg = userMessages[userMessages.length - 1].content
    return detectLanguage(lastMsg)
  }, [messages])

  // When isLoading becomes true, start the minimum timer
  useEffect(() => {
    if (isLoading && !showLoading) {
      loadingStartRef.current = Date.now()
      generationDoneRef.current = false
      pendingSaveRef.current = null
      pendingPreviewHtmlRef.current = ''
      setShowLoading(true)
    }
    if (!isLoading && showLoading) {
      generationDoneRef.current = true
      const elapsed = Date.now() - loadingStartRef.current
      const remaining = MIN_LOADING_MS - elapsed
      if (remaining > 0) {
        const timeout = setTimeout(() => {
          flushPreviewHtml()
          setShowLoading(false)
          pendingSaveRef.current?.()
          pendingSaveRef.current = null
        }, remaining)
        return () => clearTimeout(timeout)
      } else {
        flushPreviewHtml()
        setShowLoading(false)
        pendingSaveRef.current?.()
        pendingSaveRef.current = null
      }
    }
  }, [flushPreviewHtml, isLoading, showLoading])

  useEffect(() => {
    if (projectId) loadProject(projectId)
  }, [projectId])

  const hasSentInitialPrompt = useRef(false)
  useEffect(() => {
    if (initialPrompt && !hasSentInitialPrompt.current && !projectId && user) {
      hasSentInitialPrompt.current = true
      setInput(initialPrompt)
      setTimeout(() => {
        const userMsg: Msg = { role: 'user', content: initialPrompt }
        setMessages([userMsg])
        setIsLoading(true)
        let assistantSoFar = ''
        let finalMessages = [userMsg]

        const upsertAssistant = (chunk: string) => {
          assistantSoFar += chunk
          setMessages(prev => {
            const last = prev[prev.length - 1]
            if (last?.role === 'assistant') {
              const updated = prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m))
              finalMessages = updated; return updated
            }
            const updated = [...prev, { role: 'assistant' as const, content: assistantSoFar }]
            finalMessages = updated; return updated
          })
          const html = extractHtml(assistantSoFar)
          queuePreviewHtml(html)
        }

        const detectedMode = autoDetectMode(initialPrompt)
        setFlowMode(detectedMode)

        streamChat({
          messages: [userMsg],
          mode: detectedMode,
          onDelta: (chunk) => upsertAssistant(chunk),
          onDone: () => { const html = extractHtml(assistantSoFar); queuePreviewHtml(html); setIsLoading(false); if (html.includes('<')) saveProject(html, finalMessages) },
          onError: (error) => { toast.error(error); setTurnError(error); setIsLoading(false) },
        }).catch((e) => { console.error(e); toast.error('Failed to generate'); setIsLoading(false) })

        setInput('')
      }, 100)
    }
  }, [initialPrompt, projectId, user])

  const loadProject = async (id: string) => {
    const { data, error } = await supabase.from('projects').select('*').eq('id', id).single()
    if (error || !data) { toast.error('Project not found'); navigate('/dashboard'); return }
    setProjectTitle(data.title)
    setGeneratedCode(data.generated_code || '')
    setMessages((data.messages as Msg[]) || [])
    setCurrentProjectId(id)
    setIsPublished((data as any).is_published || false)
    setPublishedUrl((data as any).published_url || null)
  }

  // A caixa de mensagem cresce com o texto, até o limite do CSS (max-h).
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [input])

  const extractHtml = useCallback((text: string): string => {
    // Mesmo recorte que o chat usa para montar as caixinhas: só o documento,
    // sem a conversa em volta. Resposta só de conversa não vira preview.
    return splitProseAndCode(text).code
  }, [])

  const saveProject = async (code: string, msgs: Msg[]): Promise<string | null> => {
    if (!user) return null
    setSaving(true)
    const firstUserMsg = msgs.find(m => m.role === 'user')
    const title = firstUserMsg ? firstUserMsg.content.slice(0, 60) : 'Untitled Project'
    try {
      let id = currentProjectId
      if (currentProjectId) {
        const { error } = await supabase.from('projects').update({ title, generated_code: code, messages: msgs as any, updated_at: new Date().toISOString() }).eq('id', currentProjectId)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('projects').insert({ user_id: user.id, title, generated_code: code, messages: msgs as any }).select('id').single()
        if (error) throw error
        id = data.id
        setCurrentProjectId(data.id)
        window.history.replaceState(null, '', `/builder/${data.id}`)
      }
      setProjectTitle(title)
      toast.success('Project saved!')
      return id
    } catch (err: any) { toast.error('Error saving: ' + (err.message || 'unknown')); return null }
    finally { setSaving(false) }
  }

  const send = async () => {
    if (!input.trim() || isLoading) return
    if (!subscription?.is_active) {
      toast.error('You need an active plan to edit.', {
        action: { label: 'View plans', onClick: () => navigate('/pricing') },
      })
      return
    }
    if (!canEdit) {
      toast('Your 20 edits are used up! 🔄', {
        description: 'Reload whenever you want to keep creating.',
        action: { label: 'Reload', onClick: () => navigate('/pricing') },
      })
      return
    }
    await incrementEdit()
    // Build content with attached file URLs
    let content = input
    if (attachedFiles.length > 0) {
      const fileRefs = attachedFiles.map(f => `[${f.category}: ${f.name}](${f.url})`).join('\n')
      content = `${input}\n\nAttached files:\n${fileRefs}`
    }
    const userMsg: Msg = { role: 'user', content }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages); setInput(''); setAttachedFiles([]); setTurnError(null); setIsLoading(true)
    let assistantSoFar = ''
    let finalMessages = newMessages

    const upsertAssistant = (chunk: string) => {
      assistantSoFar += chunk
      setMessages(prev => {
        const last = prev[prev.length - 1]
        if (last?.role === 'assistant') {
          const updated = prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m))
          finalMessages = updated; return updated
        }
        const updated = [...prev, { role: 'assistant' as const, content: assistantSoFar }]
        finalMessages = updated; return updated
      })
      const html = extractHtml(assistantSoFar)
      queuePreviewHtml(html)
    }

    try {
      await streamChat({
        messages: newMessages,
        mode: flowMode,
        onDelta: (chunk) => upsertAssistant(chunk),
        onDone: () => { const html = extractHtml(assistantSoFar); queuePreviewHtml(html); setIsLoading(false); if (html.includes('<')) saveProject(html, finalMessages) },
        onError: (error) => { toast.error(error); setTurnError(error); setIsLoading(false) },
      })
    } catch (e) { console.error(e); toast.error('Failed to generate'); setIsLoading(false) }
  }

  const handleCopy = () => { navigator.clipboard.writeText(generatedCode); setCopied(true); setTimeout(() => setCopied(false), 2000) }

  const handleDownload = () => {
    const blob = new Blob([generatedCode], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `${projectTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.html`; a.click(); URL.revokeObjectURL(url)
  }

  // Volta o preview para o código de uma versão anterior da conversa.
  const handleRestore = (code: string) => {
    pendingPreviewHtmlRef.current = code
    setGeneratedCode(code)
    setPreviewKey(k => k + 1)
    openPanel('preview')
    toast.success('Versão restaurada no preview', {
      action: { label: 'Salvar', onClick: () => saveProject(code, messages) },
    })
  }

  const handleTemplateSelect = (template: Template) => { setShowTemplates(false); setInput(template.prompt) }

  const handleClone = async (url: string) => {
    if (!subscription?.is_active) {
      toast.error('You need an active plan to clone.', {
        action: { label: 'View plans', onClick: () => navigate('/pricing') },
      })
      return
    }
    if (!canEdit) {
      toast('Your edits are used up!', {
        action: { label: 'Reload', onClick: () => navigate('/pricing') },
      })
      return
    }
    await incrementEdit()
    setIsCloning(true)
    setShowCloneDialog(false)

    const cloneMsg: Msg = { role: 'user', content: `🔗 Clone: ${url}` }
    const newMessages = [...messages, cloneMsg]
    setMessages(newMessages)
    setTurnError(null)
    setIsLoading(true)

    let assistantSoFar = ''
    let finalMessages = newMessages

    const upsertAssistant = (chunk: string) => {
      assistantSoFar += chunk
      setMessages(prev => {
        const last = prev[prev.length - 1]
        if (last?.role === 'assistant') {
          const updated = prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m))
          finalMessages = updated; return updated
        }
        const updated = [...prev, { role: 'assistant' as const, content: assistantSoFar }]
        finalMessages = updated; return updated
      })
      const html = extractHtml(assistantSoFar)
      queuePreviewHtml(html)
    }

    try {
      await streamClone({
        url,
        onDelta: (chunk) => upsertAssistant(chunk),
        onDone: () => {
          const html = extractHtml(assistantSoFar)
          queuePreviewHtml(html)
          setIsLoading(false)
          setIsCloning(false)
          if (html.includes('<')) saveProject(html, finalMessages)
          toast.success('Site cloned successfully! 🎉')
        },
        onError: (error) => {
          toast.error(error)
          setTurnError(error)
          setIsLoading(false)
          setIsCloning(false)
        },
      })
    } catch (e) {
      console.error(e)
      toast.error('Failed to clone the site')
      setIsLoading(false)
      setIsCloning(false)
    }
  }

  const handlePublish = async (): Promise<string | null> => {
    if (!user || !generatedCode) return null
    const pid = await saveProject(generatedCode, messages)
    if (!pid) { toast.error('Salve o projeto antes de publicar'); return null }
    const { data, error } = await supabase.functions.invoke('cloudflare-publish', { body: { project_id: pid } })
    if (error || !data?.url) {
      const ctx = (error as { context?: Response } | null)?.context
      const detail = await ctx?.json?.().catch(() => null)
      const code = detail?.error ?? data?.error
      toast.error('Não foi possível publicar na Cloudflare', {
        description: code === 'cloudflare_not_configured' ? 'A publicação ainda não está ativa. Tente mais tarde.' : code,
      })
      return null
    }
    setIsPublished(true)
    setPublishedUrl(data.url)
    return data.url
  }

  return (
    <div ref={ref} className="h-screen w-screen flex flex-col bg-background overflow-hidden">
      {/* Toolbar */}
      <BuilderToolbar
        projectTitle={projectTitle}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        deviceFrame={deviceFrame}
        onDeviceFrameChange={(f) => { setDeviceFrame(f); if (f === 'desktop') setLandscape(false) }}
        landscape={landscape}
        onToggleLandscape={() => setLandscape(l => !l)}
        onRefreshPreview={() => setPreviewKey(k => k + 1)}
        onSave={() => saveProject(generatedCode, messages)}
        onDownload={handleDownload}
        onShowTemplates={() => setShowTemplates(true)}
        onCloneSite={() => setShowCloneDialog(true)}
        onPublish={handlePublish}
        saving={saving}
        hasCode={!!generatedCode}
        editsRemaining={editsRemaining}
        isSubscribed={!!subscription?.is_active}
        generatedCode={generatedCode}
        isPublished={isPublished}
        publishedUrl={publishedUrl}
        projectId={currentProjectId}
      />

      {/* Main content */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col md:flex-row">
        {/* Chat panel */}
        <div
          className={`relative min-h-0 w-full min-w-0 flex-1 flex-col border-r border-border/50 bg-card/50 backdrop-blur-sm transition-colors md:flex md:flex-none md:w-[min(400px,44vw)] md:min-w-[300px] xl:w-[440px] ${isDragging ? 'bg-primary/5' : ''} ${mobileView === 'chat' ? 'flex' : 'hidden'}`}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true) }}
          onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false) }}
          onDrop={(e) => {
            e.preventDefault(); e.stopPropagation(); setIsDragging(false)
            const files = Array.from(e.dataTransfer.files)
            files.forEach(handleFileUpload)
          }}
        >
          {isDragging && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/80 backdrop-blur-sm border-2 border-dashed border-primary rounded-lg pointer-events-none">
              <div className="text-center">
                <p className="text-primary font-medium text-sm">Solte o arquivo aqui</p>
                <p className="text-muted-foreground text-xs mt-1">Imagem, vídeo, áudio, PDF, DOC, ZIP</p>
              </div>
            </div>
          )}
          <BuilderChat
            messages={messages}
            isLoading={isLoading}
            mode={flowMode}
            currentCode={generatedCode}
            error={turnError}
            onPickSuggestion={setInput}
            onOpenPreview={() => openPanel('preview')}
            onOpenCode={() => openPanel('code')}
            onRestore={handleRestore}
          />

          <div className="space-y-2 border-t border-border/60 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:pb-3">
            <div className="flex items-center justify-between gap-2 px-0.5">
              <KuboFlowSelector mode={flowMode} onChange={handleModeChange} autoDetected={autoDetectedMode} userPlan={userPlan} />
              <span className="hidden text-[10px] text-muted-foreground font-display tracking-widest min-[360px]:inline">VERTAL FLOW AI</span>
            </div>
            {uploadProgress !== null && (
              <div className="flex items-center gap-2 px-1">
                <Progress value={uploadProgress} className="h-1.5 flex-1" />
                <span className="text-[10px] text-muted-foreground">{uploadProgress}%</span>
              </div>
            )}
            {attachedFiles.length > 0 && (
              <div className="flex flex-wrap gap-1.5 px-1">
                {attachedFiles.map((f, i) => (
                  <FilePreview key={i} file={f} compact />
                ))}
              </div>
            )}
            {/* Caixa de mensagem: texto em cima, ações embaixo */}
            <div className="rounded-2xl border border-border/70 bg-background/70 transition-colors focus-within:border-primary/50 focus-within:shadow-[0_0_0_3px_hsl(var(--primary)/0.08)]">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                aria-label="Mensagem para o Vertal"
                placeholder="Descreva o que quer criar ou mudar…"
                rows={1}
                className="block max-h-40 min-h-[44px] w-full resize-none bg-transparent px-3.5 pt-3 pb-1 text-base text-foreground placeholder:text-muted-foreground focus:outline-none md:text-sm"
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send() } }}
                onPaste={(e) => {
                  const items = Array.from(e.clipboardData.items)
                  const imageItem = items.find(item => item.type.startsWith('image/'))
                  if (imageItem) {
                    e.preventDefault()
                    const file = imageItem.getAsFile()
                    if (file) handleFileUpload(file)
                  }
                }}
              />
              <div className="flex items-center gap-1.5 px-2 pb-2 pt-1">
                <PromptAttachMenu
                  onAttachFile={handleFileUpload}
                  onScreenshot={() => toast.info('Screenshot functionality coming soon')}
                  onAddReference={(url) => {
                    setInput(prev => prev + `\n[Reference: ${url}]`)
                    toast.success('Reference added')
                  }}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 rounded-xl text-muted-foreground hover:text-primary"
                  onClick={() => setShowRunway(true)}
                  title="RunwayML — Generate video/image (28 credits)"
                  aria-label="Gerar vídeo ou imagem com RunwayML"
                >
                  <Film className="h-4 w-4" />
                </Button>
                <span className="ml-auto hidden text-[10px] text-muted-foreground lg:inline">Enter envia · Shift+Enter quebra linha</span>
                <Button
                  size="icon"
                  variant="hero"
                  className="ml-auto h-9 w-9 shrink-0 rounded-xl lg:ml-0"
                  onClick={send}
                  disabled={isLoading || !input.trim()}
                  aria-label={isLoading ? 'Gerando' : 'Enviar'}
                >
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Preview / Code panel */}
        <div className={`relative min-h-0 min-w-0 flex-1 overflow-hidden bg-muted md:flex ${mobileView === 'preview' ? 'flex' : 'hidden'}`}>
          <AnimatePresence mode="wait">
            {activeTab === 'preview' ? (
              <motion.div key="preview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 flex h-full w-full min-h-0 min-w-0 overflow-hidden">
                {/* Loading overlay — sits on top of everything */}
                {showLoading && (
                  <div className="absolute inset-0 z-20">
                    <AILoadingAnimation
                      isVisible={showLoading}
                      chatLanguage={chatLanguage}
                      isReady={!isLoading && !!generatedCode}
                      onSkip={() => {
                        setShowLoading(false)
                        pendingSaveRef.current?.()
                        pendingSaveRef.current = null
                      }}
                    />
                  </div>
                )}
              {generatedCode && !showLoading ? (
                  <PreviewFrame
                    generatedCode={generatedCode}
                    deviceFrame={deviceFrame}
                    landscape={landscape}
                    previewKey={previewKey}
                    previewId={previewId}
                    onRefresh={() => setPreviewKey(k => k + 1)}
                    publishedUrl={publishedUrl}
                    projectTitle={projectTitle}
                  />
                ) : !showLoading ? (
                  <div className="flex items-center justify-center h-full w-full relative">
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.5, ease: 'easeOut' }}
                      className="text-center"
                    >
                      <div className="h-16 w-16 rounded-2xl bg-accent flex items-center justify-center mx-auto mb-4">
                        <Eye className="h-8 w-8 text-accent-foreground" />
                      </div>
                      <p className="text-muted-foreground font-medium">Preview will appear here</p>
                      <p className="text-xs text-muted-foreground mt-1">Describe your app to start building</p>
                    </motion.div>
                  </div>
                ) : null}
              </motion.div>
            ) : (
              <motion.div key="code" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 flex flex-col">
                <div className="flex items-center justify-between px-4 py-2 bg-card border-b border-border">
                  <span className="text-xs font-medium text-muted-foreground">index.html</span>
                  <Button variant="ghost" size="sm" onClick={handleCopy} className="h-7 text-xs">
                    {copied ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                <pre className="flex-1 overflow-auto p-4 text-xs font-mono text-foreground bg-card">
                  <code>{generatedCode || '// Your generated code will appear here...'}</code>
                </pre>
              </motion.div>
            )}
          </AnimatePresence>
          {activeTab === 'preview' && generatedCode && (
            <PreviewAuditPanel
              logs={previewLogs}
              onClear={() => setPreviewLogs([])}
              defaultOpen={previewLogs.some(l => ['error','exception','rejection'].includes(l.kind))}
              onAutoScreenshot={(reason) => window.dispatchEvent(new CustomEvent('kubo:preview:auto-screenshot', { detail: { reason } }))}
            />
          )}
        </div>
      </div>

      {/* Barra de abas mobile — some no desktop (md:hidden) */}
      <nav aria-label="Áreas do Builder" className="flex shrink-0 border-t border-border/50 bg-card/80 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm md:hidden">
        {([
          { id: 'chat', label: 'Conversa', icon: MessageSquare },
          { id: 'preview', label: 'Preview', icon: Eye },
          { id: 'code', label: 'Código', icon: Code },
        ] as const).map(({ id, label, icon: Icon }) => {
          const active = id === 'chat' ? mobileView === 'chat' : mobileView === 'preview' && activeTab === id
          return (
            <button
              key={id}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => (id === 'chat' ? setMobileView('chat') : openPanel(id))}
              className={`relative flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${active ? 'text-primary' : 'text-muted-foreground'}`}
            >
              {active && <span className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-primary" />}
              <span className="relative">
                <Icon className="h-[18px] w-[18px]" />
                {id === 'preview' && previewUnseen && !active && (
                  <span className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-primary" aria-label="Nova versão pronta" />
                )}
              </span>
              {label}
            </button>
          )
        })}
      </nav>

      <AnimatePresence>
        {showTemplates && <TemplateGallery onSelect={handleTemplateSelect} onClose={() => setShowTemplates(false)} />}
      </AnimatePresence>

      <CloneDialog
        open={showCloneDialog}
        onOpenChange={setShowCloneDialog}
        onClone={handleClone}
        isCloning={isCloning}
      />

      <RunwayDialog
        open={showRunway}
        onOpenChange={setShowRunway}
        onResult={(url) => {
          // Insert the generated asset URL into the prompt for the AI to consume.
          setInput((prev) => `${prev}${prev ? "\n" : ""}[runway asset]: ${url}`)
        }}
      />
    </div>
  )
})

export default BuilderPage
