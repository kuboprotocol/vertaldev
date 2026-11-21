// Painel "Monitores" (F5): criar, pausar, retomar, verificar agora e excluir monitores de
// página (preço, estoque, avaliações, mudanças). Coleta com Scrapling no servidor; robots.txt,
// limites e créditos (tabela abaixo) valem para tudo. Alertas de mudança aparecem no chat.
import { useCallback, useEffect, useState } from 'react';
import { Eye, Loader2, Pause, Play, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { SCRAPE_LIMITS, SCRAPE_PRICE_TABLE } from '../../../supabase/functions/_shared/scrapeCore';
import { callWithConsent } from '@/lib/scrape/runScrape';
import type { ScrapeMonitor } from '@/lib/scrape/client';
import { navBtn, navInput, navPrimary } from '@/components/navigator/navigatorUi';

const FREQ_LABEL: Record<number, string> = { 60: 'a cada 1 h', 180: 'a cada 3 h', 360: 'a cada 6 h', 720: 'a cada 12 h', 1440: '1 vez por dia' };
const STATUS_LABEL: Record<string, string> = { active: 'Ativo', paused: 'Pausado', error: 'Com erro', needs_attention: 'Precisa de você', paused_no_credits: 'Pausado (sem créditos)' };

export function MonitorsPanel() {
  const [monitors, setMonitors] = useState<ScrapeMonitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', url: '', css: '', mode: 'fetch', frequencyMinutes: 1440 });

  const load = useCallback(async () => {
    setLoading(true);
    const r = await callWithConsent('monitors', {});
    setLoading(false);
    if (r.ok) setMonitors(r.monitors ?? []);
    else setMsg(r.message ?? 'Não consegui carregar os monitores.');
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    setBusy('create');
    setMsg(null);
    const r = await callWithConsent('monitor-create', {
      name: form.name, url: form.url, selector: { name: 'valor', css: form.css }, mode: form.mode, frequencyMinutes: form.frequencyMinutes,
    });
    setBusy(null);
    if (!r.ok) {
      setMsg(r.detail === 'selector_not_found' ? 'O seletor não encontrou nada nessa página. Confira o seletor CSS.' : r.message ?? 'Não foi possível criar o monitor.');
      return;
    }
    setMsg(`Monitor criado. Valor atual: "${r.value ?? ''}" (${r.credits ?? 0} créditos).`);
    setForm({ ...form, name: '', url: '', css: '' });
    void load();
  };

  const act = async (m: ScrapeMonitor, op: 'pause' | 'resume' | 'check' | 'delete') => {
    if (op === 'delete' && !window.confirm(`Excluir o monitor "${m.name}"?`)) return;
    setBusy(`${op}:${m.id}`);
    setMsg(null);
    const route = op === 'delete' ? 'monitor-delete' : op === 'check' ? 'monitor-check' : 'monitor-update';
    const r = await callWithConsent(route, { id: m.id, ...(op === 'pause' ? { status: 'paused' } : op === 'resume' ? { status: 'active' } : {}) });
    setBusy(null);
    if (!r.ok) setMsg(r.message ?? 'Não foi possível concluir.');
    else if (op === 'check') setMsg(r.outcome?.message ?? 'Verificado.');
    void load();
  };

  const prices = SCRAPE_PRICE_TABLE.filter((p) => p.key.startsWith('monitor'));

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-3 sm:p-4">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Eye className="h-5 w-5 text-primary" aria-hidden />
          <div>
            <h2 className="text-base font-semibold">Monitores</h2>
            <p className="text-xs text-muted-foreground">Acompanhe preços, estoque, avaliações e mudanças em páginas públicas. Avisos chegam no chat.</p>
          </div>
        </div>
        <button type="button" className={navBtn} onClick={() => void load()} disabled={loading}><RefreshCw className="h-4 w-4" aria-hidden /> Atualizar</button>
      </header>

      <form className="grid gap-2 rounded-xl border border-border/60 p-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void create(); }}>
        <label className="text-xs">Nome
          <input className={navInput} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={80} placeholder="Preço do concorrente" />
        </label>
        <label className="text-xs">Página (URL pública)
          <input className={navInput} value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} maxLength={2000} placeholder="https://loja.com/produto" required />
        </label>
        <label className="text-xs">Seletor CSS do valor
          <input className={navInput} value={form.css} onChange={(e) => setForm({ ...form, css: e.target.value })} maxLength={300} placeholder=".price" required />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs">Modo
            <select className={navInput} value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
              <option value="fetch">HTTP simples</option>
              <option value="dynamic">Dinâmico (JS)</option>
              <option value="stealth">Stealth</option>
            </select>
          </label>
          <label className="text-xs">Frequência
            <select className={navInput} value={form.frequencyMinutes} onChange={(e) => setForm({ ...form, frequencyMinutes: Number(e.target.value) })}>
              {SCRAPE_LIMITS.monitorFrequencies.map((f) => <option key={f} value={f}>{FREQ_LABEL[f] ?? `${f} min`}</option>)}
            </select>
          </label>
        </div>
        <div className="flex items-center justify-between gap-2 sm:col-span-2">
          <p className="text-[11px] text-muted-foreground">A 1ª verificação acontece agora e é cobrada. Até {SCRAPE_LIMITS.maxMonitorsPerUser} monitores.</p>
          <button type="submit" className={navPrimary} disabled={busy === 'create' || !form.url || !form.css}>
            {busy === 'create' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />} Criar monitor
          </button>
        </div>
      </form>

      {msg && <p className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm" role="status">{msg}</p>}

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Carregando…</p>
      ) : monitors.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum monitor ainda.</p>
      ) : (
        <ul className="space-y-2" aria-label="Seus monitores">
          {monitors.map((m) => (
            <li key={m.id} className="rounded-xl border border-border/60 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{m.name}</p>
                  <a href={m.url} target="_blank" rel="noreferrer noopener" className="block truncate text-xs text-primary hover:underline">{m.url}</a>
                  <p className="text-xs text-muted-foreground">
                    {STATUS_LABEL[m.status] ?? m.status} · {FREQ_LABEL[m.frequency_minutes] ?? `${m.frequency_minutes} min`} · {m.unitCredits} créditos/verificação · gasto {m.credits_spent}
                  </p>
                  <p className="mt-1 text-sm">Último valor: <strong>{m.last_value ?? '—'}</strong></p>
                  {m.status_detail && <p className="text-xs text-amber-500">{m.status_detail}</p>}
                </div>
                <div className="flex flex-wrap gap-1">
                  {m.status === 'active'
                    ? <button type="button" className={navBtn} disabled={!!busy} onClick={() => void act(m, 'pause')}><Pause className="h-4 w-4" aria-hidden /> Pausar</button>
                    : <button type="button" className={navBtn} disabled={!!busy} onClick={() => void act(m, 'resume')}><Play className="h-4 w-4" aria-hidden /> Retomar</button>}
                  <button type="button" className={navBtn} disabled={!!busy} onClick={() => void act(m, 'check')}><RefreshCw className="h-4 w-4" aria-hidden /> Verificar agora</button>
                  <button type="button" className={navBtn} disabled={!!busy} onClick={() => void act(m, 'delete')}><Trash2 className="h-4 w-4" aria-hidden /> Excluir</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <details className="rounded-xl border border-border/60 p-3 text-xs">
        <summary className="cursor-pointer font-medium">Créditos do monitoramento</summary>
        <table className="mt-2 w-full text-left">
          <tbody>
            {prices.map((p) => <tr key={p.key} className="border-t border-border/40"><td className="py-1 pr-2">{p.service}</td><td className="py-1 pr-2">{p.unit}</td><td className="py-1 font-semibold">{p.credits === 0 ? 'grátis' : `${p.credits} créditos`}</td></tr>)}
          </tbody>
        </table>
        <p className="mt-2 text-muted-foreground">robots.txt é respeitado; captcha, paywall e login de terceiros não são contornados (captcha: você resolve na tela ao vivo do Navigator).</p>
      </details>
    </div>
  );
}

export default MonitorsPanel;
