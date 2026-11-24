// VERTAL Code AI · estado da conversa na tela (puro, testável). Guardado só no aparelho (localStorage).
import type { VcaStreamEvent, VcaUiEffort, VcaUiMode } from './client';

export const EFFORT_LABEL: Record<VcaUiEffort, string> = {
  auto: 'Auto',
  low: 'Rápido',
  high: 'Profundo',
  max: 'Máximo',
};

export interface PlanData {
  goal: string;
  steps: Array<{ title: string; detail?: string; files: string[] }>;
  risks: string[];
  questions: string[];
}

export interface DiffItem {
  path: string;
  diff: string;
  added: number;
  removed: number;
  after: string | null;
  isNew: boolean;
  isDelete: boolean;
  selected: boolean;
  baseHash?: string;
  status: 'pending' | 'applied' | 'conflict' | 'skipped';
}

export interface StepItem {
  text: string;
  tone?: 'good' | 'bad';
}

export type ChatItem =
  | { type: 'user'; id: string; text: string; mode: VcaUiMode; images: number; files: string[] }
  | {
      type: 'agent';
      id: string;
      steps: StepItem[];
      diffs: DiffItem[];
      done: boolean;
      reply?: string;
      error?: string;
      plan?: PlanData;
      /** Pedido original (para "Construir este plano"). */
      prompt?: string;
    };

type AgentItem = Extract<ChatItem, { type: 'agent' }>;

const s = (v: unknown) => (typeof v === 'string' ? v : '');
const n = (v: unknown) => (typeof v === 'number' ? v : 0);

/** Aplica um evento do servidor ao balão do agente. */
export function reduceEvent(item: AgentItem, e: VcaStreamEvent): AgentItem {
  switch (e.kind) {
    case 'status':
      return { ...item, steps: [...item.steps, { text: s(e.title) }] };
    case 'model': {
      const cost = e.cost === 'paid' ? ' (pago)' : e.cost === 'self_hosted' ? ' (servidor Vertal)' : ' (grátis)';
      const text = `Modelo: ${s(e.label)}${cost}${e.fellBack ? ' · troca automática' : ''}`;
      // Mesmo modelo da volta anterior: não repete a linha.
      const last = [...item.steps].reverse().find((st) => st.text.startsWith('Modelo:'));
      if (last?.text === text) return item;
      return { ...item, steps: [...item.steps, { text }] };
    }
    case 'read': {
      const paths = Array.isArray(e.paths) ? (e.paths as string[]) : [];
      return paths.length ? { ...item, steps: [...item.steps, { text: `Leu ${paths.length} arquivo(s): ${paths.slice(0, 4).join(', ')}${paths.length > 4 ? '…' : ''}` }] } : item;
    }
    case 'verify': {
      const issues = Array.isArray(e.issues) ? (e.issues as Array<{ path: string; problem: string }>) : [];
      return {
        ...item,
        steps: [
          ...item.steps,
          e.ok
            ? { text: 'Verificação passou (sintaxe, imports, segredos, placeholders)', tone: 'good' }
            : { text: `Verificação achou ${issues.length} problema(s): ${issues.slice(0, 2).map((i) => `${i.path}: ${i.problem}`).join(' · ')}`, tone: 'bad' },
        ],
      };
    }
    case 'diff': {
      const path = s(e.path);
      if (!path) return item;
      const d: DiffItem = {
        path,
        diff: s(e.diff),
        added: n(e.added),
        removed: n(e.removed),
        after: typeof e.after === 'string' ? e.after : null,
        isNew: !!e.isNew,
        isDelete: !!e.isDelete,
        selected: !e.isDelete,
        status: 'pending',
      };
      return { ...item, diffs: [...item.diffs.filter((x) => x.path !== path), d] };
    }
    case 'base_hashes': {
      const h = (e.hashes ?? {}) as Record<string, string>;
      return { ...item, diffs: item.diffs.map((d) => ({ ...d, baseHash: typeof h[d.path] === 'string' ? h[d.path] : d.baseHash })) };
    }
    case 'plan':
      return { ...item, plan: e.plan as PlanData };
    case 'reply':
      return { ...item, reply: s(e.text) };
    case 'error':
      return { ...item, error: s(e.message) || 'Erro.' };
    case 'done':
      return { ...item, done: true };
    default:
      return item;
  }
}

const KEY = 'vertal-code-ai:session:v1';

export function loadSession(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): ChatItem[] {
  try {
    const raw = storage?.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as ChatItem[]).map((i) => (i.type === 'agent' ? { ...i, done: true } : i)) : [];
  } catch {
    return [];
  }
}

export function saveSession(items: ChatItem[], storage: Pick<Storage, 'setItem'> | undefined = globalThis.localStorage): void {
  try {
    // Só as últimas 30 mensagens, sem o conteúdo completo dos arquivos (cabe no celular).
    const slim = items.slice(-30).map((i) => (i.type === 'agent' ? { ...i, diffs: i.diffs.map((d) => ({ ...d, after: d.status === 'pending' ? d.after : null })) } : i));
    storage?.setItem(KEY, JSON.stringify(slim));
  } catch {
    /* armazenamento cheio/privado: segue só em memória */
  }
}

/** Histórico enxuto para o modelo (texto do usuário + resumo do agente). */
export function historyForModel(items: ChatItem[]): Array<{ role: 'user' | 'assistant'; content: string }> {
  return items
    .slice(-12)
    .map((i) =>
      i.type === 'user'
        ? { role: 'user' as const, content: i.text }
        : { role: 'assistant' as const, content: [i.reply, i.diffs.length ? `Arquivos alterados: ${i.diffs.map((d) => d.path).join(', ')}` : ''].filter(Boolean).join('\n') },
    )
    .filter((m) => m.content.trim());
}
