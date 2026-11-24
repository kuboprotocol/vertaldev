// VERTAL Code AI — relatórios de operação (diário/semanal) do Vertal Dev.
// Agregação e texto são puros (testáveis); a coleta fica na edge function.

export interface CreditTx {
  user_id: string;
  delta: number;
  category: string | null;
  created_at: string;
}

export interface ErrorRow {
  message: string;
  severity: string | null;
  created_at: string;
}

export interface ApiUsageRow {
  key_id: string;
  prompt_tokens: number;
  completion_tokens: number;
  cost_micro: number;
}

export interface OpsMetrics {
  period: "daily" | "weekly";
  from: string;
  to: string;
  activeUsers: number;
  creditsSpent: number;
  creditsByCategory: Array<{ category: string; credits: number }>;
  topUsers: Array<{ userId: string; credits: number }>;
  errors: { total: number; top: Array<{ message: string; count: number }> };
  api: { requests: number; tokens: number; credits: number };
  openPrs: Array<{ number: number; title: string }>;
}

export function periodRange(period: "daily" | "weekly", now: Date): { from: Date; to: Date } {
  const ms = period === "daily" ? 86_400_000 : 7 * 86_400_000;
  return { from: new Date(now.getTime() - ms), to: now };
}

/** Mascara o id do usuário no relatório (top usuários sem dado pessoal). */
export function maskId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

export function aggregate(input: {
  period: "daily" | "weekly";
  from: Date;
  to: Date;
  txs: CreditTx[];
  errors: ErrorRow[];
  api: ApiUsageRow[];
  openPrs?: Array<{ number: number; title: string }>;
}): OpsMetrics {
  // Só débitos (delta < 0) contam como gasto.
  const spent = input.txs.filter((t) => t.delta < 0);
  const byCat = new Map<string, number>();
  const byUser = new Map<string, number>();
  for (const t of spent) {
    const c = t.category || "outros";
    byCat.set(c, (byCat.get(c) ?? 0) - t.delta);
    byUser.set(t.user_id, (byUser.get(t.user_id) ?? 0) - t.delta);
  }
  const errCount = new Map<string, number>();
  for (const e of input.errors) {
    const k = (e.message || "").replace(/\s+/g, " ").trim().slice(0, 140) || "(sem mensagem)";
    errCount.set(k, (errCount.get(k) ?? 0) + 1);
  }
  const sortDesc = <T extends { [k: string]: unknown }>(arr: T[], key: keyof T) => arr.sort((a, b) => Number(b[key]) - Number(a[key]));
  return {
    period: input.period,
    from: input.from.toISOString(),
    to: input.to.toISOString(),
    activeUsers: new Set(input.txs.map((t) => t.user_id)).size,
    creditsSpent: [...byCat.values()].reduce((a, b) => a + b, 0),
    creditsByCategory: sortDesc([...byCat].map(([category, credits]) => ({ category, credits })), "credits"),
    topUsers: sortDesc([...byUser].map(([userId, credits]) => ({ userId, credits })), "credits").slice(0, 10),
    errors: { total: input.errors.length, top: sortDesc([...errCount].map(([message, count]) => ({ message, count })), "count").slice(0, 8) },
    api: {
      requests: input.api.length,
      tokens: input.api.reduce((a, r) => a + r.prompt_tokens + r.completion_tokens, 0),
      credits: Math.round(input.api.reduce((a, r) => a + r.cost_micro, 0) / 1e4) / 100,
    },
    openPrs: input.openPrs ?? [],
  };
}

const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

/** Relatório em texto simples (vai bem no e-mail e no chat). */
export function formatReport(m: OpsMetrics): string {
  const title = m.period === "daily" ? "Relatório diário" : "Relatório semanal";
  const lines = [
    `${title} do Vertal Dev`,
    `Período: ${m.from.slice(0, 16).replace("T", " ")} → ${m.to.slice(0, 16).replace("T", " ")} (UTC)`,
    "",
    `Usuários ativos (com movimento de créditos): ${fmt(m.activeUsers)}`,
    `Créditos gastos: ${fmt(m.creditsSpent)}`,
  ];
  if (m.creditsByCategory.length) {
    lines.push("", "Créditos por área:");
    for (const c of m.creditsByCategory.slice(0, 10)) lines.push(`  • ${c.category}: ${fmt(c.credits)}`);
  }
  if (m.topUsers.length) {
    lines.push("", "Quem mais usou:");
    m.topUsers.forEach((u, i) => lines.push(`  ${i + 1}. ${maskId(u.userId)} — ${fmt(u.credits)} créditos`));
  }
  lines.push("", `API VERTAL: ${fmt(m.api.requests)} pedidos, ${fmt(m.api.tokens)} tokens, ${fmt(m.api.credits)} créditos`);
  lines.push("", `Erros: ${fmt(m.errors.total)}`);
  for (const e of m.errors.top) lines.push(`  • (${e.count}×) ${e.message}`);
  if (m.openPrs.length) {
    lines.push("", "PRs abertos:");
    for (const p of m.openPrs.slice(0, 10)) lines.push(`  • #${p.number} ${p.title}`);
  }
  return lines.join("\n");
}

/** Relatório enviado pelo Laércio (texto/CSV/MD): limpa e corta para caber no contexto. */
export function prepareIngestedReport(name: string, text: string, max = 40_000): { name: string; text: string; truncated: boolean } {
  // eslint-disable-next-line no-control-regex -- remove caracteres de controle de relatórios enviados
  const clean = text.replace(/\r\n/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  return { name: name.slice(0, 120) || "relatorio.txt", text: clean.slice(0, max), truncated: clean.length > max };
}
