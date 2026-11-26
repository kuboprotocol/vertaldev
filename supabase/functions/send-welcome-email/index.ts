import { createClient } from 'npm:@supabase/supabase-js@2'
import { sendTemplateEmail } from '../_shared/transactional-email-templates/send-email.ts'
import { logEmailSend } from '../_shared/email-send-log.ts'
import { welcomeAppliesTo, welcomeConfig, WELCOME_V2_TEMPLATE } from '../_shared/vertalWelcome/welcomeEmail.ts'
import { runWelcomeV2, type WelcomeDeps } from '../_shared/vertalWelcome/welcomeFlow.ts'

// Sends the welcome email for a freshly created account.
// The recipient is NEVER taken from the request body — it is derived from the
// auth user record, and only for accounts created in the last few minutes.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_ACCOUNT_AGE_MS = 15 * 60 * 1000

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) return json({ error: 'server_configuration_error' }, 500)

  let userId: string
  // "session" = chamada do front depois da confirmação do e-mail / 1º login (só existe no v2).
  let trigger = ''
  try {
    const body = await req.json()
    userId = String(body?.userId ?? '')
    trigger = String(body?.trigger ?? '')
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  if (!UUID_RE.test(userId)) return json({ error: 'invalid_user_id' }, 400)

  // Boas-vindas v2 (VERTAL_GPU_CONFIG.VERTAL_WELCOME_EMAIL, desligado por padrão).
  // Desligado: o gatilho "session" não faz nada e o fluxo antigo abaixo segue idêntico.
  const welcomeV2 = welcomeConfig({
    VERTAL_WELCOME_EMAIL: Deno.env.get('VERTAL_WELCOME_EMAIL'),
    VERTAL_GPU_CONFIG: Deno.env.get('VERTAL_GPU_CONFIG'),
  })
  const useV2 = welcomeAppliesTo(welcomeV2, userId)
  if (!useV2 && trigger === 'session') return json({ success: false, reason: 'disabled' })

  const admin = createClient(supabaseUrl, serviceKey)

  // Rate limit: at most a handful of attempts per user per hour.
  const { data: hits } = await admin.rpc('bump_rate_limit', {
    _bucket: 'welcome_email',
    _user: userId,
    _window_seconds: 3600,
  })
  if (typeof hits === 'number' && hits > 3) return json({ error: 'rate_limited' }, 429)

  if (useV2 && welcomeV2) {
    const { data: v2Data, error: v2Error } = await admin.auth.admin.getUserById(userId)
    const u = v2Data?.user
    if (v2Error || !u) return json({ error: 'user_not_found' }, 404)
    const outcome = await runWelcomeV2(
      welcomeV2,
      {
        id: u.id,
        email: u.email ?? null,
        createdAt: u.created_at ?? null,
        emailConfirmedAt: u.email_confirmed_at ?? null,
        meta: (u.user_metadata as Record<string, unknown> | null) ?? null,
      },
      welcomeV2Deps(admin),
    )
    if (outcome.status === 'failed') return json({ error: 'send_failed' }, 500)
    return json(outcome.status === 'sent' ? { success: true } : { success: false, reason: outcome.reason })
  }

  const { data: userData, error: userError } = await admin.auth.admin.getUserById(userId)
  const user = userData?.user
  if (userError || !user?.email) return json({ error: 'user_not_found' }, 404)

  const createdAtMs = user.created_at ? new Date(user.created_at).getTime() : 0
  if (!createdAtMs || Date.now() - createdAtMs > MAX_ACCOUNT_AGE_MS) {
    return json({ error: 'account_not_new' }, 400)
  }

  const recipient = user.email
  const name =
    (user.user_metadata as Record<string, unknown> | null)?.display_name ?? undefined

  try {
    const result = await sendTemplateEmail('welcome', recipient, {
      templateData: { name },
      idempotencyKey: `welcome-${userId}`,
    })

    if (!result.sent) {
      await logEmailSend(admin, {
        templateName: 'welcome',
        recipientEmail: recipient,
        status: 'suppressed',
      })
      return json({ success: false, reason: result.reason })
    }

    await logEmailSend(admin, {
      templateName: 'welcome',
      recipientEmail: recipient,
      status: 'sent',
    })
    return json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await logEmailSend(admin, {
      templateName: 'welcome',
      recipientEmail: recipient,
      status: 'failed',
      errorMessage: message,
    })
    console.error('Welcome email send failed', { message })
    return json({ error: 'send_failed' }, 500)
  }
})

// Dependências reais do v2 (o módulo do fluxo é puro e testado com dublês — nenhum teste envia e-mail).
// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function welcomeV2Deps(admin: any): WelcomeDeps {
  return {
    async alreadySent(recipient, templates) {
      const { count, error } = await admin
        .from('email_send_log')
        .select('template_name', { count: 'exact', head: true })
        .eq('recipient_email', recipient)
        .eq('status', 'sent')
        .in('template_name', templates as string[])
      // Falha ao consultar = não envia (nunca arriscar mandar duas boas-vindas).
      if (error) return true
      return (count ?? 0) > 0
    },
    async send(input) {
      const apiKey = Deno.env.get('LOVABLE_API_KEY')
      if (!apiKey) throw new Error('LOVABLE_API_KEY is not configured')
      const { sendLovableEmail, EmailAPIError } = await import('npm:@lovable.dev/email-js@0.1.0')
      try {
        await sendLovableEmail(
          {
            to: input.to,
            from: `${input.fromName} <noreply@kubovibe.dev>`,
            sender_domain: 'notify.kubovibe.dev',
            subject: input.email.subject,
            html: input.email.html,
            text: input.email.text,
            purpose: 'transactional',
            label: input.label,
            idempotency_key: input.idempotencyKey,
            reply_to: input.replyTo,
          },
          { apiKey, sendUrl: Deno.env.get('LOVABLE_SEND_URL') },
        )
      } catch (error) {
        if (error instanceof EmailAPIError && error.code === 'recipient_suppressed') {
          return { sent: false, reason: 'recipient_suppressed' }
        }
        throw error
      }
      return { sent: true }
    },
    async log(entry) {
      await logEmailSend(admin, {
        templateName: WELCOME_V2_TEMPLATE,
        recipientEmail: entry.recipient,
        status: entry.status,
        errorMessage: entry.error ?? null,
      })
    },
    now: () => Date.now(),
  }
}
