// Vertal Chat · Agendador (tarefas agendadas, lembretes, consultas e gatilhos de e-mail).
//
// Função NOVA e isolada (não mexe no creative-router nem em nenhum motor existente).
// Desligada por padrão: só responde a quem está em VERTAL_CHAT_SCHEDULER_USER_IDS
// com VERTAL_CHAT_SCHEDULER_ENABLED=true; os demais recebem 404.
//
// Entradas:
//   - Usuário (Authorization: Bearer <sessão>): {"action": status|preview|create|list|get|update|delete|run_now|
//     settings_get|settings_set|agenda|templates|unseen|mark_seen, ...}
//   - pg_cron (cabeçalho x-vertal-scheduler-key = VERTAL_CHAT_SCHEDULER_CRON_KEY): {"action":"tick"}
// Créditos: nada novo é cobrado; o custo estimado da IA fica em chat_task_runs.est_cost_usd.
// Ações que já custam (Vertal Fluxos, 2 créditos) seguem a regra de sempre.
import { corsHeaders } from "../_shared/cors.ts";
import { enforceRateLimit, getUser, sanitizeError, supaAdmin } from "../_shared/creative.ts";
import {
  SCHEDULER_LIMITS, SCHEDULER_TEMPLATES, describeSchedule, formatLocal, isUuid, nextRun, normTime, normalizeSpec,
  hasCalendarScope, sanitizeChangesInput as sanitizeChanges, sanitizeSpecInput as sanitizeSpec, schedulerAllowed, summaryLines, validTimezone, type NormalizedTask, type SchedulerSpec,
} from "../_shared/chatScheduler.ts";
import {
  createAgendaEvent, deleteAgendaEvent, gmailAccount, loadSettings, pollEmailTask, runScheduledTask, tick, type TaskRow,
} from "./engine.ts";

const env = (k: string) => Deno.env.get(k);

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function allowlist(): string[] {
  return (env("VERTAL_CHAT_SCHEDULER_USER_IDS") ?? "").split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const action = String(body.action ?? "");

  // ── Disparo do pg_cron ──
  if (action === "tick") {
    const key = req.headers.get("x-vertal-scheduler-key") ?? "";
    if (!timingSafeEqual(key, env("VERTAL_CHAT_SCHEDULER_CRON_KEY") ?? "")) return json(401, { error: "unauthorized" });
    if ((env("VERTAL_CHAT_SCHEDULER_ENABLED") ?? "").toLowerCase() !== "true") return json(200, { ok: true, disabled: true });
    const users = allowlist();
    if (!users.length) return json(200, { ok: true, claimed: 0 });
    const work = tick(users).then((r) => console.log("[scheduler] tick", JSON.stringify(r))).catch((e) => console.error("[scheduler] tick falhou:", sanitizeError(e)));
    const rt = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
    if (rt?.waitUntil) { rt.waitUntil(work); return json(202, { ok: true, queued: true }); }
    await work;
    return json(200, { ok: true });
  }

  const user = await getUser(req.headers.get("Authorization"));
  if (!user) return json(401, { error: "Unauthorized" });
  const allowed = schedulerAllowed(env, user.id);
  if (action === "status") return json(200, { allowed });
  if (!allowed) return json(404, { error: "not_found" });

  const limit = await enforceRateLimit(user.id, "chat_scheduler", { max: 60, windowSeconds: 60, userEmail: user.email ?? null });
  if (!limit.ok) return json(429, { error: limit.error });

  const admin = supaAdmin();
  const me = { id: user.id, email: user.email ?? null };
  try {
    switch (action) {
      case "templates":
        return json(200, { ok: true, templates: SCHEDULER_TEMPLATES });
      case "settings_get":
        return json(200, { ok: true, settings: await loadSettings(admin, user.id) });
      case "settings_set": {
        const s = (body.settings ?? {}) as Record<string, unknown>;
        const quietStart = s.quiet_start === null ? null : normTime(s.quiet_start);
        const quietEnd = s.quiet_end === null ? null : normTime(s.quiet_end);
        const row: Record<string, unknown> = { user_id: user.id, updated_at: new Date().toISOString() };
        if (s.timezone !== undefined) row.timezone = validTimezone(s.timezone);
        if (s.quiet_start !== undefined) row.quiet_start = quietStart;
        if (s.quiet_end !== undefined) row.quiet_end = quietEnd;
        if (s.notify_email !== undefined) row.notify_email = s.notify_email === true;
        const { error } = await admin.from("chat_scheduler_settings").upsert(row, { onConflict: "user_id" });
        if (error) return json(500, { error: "save_failed" });
        return json(200, { ok: true, settings: await loadSettings(admin, user.id) });
      }
      case "preview":
      case "create":
        return await previewOrCreate(admin, me, body, action === "create");
      case "list":
        return await list(admin, user.id);
      case "agenda": {
        const { data } = await admin.from("chat_agenda_events").select("*").eq("user_id", user.id)
          .gte("ends_at", new Date(Date.now() - 86_400_000).toISOString()).order("starts_at").limit(50);
        return json(200, { ok: true, events: data ?? [] });
      }
      case "get":
      case "history": {
        const task = await findTask(admin, user.id, body);
        if (!task) return json(404, { error: "task_not_found" });
        const { data: runs } = await admin.from("chat_task_runs").select("*").eq("task_id", task.id).order("started_at", { ascending: false }).limit(20);
        return json(200, { ok: true, task: view(task), runs: runs ?? [] });
      }
      case "update":
        return await update(admin, user.id, body);
      case "delete": {
        const task = await findTask(admin, user.id, body);
        if (!task) return json(404, { error: "task_not_found" });
        if (task.appointment_id && body.keep_event !== true) await deleteAgendaEvent(admin, user.id, task.appointment_id);
        await admin.from("chat_scheduled_tasks").delete().eq("id", task.id).eq("user_id", user.id);
        return json(200, { ok: true, deleted: task.title });
      }
      case "run_now": {
        const task = await findTask(admin, user.id, body);
        if (!task) return json(404, { error: "task_not_found" });
        const settings = await loadSettings(admin, user.id);
        const r = task.schedule.type === "email"
          ? await pollEmailTask(admin, me, task, settings, true)
          : await runScheduledTask(admin, me, task, settings, true);
        return json(200, { ok: r.ok, text: r.text });
      }
      case "unseen": {
        const { data, count } = await admin.from("chat_task_runs")
          .select("id, task_id, status, output, error, sentiment, finished_at, chat_scheduled_tasks(title)", { count: "exact" })
          .eq("user_id", user.id).is("seen_at", null).neq("status", "running").order("finished_at", { ascending: false }).limit(10);
        return json(200, { ok: true, count: count ?? 0, runs: data ?? [] });
      }
      case "mark_seen": {
        await admin.from("chat_task_runs").update({ seen_at: new Date().toISOString() }).eq("user_id", user.id).is("seen_at", null);
        return json(200, { ok: true });
      }
      default:
        return json(400, { error: "invalid_action" });
    }
  } catch (e) {
    console.error("[scheduler] erro:", sanitizeError(e));
    return json(500, { error: sanitizeError(e) });
  }
});

// deno-lint-ignore no-explicit-any
type Admin = any;

function view(t: TaskRow & Record<string, unknown>) {
  return {
    id: t.id, kind: t.kind, title: t.title, prompt: t.prompt, status: t.status, schedule: t.schedule, timezone: t.timezone,
    when_text: describeSchedule(t.schedule, t.timezone),
    next_run_at: t.next_run_at, next_run_text: t.next_run_at ? formatLocal(Date.parse(t.next_run_at), t.timezone) : null,
    last_run_at: t.last_run_at ?? null, last_status: t.last_status ?? null, last_error: t.last_error ?? null,
    run_count: t.run_count, trigger: t.trigger, branches: t.branches, send_to: t.send_to ?? [], notify_email: t.notify_email,
    allow_app_actions: t.allow_app_actions, ignore_quiet: t.ignore_quiet, appointment_id: t.appointment_id, created_at: t.created_at,
  };
}

async function findTask(admin: Admin, userId: string, body: Record<string, unknown>): Promise<(TaskRow & Record<string, unknown>) | null> {
  if (isUuid(body.id)) {
    const { data } = await admin.from("chat_scheduled_tasks").select("*").eq("id", body.id).eq("user_id", userId).maybeSingle();
    return data ?? null;
  }
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
  if (!name) return null;
  const { data } = await admin.from("chat_scheduled_tasks").select("*").eq("user_id", userId)
    .ilike("title", `%${name.replace(/[%_]/g, "")}%`).order("created_at", { ascending: false }).limit(1);
  return data?.[0] ?? null;
}

async function list(admin: Admin, userId: string): Promise<Response> {
  const { data } = await admin.from("chat_scheduled_tasks").select("*").eq("user_id", userId)
    .order("status").order("next_run_at", { ascending: true, nullsFirst: false }).limit(100);
  return json(200, { ok: true, tasks: (data ?? []).map(view) });
}

async function previewOrCreate(admin: Admin, user: { id: string; email: string | null }, body: Record<string, unknown>, create: boolean): Promise<Response> {
  const spec = sanitizeSpec(body.spec);
  if (!spec) return json(200, { ok: false, error: "Faltou dizer o que agendar." });
  const settings = await loadSettings(admin, user.id);
  const tz = validTimezone(spec.timezone ?? (typeof body.timezone === "string" ? body.timezone : undefined) ?? settings.timezone);
  const norm = normalizeSpec({ ...spec, timezone: tz }, Date.now(), tz);
  if (!norm.ok) return json(200, { ok: false, error: norm.error });
  const t: NormalizedTask = norm.task;
  const acc = t.appointment ? await gmailAccount(admin, user.id) : null;
  const calendar = acc && hasCalendarScope(acc.scope) ? "google" as const : "vertal" as const;
  const needsGmail = t.kind === "email_trigger" || t.send_to.length > 0 || t.notify_email;
  const gmailConnected = needsGmail ? !!(acc ?? await gmailAccount(admin, user.id)) : true;
  const summary = summaryLines(t, { calendar });
  const warnings = [...norm.notes, ...(gmailConnected ? [] : ["O Gmail não está conectado: conecte em Conectores → Gmail para o gatilho funcionar."])];
  if (!create) return json(200, { ok: true, summary, warnings, task: t, calendar });

  const { count } = await admin.from("chat_scheduled_tasks").select("id", { count: "exact", head: true }).eq("user_id", user.id).in("status", ["active", "paused"]);
  if ((count ?? 0) >= SCHEDULER_LIMITS.maxTasksPerUser) return json(200, { ok: false, error: `Você já tem ${SCHEDULER_LIMITS.maxTasksPerUser} tarefas; apague alguma antes.` });
  const conversationId = isUuid(body.conversation_id) ? body.conversation_id : null;
  const { data: task, error } = await admin.from("chat_scheduled_tasks").insert({
    user_id: user.id, conversation_id: conversationId, kind: t.kind, title: t.title, prompt: t.prompt, schedule: t.schedule, timezone: t.timezone,
    trigger: t.trigger ?? null, branches: t.branches ?? null, send_to: t.send_to, notify_email: t.notify_email,
    allow_app_actions: t.allow_app_actions, ignore_quiet: t.ignore_quiet, next_run_at: t.next_run_at, spec, status: "active",
    email_checked_at: t.kind === "email_trigger" ? new Date().toISOString() : null,
  }).select("*").single();
  if (error) {
    console.error("[scheduler] insert falhou:", error.message);
    return json(500, { error: "save_failed" });
  }
  let event: Record<string, unknown> | null = null;
  if (t.appointment) {
    try {
      event = await createAgendaEvent(admin, user, task.id, t.appointment, t.timezone);
      await admin.from("chat_scheduled_tasks").update({ appointment_id: event!.id }).eq("id", task.id);
    } catch (e) {
      await admin.from("chat_scheduled_tasks").delete().eq("id", task.id);
      return json(500, { error: sanitizeError(e) });
    }
  }
  return json(200, { ok: true, task: view({ ...task, appointment_id: event?.id ?? null }), summary, warnings, event });
}

async function update(admin: Admin, userId: string, body: Record<string, unknown>): Promise<Response> {
  const task = await findTask(admin, userId, body);
  if (!task) return json(404, { error: "task_not_found" });
  const now = Date.now();
  if (body.status === "paused") {
    await admin.from("chat_scheduled_tasks").update({ status: "paused", locked_until: null, updated_at: new Date().toISOString() }).eq("id", task.id);
    return json(200, { ok: true, status: "paused", title: task.title });
  }
  if (body.status === "active") {
    let next = task.next_run_at ? Date.parse(task.next_run_at) : NaN;
    if (!Number.isFinite(next) || next < now) {
      const n = task.schedule.type === "email" ? now + 60_000 : nextRun(task.schedule, task.timezone, now);
      if (n === null) return json(200, { ok: false, error: "Esse horário já passou. Edite a data para reativar." });
      next = n;
    }
    await admin.from("chat_scheduled_tasks").update({
      status: "active", attempts: 0, next_run_at: new Date(next).toISOString(), updated_at: new Date().toISOString(),
      ...(task.schedule.type === "email" ? { email_checked_at: new Date(now).toISOString() } : {}),
    }).eq("id", task.id);
    return json(200, { ok: true, status: "active", title: task.title, next_run_text: formatLocal(next, task.timezone) });
  }
  const changes = sanitizeChanges(body.changes);
  if (!changes) return json(400, { error: "invalid_input" });
  const prev = (task.spec && typeof task.spec === "object" ? task.spec : {}) as SchedulerSpec;
  // Mudou "quando": descarta as formas antigas de horário para não misturar.
  const timeKeys = ["when", "at", "repeat", "cron"] as const;
  const touchesTime = timeKeys.some((k) => changes[k] !== undefined);
  const base: SchedulerSpec = { ...prev };
  if (touchesTime) for (const k of timeKeys) delete base[k];
  const merged: SchedulerSpec = { ...base, ...changes, kind: task.kind };
  const norm = normalizeSpec(merged, now, task.timezone);
  if (!norm.ok) return json(200, { ok: false, error: norm.error });
  const t = norm.task;
  await admin.from("chat_scheduled_tasks").update({
    title: t.title, prompt: t.prompt, schedule: t.schedule, timezone: t.timezone, trigger: t.trigger ?? null, branches: t.branches ?? null,
    send_to: t.send_to, notify_email: t.notify_email, allow_app_actions: t.allow_app_actions, ignore_quiet: t.ignore_quiet,
    next_run_at: t.next_run_at, spec: merged, attempts: 0, status: task.status === "done" || task.status === "failed" ? "active" : task.status,
    updated_at: new Date().toISOString(),
  }).eq("id", task.id);
  return json(200, { ok: true, title: t.title, summary: summaryLines(t) });
}

