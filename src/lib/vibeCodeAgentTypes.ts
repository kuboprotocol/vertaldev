// Shared types between the Vibe Code Agent UI and the `vibe-code-agent` edge function.
import type { DetectedRequirement } from "@/config/connectorCatalog";
import type { DevContext, ReviewCommand, ReviewFinding, ReviewPayload } from "@/lib/vibeReview/engine";

export type VibeRequirement = DetectedRequirement;

export type VibeStepKind =
  | "thinking"
  | "plan"
  | "estimate"
  | "read_file"
  | "edit_file"
  | "diff"
  | "commit"
  | "checkpoint"
  | "credits"
  | "connector"
  | "message"
  | "memory"
  | "conversation"
  | "requirements"
  | "question"
  | "review"
  | "design"
  /** Resultado do Vibe Reviewer (PR-Agent): alimenta a fila de correções do chat. */
  | "review_findings"
  /** Resposta em texto do agente ao usuário (o balão do chat). */
  | "reply"
  | "error"
  | "done";

export type VibeStepStatus = "running" | "success" | "failed" | "skipped";

export type VibeModelTier = "flash" | "pro";

export interface VibeStep {
  id: string;
  kind: VibeStepKind;
  title: string;
  status: VibeStepStatus;
  detail?: string;
  path?: string;
  /** Unified diff preview (when the agent runs in dry-run mode). */
  diff?: string;
  /** Full proposed content, used when the user applies a previewed diff. */
  proposedContent?: string;
  /** Commit SHA produced by this step — enables per-step undo. */
  commitSha?: string;
  /** Endereço do arquivo no GitHub depois do commit (quando o projeto usa GitHub). */
  repoUrl?: string;
  reverted?: boolean;
  /** Persisted checkpoint id (vibe_checkpoints), enables timeline rollback. */
  checkpointId?: string;
  /** Conversa (caixinha) à qual este passo pertence. */
  conversationId?: string;
  isNew?: boolean;
  /** Conectores e APIs que a aplicação precisa (kind "requirements"). */
  requirements?: VibeRequirement[];
  /** Findings do Vibe Reviewer (kind "review_findings"). */
  review?: ReviewPayload;
  /** Model tier chosen by the DeepSeek router for this cycle. */
  tier?: VibeModelTier;
  estimatedCost?: number;
  creditsCharged?: number;
  balanceAfter?: number;
  startedAt: number;
  finishedAt?: number;
}

export interface VibeChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  steps?: VibeStep[];
  createdAt: number;
}

export type VibeAgentMode =
  /** Generates a plan and previews diffs without touching the repository. */
  | "preview"
  /** Generates a plan and commits the changes straight to GitHub. */
  | "apply";

export interface VibeConversation {
  id: string;
  project_id: string | null;
  title: string;
  summary: string | null;
  message_count: number;
  archived: boolean;
  created_at: string;
  last_message_at: string;
}

export interface VibeAgentRequest {
  prompt: string;
  /** Conversa existente; omitida = o agente abre uma nova caixinha. */
  conversationId?: string;
  projectId?: string;
  mode: VibeAgentMode;
  /** Apply an already-previewed set of file writes. */
  apply?: Array<{ path: string; content: string }>;
  /** Revert a single commit produced by a previous step (legacy). */
  revertSha?: string;
  /** Revert to a persisted checkpoint (preferred — powers the timeline UI). */
  revertCheckpointId?: string;
  /** false desliga o Vertal Design Intelligence só neste pedido. */
  designIntelligence?: boolean;
  /** Força o perfil de design em vez de detectar pelo pedido. */
  designSurface?: "web_app" | "saas_dashboard" | "mobile_app" | "landing_page";
  /** Comando do Vibe Reviewer (PR-Agent) em vez de um pedido de código. */
  review?: {
    command: ReviewCommand;
    focus?: string;
    question?: string;
    paths?: string[];
    errors?: string[];
    finding?: ReviewFinding;
    comment?: string;
    fileContent?: string;
  };
  /** Contexto do Dev: erros recentes, arquivo aberto, decisões da fila. */
  devContext?: DevContext;
}

export interface VibeConnectorState {
  slug: "github" | "supabase" | "stripe" | "ionos" | "mcp";
  label: string;
  description: string;
  connected: boolean;
  hint?: string;
}

export interface VibeCheckpoint {
  id: string;
  project_repo: string;
  commit_sha: string;
  summary: string;
  files_changed: string[];
  credits_spent: number;
  model_used: VibeModelTier | null;
  reverted_checkpoint_id: string | null;
  created_at: string;
}

export interface VibeSandboxSession {
  id: string;
  project_repo: string;
  e2b_sandbox_id: string | null;
  preview_url: string | null;
  status: "starting" | "running" | "stopped" | "failed" | "timed_out";
  started_at: string;
  ended_at: string | null;
  credits_charged: number;
}
