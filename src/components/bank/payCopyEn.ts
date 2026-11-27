/**
 * English display text for Vertal Vibe Pay (/pay, the wallet in /profile).
 *
 * Copy only. Some labels and messages come from files that are shared with the
 * `wallet` Edge Function or mirrored by it (src/lib/bank/routing.ts,
 * src/lib/wallet/pix.ts, src/lib/bank/payOnboarding.ts ->
 * supabase/functions/_shared). Those files stay as they are, so the server and
 * its tests do not change. This module turns their values into English at
 * display time and falls back to the original text when it does not know one.
 *
 * Nothing here changes amounts, fees, providers, routing or validation.
 */
import type { PixKeyType } from '@/lib/wallet/pix'
import type { PayStatus } from '@/lib/bank/payOnboarding'

/** English region name from an ISO 3166 code ("BR" -> "Brazil"). */
export function regionName(code: string | null | undefined, fallback?: string): string {
  if (!code) return fallback ?? ''
  try {
    const dn = new Intl.DisplayNames(['en'], { type: 'region' })
    return dn.of(code.toUpperCase()) ?? fallback ?? code
  } catch {
    return fallback ?? code
  }
}

/** Dates on the English pages: "Nov 27, 2026" (no day/month order confusion). */
export function formatDate(value: string | number | Date, withTime = false): string {
  const d = value instanceof Date ? value : new Date(value)
  return d.toLocaleString('en-US', withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' })
}

export const PIX_KEY_LABEL_EN: Record<PixKeyType, string> = {
  cpf: 'CPF',
  cnpj: 'CNPJ',
  email: 'Email',
  phone: 'Mobile number',
  random: 'Random key',
}

export const PIX_KEY_PLACEHOLDER_EN: Record<PixKeyType, string> = {
  cpf: '000.000.000-00',
  cnpj: '00.000.000/0000-00',
  email: 'you@example.com',
  phone: '+55 11 91234-5678',
  random: '123e4567-e89b-12d3-a456-426614174000',
}

/** Company types sent to ASAAS (values unchanged). */
export const COMPANY_TYPE_LABEL_EN: Record<string, string> = {
  MEI: 'MEI (individual micro-entrepreneur)',
  LIMITED: 'Limited company (LTDA)',
  INDIVIDUAL: 'Sole proprietor (EI/SLU)',
  ASSOCIATION: 'Association',
}

/** Field errors of the sign-up form, by validation code (src/lib/bank/payOnboarding.ts). */
export const PAY_FIELD_MESSAGES_EN: Record<string, string> = {
  name_required: 'Enter your full name or company name',
  name_full: 'Enter your first and last name',
  name_too_long: 'The name is too long (120 characters max.)',
  document_invalid: 'Invalid CPF or CNPJ',
  birth_date_required: 'Enter your date of birth',
  birth_date_invalid: 'Invalid date of birth',
  birth_date_minor: 'The account holder must be 18 or older',
  email_invalid: 'Invalid email',
  phone_invalid: 'Invalid mobile number: use the area code and a 9-digit number',
  postal_code_invalid: 'Invalid CEP (postal code)',
  address_required: 'Enter the street address',
  address_number_required: 'Enter the street number',
  province_required: 'Enter the neighborhood',
  city_required: 'Enter the city',
  state_invalid: 'Invalid state',
  income_invalid: 'Enter your monthly income or revenue',
  company_type_required: 'Choose the company type',
}

/** Pix key validation messages (src/lib/wallet/pix.ts), by their Portuguese text. */
const PIX_KEY_ERRORS_EN: Record<string, string> = {
  'Informe a chave Pix': 'Enter the Pix key',
  'CPF inválido': 'Invalid CPF',
  'CNPJ inválido': 'Invalid CNPJ',
  'E-mail inválido': 'Invalid email',
  'Celular inválido (use DDD + número com 9 dígitos)': 'Invalid mobile number (use the area code and a 9-digit number)',
  'Chave aleatória inválida': 'Invalid random key',
}

export function pixKeyErrorEn(message: string | null): string | null {
  if (!message) return message
  return PIX_KEY_ERRORS_EN[message] ?? message
}

/** Why a receive method goes to a provider (src/lib/bank/routing.ts `reason`). */
const ROUTE_REASONS_EN: Record<string, string> = {
  'Pix e boleto só existem em BRL': 'Pix and boleto work in BRL only',
  'Pix e boleto saem pelo ASAAS': 'Pix and boleto go through ASAAS',
  'Abra sua conta ASAAS para receber por Pix e boleto': 'Open your ASAAS account to receive with Pix and boleto',
  'Cartão em reais pelo ASAAS (taxas nacionais)': 'Card payments in BRL through ASAAS (domestic rates)',
  'Link de pagamento ASAAS (Pix, boleto e cartão)': 'ASAAS payment link (Pix, boleto and card)',
  'Stripe (cartões nacionais e internacionais)': 'Stripe (domestic and international cards)',
  'Link de pagamento ASAAS': 'ASAAS payment link',
  'Ative a conta ASAAS ou a conta global Stripe': 'Activate the ASAAS account or the Stripe global account',
  'Ative a conta global Stripe para receber em outras moedas': 'Activate the Stripe global account to receive in other currencies',
}

export function routeReasonEn(reason: string): string {
  if (ROUTE_REASONS_EN[reason]) return ROUTE_REASONS_EN[reason]
  const m = reason.match(/^Stripe em ([A-Z]{3})$/)
  if (m) return `Stripe in ${m[1]}`
  return reason
}

/** Status line of the single sign-up, built from the status fields (same rules as combinePayStatus). */
export function payStatusTextEn(s: PayStatus): string {
  switch (s.overall) {
    case 'not_started':
      return s.nextStep === 'wait'
        ? 'The digital account is not turned on for the platform yet.'
        : 'Open your account: one sign-up for the Brazil account and the global account.'
    case 'partial':
      return `The ${s.asaas === 'none' ? 'Brazil account (ASAAS)' : 'global account (Stripe)'} is not open yet. Try again: accounts that are already open are not opened twice.`
    case 'action_required':
      if (s.nextStep === 'stripe_onboarding') {
        return s.stripe === 'rejected'
          ? 'Stripe declined the global account. Please contact support.'
          : 'Finish the global account verification on Stripe.'
      }
      return s.asaas === 'rejected'
        ? 'ASAAS declined the Brazil account. Please contact support.'
        : 'Finish activating the Brazil account from the ASAAS email (password and documents).'
    case 'active':
      return 'Your account is active.'
    case 'in_review':
      return 'Sign-up sent. ASAAS and Stripe are reviewing it.'
    default:
      return s.message
  }
}
