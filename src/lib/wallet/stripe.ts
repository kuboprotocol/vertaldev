// Carrega o Stripe.js direto de js.stripe.com (exigência do PCI: o script não
// pode ser empacotado nem servido pelo nosso domínio). Sem dependência npm.

/* eslint-disable @typescript-eslint/no-explicit-any */
export type StripeJs = any

declare global {
  interface Window { Stripe?: (key: string, opts?: Record<string, unknown>) => StripeJs }
}

let loading: Promise<StripeJs> | null = null
let loadedKey: string | null = null

export function loadStripe(publishableKey: string): Promise<StripeJs> {
  if (loading && loadedKey === publishableKey) return loading
  loadedKey = publishableKey
  loading = new Promise((resolve, reject) => {
    const done = () => (window.Stripe ? resolve(window.Stripe(publishableKey, { locale: 'pt-BR' })) : reject(new Error('Stripe.js indisponível')))
    if (window.Stripe) return done()
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://js.stripe.com/v3/"]')
    const script = existing ?? document.createElement('script')
    script.addEventListener('load', done, { once: true })
    script.addEventListener('error', () => { loading = null; reject(new Error('Falha ao carregar Stripe.js')) }, { once: true })
    if (!existing) {
      script.src = 'https://js.stripe.com/v3/'
      script.async = true
      document.head.appendChild(script)
    }
  })
  return loading
}
