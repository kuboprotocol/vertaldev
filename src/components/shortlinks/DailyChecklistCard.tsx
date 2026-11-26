import { CheckCircle2, Circle, Gift, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { DAILY_CHECKLIST_NOTICE, type DailyChecklist } from "@/lib/dailyRewards";

/** Checklist do dia no topo de /recompensas: aviso, as 3 atividades obrigatórias e os créditos. */
export default function DailyChecklistCard({ checklist }: { checklist: DailyChecklist | null }) {
  const total = checklist?.music_tracks_total ?? 5;
  const items = [
    {
      key: "video",
      label: "Assista ao vídeo premiado",
      detail: checklist ? `${checklist.videos_today} hoje` : "",
      done: checklist?.video_done ?? false,
    },
    {
      key: "music",
      label: "Ouça as 5 músicas do Kubo",
      detail: checklist ? `${checklist.music_tracks_counted}/${total}` : `0/${total}`,
      done: checklist?.music_done ?? false,
    },
    {
      key: "terra",
      label: "Veja o anúncio TERRA ADS",
      detail: checklist ? `${checklist.terra_today} hoje` : "",
      done: checklist?.terra_done ?? false,
    },
  ];
  const doneCount = items.filter((i) => i.done).length;
  const completed = checklist?.completed ?? false;

  return (
    <Card className="glass glass-border" data-testid="daily-checklist">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Gift className="h-5 w-5 text-primary" />
            Atividades do dia
          </CardTitle>
          <span className="text-xs text-muted-foreground" data-testid="daily-checklist-progress">
            {doneCount}/3 concluídas
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className="flex gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm text-foreground"
          data-testid="daily-checklist-notice"
        >
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p>{DAILY_CHECKLIST_NOTICE}</p>
        </div>

        <Progress value={(doneCount / 3) * 100} className="h-2" />

        <ul className="grid gap-2 sm:grid-cols-3">
          {items.map((item) => (
            <li
              key={item.key}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                item.done ? "border-green-500/40 bg-green-500/5" : "border-border/60"
              }`}
              data-testid={`daily-checklist-${item.key}`}
              data-done={item.done}
            >
              {item.done ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
              ) : (
                <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <span className="flex-1">{item.label}</span>
              <span className="text-xs text-muted-foreground">{item.detail}</span>
            </li>
          ))}
        </ul>

        <p className="text-xs text-muted-foreground" data-testid="daily-checklist-credits">
          {completed
            ? `Recompensas de hoje liberadas: ${checklist?.released_credits ?? 0} crédito(s) no seu saldo.`
            : `Créditos pendentes hoje: ${checklist?.pending_credits ?? 0}. Eles vão para o seu saldo quando você completar as 3 atividades; se o dia acabar antes (meia-noite, horário de Brasília), expiram.`}
        </p>
      </CardContent>
    </Card>
  );
}
