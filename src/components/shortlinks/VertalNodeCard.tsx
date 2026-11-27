import { useCallback, useEffect, useState } from "react";
import { Download, Smartphone, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

/** Resposta de `vertal-node-heartbeat?action=summary`. */
export interface NodeSummary {
  daily_credits: number;
  total_credits: number;
  active_days: number;
  credited_today: boolean;
  devices: {
    device_id: string;
    platform: string;
    provider?: string;
    opted_in: boolean;
    running: boolean;
    last_seen_at: string;
  }[];
}

function envUrl(v: unknown): string | null {
  return typeof v === "string" && /^https:\/\//.test(v.trim()) ? v.trim() : null;
}

/** Nome do parceiro no rodapé (VITE_VERTAL_NODE_PARTNER). Vazio = rodapé escondido. */
function envText(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, 60) : null;
}

/**
 * "Ganhe compartilhando internet": marca Vertal Node, independente do SDK de banda usado no app.
 * O nome do fornecedor do SDK aparece só na tela de consentimento do próprio SDK, dentro do app
 * (exigência dos termos de cada parceiro). Links de download vêm do env e somem quando não configurados.
 * O rodapé discreto "Parceiro: …" só aparece quando VITE_VERTAL_NODE_PARTNER está definido.
 */
export default function VertalNodeCard({
  desktopUrl = envUrl(import.meta.env.VITE_VERTAL_NODE_DESKTOP_URL),
  androidUrl = envUrl(import.meta.env.VITE_VERTAL_NODE_ANDROID_URL),
  partner = envText(import.meta.env.VITE_VERTAL_NODE_PARTNER),
}: {
  desktopUrl?: string | null;
  androidUrl?: string | null;
  partner?: string | null;
}) {
  const [summary, setSummary] = useState<NodeSummary | null>(null);

  const refresh = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke(
        "vertal-node-heartbeat?action=summary",
        { method: "GET" },
      );
      if (!error && data) setSummary(data as NodeSummary);
    } catch {
      /* card continua útil sem o resumo */
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const activeDevices = summary?.devices.filter((d) => d.opted_in && d.running).length ?? 0;

  return (
    <Card className="rounded-2xl border-white/[0.06] bg-card/50" data-testid="vertal-node-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wifi className="h-5 w-5 text-primary" />
          Earn by sharing your internet
        </CardTitle>
        <CardDescription>
          Install <span className="font-medium text-foreground">Vertal Node</span> on your computer
          or Android phone and earn {summary?.daily_credits ?? 2} credits for each active day.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground" data-testid="vertal-node-disclosure">
          With your permission, Vertal Node shares part of your unused internet connection through a
          network partner: your device becomes an exit node. Nothing turns on until you accept the
          partner's consent screen in the app, which shows its terms and privacy policy. You can turn
          it off at any time in the app.
        </p>

        <div className="grid grid-cols-2 gap-3" data-testid="vertal-node-stats">
          <div className="rounded-xl border border-border/60 bg-background/40 p-3">
            <p className="text-xs text-muted-foreground">Credits earned</p>
            <p className="text-lg font-semibold">{summary?.total_credits ?? 0}</p>
          </div>
          <div className="rounded-xl border border-border/60 bg-background/40 p-3">
            <p className="text-xs text-muted-foreground">Active days</p>
            <p className="text-lg font-semibold">{summary?.active_days ?? 0}</p>
          </div>
        </div>
        {summary && summary.devices.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {activeDevices > 0
              ? `${activeDevices} active device(s)${summary.credited_today ? " · today's credit received" : ""}`
              : "No device is sharing right now."}
          </p>
        )}

        {(desktopUrl || androidUrl) && (
          <div className="flex flex-col gap-2 sm:flex-row">
            {desktopUrl && (
              <Button asChild variant="outline" className="flex-1">
                <a href={desktopUrl} target="_blank" rel="noopener noreferrer" data-testid="vertal-node-desktop">
                  <Download className="mr-2 h-4 w-4" />
                  Download for computer
                </a>
              </Button>
            )}
            {androidUrl && (
              <Button asChild variant="outline" className="flex-1">
                <a href={androidUrl} target="_blank" rel="noopener noreferrer" data-testid="vertal-node-android">
                  <Smartphone className="mr-2 h-4 w-4" />
                  Download for Android
                </a>
              </Button>
            )}
          </div>
        )}

        {partner ? (
          <p
            className="pt-1 text-center text-[10px] leading-tight text-muted-foreground/60"
            data-testid="vertal-node-partner"
          >
            Partner: {partner}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
