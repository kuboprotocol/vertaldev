import { createClient } from 'npm:@supabase/supabase-js@2'
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
import { z } from 'npm:zod@3'
import { getFreshAccessToken, loadAccount } from '../_shared/gmailToken.ts'
import { sanitizeError } from '../_shared/cors.ts'
import { b64url, buildMime, forwardBody, forwardSubject, isInsufficientScope } from '../_shared/gmailOps.ts'

const Body = z.object({
  accountId: z.string().uuid(),
  to: z.string().email(),
  cc: z.string().max(2_000).optional(),
  subject: z.string().max(998).optional(),
  body: z.string().max(50_000).default(''),
  // Reply / forward support
  threadId: z.string().min(1).max(128).optional(),
  inReplyTo: z.string().min(1).max(998).optional(),
  references: z.string().max(4_000).optional(),
  // "draft" só cria o rascunho no Gmail (precisa de gmail.modify); "send" envia.
  mode: z.enum(['send', 'draft']).default('send'),
  // Encaminhar: id do e-mail original; o texto dele vai citado abaixo da nota.
  forwardOf: z.string().regex(/^[A-Za-z0-9_-]{6,128}$/).optional(),
}).refine(b => b.forwardOf || (b.subject && b.body), { message: 'subject and body required' })

interface GPart { mimeType?: string; filename?: string; headers?: Array<{ name: string; value: string }>; body?: { data?: string }; parts?: GPart[] }

function b64urlDecode(data: string): string {
  const std = data.replace(/-/g, '+').replace(/_/g, '/')
  try {
    const bin = atob(std + '='.repeat((4 - (std.length % 4)) % 4))
    return new TextDecoder('utf-8').decode(Uint8Array.from(bin, c => c.charCodeAt(0)))
  } catch { return '' }
}

/** Lê o original para encaminhar: cabeçalhos, texto e nomes dos anexos. */
async function loadOriginal(token: string, id: string) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=full`, { headers: { Authorization: `Bearer ${token}` } })
  const m = await res.json() as { payload?: GPart; threadId?: string }
  if (!res.ok) return { ok: false as const, status: res.status, detail: m }
  const h = (n: string) => m.payload?.headers?.find(x => x.name.toLowerCase() === n.toLowerCase())?.value ?? ''
  let text = '', html = ''
  const files: string[] = []
  const walk = (p?: GPart) => {
    if (!p) return
    if (p.filename) files.push(p.filename)
    else if (p.mimeType === 'text/plain' && p.body?.data && !text) text = b64urlDecode(p.body.data)
    else if (p.mimeType === 'text/html' && p.body?.data && !html) html = b64urlDecode(p.body.data)
    p.parts?.forEach(walk)
  }
  walk(m.payload)
  if (!text) text = html.replace(/<[^>]+>/g, ' ').replace(/[ \t]{2,}/g, ' ')
  return { ok: true as const, from: h('From'), to: h('To'), date: h('Date'), subject: h('Subject'), text: text.slice(0, 40_000), attachments: files }
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
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
    const { accountId, to, cc, threadId, inReplyTo, references, mode, forwardOf } = parsed.data
    let subject = parsed.data.subject ?? ''
    let body = parsed.data.body

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const acct = await loadAccount(admin, user.id, accountId)
    const token = await getFreshAccessToken(admin, acct)

    if (forwardOf) {
      const orig = await loadOriginal(token, forwardOf)
      if (!orig.ok) return json(isInsufficientScope(orig.status, orig.detail) ? 403 : 502, { error: isInsufficientScope(orig.status, orig.detail) ? 'gmail_needs_reconsent' : 'gmail_forward_failed' })
      subject = parsed.data.subject || forwardSubject(orig.subject)
      body = forwardBody(body, orig)
    }

    const raw = b64url(buildMime({ to, cc, subject, body, inReplyTo, references }))
    const message: Record<string, unknown> = { raw }
    if (threadId) message.threadId = threadId

    const isDraft = mode === 'draft'
    const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${isDraft ? 'drafts' : 'messages/send'}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(isDraft ? { message } : message),
    })
    const out = await res.json() as { id?: string; threadId?: string; message?: { id?: string; threadId?: string } }
    if (!res.ok) {
      if (isInsufficientScope(res.status, out)) return json(403, { error: 'gmail_needs_reconsent' })
      return json(502, { error: isDraft ? 'gmail_draft_failed' : 'gmail_send_failed' })
    }

    const kind = isDraft ? 'draft' : forwardOf ? 'forwarded' : threadId ? 'replied' : 'sent'
    const label = { draft: 'Rascunho criado para', forwarded: 'E-mail encaminhado para', replied: 'Resposta enviada para', sent: 'Email enviado para' }[kind]
    const outThread = out.threadId ?? out.message?.threadId ?? threadId ?? null
    await admin.from('connector_activity_logs').insert({
      user_id: user.id,
      connector_slug: 'gmail',
      event_type: `gmail_${kind}`,
      message: `${label} ${to}`,
      status: 'success',
      metadata: { to, cc: cc ?? null, subject, accountEmail: (acct as { email: string }).email, messageId: out.message?.id ?? out.id, draftId: isDraft ? out.id : null, threadId: outThread, forwardOf: forwardOf ?? null },
    })

    return json(200, { success: true, id: out.id, threadId: outThread, ...(isDraft ? { draftId: out.id } : {}) })
  } catch (e) {
    console.error('[gmail-send-message] error:', e);
    return json(500, { error: sanitizeError(e) })
  }
})
