// Vertal Mail · recebimento de e-mail no Worker do vertal.dev (Cloudflare Email Workers, grátis).
//
// Só roda quando o Laércio ligar o Email Routing de um domínio e apontar a regra (ou o catch-all)
// para este Worker — nada muda enquanto isso não for feito. Além disso exige a variável
// MAILBOX_INBOUND_ENABLED="true" (wrangler.jsonc, padrão vazio = recusa tudo).
//
// Fluxo: destinatário → mailbox_addresses (ativo) → decodifica (postal-mime, MIT) → mailbox_messages.
// Endereço desconhecido ou e-mail grande demais: recusa na conversa SMTP (o remetente recebe o aviso).
// O CRM é alimentado depois, pela edge function (action "mailbox", sem IA e sem crédito).
import PostalMime from 'postal-mime';
import { inboundRow, MAILBOX_LIMITS } from '../supabase/functions/_shared/vertalMailbox/core';
import { table, type SupabaseEnv } from './supabaseRest';

export interface MailboxInboundEnv extends SupabaseEnv {
  /** "true" liga o recebimento. Qualquer outro valor = recusa (padrão). */
  MAILBOX_INBOUND_ENABLED?: string;
  /**
   * Opcional: e-mail (já verificado como destino no Email Routing) que recebe tudo o que NÃO é de uma caixa
   * do Vertal Mail. Serve para apontar o catch-all de vertal.dev para o Worker sem perder o encaminhamento de hoje.
   */
  MAILBOX_FALLBACK_FORWARD?: string;
}

/** O que o runtime da Cloudflare entrega ao handler `email` (ForwardableEmailMessage). */
export interface InboundEmail {
  readonly from: string;
  readonly to: string;
  readonly raw: ReadableStream<Uint8Array>;
  readonly rawSize: number;
  readonly headers: Headers;
  setReject(reason: string): void;
  forward?(rcptTo: string, headers?: Headers): Promise<void>;
}

/** "ana+loja@mail.vertal.dev" → "ana@mail.vertal.dev" (subendereço cai na mesma caixa). */
export function baseAddress(to: string): string {
  const s = String(to ?? '').trim().toLowerCase();
  const at = s.lastIndexOf('@');
  if (at < 1) return s;
  const local = s.slice(0, at).split('+')[0];
  return `${local}@${s.slice(at + 1)}`;
}

export type InboundResult = 'stored' | 'duplicate' | 'forwarded' | 'rejected_disabled' | 'rejected_unknown' | 'rejected_size' | 'error';

export async function handleInboundEmail(
  message: InboundEmail,
  env: MailboxInboundEnv,
  deps: { parse?: (raw: ArrayBuffer) => Promise<Record<string, unknown>> } = {},
): Promise<InboundResult> {
  const fallback = (env.MAILBOX_FALLBACK_FORWARD ?? '').trim();
  const passThrough = async (): Promise<InboundResult | null> => {
    if (!fallback || !message.forward) return null;
    await message.forward(fallback);
    return 'forwarded';
  };
  if ((env.MAILBOX_INBOUND_ENABLED ?? '').trim().toLowerCase() !== 'true') {
    const f = await passThrough();
    if (f) return f;
    message.setReject('Mailbox not available');
    return 'rejected_disabled';
  }
  if (message.rawSize > MAILBOX_LIMITS.maxInboundBytes) {
    message.setReject('Message too large');
    return 'rejected_size';
  }
  const address = baseAddress(message.to);
  try {
    const rows = await table(env, 'mailbox_addresses').select<{ id: string; user_id: string }>({
      select: 'id,user_id', address: `eq.${address}`, active: 'eq.true', limit: '1',
    });
    const box = rows[0];
    if (!box) {
      const f = await passThrough();
      if (f) return f;
      message.setReject('Address not found');
      return 'rejected_unknown';
    }
    const raw = await new Response(message.raw).arrayBuffer();
    const parsed = deps.parse ? await deps.parse(raw) : ((await PostalMime.parse(raw)) as unknown as Record<string, unknown>);
    const row = inboundRow({
      userId: box.user_id, addressId: box.id, envelopeFrom: message.from, envelopeTo: address, rawSize: message.rawSize,
      parsed: parsed as Parameters<typeof inboundRow>[0]['parsed'],
    });
    try {
      await table(env, 'mailbox_messages').insert(row);
    } catch (e) {
      // Reentrega do mesmo Message-ID (índice único): aceita sem duplicar.
      if (/409|23505|duplicate/i.test(e instanceof Error ? e.message : String(e))) return 'duplicate';
      throw e;
    }
    return 'stored';
  } catch (e) {
    console.error('[vertal-mail] inbound failed:', e instanceof Error ? e.message.slice(0, 200) : e);
    // Falha nossa (banco fora do ar etc.): recusa com aviso ao remetente em vez de perder o e-mail calado.
    message.setReject('Temporary failure, try again later');
    return 'error';
  }
}
