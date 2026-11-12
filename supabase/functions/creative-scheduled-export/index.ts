// Painel Criativo › Tarefas agendadas — exportação da trilha de auditoria.
//
// Dois modos:
//  - cron (pg_cron, header x-cron-secret = service role): roda os agendamentos
//    vencidos (creative_audit_schedules.next_run_at <= now) e as exportações
//    reenfileiradas (creative_export_history.status = 'queued').
//  - usuário (JWT): { action: "run_now" } executa o agendamento do próprio
//    usuário imediatamente. user_id e e-mail vêm do servidor, nunca do body.
import { createClient } from "npm:@supabase/supabase-js@2";
import { EmailAPIError, sendLovableEmail } from "npm:@lovable.dev/email-js@0.1.0";
import { logEmailSend } from "../_shared/email-send-log.ts";
import { corsHeaders } from "../_shared/cors.ts";
import {
  buildEmail, type ExportFormat, isValidEmail, MAX_EXPORT_ROWS, normalizeFormat, periodFor,
  serialize, SIGNED_URL_TTL_SECONDS,
} from "./lib.ts";

// Verified sender subdomain delegated to Lovable — never the root domain.
const SENDER_DOMAIN = "notify.kubovibe.dev";
const FROM_DOMAIN = "kubovibe.dev";
const BUCKET = "exports";
const CRON_BATCH = 25;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_KEY);

type Schedule = {
  id: string; user_id: string; email: string; last_run: string | null;
  export_interval_days: number | null; format: string | null; is_active: boolean | null;
};

type Job = {
  userId: string; email: string; format: ExportFormat; start: string; end: string;
  scheduleId: string | null; historyId?: string; trigger: "cron" | "manual" | "retry";
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function errMessage(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

async function notify(userId: string, title: string, message: string, type: "info" | "warning" | "error") {
  const { error } = await admin.from("notifications").insert({ user_id: userId, title, message, type });
  if (error) console.warn("[creative-scheduled-export] notification insert failed", error.message);
}

async function sendExportEmail(to: string, historyId: string, content: { html: string; text: string }) {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");
  try {
    await sendLovableEmail(
      {
        to,
        from: `Kubo Vibe <noreply@${FROM_DOMAIN}>`,
        sender_domain: SENDER_DOMAIN,
        subject: "Sua trilha de auditoria está pronta",
        html: content.html,
        text: content.text,
        purpose: "transactional",
        label: "creative_audit_export",
        idempotency_key: `audit-export-${historyId}`,
      },
      { apiKey, sendUrl: Deno.env.get("LOVABLE_SEND_URL") },
    );
    await logEmailSend(admin, { templateName: "creative_audit_export", recipientEmail: to, status: "sent" });
    return "sent" as const;
  } catch (error) {
    const suppressed = error instanceof EmailAPIError && error.code === "recipient_suppressed";
    await logEmailSend(admin, {
      templateName: "creative_audit_export",
      recipientEmail: to,
      status: suppressed ? "suppressed" : "failed",
      ...(suppressed ? {} : { errorMessage: errMessage(error) }),
    });
    if (suppressed) return "suppressed" as const;
    throw error;
  }
}

/** Executa uma exportação e registra tudo em creative_export_history. Nunca lança. */
async function runExport(job: Job): Promise<{ id: string; status: string; count: number; error?: string }> {
  const startedAt = Date.now();
  let historyId = job.historyId;

  if (historyId) {
    // Retry: só assume a linha se ainda estiver na fila (evita corrida entre execuções do cron).
    const { data, error } = await admin.from("creative_export_history")
      .update({ status: "processing", generation_started_at: new Date().toISOString() })
      .eq("id", historyId).eq("status", "queued").select("id").maybeSingle();
    if (error || !data) return { id: historyId, status: "skipped", count: 0 };
  } else {
    const { data, error } = await admin.from("creative_export_history").insert({
      user_id: job.userId, schedule_id: job.scheduleId, status: "processing", format: job.format,
      period_start: job.start, period_end: job.end, date_range_start: job.start, date_range_end: job.end,
      generation_started_at: new Date().toISOString(),
    }).select("id").single();
    if (error || !data) {
      console.error("[creative-scheduled-export] history insert failed", error?.message);
      return { id: "", status: "failed", count: 0, error: "history_insert_failed" };
    }
    historyId = data.id as string;
  }
  await admin.from("creative_export_audit_log").insert({
    export_id: historyId, user_id: job.userId, action: "create",
    details: { trigger: job.trigger, period_start: job.start, period_end: job.end, format: job.format },
  });

  try {
    const { data: rows, error } = await admin.from("creative_audit_logs")
      .select("id, created_at, event_type, tool, asset_id, idempotency_key, metadata")
      .eq("user_id", job.userId)
      .gte("created_at", job.start).lte("created_at", job.end)
      .order("created_at", { ascending: false })
      .limit(MAX_EXPORT_ROWS);
    if (error) throw error;
    const items = rows ?? [];

    let fileUrl: string | null = null;
    let emailStatus: string = "skipped_empty";
    if (items.length > 0) {
      const { body, contentType } = serialize(items, job.format);
      const path = `${job.userId}/${historyId}.${job.format}`;
      const { error: upErr } = await admin.storage.from(BUCKET).upload(path, body, { contentType, upsert: true });
      if (upErr) throw upErr;
      fileUrl = `${BUCKET}/${path}`;

      const { data: signed, error: signErr } = await admin.storage.from(BUCKET)
        .createSignedUrl(path, SIGNED_URL_TTL_SECONDS, { download: true });
      if (signErr || !signed) throw signErr ?? new Error("signed_url_failed");

      emailStatus = await sendExportEmail(job.email, historyId,
        buildEmail({ count: items.length, url: signed.signedUrl, start: job.start, end: job.end, format: job.format }));
    }

    // Respeita um cancelamento feito durante a geração.
    const { data: done } = await admin.from("creative_export_history").update({
      status: "completed", file_url: fileUrl, item_count: items.length, included_count: items.length,
      item_ids: items.slice(0, 1000).map((r) => r.asset_id).filter(Boolean),
      generation_time_ms: Date.now() - startedAt, error_message: null,
    }).eq("id", historyId).eq("status", "processing").select("id").maybeSingle();
    if (!done) return { id: historyId, status: "cancelled", count: items.length };

    await admin.from("creative_export_audit_log").insert({
      export_id: historyId, user_id: job.userId, action: "success",
      details: { count: items.length, email: emailStatus, ms: Date.now() - startedAt },
    });
    if (items.length === 0) {
      await notify(job.userId, "Exportação de auditoria vazia",
        "Nenhum evento de auditoria no período — nenhum e-mail foi enviado.", "warning");
    }
    return { id: historyId, status: "completed", count: items.length };
  } catch (e) {
    const message = errMessage(e);
    console.error("[creative-scheduled-export] export failed", historyId, message);
    await admin.from("creative_export_history")
      .update({ status: "failed", error_message: message.slice(0, 500), generation_time_ms: Date.now() - startedAt })
      .eq("id", historyId);
    await admin.from("creative_export_audit_log").insert({
      export_id: historyId, user_id: job.userId, action: "fail", details: { error: message.slice(0, 500) },
    });
    await notify(job.userId, "Falha na exportação de auditoria",
      "Não foi possível gerar sua trilha de auditoria. Tente novamente em Tarefas agendadas.", "error");
    return { id: historyId, status: "failed", count: 0, error: message };
  }
}

async function runSchedule(s: Schedule, trigger: Job["trigger"]) {
  const { start, end } = periodFor(s.last_run, s.export_interval_days);
  const result = await runExport({
    userId: s.user_id, email: s.email, format: normalizeFormat(s.format), start, end,
    scheduleId: s.id, trigger,
  });
  // last_run avança mesmo em falha (o trigger recalcula next_run_at), evitando
  // martelar a cada 15 min; a falha fica no histórico e pode ser reprocessada.
  await admin.from("creative_audit_schedules").update({
    last_run: end,
    ...(result.status === "failed" ? { last_error_notified_at: new Date().toISOString() } : {}),
  }).eq("id", s.id);
  return result;
}

async function cronRun() {
  const nowIso = new Date().toISOString();
  const { data: due, error } = await admin.from("creative_audit_schedules")
    .select("id, user_id, email, last_run, export_interval_days, format, is_active")
    .eq("is_active", true).lte("next_run_at", nowIso)
    .order("next_run_at", { ascending: true }).limit(CRON_BATCH);
  if (error) throw error;

  const results = [];
  for (const s of (due ?? []) as Schedule[]) {
    if (!isValidEmail(s.email)) {
      await admin.from("creative_audit_schedules").update({ is_active: false }).eq("id", s.id);
      await notify(s.user_id, "Agendamento pausado", "O e-mail do agendamento de auditoria é inválido. Atualize-o para reativar.", "warning");
      continue;
    }
    results.push(await runSchedule(s, "cron"));
  }

  const { data: queued } = await admin.from("creative_export_history")
    .select("id, user_id, schedule_id, format, period_start, period_end")
    .eq("status", "queued").order("created_at", { ascending: true }).limit(CRON_BATCH);
  for (const q of queued ?? []) {
    const email = await resolveEmail(q.user_id as string, q.schedule_id as string | null);
    if (!email) continue;
    const fallback = periodFor(null, 7);
    results.push(await runExport({
      userId: q.user_id, email, format: normalizeFormat(q.format), scheduleId: q.schedule_id,
      start: q.period_start ?? fallback.start, end: q.period_end ?? fallback.end,
      historyId: q.id, trigger: "retry",
    }));
  }
  return results;
}

async function resolveEmail(userId: string, scheduleId: string | null): Promise<string | null> {
  if (scheduleId) {
    const { data } = await admin.from("creative_audit_schedules").select("email").eq("id", scheduleId).maybeSingle();
    if (isValidEmail(data?.email)) return data!.email;
  }
  const { data } = await admin.auth.admin.getUserById(userId);
  return isValidEmail(data?.user?.email) ? data!.user!.email! : null;
}

function isCronRequest(req: Request) {
  const secret = req.headers.get("x-cron-secret");
  const bearer = req.headers.get("Authorization");
  return (!!secret && secret === SERVICE_KEY) || bearer === `Bearer ${SERVICE_KEY}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? "");

  try {
    if (isCronRequest(req)) {
      if (action !== "cron_run") return json({ error: "unknown_action" }, 400);
      const results = await cronRun();
      return json({ ok: true, processed: results.length, results: results.map(({ id, status, count }) => ({ id, status, count })) });
    }

    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
    const { data: userRes, error: userErr } = await admin.auth.getUser(auth.slice(7));
    const user = userRes?.user;
    if (userErr || !user) return json({ error: "unauthorized" }, 401);

    if (action !== "run_now") return json({ error: "unknown_action" }, 400);

    // Uma exportação por vez e no máximo uma a cada 2 minutos por usuário.
    const since = new Date(Date.now() - 2 * 60_000).toISOString();
    const { data: busy } = await admin.from("creative_export_history").select("id")
      .eq("user_id", user.id).or(`status.in.(queued,processing),created_at.gte."${since}"`).limit(1);
    if (busy && busy.length > 0) return json({ error: "rate_limited", message: "Aguarde a exportação atual terminar." }, 429);

    const { data: schedule } = await admin.from("creative_audit_schedules")
      .select("id, user_id, email, last_run, export_interval_days, format, is_active")
      .eq("user_id", user.id).maybeSingle();

    if (schedule) {
      if (!isValidEmail(schedule.email)) return json({ error: "invalid_email" }, 400);
      // Execução manual não altera o calendário: usa a janela do intervalo e não mexe em last_run.
      const { start, end } = periodFor(null, schedule.export_interval_days);
      const result = await runExport({
        userId: user.id, email: schedule.email, format: normalizeFormat(schedule.format),
        start, end, scheduleId: schedule.id, trigger: "manual",
      });
      return json({ id: result.id, status: result.status, count: result.count }, result.status === "failed" ? 500 : 200);
    }

    if (!isValidEmail(user.email)) return json({ error: "invalid_email" }, 400);
    const { start, end } = periodFor(null, 7);
    const result = await runExport({
      userId: user.id, email: user.email, format: "json", start, end, scheduleId: null, trigger: "manual",
    });
    return json({ id: result.id, status: result.status, count: result.count }, result.status === "failed" ? 500 : 200);
  } catch (e) {
    console.error("[creative-scheduled-export]", e);
    return json({ error: "internal_error" }, 500);
  }
});
