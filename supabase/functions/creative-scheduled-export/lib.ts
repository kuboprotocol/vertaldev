// Funções puras da exportação agendada — isoladas para teste (lib_test.ts).

export type ExportFormat = "json" | "csv";

export const MAX_EXPORT_ROWS = 10_000;
export const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 dias

const EMAIL_RE = /^[^\s@<>"'()]+@[^\s@<>"'()]+\.[^\s@<>"'()]{2,}$/;

export function isValidEmail(email: unknown): email is string {
  return typeof email === "string" && email.length <= 254 && EMAIL_RE.test(email);
}

export function normalizeFormat(format: unknown): ExportFormat {
  return format === "csv" ? "csv" : "json";
}

/** Janela coberta por uma execução: desde a última execução (ou `intervalDays` atrás) até agora. */
export function periodFor(
  lastRun: string | null | undefined,
  intervalDays: number | null | undefined,
  now: Date = new Date(),
): { start: string; end: string } {
  const days = Math.min(Math.max(intervalDays ?? 7, 1), 90);
  const fallback = new Date(now.getTime() - days * 86_400_000);
  const last = lastRun ? new Date(lastRun) : null;
  const start = last && !Number.isNaN(last.getTime()) && last < now ? last : fallback;
  return { start: start.toISOString(), end: now.toISOString() };
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "object" ? JSON.stringify(value) : String(value);
  // Neutraliza fórmulas (CSV injection) e escapa aspas.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: Record<string, unknown>[]): string {
  const columns = ["id", "created_at", "event_type", "tool", "asset_id", "idempotency_key", "metadata"];
  const lines = [columns.join(",")];
  for (const row of rows) lines.push(columns.map((c) => csvCell(row[c])).join(","));
  return lines.join("\n");
}

export function serialize(rows: Record<string, unknown>[], format: ExportFormat): { body: string; contentType: string } {
  return format === "csv"
    ? { body: toCsv(rows), contentType: "text/csv; charset=utf-8" }
    : { body: JSON.stringify(rows, null, 2), contentType: "application/json" };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

export function buildEmail(p: { count: number; url: string; start: string; end: string; format: ExportFormat }) {
  const url = escapeHtml(p.url);
  const range = `${fmtDate(p.start)} – ${fmtDate(p.end)}`;
  const html = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#0b0b12;color:#e7e7f0;border-radius:16px">
      <p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#a5a6f6">KUBO Vibe · Painel Criativo</p>
      <h2 style="margin:0 0 16px;font-size:22px;color:#fff">Sua trilha de auditoria está pronta</h2>
      <p style="margin:0 0 8px">Período: <strong>${escapeHtml(range)}</strong></p>
      <p style="margin:0 0 24px">Eventos incluídos: <strong>${p.count}</strong> · Formato: <strong>${p.format.toUpperCase()}</strong></p>
      <a href="${url}" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;text-decoration:none;border-radius:10px;font-weight:600">Baixar arquivo</a>
      <p style="font-size:12px;color:#9a9ab0;margin-top:24px">O link expira em 7 dias. Você pode gerar um novo link em Painel Criativo › Tarefas agendadas.</p>
    </div>`;
  const text = `Sua trilha de auditoria está pronta (${p.count} eventos, ${range}). Baixe em: ${p.url} — o link expira em 7 dias.`;
  return { html, text };
}
