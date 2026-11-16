import { supabase } from '@/integrations/supabase/client'
import type { VibeToolId } from '@/config/vibeAgents'

export interface AgentDraft { name: string; instructions: string; tools: VibeToolId[] }
export interface SavedAgent extends AgentDraft { id: string; created_at: string }
/** setup_route is null for platform capabilities (e.g. the Python sandbox) that the user cannot connect. */
export interface Readiness { connector: string; label: string; setup_route: string | null; connected: boolean }
export type Step =
  | { type: 'thought' | 'final'; agent: string; text: string }
  | { type: 'tool'; agent: string; tool: VibeToolId; args: Record<string, unknown>; ok: boolean; result: string }
export interface RunResult { status: 'completed' | 'failed'; output: string; steps: Step[]; credits_charged?: number }

const ERRORS: Record<string, string> = {
  agent_model_not_configured: 'O modelo dos agentes ainda não está ativo (falta a chave do OpenRouter).',
  deduction_failed: 'Créditos insuficientes para executar o agente.',
  sandbox_not_configured: 'A sandbox Python ainda não foi ativada na plataforma.',
  agent_limit_reached: 'Você chegou ao limite de agentes. Apague algum para criar outro.',
  description_required: 'Descreva o que o agente deve fazer.',
  duplicate_request: 'Essa execução já foi enviada.',
}

export const friendlyAgentError = (code: string) =>
  ERRORS[code] ?? (code.startsWith('rate_limit') ? 'Muitas solicitações. Aguarde um minuto.' : code)

/** Calls the `vibe-agents` edge function. A failed run still carries its steps, so they are returned as data. */
export async function invokeAgents<T>(body: Record<string, unknown>, idempotencyKey?: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke('vibe-agents', {
    body,
    headers: idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : undefined,
  })
  if (error) {
    const detail = await (error as { context?: Response }).context?.json?.().catch(() => null)
    if (detail?.steps) return detail as T
    throw new Error(friendlyAgentError(detail?.error ?? error.message))
  }
  return data as T
}

// vibe_agents is newer than the generated Supabase types; type just the queries used by the Vibe screens.
export interface AgentsTable {
  select: (cols: string) => { order: (col: string, o: { ascending: boolean }) => PromiseLike<{ data: SavedAgent[] | null }> }
  delete: () => { eq: (col: string, v: string) => PromiseLike<{ error: unknown }> }
}
export const agentsTable = () => (supabase as unknown as { from: (t: string) => AgentsTable }).from('vibe_agents')
