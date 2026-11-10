// Vertal Chat: layout único que envolve o Painel Criativo.
// Barra lateral (conversas e painéis), conversa no centro e, ao lado, o que o agente
// criou ou o painel aberto (Office, Design Premium, Canvas, Notebook…).
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle, ArrowLeft, ArrowUp, Check, ChevronDown, Coins, Columns2, ExternalLink, LayoutGrid, Loader2,
  Maximize2, MessageSquare, MessageSquarePlus, Cable, MoreHorizontal, PanelLeft, Pencil, Pin, PinOff, Plus, ShieldCheck, Trash2, X,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useVertalChat, type VertalMessage } from '@/hooks/useVertalChat';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { LOGO_SRC } from '@/components/branding/AnimatedLogo';
import { PANELS, type PanelKey } from '@/lib/chatAgent/contract';
import { KIND_LABEL, type Artifact } from '@/lib/chatAgent/artifacts';
import { ArtifactCard, ArtifactViewer, ChatMarkdown, type ViewerActions } from './ArtifactViews';
import { PANEL_BY_KEY, PANEL_LIST, type PanelRequest } from './panelList';
import { PanelHost } from './PanelHost';
import { ConnectionsDialog } from './ConnectionsDialog';
import { previewHtml } from '@/lib/chatAgent/previewHtml';

const SIDEBAR_KEY = 'vertal-chat-sidebar';
const CHAT_ONLY_KEY = 'vertal-chat-only';

const STARTERS: Array<{ label: string; text: string }> = [
  { label: 'Imagem', text: 'Crie uma imagem de ' },
  { label: 'Post para redes sociais', text: 'Crie um post para Instagram sobre ' },
  { label: 'Documento', text: 'Escreva um documento sobre ' },
  { label: 'Planilha', text: 'Monte uma planilha de ' },
  { label: 'Apresentação', text: 'Monte uma apresentação sobre ' },
  { label: 'Design no Canvas', text: 'Desenhe no Canvas um layout de ' },
  { label: 'Site ou aplicativo', text: 'Construa um aplicativo que ' },
  { label: 'Música', text: 'Componha uma música ' },
  { label: 'Ebook', text: 'Escreva um ebook sobre ' },
  { label: 'Clima agora', text: 'Como está o tempo aqui agora?' },
  { label: 'Ler meus e-mails', text: 'Resuma meus e-mails não lidos de hoje.' },
  { label: 'Chamar uma API', text: 'Use a API ' },
];

const SUGGESTIONS = [
  { title: 'Post pronto para publicar', text: 'Crie um post para Instagram anunciando a inauguração de uma cafeteria, com legenda.' },
  { title: 'Planilha de controle', text: 'Monte uma planilha de controle financeiro mensal para um pequeno negócio.' },
  { title: 'Apresentação de vendas', text: 'Monte uma apresentação de 6 slides para vender um curso online de inglês.' },
  { title: 'Aplicativo funcionando', text: 'Construa um aplicativo de lista de tarefas com prioridades e filtro.' },
];

const GROUPS: Array<{ id: 'criar' | 'midia' | 'conectar'; label: string }> = [
  { id: 'criar', label: 'Criar' },
  { id: 'midia', label: 'Vídeo e áudio' },
  { id: 'conectar', label: 'Conectar' },
];

/** Painéis que ocupam bem a tela inteira; o chat fica a um toque de distância. */
const WIDE_PANELS: PanelKey[] = ['office', 'design', 'canvas', 'notebook'];

/** Artefatos que abrem sozinhos ao lado quando ficam prontos (em telas largas). */
const AUTO_OPEN: Artifact['kind'][] = ['doc', 'sheet', 'slides', 'canvas', 'app', 'ebook', 'email'];

type Side = { type: 'artifact'; id: string } | { type: 'panel' } | { type: 'live' } | null;

export function VertalChat() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();

  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      return window.localStorage.getItem(SIDEBAR_KEY) !== 'closed';
    } catch {
      return true;
    }
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  // "Só no chat": nada abre ao lado sozinho; o que o agente cria fica na conversa.
  const [chatOnly, setChatOnlyState] = useState(() => {
    try {
      return window.localStorage.getItem(CHAT_ONLY_KEY) === 'on';
    } catch {
      return false;
    }
  });
  const chatOnlyRef = useRef(chatOnly);
  chatOnlyRef.current = chatOnly;
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [side, setSide] = useState<Side>(null);
  const [panel, setPanel] = useState<PanelRequest | null>(null);
  const [focus, setFocus] = useState(false);
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const nonceRef = useRef(0);

  const openPanel = useCallback(
    (key: PanelKey, extra: Partial<Pick<PanelRequest, 'office' | 'designOpen'>> = {}) => {
      const info = PANEL_BY_KEY[key];
      if (info.route) {
        navigate(info.route);
        return;
      }
      nonceRef.current += 1;
      setPanel({ key, nonce: nonceRef.current, ...extra });
      setSide({ type: 'panel' });
      setFocus(WIDE_PANELS.includes(key));
      setDrawerOpen(false);
    },
    [navigate],
  );

  const setChatOnly = useCallback((value: boolean) => {
    setChatOnlyState(value);
    try {
      window.localStorage.setItem(CHAT_ONLY_KEY, value ? 'on' : 'off');
    } catch {
      /* vale só nesta visita */
    }
    if (value) {
      setSide(null);
      setFocus(false);
    }
  }, []);

  const chat = useVertalChat({
    onChatOnly: setChatOnly,
    // Painéis com rota própria viram um botão na mensagem: o agente não tira o usuário do chat.
    onOpenPanel: (key) => {
      if (!PANEL_BY_KEY[key].route && !chatOnlyRef.current) openPanel(key);
    },
    onArtifact: (artifact) => {
      if (!chatOnlyRef.current && AUTO_OPEN.includes(artifact.kind) && window.matchMedia('(min-width: 1024px)').matches) {
        setSide({ type: 'artifact', id: artifact.id });
        setFocus(false);
      }
    },
  });

  const artifacts = useMemo(() => chat.messages.flatMap((m) => m.extras.artifacts), [chat.messages]);
  const openArtifact = side?.type === 'artifact' ? artifacts.find((a) => a.id === side.id) : undefined;

  // App em construção: a prévia aparece ao lado enquanto o código chega.
  useEffect(() => {
    if (chat.livePreview && !chatOnlyRef.current && window.matchMedia('(min-width: 1024px)').matches) {
      setSide((s) => (s?.type === 'live' ? s : { type: 'live' }));
      setFocus(false);
    } else if (!chat.livePreview) {
      setSide((s) => (s?.type === 'live' ? null : s));
    }
  }, [chat.livePreview]);

  // Link direto: /creative/chat?tool=office abre o painel já dentro do chat.
  useEffect(() => {
    const tool = searchParams.get('tool');
    if (!tool) return;
    setSearchParams({}, { replace: true });
    if ((PANELS as readonly string[]).includes(tool)) openPanel(tool as PanelKey);
  }, [openPanel, searchParams, setSearchParams]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_KEY, sidebarOpen ? 'open' : 'closed');
    } catch {
      /* sem armazenamento: a preferência vale só nesta visita */
    }
  }, [sidebarOpen]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [chat.messages]);

  // A caixa de mensagem cresce com o texto.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [input]);

  const submit = () => {
    if (!input.trim() || chat.busy) return;
    const text = input;
    setInput('');
    void chat.send(text);
  };

  const fill = (text: string) => {
    setInput(text);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(text.length, text.length);
    });
  };

  const viewerActions: ViewerActions = useMemo(
    () => ({
      openInOffice: (a) => openPanel('office', { office: { app: a.kind, recordId: a.officeId } }),
      openInCanvas: (a) => openPanel('canvas', { designOpen: { mode: 'canvas', canvasCopy: { name: a.spec.name, snapshot: undefined, spec: a.spec } } }),
      openInBuilder: (a) => navigate(`/builder/${a.projectId}`),
    }),
    [navigate, openPanel],
  );

  const firstName = useMemo(() => {
    const meta = user?.user_metadata as { full_name?: string; name?: string } | undefined;
    const name = meta?.full_name || meta?.name || user?.email?.split('@')[0] || '';
    return name.split(/[\s._-]+/)[0]?.replace(/^./, (c) => c.toUpperCase()) ?? '';
  }, [user]);

  const sideOpen = side !== null;
  const empty = chat.messages.length === 0 && !chat.loadingConversation;
  const currentTitle = chat.conversations.find((c) => c.id === chat.conversationId)?.title;

  const sidebar = (
    <SidebarContent
      chat={chat}
      activePanel={side?.type === 'panel' ? panel?.key : undefined}
      onNew={() => {
        chat.newConversation();
        setSide(null);
        setDrawerOpen(false);
        inputRef.current?.focus();
      }}
      onOpenConversation={(id) => {
        setSide(null);
        setDrawerOpen(false);
        void chat.openConversation(id);
      }}
      onOpenPanel={(key) => openPanel(key)}
      onCollapse={() => (drawerOpen ? setDrawerOpen(false) : setSidebarOpen(false))}
      onBackToPanel={() => navigate('/creative')}
      onConnections={() => {
        setDrawerOpen(false);
        setConnectionsOpen(true);
      }}
    />
  );

  const composer = (
    <Composer
      value={input}
      onChange={setInput}
      onSubmit={submit}
      onFill={fill}
      busy={chat.busy}
      inputRef={inputRef}
    />
  );

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-background text-foreground">
      {/* Barra lateral fixa (computador) */}
      <aside
        aria-label="Conversas e painéis"
        className={cn(
          'hidden shrink-0 border-r border-border/50 bg-[hsl(var(--sidebar-background))] transition-[width] duration-200 md:block',
          sidebarOpen ? 'w-72' : 'w-0 overflow-hidden border-r-0',
        )}
      >
        <div className="h-full w-72">{sidebar}</div>
      </aside>

      {/* Gaveta (celular) */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button type="button" aria-label="Fechar menu" className="absolute inset-0 bg-black/60" onClick={() => setDrawerOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[85%] max-w-xs border-r border-border/50 bg-[hsl(var(--sidebar-background))] shadow-2xl">{sidebar}</div>
        </div>
      )}

      {/* Conversa */}
      <section
        aria-label="Conversa"
        className={cn(
          'min-w-0 flex-col',
          !sideOpen && 'flex flex-1',
          sideOpen && (focus ? 'hidden' : side?.type === 'panel' ? 'hidden xl:flex xl:w-[420px] xl:shrink-0' : 'hidden lg:flex lg:flex-1'),
        )}
      >
        <header className="flex h-14 shrink-0 items-center gap-2 px-3 sm:px-4">
          <button
            type="button"
            aria-label="Abrir menu"
            onClick={() => setDrawerOpen(true)}
            className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground md:hidden"
          >
            <PanelLeft className="h-5 w-5" />
          </button>
          {!sidebarOpen && (
            <button
              type="button"
              aria-label="Mostrar barra lateral"
              onClick={() => setSidebarOpen(true)}
              className="hidden rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground md:inline-flex"
            >
              <PanelLeft className="h-5 w-5" />
            </button>
          )}
          <h1 className="min-w-0 flex-1 truncate text-sm font-medium text-foreground/80">{currentTitle ?? 'Vertal Chat'}</h1>
          <button
            type="button"
            onClick={() => setChatOnly(!chatOnly)}
            aria-pressed={chatOnly}
            title={chatOnly ? 'Tudo fica na conversa. Clique para voltar a abrir ao lado.' : 'Manter tudo só na tela do chat'}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition',
              chatOnly ? 'border-primary/60 bg-primary/15 text-primary' : 'border-border/60 text-foreground/80 hover:border-primary/50',
            )}
          >
            <MessageSquare className="h-3.5 w-3.5" aria-hidden />
            Só no chat
          </button>
          <button
            type="button"
            onClick={() => navigate('/pricing')}
            className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1.5 text-xs font-medium text-foreground/80 hover:border-primary/50"
            aria-label={`${chat.credits} créditos. Ver planos`}
          >
            <Coins className="h-3.5 w-3.5 text-primary" aria-hidden />
            {chat.credits}
          </button>
        </header>

        {empty ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-4 pb-10">
            <div className="w-full max-w-2xl">
              <img src={LOGO_SRC} alt="" className="mx-auto mb-5 h-12 w-auto" />
              <h2 className="mb-8 text-center font-serif text-3xl leading-tight text-foreground sm:text-4xl">
                {firstName ? `Olá, ${firstName}.` : 'Olá.'} O que vamos criar?
              </h2>
              {composer}
              <ul className="mt-6 grid gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <li key={s.title}>
                    <button
                      type="button"
                      onClick={() => fill(s.text)}
                      className="h-full w-full rounded-2xl border border-border/50 bg-card/40 px-4 py-3 text-left transition hover:border-primary/40 hover:bg-card"
                    >
                      <span className="block text-sm font-medium">{s.title}</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{s.text}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto px-4">
              <div className="mx-auto w-full max-w-3xl space-y-6 pb-6 pt-2">
                {chat.loadingConversation && (
                  <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Carregando conversa" /></div>
                )}
                {chat.messages.map((m) => (
                  <MessageRow
                    key={m.id}
                    message={m}
                    activeArtifactId={openArtifact?.id}
                    onOpenArtifact={(id) => {
                      setSide({ type: 'artifact', id });
                      setFocus(false);
                    }}
                    onOpenPanel={(key) => openPanel(key)}
                  />
                ))}
                <div ref={endRef} />
              </div>
            </div>
            <div className="shrink-0 px-4 pb-3">
              <div className="mx-auto w-full max-w-3xl">
                {chat.error && (
                  <div role="alert" className="mb-2 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <span className="flex-1">{chat.error}</span>
                    <button type="button" onClick={chat.clearError} aria-label="Fechar aviso"><X className="h-4 w-4" /></button>
                  </div>
                )}
                {composer}
                <p className="mt-2 text-center text-[11px] text-muted-foreground">
                  O Vertal Chat pode errar. Cada criação usa os créditos da ferramenta correspondente.
                </p>
              </div>
            </div>
          </>
        )}
        {empty && chat.error && (
          <div role="alert" className="mx-auto mb-4 flex max-w-2xl items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span className="flex-1">{chat.error}</span>
            <button type="button" onClick={chat.clearError} aria-label="Fechar aviso"><X className="h-4 w-4" /></button>
          </div>
        )}
      </section>

      {/* Painel lateral: artefato, prévia ao vivo ou painel do Painel Criativo */}
      {sideOpen && (
        <section
          aria-label="Área de trabalho"
          className={cn(
            'flex min-w-0 flex-1 flex-col border-l border-border/50 bg-[hsl(var(--card))]',
            !focus && side?.type !== 'panel' && 'lg:max-w-[52%]',
          )}
        >
          <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/50 px-3">
            <button
              type="button"
              onClick={() => (side?.type === 'panel' ? setFocus(false) : setSide(null))}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground',
                focus ? '' : side?.type === 'panel' ? 'xl:hidden' : 'lg:hidden',
              )}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden /> Chat
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {side?.type === 'panel' && panel ? PANEL_BY_KEY[panel.key].label : side?.type === 'live' ? 'Construindo aplicativo…' : openArtifact?.title ?? 'Artefato'}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {side?.type === 'panel' && panel ? PANEL_BY_KEY[panel.key].hint : side?.type === 'live' ? 'Prévia ao vivo' : openArtifact ? KIND_LABEL[openArtifact.kind] : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFocus((f) => !f)}
              aria-label={focus ? 'Dividir a tela com o chat' : 'Usar a tela inteira'}
              title={focus ? 'Dividir com o chat' : 'Tela inteira'}
              className={cn('hidden rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground', side?.type === 'panel' ? 'xl:inline-flex' : 'lg:inline-flex')}
            >
              {focus ? <Columns2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => {
                if (side?.type === 'panel') setPanel(null);
                setSide(null);
                setFocus(false);
              }}
              aria-label="Fechar"
              className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-auto">
            {side?.type === 'artifact' && openArtifact && <ArtifactViewer artifact={openArtifact} actions={viewerActions} />}
            {side?.type === 'artifact' && !openArtifact && (
              <p className="p-6 text-sm text-muted-foreground">Este item não está mais nesta conversa.</p>
            )}
            {side?.type === 'live' && chat.livePreview && (
              <iframe title="Prévia ao vivo do aplicativo" srcDoc={previewHtml(chat.livePreview)} sandbox="allow-scripts" className="h-full w-full bg-white" />
            )}
            {/* O painel aberto continua montado ao ver um artefato, para não perder o trabalho. */}
            {panel && (
              <div hidden={side?.type !== 'panel'} className="min-h-full">
                <Suspense fallback={<div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Carregando painel" /></div>}>
                  <PanelHost request={panel} credits={chat.credits} userId={user?.id} />
                </Suspense>
              </div>
            )}
          </div>
        </section>
      )}

      <ApiApprovalDialog approval={chat.approval} />
      <ConnectionsDialog open={connectionsOpen} onOpenChange={setConnectionsOpen} onOpenVault={() => navigate('/secrets')} />
    </div>
  );
}

// ─── Barra lateral ───────────────────────────────────────────────────────

function SidebarContent({
  chat, activePanel, onNew, onOpenConversation, onOpenPanel, onCollapse, onBackToPanel, onConnections,
}: {
  onConnections: () => void;
  chat: ReturnType<typeof useVertalChat>;
  activePanel?: PanelKey;
  onNew: () => void;
  onOpenConversation: (id: string) => void;
  onOpenPanel: (key: PanelKey) => void;
  onCollapse: () => void;
  onBackToPanel: () => void;
}) {
  const [toolsOpen, setToolsOpen] = useState(true);
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);

  return (
    <div className="flex h-full flex-col text-sm">
      <div className="flex h-14 shrink-0 items-center gap-2 px-3">
        <img src={LOGO_SRC} alt="" className="h-7 w-auto" />
        <span className="flex-1 font-semibold tracking-tight">Vertal Chat</span>
        <button type="button" onClick={onCollapse} aria-label="Recolher barra lateral" className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground">
          <PanelLeft className="h-4 w-4" />
        </button>
      </div>

      <div className="px-3 pb-2">
        <button
          type="button"
          onClick={onNew}
          className="flex w-full items-center gap-2 rounded-xl bg-primary/10 px-3 py-2.5 font-medium text-primary transition hover:bg-primary/15"
        >
          <MessageSquarePlus className="h-4 w-4" aria-hidden /> Nova conversa
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <button
          type="button"
          onClick={() => setToolsOpen((o) => !o)}
          aria-expanded={toolsOpen}
          className="flex w-full items-center gap-1 px-2 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
        >
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', !toolsOpen && '-rotate-90')} aria-hidden /> Painéis
        </button>
        {toolsOpen &&
          GROUPS.map((group) => (
            <div key={group.id} className="mb-1">
              <p className="px-3 pb-0.5 pt-2 text-[11px] text-muted-foreground/70">{group.label}</p>
              <ul>
                {group.id === 'conectar' && (
                  <li>
                    <button
                      type="button"
                      onClick={onConnections}
                      title="APIs e servidores MCP que você liga ao chat"
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left text-foreground/85 transition hover:bg-secondary"
                    >
                      <Cable className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate">Minhas conexões</span>
                    </button>
                  </li>
                )}
                {PANEL_LIST.filter((p) => p.group === group.id).map((p) => (
                  <li key={p.key}>
                    <button
                      type="button"
                      onClick={() => onOpenPanel(p.key)}
                      title={p.hint}
                      aria-current={activePanel === p.key ? 'page' : undefined}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left text-foreground/85 transition hover:bg-secondary',
                        activePanel === p.key && 'bg-secondary text-foreground',
                      )}
                    >
                      <p.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate">{p.label}</span>
                      {p.route && <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground/60" aria-hidden />}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}

        <p className="px-2 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Recentes</p>
        {chat.conversations.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">Suas conversas aparecem aqui.</p>
        ) : (
          <ul>
            {chat.conversations.map((c) => (
              <li key={c.id} className="group relative">
                {renaming?.id === c.id ? (
                  <form
                    className="px-1 py-0.5"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void chat.renameConversation(c.id, renaming.title);
                      setRenaming(null);
                    }}
                  >
                    <input
                      autoFocus
                      aria-label="Novo nome da conversa"
                      value={renaming.title}
                      maxLength={80}
                      onChange={(e) => setRenaming({ id: c.id, title: e.target.value })}
                      onBlur={() => setRenaming(null)}
                      onKeyDown={(e) => e.key === 'Escape' && setRenaming(null)}
                      className="w-full rounded-lg border border-primary/50 bg-background px-2 py-1.5 text-sm outline-none"
                    />
                  </form>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => onOpenConversation(c.id)}
                      aria-current={chat.conversationId === c.id ? 'page' : undefined}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-lg py-1.5 pl-3 pr-9 text-left text-foreground/85 transition hover:bg-secondary',
                        chat.conversationId === c.id && 'bg-secondary text-foreground',
                      )}
                    >
                      {c.pinned && <Pin className="h-3 w-3 shrink-0 text-primary" aria-label="Fixada" />}
                      <span className="truncate">{c.title}</span>
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          aria-label={`Opções da conversa ${c.title}`}
                          className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground opacity-0 hover:bg-background hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100 max-md:opacity-100"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onSelect={() => void chat.pinConversation(c.id, !c.pinned)}>
                          {c.pinned ? <PinOff className="mr-2 h-4 w-4" /> : <Pin className="mr-2 h-4 w-4" />}
                          {c.pinned ? 'Desafixar' : 'Fixar'}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setRenaming({ id: c.id, title: c.title })}>
                          <Pencil className="mr-2 h-4 w-4" /> Renomear
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={() => {
                            if (window.confirm(`Excluir a conversa "${c.title}"? Isso não pode ser desfeito.`)) void chat.removeConversation(c.id);
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="shrink-0 border-t border-border/50 p-2">
        <button
          type="button"
          onClick={onBackToPanel}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-foreground/85 hover:bg-secondary"
        >
          <LayoutGrid className="h-4 w-4 text-muted-foreground" aria-hidden /> Painel Criativo e histórico
        </button>
      </div>
    </div>
  );
}

// ─── Mensagens ───────────────────────────────────────────────────────────

function MessageRow({
  message, activeArtifactId, onOpenArtifact, onOpenPanel,
}: {
  message: VertalMessage;
  activeArtifactId?: string;
  onOpenArtifact: (id: string) => void;
  onOpenPanel: (key: PanelKey) => void;
}) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-3xl bg-secondary px-4 py-2.5 text-[15px] leading-relaxed">{message.text}</div>
      </div>
    );
  }
  const { artifacts, panels, errors } = message.extras;
  const thinking = message.pending && !message.text && (message.steps?.length ?? 0) === 0;
  return (
    <div className="space-y-3">
      {thinking && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Pensando…
        </p>
      )}
      {message.text && <ChatMarkdown text={message.text} />}
      {message.steps && message.steps.length > 0 && (
        <ul className="space-y-1.5" role="status" aria-live="polite">
          {message.steps.map((s, i) => (
            <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
              {s.state === 'running' ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden />
              ) : s.state === 'done' ? (
                <Check className="h-4 w-4 text-emerald-400" aria-hidden />
              ) : (
                <AlertCircle className="h-4 w-4 text-destructive" aria-hidden />
              )}
              <span>{s.label}{s.state === 'running' ? '…' : ''}</span>
            </li>
          ))}
        </ul>
      )}
      {artifacts.map((a) => (
        <ArtifactCard key={a.id} artifact={a} active={a.id === activeArtifactId} onOpen={() => onOpenArtifact(a.id)} />
      ))}
      {panels.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {panels.map((key) => {
            const info = PANEL_BY_KEY[key];
            return (
              <button
                key={key}
                type="button"
                onClick={() => onOpenPanel(key)}
                className="inline-flex items-center gap-2 rounded-xl border border-border/60 bg-card px-3 py-2 text-sm font-medium hover:border-primary/50"
              >
                <info.icon className="h-4 w-4 text-primary" /> Abrir {info.label}
              </button>
            );
          })}
        </div>
      )}
      {errors.map((e, i) => (
        <p key={i} className="flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {e}
        </p>
      ))}
    </div>
  );
}

// ─── Compositor ──────────────────────────────────────────────────────────

function Composer({
  value, onChange, onSubmit, onFill, busy, inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onFill: (text: string) => void;
  busy: boolean;
  inputRef: React.RefObject<HTMLTextAreaElement>;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="rounded-3xl border border-border/70 bg-card shadow-[0_8px_30px_-12px_rgba(0,0,0,0.6)] transition focus-within:border-primary/50">
      <textarea
        ref={inputRef}
        value={value}
        rows={1}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            onSubmit();
          }
        }}
        aria-label="Mensagem para o Vertal Chat"
        placeholder="Peça o que quiser: um post, uma planilha, um app…"
        className="block max-h-[220px] w-full resize-none bg-transparent px-5 pb-1 pt-4 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground/70"
      />
      <div className="flex items-center gap-2 px-3 pb-3 pt-1">
        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="O que o chat pode criar"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
            >
              <Plus className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-1.5">
            <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Pedir ao chat</p>
            <ul>
              {STARTERS.map((s) => (
                <li key={s.label}>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onFill(s.text);
                    }}
                    className="w-full rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-secondary"
                  >
                    {s.label}
                  </button>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
        <span className="flex-1" />
        <button
          type="button"
          onClick={onSubmit}
          disabled={busy || !value.trim()}
          aria-label={busy ? 'O chat está trabalhando' : 'Enviar mensagem'}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground transition hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

// ─── Aprovação de chamada de API ─────────────────────────────────────────

function ApiApprovalDialog({ approval }: { approval: ReturnType<typeof useVertalChat>['approval'] }) {
  return (
    <Dialog open={!!approval} onOpenChange={(open) => !open && approval?.resolve(false)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" aria-hidden /> Permitir esta ação?
          </DialogTitle>
          <DialogDescription>O chat precisa da sua permissão para agir fora dele e concluir o seu pedido.</DialogDescription>
        </DialogHeader>
        {approval && (
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Serviço</dt>
              <dd className="font-semibold">{approval.host}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Chamada</dt>
              <dd className="break-all rounded-lg bg-muted/50 px-2.5 py-2 font-mono text-xs">{approval.method} {approval.url}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Motivo</dt>
              <dd>{approval.reason}</dd>
            </div>
            {approval.secrets.length > 0 && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
                <dt className="text-xs font-semibold text-primary">Usa segredos do seu cofre</dt>
                <dd className="mt-0.5 font-mono text-xs">{approval.secrets.join(', ')}</dd>
                <dd className="mt-1 text-xs text-muted-foreground">O valor é enviado só para {approval.host} e nunca aparece no chat.</dd>
              </div>
            )}
            {approval.hasBody && <p className="text-xs text-muted-foreground">Esta chamada envia dados e pode alterar algo no serviço.</p>}
          </dl>
        )}
        <DialogFooter className="gap-2 sm:gap-2">
          <button type="button" onClick={() => approval?.resolve(false)} className="rounded-lg border border-border/60 px-4 py-2 text-sm font-medium hover:bg-secondary">
            Não permitir
          </button>
          <button type="button" onClick={() => approval?.resolve(true)} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            Permitir
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
