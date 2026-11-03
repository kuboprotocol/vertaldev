// Envio de e-mail com anexo do Vertal Office (edge function `office-email-send`).
// O envio só é feito com confirmed: true, que a interface envia apenas depois
// de o usuário revisar o e-mail e marcar a confirmação.
import { supabase } from '@/integrations/supabase/client';

export interface GmailAccountOption {
  id: string;
  email: string;
}

export async function listGmailAccounts(): Promise<GmailAccountOption[]> {
  const { data, error } = await supabase
    .from('gmail_accounts')
    .select('id, email')
    .order('created_at', { ascending: true });
  if (error) throw new Error('Não foi possível carregar suas contas de e-mail.');
  return (data ?? []) as GmailAccountOption[];
}

/** Bytes para base64 em blocos (evita estourar a pilha em arquivos grandes). */
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export interface SendOfficeEmailInput {
  accountId: string;
  to: string;
  subject: string;
  body: string;
  attachment: { filename: string; bytes: Uint8Array };
}

const ERRORS: Record<string, string> = {
  invalid_recipient: 'Destinatário inválido.',
  attachment_type_not_allowed: 'Tipo de anexo não permitido.',
  attachment_too_large: 'Anexo maior que 10 MB.',
  gmail_send_failed: 'O Gmail recusou o envio. Verifique a conta conectada e tente de novo.',
  account_not_found: 'Conta de e-mail não encontrada. Conecte o Gmail e tente de novo.',
};

export async function sendOfficeEmail(input: SendOfficeEmailInput): Promise<void> {
  const { data, error } = await supabase.functions.invoke<{ success?: boolean; error?: string }>(
    'creative-router',
    {
      body: {
        tool: 'office_email',
        office: {
          accountId: input.accountId,
          to: input.to,
          subject: input.subject,
          body: input.body,
          attachment: {
            filename: input.attachment.filename,
            contentBase64: bytesToBase64(input.attachment.bytes),
          },
          confirmed: true,
        },
      },
    },
  );
  if (error) {
    const ctx = (error as { context?: Response })?.context;
    let code: string | undefined;
    try {
      code = ((await ctx?.json()) as { error?: string } | undefined)?.error;
    } catch {
      code = undefined;
    }
    throw new Error((code && ERRORS[code]) || 'Não foi possível enviar o e-mail agora.');
  }
  if (!data?.success) throw new Error('Resposta inesperada ao enviar o e-mail.');
}
