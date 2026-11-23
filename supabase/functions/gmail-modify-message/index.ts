import { createClient } from 'npm:@supabase/supabase-js@2'
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
import { z } from 'npm:zod@3'
import { withRefundOnFailure } from '../_shared/creative.ts'
import { chargeGmailChat } from '../_shared/gmailBilling.ts'
import { getFreshAccessToken, loadAccount } from '../_shared/gmailToken.ts'
import { sanitizeError } from '../_shared/cors.ts'
import { GMAIL_MODIFY_OPS, isInsufficientScope, modifyBody, resolveLabelIds, type GmailModifyOp } from '../_shared/gmailOps.ts'

const Body = z.object({
  // Vertal Chat: cobra 2 créditos (chave de idempotência da cobrança). Sem ela, grátis (caixa no app).
  chatCharge: z.string().uuid().optional(),
  accountId: z.string().uuid(),
  // Um e-mail (messageId) ou a conversa inteira (threadId).
  messageId: z.string().regex(/^[A-Za-z0-9_-]{6,128}$/).optional(),
  threadId: z.string().regex(/^[A-Za-z0-9_-]{6,128}$/).optional(),
  // Compatível com o painel antigo: markAs read/unread.
  markAs: z.enum(['read', 'unread']).optional(),
  op: z.enum(GMAIL_MODIFY_OPS).optional(),
  labels: z.array(z.string().min(1).max(100)).max(10).optional(),
}).refine(b => !!(b.messageId || b.threadId), { message: 'messageId or threadId required' })
  .refine(b => !!(b.op || b.markAs), { message: 'op required' })

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(withRefundOnFailure(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json(401, { error: 'missing auth' })

    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: uErr } = await userClient.auth.getUser()
    if (uErr || !user) return json(401, { error: 'invalid token' })

    const parsed = Body.safeParse(await req.json())
    if (!parsed.success) return json(400, { error: 'invalid_input' })
    const { accountId, messageId, threadId, markAs, labels } = parsed.data
    const op: GmailModifyOp = parsed.data.op ?? (markAs as GmailModifyOp)
    // Vertal Chat: 2 créditos por ação (devolvidos se a ação no Gmail falhar).
    const charge = await chargeGmailChat(user, parsed.data.chatCharge, op)
    if (charge) return json(charge.status, { error: charge.error })

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const acct = await loadAccount(admin, user.id, accountId)
    const token = await getFreshAccessToken(admin, acct)
    const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    const base = 'https://gmail.googleapis.com/gmail/v1/users/me'
    const target = threadId ? `threads/${encodeURIComponent(threadId)}` : `messages/${encodeURIComponent(messageId!)}`

    // Rótulos pelo nome: resolve para id; "label" cria o rótulo que ainda não existe.
    let labelIds: string[] = []
    if (op === 'label' || op === 'unlabel') {
      if (!labels?.length) return json(400, { error: 'labels_required' })
      const lr = await fetch(`${base}/labels`, { headers: auth })
      const lj = await lr.json() as { labels?: Array<{ id: string; name: string }> }
      if (!lr.ok) return json(isInsufficientScope(lr.status, lj) ? 403 : 502, { error: isInsufficientScope(lr.status, lj) ? 'gmail_needs_reconsent' : 'gmail_modify_failed' })
      const r = resolveLabelIds(labels, lj.labels ?? [])
      labelIds = r.ids
      if (op === 'label') {
        for (const name of r.missing) {
          const cr = await fetch(`${base}/labels`, { method: 'POST', headers: auth, body: JSON.stringify({ name, labelListVisibility: 'labelShow', messageListVisibility: 'show' }) })
          const cj = await cr.json() as { id?: string }
          if (!cr.ok || !cj.id) return json(isInsufficientScope(cr.status, cj) ? 403 : 502, { error: isInsufficientScope(cr.status, cj) ? 'gmail_needs_reconsent' : 'gmail_label_failed' })
          labelIds.push(cj.id)
        }
      } else if (!labelIds.length) return json(404, { error: 'label_not_found' })
    }

    let url: string
    let body: string | undefined
    if (op === 'trash' || op === 'untrash') {
      url = `${base}/${target}/${op}`
    } else {
      const b = modifyBody(op, labelIds)
      if (!b) return json(400, { error: 'invalid_op' })
      url = `${base}/${target}/modify`
      body = JSON.stringify(b)
    }
    const res = await fetch(url, { method: 'POST', headers: auth, body })
    const out = await res.json() as { id?: string; labelIds?: string[]; messages?: Array<{ labelIds?: string[] }> }
    if (!res.ok) {
      if (isInsufficientScope(res.status, out)) return json(403, { error: 'gmail_needs_reconsent' })
      return json(502, { error: 'gmail_modify_failed' })
    }

    await admin.from('connector_activity_logs').insert({
      user_id: user.id,
      connector_slug: 'gmail',
      event_type: `gmail_${op}`,
      message: `Gmail: ${op}${labels?.length ? ` (${labels.join(', ')})` : ''}`,
      status: 'success',
      metadata: { op, messageId: messageId ?? null, threadId: threadId ?? null, labels: labels ?? [], accountEmail: (acct as { email: string }).email },
    })

    return json(200, { id: out.id, op, labelIds: out.labelIds ?? out.messages?.[0]?.labelIds ?? [] })
  } catch (e) {
    console.error('[gmail-modify-message] error:', e)
    return json(500, { error: sanitizeError(e) })
  }
}))
