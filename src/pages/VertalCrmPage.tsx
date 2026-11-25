// Vertal CRM · tela principal (/crm, carregada sob demanda). CRM grátis; só a IA custa (1 crédito por uso).
// White-label "Vertal CRM". Base adaptada do Atomic CRM (MIT, Marmelab) — ver src/components/vertal-crm/LICENSE.atomic-crm.md.
import { lazy, Suspense } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Building2, Handshake, LayoutDashboard, ListChecks, Loader2, Settings2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useVertalCrmAccess } from '@/lib/vertalCrm/client';
import { CrmProvider } from '@/components/vertal-crm/CrmContext';
import { useCrm } from '@/components/vertal-crm/crmState';
import { CrmDashboard, CrmTasksList } from '@/components/vertal-crm/CrmDashboard';
import { CrmCompanies, CrmContacts } from '@/components/vertal-crm/CrmContacts';
import { CrmDeals } from '@/components/vertal-crm/CrmDeals';
import { CrmSettings } from '@/components/vertal-crm/CrmSettings';
import { CrmWaitlist } from '@/components/vertal-crm/CrmWaitlist';
import { isCrmWaitlistEnabled } from '@/lib/vertalCrm/waitlist';

const NotFound = lazy(() => import('@/pages/NotFound'));

const TABS = [
  { id: 'dashboard', icon: LayoutDashboard },
  { id: 'contacts', icon: Users },
  { id: 'companies', icon: Building2 },
  { id: 'deals', icon: Handshake },
  { id: 'tasks', icon: ListChecks },
  { id: 'settings', icon: Settings2 },
] as const;
type TabId = (typeof TABS)[number]['id'];

function CrmShell() {
  const { ready, error, workspace, t } = useCrm();
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const tab = (TABS.find((x) => x.id === sp.get('aba'))?.id ?? 'dashboard') as TabId;
  const go = (id: TabId) => {
    setSp((p) => { const n = new URLSearchParams(p); n.set('aba', id); return n; }, { replace: true });
  };
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b bg-card/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/connectors')} aria-label={t.back}><ArrowLeft className="h-5 w-5" /></Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-xl font-bold">{t.title}{workspace ? <span className="ml-2 text-sm font-normal text-muted-foreground">{workspace.name}</span> : null}</h1>
            <p className="truncate text-xs text-muted-foreground">{t.subtitle}</p>
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-2" aria-label="Vertal CRM">
          {TABS.map(({ id, icon: Icon }) => (
            <button key={id} type="button" onClick={() => go(id)} data-testid={`crm-tab-${id}`}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ${tab === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'}`}>
              <Icon className="h-4 w-4" />{t.tabs[id]}
            </button>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        {!ready ? (
          <div className="flex justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : error || !workspace ? (
          <p className="py-20 text-center text-sm text-muted-foreground">{t.error}{error ? ` (${error})` : ''}</p>
        ) : (
          <>
            {tab === 'dashboard' && <CrmDashboard />}
            {tab === 'contacts' && <CrmContacts />}
            {tab === 'companies' && <CrmCompanies />}
            {tab === 'deals' && <CrmDeals />}
            {tab === 'tasks' && <CrmTasksList />}
            {tab === 'settings' && <CrmSettings />}
          </>
        )}
      </main>
    </div>
  );
}

export default function VertalCrmPage() {
  const access = useVertalCrmAccess();
  const [sp] = useSearchParams();
  if (access === 'checking') return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  // Fora da allowlist: "liberação em breve / entrar na lista" (nunca um erro). Com VITE_VERTAL_CRM_WAITLIST=false volta ao 404.
  if (access !== 'allowed') {
    return isCrmWaitlistEnabled() ? <CrmWaitlist langHint={sp.get('lang')} /> : <Suspense fallback={null}><NotFound /></Suspense>;
  }
  return (
    <CrmProvider langHint={sp.get('lang')}>
      <CrmShell />
    </CrmProvider>
  );
}
