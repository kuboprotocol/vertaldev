// Conector "Vertal AI" no front: núcleo compartilhado com as edge functions + chamadas da tela.
// A flag do servidor (VERTAL_AI_CONNECTOR_ENABLED + allowlist) decide quem pode ativar; a do
// front (VITE_VERTAL_AI_CONNECTOR, padrão desligado) só decide se o cartão aparece.
export * from "../../supabase/functions/_shared/vertalAiConnector";
import { supabase } from "@/integrations/supabase/client";

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

export function vertalAiConnectorUiEnabled(env: Record<string, unknown> | undefined = import.meta.env as Record<string, unknown>): boolean {
  return /^(1|true|yes|on|sim)$/i.test(String(env?.VITE_VERTAL_AI_CONNECTOR ?? "").trim());
}

export interface ConnectorActivation {
  active: boolean;
  created?: boolean;
  keyId?: string;
  proxyUrl?: string;
  video?: boolean;
  scope?: string;
}

export class VertalAiConnectorError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function call(body: Record<string, unknown>, fetchImpl: typeof fetch = fetch): Promise<ConnectorActivation & { allowed?: boolean }> {
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  if (!token) throw new VertalAiConnectorError("Entre na sua conta.", 401);
  const r = await fetchImpl(`${BASE}/vertal-ai-api/connector`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
    body: JSON.stringify(body),
  });
  const data = (await r.json().catch(() => ({}))) as { error?: { message?: string } } & ConnectorActivation;
  if (!r.ok) throw new VertalAiConnectorError(data.error?.message ?? `Falha (${r.status}).`, r.status);
  return data;
}

/** Ativa (idempotente) a Vertal AI no projeto. Nunca recebe a chave: só o ref/proxy e o estado. */
export const vertalAiConnectorApi = {
  status: (projectId?: string | null) => call({ action: "status", projectId: projectId ?? null }),
  activate: (projectId?: string | null, needs?: { video?: boolean }) => call({ action: "activate", projectId: projectId ?? null, needs: needs ?? {} }),
  deactivate: (projectId?: string | null) => call({ action: "deactivate", projectId: projectId ?? null }),
};

/** Pedido que o Vibe Code manda depois do clique: liga a IA do app usando o conector recém-ativado. */
export const VERTAL_AI_FOLLOW_UP_PROMPT = "Conecte a IA deste app à Vertal AI (conector já ativado): use o helper src/lib/vertalAi.ts nas telas que precisam de IA.";
