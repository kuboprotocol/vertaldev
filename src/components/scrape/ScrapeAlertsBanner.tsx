// Alertas no chat (F5): mudanças detectadas pelos monitores e avisos de captcha.
// Consulta /api/scrape/alerts a cada minuto enquanto o chat está aberto; também mostra
// o aviso "Apareceu um captcha, resolva na tela ao vivo" quando o Navigator pausa.
import { useCallback, useEffect, useState } from 'react';
import { Bell, ShieldAlert, X } from 'lucide-react';
import { callScrape, type ScrapeAlert } from '@/lib/scrape/client';

export function ScrapeAlertsBanner({ onOpenMonitors, onOpenNavigator, pollMs = 60_000, alerts: withAlerts = true }: { onOpenMonitors?: () => void; onOpenNavigator?: () => void; pollMs?: number; alerts?: boolean }) {
  const [alerts, setAlerts] = useState<ScrapeAlert[]>([]);
  const [captcha, setCaptcha] = useState<{ message: string; host?: string } | null>(null);

  const load = useCallback(async () => {
    const r = await callScrape('alerts', {});
    if (r.ok) setAlerts(r.alerts ?? []);
  }, []);

  useEffect(() => {
    if (!withAlerts) return;
    void load();
    const t = setInterval(() => void load(), pollMs);
    return () => clearInterval(t);
  }, [load, pollMs, withAlerts]);

  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ message: string; host?: string }>).detail;
      setCaptcha({ message: d?.message ?? 'Apareceu um captcha, resolva na tela ao vivo', host: d?.host });
    };
    window.addEventListener('vertal-navigator:captcha', on);
    return () => window.removeEventListener('vertal-navigator:captcha', on);
  }, []);

  const dismiss = async (ids: string[]) => {
    setAlerts((a) => a.filter((x) => !ids.includes(x.id)));
    await callScrape('alerts-seen', { ids });
  };

  if (!alerts.length && !captcha) return null;
  return (
    <div className="space-y-2 px-3 pt-2" role="region" aria-label="Alertas">
      {captcha && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm" role="alert">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden />
          <p className="min-w-0 flex-1">
            <strong>{captcha.message}</strong>{captcha.host ? ` (${captcha.host})` : ''}. A tarefa está pausada e o controle é seu; ao devolver, ela continua. Não resolvo captcha automaticamente.
            {onOpenNavigator && <button type="button" className="ml-2 underline" onClick={onOpenNavigator}>Abrir tela ao vivo</button>}
          </p>
          <button type="button" aria-label="Fechar aviso" onClick={() => setCaptcha(null)}><X className="h-4 w-4" aria-hidden /></button>
        </div>
      )}
      {alerts.slice(0, 3).map((a) => (
        <div key={a.id} className="flex items-start gap-2 rounded-xl border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
          <Bell className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          <p className="min-w-0 flex-1">
            {a.message}
            {a.url && <a href={a.url} target="_blank" rel="noreferrer noopener" className="ml-2 text-xs text-primary hover:underline">ver página</a>}
            {onOpenMonitors && <button type="button" className="ml-2 text-xs underline" onClick={onOpenMonitors}>Monitores</button>}
          </p>
          <button type="button" aria-label="Marcar como visto" onClick={() => void dismiss([a.id])}><X className="h-4 w-4" aria-hidden /></button>
        </div>
      ))}
      {alerts.length > 3 && <button type="button" className="text-xs underline" onClick={() => void dismiss(alerts.map((a) => a.id))}>Marcar todos ({alerts.length}) como vistos</button>}
    </div>
  );
}

export default ScrapeAlertsBanner;
