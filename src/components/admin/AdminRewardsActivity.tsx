import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface ActivityRow {
  reward_day: string;
  user_id: string;
  email: string | null;
  videos: number;
  music_tracks_counted: number;
  music_tracks_total: number;
  terra_ads: number;
  completed: boolean;
  completed_at: string | null;
  pending_credits: number;
  released_credits: number;
  expired_credits: number;
}

/**
 * Admin: quem está fazendo as atividades do painel /recompensas, por usuário e dia (São Paulo).
 * Lê public.admin_reward_daily_activity (só admin; também roda no SQL Editor do Supabase).
 */
export default function AdminRewardsActivity() {
  const [days, setDays] = useState(7);
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    const { data, error: rpcError } = await supabase.rpc("admin_reward_daily_activity", { _days: days });
    setError(rpcError ? rpcError.message : null);
    setRows((data ?? []) as ActivityRow[]);
    setBusy(false);
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  const completedCount = rows.filter((r) => r.completed).length;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Checklist diário (vídeo + 5 músicas do Kubo + 1 vídeo extra). A coluna TERRA mostra só o histórico: o anúncio saiu do site.</span>
          <span className="ml-auto text-xs text-muted-foreground">
            {completedCount}/{rows.length} usuário-dia completos
          </span>
          {[1, 7, 30].map((d) => (
            <Button key={d} size="sm" variant={d === days ? "default" : "outline"} onClick={() => setDays(d)}>
              {d === 1 ? "Hoje" : `${d} dias`}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => void load()} aria-label="Atualizar">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="max-h-[600px] overflow-auto">
          {busy && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Carregando…
            </div>
          )}
          <table className="w-full text-xs" data-testid="admin-rewards-activity">
            <thead className="sticky top-0 bg-muted/40">
              <tr>
                <th className="p-2 text-left">Dia</th>
                <th className="p-2 text-left">Usuário</th>
                <th className="p-2 text-right">Vídeos</th>
                <th className="p-2 text-right">Músicas</th>
                <th className="p-2 text-right">TERRA</th>
                <th className="p-2 text-left">Checklist</th>
                <th className="p-2 text-right">Pendente</th>
                <th className="p-2 text-right">Liberado</th>
                <th className="p-2 text-right">Expirado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.reward_day}-${r.user_id}`} className="border-t border-border">
                  <td className="whitespace-nowrap p-2">{r.reward_day}</td>
                  <td className="p-2">{r.email ?? `${r.user_id.slice(0, 8)}…`}</td>
                  <td className="p-2 text-right">{r.videos}</td>
                  <td className="p-2 text-right">
                    {r.music_tracks_counted}/{r.music_tracks_total}
                  </td>
                  <td className="p-2 text-right">{r.terra_ads}</td>
                  <td className="p-2">
                    <Badge variant={r.completed ? "default" : "outline"} className="text-[10px]">
                      {r.completed ? "completo" : "incompleto"}
                    </Badge>
                  </td>
                  <td className="p-2 text-right">{r.pending_credits}</td>
                  <td className="p-2 text-right">{r.released_credits}</td>
                  <td className="p-2 text-right">{r.expired_credits}</td>
                </tr>
              ))}
              {!busy && rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-muted-foreground">
                    Nenhuma atividade no período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
