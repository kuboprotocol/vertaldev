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

/**
 * "Ganhe compartilhando internet": marca Vertal Node, independente do SDK de banda usado no app.
 * O nome do fornecedor do SDK aparece só na tela de consentimento do próprio SDK, dentro do app
 * (exigência dos termos de cada parceiro). Links de download vêm do env e somem quando não configurados.
 */
export default function VertalNodeCard({
  desktopUrl = envUrl(import.meta.env.VITE_VERTAL_NODE_DESKTOP_URL),
  androidUrl = envUrl(import.meta.env.VITE_VERTAL_NODE_ANDROID_URL),
}: {
  desktopUrl?: string | null;
  androidUrl?: string | null;
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
    <Card className="glass glass-border" data-testid="vertal-node-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wifi className="h-5 w-5 text-primary" />
          Ganhe compartilhando internet
        </CardTitle>
        <CardDescription>
          Instale o <span className="font-medium text-foreground">Vertal Node</span> no computador
          ou no Android e ganhe {summary?.daily_credits ?? 2} créditos por dia ativo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground" data-testid="vertal-node-disclosure">
          Com a sua permissão, o Vertal Node compartilha uma parte da sua conexão de internet não
          usada por meio de um parceiro de rede: o aparelho vira um ponto de saída (exit node).
          Nada é ativado antes de você aceitar a tela de consentimento do parceiro no app, que traz
          os termos e a política de privacidade, e dá para desligar quando quiser no próprio app.
        </p>

        <div className="grid grid-cols-2 gap-3" data-testid="vertal-node-stats">
          <div className="rounded-xl border border-border/60 bg-background/40 p-3">
            <p className="text-xs text-muted-foreground">Créditos ganhos</p>
            <p className="text-lg font-semibold">{summary?.total_credits ?? 0}</p>
          </div>
          <div className="rounded-xl border border-border/60 bg-background/40 p-3">
            <p className="text-xs text-muted-foreground">Dias ativos</p>
            <p className="text-lg font-semibold">{summary?.active_days ?? 0}</p>
          </div>
        </div>
        {summary && summary.devices.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {activeDevices > 0
              ? `${activeDevices} dispositivo(s) ativo(s)${summary.credited_today ? " · crédito de hoje já recebido" : ""}`
              : "Nenhum dispositivo compartilhando agora."}
          </p>
        )}

        {(desktopUrl || androidUrl) && (
          <div className="flex flex-col gap-2 sm:flex-row">
            {desktopUrl && (
              <Button asChild variant="outline" className="flex-1">
                <a href={desktopUrl} target="_blank" rel="noopener noreferrer" data-testid="vertal-node-desktop">
                  <Download className="mr-2 h-4 w-4" />
                  Baixar para computador
                </a>
              </Button>
            )}
            {androidUrl && (
              <Button asChild variant="outline" className="flex-1">
                <a href={androidUrl} target="_blank" rel="noopener noreferrer" data-testid="vertal-node-android">
                  <Smartphone className="mr-2 h-4 w-4" />
                  Baixar para Android
                </a>
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
