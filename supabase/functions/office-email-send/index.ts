// Vertal Office: envia um e-mail com anexo pela conta Gmail do próprio usuário.
//
// Regra de segurança: o envio só acontece com `confirmed: true` no corpo, ou
// seja, quando o usuário clicou em "Confirmar envio" na interface. Nenhum
// agente envia sozinho por esta função sem essa confirmação explícita.
// Envio não é cobrado em créditos. A preparação do texto pela IA é (office-ai).
import { z } from "npm:zod@3";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, sanitizeError } from "../_shared/cors.ts";
import { getFreshAccessToken, loadAccount } from "../_shared/gmailToken.ts";
import {
  ATTACHMENT_MAX_BYTES,
  OfficeEmailError,
  base64DecodedSize,
  buildRawEmail,
  sanitizeAttachmentName,
  toGmailRaw,
} from "../_shared/officeEmail.ts";

const Body = z.object({
  accountId: z.string().uuid(),
  to: z.string().email().max(254),
  subject: z.string().trim().min(1).max(200),
  body: z.string().min(1).max(50_000),
  attachment: z
    .object({
      filename: z.string().min(1).max(200),
      contentBase64: z.string().min(1).max(Math.ceil((ATTACHMENT_MAX_BYTES * 4) / 3) + 4),
    })
    .optional(),
  confirmed: z.literal(true),
});

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "missing auth" });

    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: uErr } = await userClient.auth.getUser();
    if (uErr || !user) return json(401, { error: "invalid token" });

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return json(400, { error: "invalid_input", details: parsed.error.flatten().fieldErrors });
    }
    const { accountId, to, subject, body, attachment } = parsed.data;

    // Confere o anexo no servidor: nome, extensão (que define o MIME) e tamanho real.
    let safeAttachment: { filename: string; contentBase64: string } | undefined;
    if (attachment) {
      const { filename } = sanitizeAttachmentName(attachment.filename);
      if (base64DecodedSize(attachment.contentBase64) > ATTACHMENT_MAX_BYTES) {
        return json(413, { error: "attachment_too_large" });
      }
      safeAttachment = { filename, contentBase64: attachment.contentBase64 };
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const acct = await loadAccount(admin, user.id, accountId);
    const token = await getFreshAccessToken(admin, acct);

    const raw = buildRawEmail({ to, subject, body, attachment: safeAttachment });

    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: toGmailRaw(raw) }),
    });
    const sent = await res.json();
    if (!res.ok) return json(502, { error: "gmail_send_failed" });

    await admin.from("connector_activity_logs").insert({
      user_id: user.id,
      connector_slug: "gmail",
      event_type: "gmail_sent",
      message: `Email com anexo enviado para ${to}`,
      status: "success",
      metadata: {
        to,
        subject,
        attachment: safeAttachment?.filename ?? null,
        accountEmail: (acct as { email: string }).email,
        messageId: sent.id,
      },
    });

    return json(200, { success: true, id: sent.id });
  } catch (e) {
    if (e instanceof OfficeEmailError) return json(400, { error: e.message });
    console.error("[office-email-send] error:", e);
    return json(500, { error: sanitizeError(e) });
  }
});
