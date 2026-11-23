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
import { ATTACHMENT_TEXT_MAX, isTextAttachment } from '../_shared/gmailOps.ts'

const Body = z.object({
  // Vertal Chat: cobra 2 créditos (chave de idempotência da cobrança). Sem ela, grátis (caixa no app).
  chatCharge: z.string().uuid().optional(),
  accountId: z.string().uuid(),
  threadId: z.string().min(1).max(128),
  // Ler um anexo: e-mail + id do anexo (vem em messages[].attachments).
  messageId: z.string().regex(/^[A-Za-z0-9_-]{6,128}$/).optional(),
  attachmentId: z.string().regex(/^[A-Za-z0-9_-]{6,1024}$/).optional(),
})

/** Anexos do e-mail: nome, tipo, tamanho e id (para ler depois). */
function listAttachments(payload: GPart | undefined): Array<{ filename: string; mimeType: string; size: number; attachmentId: string }> {
  const out: Array<{ filename: string; mimeType: string; size: number; attachmentId: string }> = []
  const walk = (p?: GPart) => {
    if (!p) return
    if (p.filename && p.body?.attachmentId) out.push({ filename: p.filename, mimeType: p.mimeType ?? '', size: p.body.size ?? 0, attachmentId: p.body.attachmentId })
    p.parts?.forEach(walk)
  }
  walk(payload)
  return out
}

interface GHeader { name: string; value: string }
interface GPart {
  partId?: string
  mimeType?: string
  filename?: string
  headers?: GHeader[]
  body?: { data?: string; size?: number; attachmentId?: string }
  parts?: GPart[]
}
interface GMessage {
  id: string
  threadId: string
  snippet?: string
  internalDate?: string
  payload?: GPart
  labelIds?: string[]
}

function b64urlDecode(data: string): string {
  const pad = data.length % 4 === 0 ? '' : '='.repeat(4 - (data.length % 4))
  const std = data.replace(/-/g, '+').replace(/_/g, '/') + pad
  try {
    const bin = atob(std)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return new TextDecoder('utf-8').decode(bytes)
  } catch { return '' }
}

function header(part: GPart | undefined, name: string): string {
  return part?.headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''
}

/** Extrai melhor representação texto do payload (text/plain > text/html sanitizado simples). */
function extractBody(payload: GPart | undefined): { text: string; html: string } {
  let text = ''
  let html = ''
  const walk = (p?: GPart) => {
    if (!p) return
    const mime = p.mimeType ?? ''
    if (mime === 'text/plain' && p.body?.data && !text) text = b64urlDecode(p.body.data)
    else if (mime === 'text/html' && p.body?.data && !html) html = b64urlDecode(p.body.data)
    p.parts?.forEach(walk)
  }
  walk(payload)
  if (!text && payload?.body?.data) text = b64urlDecode(payload.body.data)
  return { text, html }
}

Deno.serve(withRefundOnFailure(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response(JSON.stringify({ error: 'missing auth' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: uErr } = await userClient.auth.getUser()
    if (uErr || !user) return new Response(JSON.stringify({ error: 'invalid token' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const parsed = Body.safeParse(await req.json())
    if (!parsed.success) return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    // Vertal Chat: 2 créditos por ação (devolvidos se a ação no Gmail falhar).
    const charge = await chargeGmailChat(user, parsed.data.chatCharge, parsed.data.attachmentId ? 'attachment' : 'read')
    if (charge) return new Response(JSON.stringify({ error: charge.error }), { status: charge.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const acct = await loadAccount(admin, user.id, parsed.data.accountId)
    const token = await getFreshAccessToken(admin, acct)

    if (parsed.data.attachmentId) {
      const { messageId, attachmentId } = parsed.data
      if (!messageId) return new Response(JSON.stringify({ error: 'messageId_required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      const base = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}`
      const mr = await fetch(`${base}?format=full`, { headers: { Authorization: `Bearer ${token}` } })
      const mj = await mr.json() as GMessage
      if (!mr.ok) return new Response(JSON.stringify({ error: 'gmail_thread_failed' }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      const meta = listAttachments(mj.payload).find(a => a.attachmentId === attachmentId)
      if (!meta) return new Response(JSON.stringify({ error: 'attachment_not_found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      let text: string | null = null
      if (isTextAttachment(meta.mimeType, meta.filename) && meta.size <= 2_000_000) {
        const ar = await fetch(`${base}/attachments/${encodeURIComponent(attachmentId)}`, { headers: { Authorization: `Bearer ${token}` } })
        const aj = await ar.json() as { data?: string }
        if (ar.ok && aj.data) text = b64urlDecode(aj.data).slice(0, ATTACHMENT_TEXT_MAX)
      }
      return new Response(JSON.stringify({ filename: meta.filename, mimeType: meta.mimeType, size: meta.size, text }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const url = `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(parsed.data.threadId)}?format=full`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    const json = await res.json() as { messages?: GMessage[]; id?: string; historyId?: string }
    if (!res.ok) return new Response(JSON.stringify({ error: 'gmail_thread_failed', detail: json }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const messages = (json.messages ?? []).map(m => {
      const { text, html } = extractBody(m.payload)
      return {
        id: m.id,
        threadId: m.threadId,
        snippet: m.snippet ?? '',
        from: header(m.payload, 'From'),
        to: header(m.payload, 'To'),
        cc: header(m.payload, 'Cc'),
        subject: header(m.payload, 'Subject'),
        date: header(m.payload, 'Date'),
        messageIdHeader: header(m.payload, 'Message-ID') || header(m.payload, 'Message-Id'),
        references: header(m.payload, 'References'),
        labelIds: m.labelIds ?? [],
        bodyText: text,
        bodyHtml: html,
        attachments: listAttachments(m.payload),
      }
    })

    return new Response(JSON.stringify({
      threadId: json.id ?? parsed.data.threadId,
      messages,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
}))
