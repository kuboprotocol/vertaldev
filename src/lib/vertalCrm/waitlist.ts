// Vertal CRM · textos e interruptor da tela "liberação em breve / entrar na lista" (CrmWaitlist).
import type { CrmLang } from './i18n';

type EnvLike = Record<string, unknown> | undefined;

/** Ligado por padrão; só "false"/"0"/"off" desliga. */
export function isCrmWaitlistEnabled(env: EnvLike = import.meta.env as unknown as EnvLike): boolean {
  const v = String(env?.VITE_VERTAL_CRM_WAITLIST ?? '').trim().toLowerCase();
  return v !== 'false' && v !== '0' && v !== 'off';
}

export const WAITLIST_TEXT: Record<CrmLang, {
  title: string; body: string; join: string; joined: string; joinedBody: string; error: string; docs: string; back: string; free: string;
}> = {
  pt: {
    title: 'O Vertal CRM está chegando para a sua conta',
    body: 'Estamos liberando o CRM grátis aos poucos. Entre na lista e sua conta é liberada assim que abrirmos mais vagas.',
    join: 'Entrar na lista',
    joined: 'Você está na lista',
    joinedBody: 'Pronto! Seu pedido foi registrado. Quando sua conta for liberada, o Vertal CRM aparece em Conectores.',
    error: 'Não foi possível registrar agora. Tente de novo em instantes.',
    docs: 'Ver como o CRM funciona',
    back: 'Voltar para Conectores',
    free: 'Usar o CRM é grátis. Só a IA usa créditos.',
  },
  en: {
    title: 'Vertal CRM is coming to your account',
    body: 'We’re opening the free CRM gradually. Join the waitlist and your account will be enabled as soon as we open more spots.',
    join: 'Join the waitlist',
    joined: 'You’re on the list',
    joinedBody: 'Done! Your request is saved. Once your account is enabled, Vertal CRM will show up in Connectors.',
    error: 'Couldn’t save that right now. Please try again in a moment.',
    docs: 'See how the CRM works',
    back: 'Back to Connectors',
    free: 'Using the CRM is free. Only the AI uses credits.',
  },
  es: {
    title: 'Vertal CRM está llegando a tu cuenta',
    body: 'Estamos abriendo el CRM gratis poco a poco. Únete a la lista y tu cuenta se activará en cuanto abramos más plazas.',
    join: 'Unirme a la lista',
    joined: 'Ya estás en la lista',
    joinedBody: '¡Listo! Guardamos tu solicitud. Cuando tu cuenta esté activada, Vertal CRM aparecerá en Conectores.',
    error: 'No pudimos guardarlo ahora. Inténtalo de nuevo en un momento.',
    docs: 'Ver cómo funciona el CRM',
    back: 'Volver a Conectores',
    free: 'Usar el CRM es gratis. Solo la IA usa créditos.',
  },
};

