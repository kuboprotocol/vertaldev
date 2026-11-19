/**
 * Vertal Vibe Pay: marca, rotas e textos da página pública (landing) em
 * cada idioma. Usado pelo app (`VibePayLandingPage`, cabeçalho do `/pay`)
 * e pelo build, que gera o HTML estático de cada idioma
 * (`vite-plugins/vibePay.ts`): buscadores leem a página inteira sem rodar JS.
 *
 * Conformidade (docs/VERTAL_BANK.md §10 e §12.4): a VERTAL não é banco nem
 * instituição financeira, e o nome/título/descrição nunca usam "banco"/"bank"
 * (Res. Conjunta CMN/BCB 16 e 17/2025); só o FAQ "É um banco? Não…". Os textos descrevem uma *conta digital* dentro do
 * Vertal Dev, com contas e pagamentos fornecidos por Stripe e ASAAS. Não
 * prometer licença bancária, cartão emitido, rendimento, garantia (FGC) nem
 * recurso que o código não tem. Traduções revisadas por falantes nativos
 * entram aqui.
 */
import type { LocaleCode } from './locales'

export const VIBE_PAY = {
  name: 'Vertal Vibe Pay',
  wordmark: 'VERTAL VIBE PAY',
  /** Página pública (pt-BR na raiz; outros idiomas em `/<código>/vibe-pay`). */
  landingPath: '/vibe-pay',
  /** App logado. */
  appPath: '/pay',
  logo: '/vibe-pay/logo.webp',
  logoPng: '/vibe-pay/logo.png',
  logoSize: { width: 960, height: 640 },
  icon: '/vibe-pay/icon-192.png',
  iconSmall: '/vibe-pay/icon-64.webp',
  appleTouchIcon: '/vibe-pay/apple-touch-icon.png',
  ogImage: '/vibe-pay/og-image.jpg',
  ogImageSize: { width: 1200, height: 630 },
  providers: ['Stripe', 'ASAAS'] as const,
} as const

export const VIBE_PAY_ROOT_LOCALE = 'pt-BR'
export type VibePayCode = typeof VIBE_PAY_ROOT_LOCALE | LocaleCode

/** Caminho da landing num idioma: pt-BR na raiz. */
export function vibePayPath(code: VibePayCode): string {
  return code === VIBE_PAY_ROOT_LOCALE ? VIBE_PAY.landingPath : `/${code}${VIBE_PAY.landingPath}`
}

export interface VibePayCopy {
  code: VibePayCode
  /** `lang` do HTML / hreflang (BCP 47). */
  lang: string
  dir?: 'rtl'
  ogLocale: string
  /** Nome do idioma no próprio idioma. */
  label: string
  /** ≤ 65 caracteres. */
  title: string
  /** ≤ 155 caracteres. */
  description: string
  /** Meta keywords (Yandex, Baidu e Naver ainda leem). */
  keywords: string
  eyebrow: string
  h1: string
  lead: string
  cta: string
  login: string
  featuresTitle: string
  /** Conta global, Pix, boleto, cartões, links de pagamento, saques globais. */
  features: [string, string][]
  howTitle: string
  steps: [string, string, string]
  faqTitle: string
  faq: [string, string][]
  /** Linha de conformidade sempre visível. Cita Stripe e ASAAS. */
  disclaimer: string
  languages: string
}

export const VIBE_PAY_COPY: VibePayCopy[] = [
  {
    code: 'pt-BR', lang: 'pt-BR', ogLocale: 'pt_BR', label: 'Português (Brasil)',
    title: 'Vertal Vibe Pay — Conta digital global, Pix e carteira multimoeda',
    description: 'Conta digital e conta global no Vertal Dev: receba pagamentos do mundo todo em várias moedas, Pix, boleto, cartões, links de pagamento e saques. Grátis.',
    keywords: 'conta digital, conta global, carteira digital, conta multimoeda, conta internacional, receber pagamentos do exterior, receber em dólar, Pix, boleto, link de pagamento, Vertal Vibe Pay',
    eyebrow: 'Dentro do Vertal Dev',
    h1: 'Sua conta digital global, com Pix e várias moedas',
    lead: 'Receba de clientes no Brasil e no mundo, pague com Pix e saque para o seu banco — tudo no mesmo painel em que você cria seus apps com IA.',
    cta: 'Criar conta grátis no Vertal Dev',
    login: 'Já tenho conta',
    featuresTitle: 'Tudo o que você precisa para receber e pagar',
    features: [
      ['Conta digital global', 'Conta no seu país em mais de 40 países, saldo multimoeda e recebimentos em USD, EUR, GBP, BRL e outras moedas.'],
      ['Pix', 'Receba por QR Code ou copia e cola e envie Pix para qualquer chave, na conta Brasil.'],
      ['Boleto', 'Emita boletos com linha digitável e acompanhe o pagamento no extrato.'],
      ['Cartões', 'Aceite cartão de crédito e débito e guarde seus cartões com segurança — o número nunca passa pelos nossos servidores.'],
      ['Links de pagamento', 'Crie um link, compartilhe por WhatsApp, e-mail ou redes sociais e receba em reais ou em outra moeda.'],
      ['Saques globais', 'Saque o saldo para a sua conta bancária local, no seu país, com extrato unificado.'],
    ],
    howTitle: 'Como funciona',
    steps: [
      'Crie sua conta grátis no Vertal Dev.',
      'Abra o Vertal Vibe Pay e faça a verificação de identidade com o Stripe (conta global) e/ou o ASAAS (conta Brasil).',
      'Receba, pague e saque em um só lugar — inclusive pelos apps que você cria.',
    ],
    faqTitle: 'Perguntas frequentes',
    faq: [
      ['O Vertal Vibe Pay é um banco?', 'Não. É uma conta digital dentro da plataforma Vertal Dev. As contas e os pagamentos são fornecidos pelo Stripe e pelo ASAAS (instituição de pagamento autorizada pelo Banco Central do Brasil), em nome de cada titular. A Vertal não é banco nem instituição financeira.'],
      ['Posso usar de qualquer país?', 'A conta global usa o Stripe, disponível em mais de 40 países. Pix e boleto são para o Brasil, em reais. A disponibilidade depende do país e da verificação de identidade.'],
      ['Em quais moedas posso receber?', 'Em várias moedas, como dólar, euro, libra e real. O saldo aparece separado por moeda.'],
      ['Quanto custa?', 'Criar a conta no Vertal Dev é grátis. Podem existir tarifas de processamento do Stripe e do ASAAS em cada transação.'],
      ['Como abro minha conta?', 'Crie sua conta grátis no Vertal Dev, abra o Vertal Vibe Pay no painel e siga a verificação.'],
    ],
    disclaimer: 'O Vertal Vibe Pay é um recurso da plataforma Vertal Dev, não um banco. As contas são fornecidas pelo Stripe e pelo ASAAS (instituição de pagamento autorizada pelo Banco Central do Brasil), em nome de cada titular. A Vertal não é banco nem instituição financeira.',
    languages: 'Idiomas',
  },
  {
    code: 'en', lang: 'en', ogLocale: 'en_US', label: 'English',
    title: 'Vertal Vibe Pay — Global account & multi-currency digital wallet',
    description: 'A global account and digital wallet inside Vertal Dev: receive payments worldwide in multiple currencies, Pix, boleto, cards, payment links and payouts.',
    keywords: 'global account, multi-currency account, digital wallet, receive payments worldwide, get paid internationally, international payments, payment links, Pix, boleto, Vertal Vibe Pay',
    eyebrow: 'Inside Vertal Dev',
    h1: 'Your global digital account, multi-currency and Pix-ready',
    lead: 'Get paid by customers in Brazil and worldwide, pay with Pix and withdraw to your bank — from the same dashboard where you build apps with AI.',
    cta: 'Sign up free to Vertal Dev',
    login: 'I already have an account',
    featuresTitle: 'Everything you need to get paid and pay',
    features: [
      ['Global digital account', 'An account in your own country in 40+ countries, a multi-currency balance and payments in USD, EUR, GBP, BRL and more.'],
      ['Pix', 'Receive by QR code or copy-and-paste and send Pix to any key with the Brazil account.'],
      ['Boleto', 'Issue Brazilian boletos and track payment in your statement.'],
      ['Cards', 'Accept credit and debit cards and save your cards securely — card numbers never touch our servers.'],
      ['Payment links', 'Create a link, share it by WhatsApp, email or social media and get paid in BRL or another currency.'],
      ['Global payouts', 'Withdraw your balance to your local bank account in your country, with one unified statement.'],
    ],
    howTitle: 'How it works',
    steps: [
      'Create your free Vertal Dev account.',
      'Open Vertal Vibe Pay and verify your identity with Stripe (global account) and/or ASAAS (Brazil account).',
      'Get paid, pay and withdraw in one place — including from the apps you build.',
    ],
    faqTitle: 'Frequently asked questions',
    faq: [
      ['Is Vertal Vibe Pay a bank?', 'No. It is a digital account feature inside the Vertal Dev platform. Accounts and payments are provided by Stripe and ASAAS (a payment institution authorized by the Central Bank of Brazil), in each holder\'s name. Vertal is not a bank or financial institution.'],
      ['Can I use it from any country?', 'The global account runs on Stripe, available in 40+ countries. Pix and boleto are for Brazil, in BRL. Availability depends on your country and identity verification.'],
      ['Which currencies can I receive?', 'Multiple currencies, such as US dollars, euros, pounds and Brazilian reais. Your balance is shown per currency.'],
      ['How much does it cost?', 'Signing up to Vertal Dev is free. Stripe and ASAAS processing fees may apply to each transaction.'],
      ['How do I open my account?', 'Create a free Vertal Dev account, open Vertal Vibe Pay from the dashboard and follow the verification steps.'],
    ],
    disclaimer: 'Vertal Vibe Pay is a feature of the Vertal Dev platform, not a bank. Accounts are provided by Stripe and ASAAS (a payment institution authorized by the Central Bank of Brazil), in each holder\'s name. Vertal is not a bank or financial institution.',
    languages: 'Languages',
  },
  {
    code: 'es', lang: 'es', ogLocale: 'es_ES', label: 'Español',
    title: 'Vertal Vibe Pay — Cuenta global y billetera digital multidivisa',
    description: 'Cuenta global y billetera digital en Vertal Dev: recibe pagos de todo el mundo en varias monedas, Pix, boleto, tarjetas, enlaces de pago y retiros. Gratis.',
    keywords: 'cuenta digital, cuenta global, billetera digital, cuenta multidivisa, cuenta internacional, recibir pagos del exterior, cobrar en dólares, enlace de pago, Pix, Vertal Vibe Pay',
    eyebrow: 'Dentro de Vertal Dev',
    h1: 'Tu cuenta digital global, multidivisa y con Pix',
    lead: 'Cobra a clientes en Brasil y en todo el mundo, paga con Pix y retira a tu banco, desde el mismo panel donde creas tus apps con IA.',
    cta: 'Regístrate gratis en Vertal Dev',
    login: 'Ya tengo cuenta',
    featuresTitle: 'Todo lo que necesitas para cobrar y pagar',
    features: [
      ['Cuenta digital global', 'Una cuenta en tu propio país en más de 40 países, saldo multidivisa y cobros en USD, EUR, GBP, BRL y más.'],
      ['Pix', 'Recibe por código QR o copia y pega y envía Pix a cualquier clave con la cuenta de Brasil.'],
      ['Boleto', 'Emite boletos brasileños y sigue el pago en tu extracto.'],
      ['Tarjetas', 'Acepta tarjetas de crédito y débito y guarda tus tarjetas de forma segura: el número nunca pasa por nuestros servidores.'],
      ['Enlaces de pago', 'Crea un enlace, compártelo por WhatsApp, correo o redes sociales y cobra en reales u otra moneda.'],
      ['Retiros globales', 'Retira tu saldo a tu cuenta bancaria local en tu país, con un extracto unificado.'],
    ],
    howTitle: 'Cómo funciona',
    steps: [
      'Crea tu cuenta gratis en Vertal Dev.',
      'Abre Vertal Vibe Pay y verifica tu identidad con Stripe (cuenta global) y/o ASAAS (cuenta Brasil).',
      'Cobra, paga y retira en un solo lugar, también desde las apps que creas.',
    ],
    faqTitle: 'Preguntas frecuentes',
    faq: [
      ['¿Vertal Vibe Pay es un banco?', 'No. Es una función de cuenta digital dentro de la plataforma Vertal Dev. Las cuentas y los pagos los proveen Stripe y ASAAS (institución de pago autorizada por el Banco Central de Brasil), a nombre de cada titular. Vertal no es un banco ni una institución financiera.'],
      ['¿Puedo usarlo desde cualquier país?', 'La cuenta global funciona con Stripe, disponible en más de 40 países. Pix y boleto son para Brasil, en reales. La disponibilidad depende de tu país y de la verificación de identidad.'],
      ['¿En qué monedas puedo cobrar?', 'En varias monedas, como dólares, euros, libras y reales. El saldo se muestra por moneda.'],
      ['¿Cuánto cuesta?', 'Registrarse en Vertal Dev es gratis. Pueden aplicarse comisiones de procesamiento de Stripe y ASAAS en cada transacción.'],
      ['¿Cómo abro mi cuenta?', 'Crea una cuenta gratis en Vertal Dev, abre Vertal Vibe Pay desde el panel y sigue la verificación.'],
    ],
    disclaimer: 'Vertal Vibe Pay es una función de la plataforma Vertal Dev, no un banco. Las cuentas las proveen Stripe y ASAAS (institución de pago autorizada por el Banco Central de Brasil), a nombre de cada titular. Vertal no es un banco ni una institución financiera.',
    languages: 'Idiomas',
  },
  {
    code: 'fr', lang: 'fr', ogLocale: 'fr_FR', label: 'Français',
    title: 'Vertal Vibe Pay — Compte global et portefeuille multidevise',
    description: 'Compte global et portefeuille numérique sur Vertal Dev : paiements du monde entier en plusieurs devises, Pix, boleto, cartes, liens de paiement.',
    keywords: 'compte global, compte multidevise, portefeuille numérique, compte en ligne, recevoir des paiements internationaux, lien de paiement, Pix, Vertal Vibe Pay',
    eyebrow: 'Dans Vertal Dev',
    h1: 'Votre compte digital mondial, multidevise et compatible Pix',
    lead: 'Encaissez vos clients au Brésil et dans le monde, payez par Pix et retirez vers votre banque, depuis le tableau de bord où vous créez vos apps avec l\'IA.',
    cta: 'Inscription gratuite à Vertal Dev',
    login: 'J\'ai déjà un compte',
    featuresTitle: 'Tout pour encaisser et payer',
    features: [
      ['Compte digital mondial', 'Un compte dans votre propre pays parmi plus de 40, un solde multidevise et des paiements en USD, EUR, GBP, BRL et plus.'],
      ['Pix', 'Recevez par QR code ou copier-coller et envoyez des Pix vers n\'importe quelle clé avec le compte Brésil.'],
      ['Boleto', 'Émettez des boletos brésiliens et suivez le paiement dans votre relevé.'],
      ['Cartes', 'Acceptez les cartes de crédit et de débit et enregistrez vos cartes en sécurité : le numéro ne passe jamais par nos serveurs.'],
      ['Liens de paiement', 'Créez un lien, partagez-le par WhatsApp, e-mail ou réseaux sociaux et soyez payé en reais ou dans une autre devise.'],
      ['Retraits mondiaux', 'Retirez votre solde vers votre compte bancaire local, dans votre pays, avec un relevé unifié.'],
    ],
    howTitle: 'Comment ça marche',
    steps: [
      'Créez votre compte Vertal Dev gratuit.',
      'Ouvrez Vertal Vibe Pay et vérifiez votre identité avec Stripe (compte mondial) et/ou ASAAS (compte Brésil).',
      'Encaissez, payez et retirez au même endroit, y compris depuis les apps que vous créez.',
    ],
    faqTitle: 'Questions fréquentes',
    faq: [
      ['Vertal Vibe Pay est-il une banque ?', 'Non. C\'est une fonctionnalité de compte digital de la plateforme Vertal Dev. Les comptes et les paiements sont fournis par Stripe et ASAAS (établissement de paiement agréé par la Banque centrale du Brésil), au nom de chaque titulaire. Vertal n\'est ni une banque ni un établissement financier.'],
      ['Puis-je l\'utiliser depuis n\'importe quel pays ?', 'Le compte mondial fonctionne avec Stripe, disponible dans plus de 40 pays. Pix et boleto concernent le Brésil, en reais. La disponibilité dépend de votre pays et de la vérification d\'identité.'],
      ['Dans quelles devises puis-je encaisser ?', 'Plusieurs devises, comme le dollar, l\'euro, la livre et le real. Le solde est affiché par devise.'],
      ['Combien ça coûte ?', 'L\'inscription à Vertal Dev est gratuite. Des frais de traitement de Stripe et d\'ASAAS peuvent s\'appliquer à chaque transaction.'],
      ['Comment ouvrir mon compte ?', 'Créez un compte Vertal Dev gratuit, ouvrez Vertal Vibe Pay depuis le tableau de bord et suivez la vérification.'],
    ],
    disclaimer: 'Vertal Vibe Pay est une fonctionnalité de la plateforme Vertal Dev, pas une banque. Les comptes sont fournis par Stripe et ASAAS (établissement de paiement agréé par la Banque centrale du Brésil), au nom de chaque titulaire. Vertal n\'est ni une banque ni un établissement financier.',
    languages: 'Langues',
  },
  {
    code: 'de', lang: 'de', ogLocale: 'de_DE', label: 'Deutsch',
    title: 'Vertal Vibe Pay — Globales Konto & digitale Wallet, Mehrwährung',
    description: 'Globales Konto und digitale Wallet in Vertal Dev: weltweit Zahlungen in mehreren Währungen empfangen, Pix, Boleto, Karten, Zahlungslinks und Auszahlungen.',
    keywords: 'globales Konto, Mehrwährungskonto, digitale Wallet, Onlinekonto, weltweit Zahlungen empfangen, internationale Zahlungen, Zahlungslink, Pix, Vertal Vibe Pay',
    eyebrow: 'In Vertal Dev',
    h1: 'Ihr globales digitales Konto – Mehrwährung und Pix',
    lead: 'Werden Sie von Kunden in Brasilien und weltweit bezahlt, zahlen Sie per Pix und zahlen Sie auf Ihre Bank aus – im selben Dashboard, in dem Sie Apps mit KI bauen.',
    cta: 'Kostenlos bei Vertal Dev registrieren',
    login: 'Ich habe schon ein Konto',
    featuresTitle: 'Alles, um bezahlt zu werden und zu bezahlen',
    features: [
      ['Globales digitales Konto', 'Ein Konto in Ihrem eigenen Land in über 40 Ländern, Mehrwährungsguthaben und Zahlungen in USD, EUR, GBP, BRL und mehr.'],
      ['Pix', 'Empfangen per QR-Code oder Copy & Paste und Pix an jeden Schlüssel senden – mit dem Brasilien-Konto.'],
      ['Boleto', 'Brasilianische Boletos ausstellen und die Zahlung im Kontoauszug verfolgen.'],
      ['Karten', 'Kredit- und Debitkarten akzeptieren und eigene Karten sicher speichern – Kartennummern berühren nie unsere Server.'],
      ['Zahlungslinks', 'Link erstellen, per WhatsApp, E-Mail oder Social Media teilen und in BRL oder einer anderen Währung bezahlt werden.'],
      ['Globale Auszahlungen', 'Guthaben auf Ihr lokales Bankkonto in Ihrem Land auszahlen, mit einem einheitlichen Kontoauszug.'],
    ],
    howTitle: 'So funktioniert es',
    steps: [
      'Erstellen Sie Ihr kostenloses Vertal-Dev-Konto.',
      'Öffnen Sie Vertal Vibe Pay und verifizieren Sie Ihre Identität bei Stripe (globales Konto) und/oder ASAAS (Brasilien-Konto).',
      'Empfangen, zahlen und auszahlen an einem Ort – auch aus den Apps, die Sie bauen.',
    ],
    faqTitle: 'Häufige Fragen',
    faq: [
      ['Ist Vertal Vibe Pay eine Bank?', 'Nein. Es ist eine Funktion für digitale Konten in der Plattform Vertal Dev. Konten und Zahlungen werden von Stripe und ASAAS (von der brasilianischen Zentralbank zugelassenes Zahlungsinstitut) im Namen jedes Inhabers bereitgestellt. Vertal ist weder eine Bank noch ein Finanzinstitut.'],
      ['Kann ich es aus jedem Land nutzen?', 'Das globale Konto läuft über Stripe, verfügbar in über 40 Ländern. Pix und Boleto gelten für Brasilien in BRL. Die Verfügbarkeit hängt von Ihrem Land und der Identitätsprüfung ab.'],
      ['In welchen Währungen kann ich Zahlungen empfangen?', 'In mehreren Währungen wie US-Dollar, Euro, Pfund und Real. Das Guthaben wird je Währung angezeigt.'],
      ['Was kostet es?', 'Die Registrierung bei Vertal Dev ist kostenlos. Für jede Transaktion können Bearbeitungsgebühren von Stripe und ASAAS anfallen.'],
      ['Wie eröffne ich mein Konto?', 'Erstellen Sie ein kostenloses Vertal-Dev-Konto, öffnen Sie Vertal Vibe Pay im Dashboard und folgen Sie der Verifizierung.'],
    ],
    disclaimer: 'Vertal Vibe Pay ist eine Funktion der Plattform Vertal Dev, keine Bank. Die Konten werden von Stripe und ASAAS (von der brasilianischen Zentralbank zugelassenes Zahlungsinstitut) im Namen jedes Inhabers bereitgestellt. Vertal ist weder eine Bank noch ein Finanzinstitut.',
    languages: 'Sprachen',
  },
  {
    code: 'it', lang: 'it', ogLocale: 'it_IT', label: 'Italiano',
    title: 'Vertal Vibe Pay — Conto globale e wallet digitale multivaluta',
    description: 'Conto globale e wallet digitale in Vertal Dev: ricevi pagamenti da tutto il mondo in più valute, Pix, boleto, carte, link di pagamento e prelievi. Gratis.',
    keywords: 'conto globale, conto multivaluta, wallet digitale, portafoglio digitale, conto online, ricevere pagamenti dall\'estero, link di pagamento, Pix, Vertal Vibe Pay',
    eyebrow: 'Dentro Vertal Dev',
    h1: 'Il tuo conto digitale globale, multivaluta e con Pix',
    lead: 'Incassa da clienti in Brasile e nel mondo, paga con Pix e preleva sulla tua banca, dallo stesso pannello in cui crei app con l\'IA.',
    cta: 'Iscriviti gratis a Vertal Dev',
    login: 'Ho già un account',
    featuresTitle: 'Tutto ciò che serve per incassare e pagare',
    features: [
      ['Conto digitale globale', 'Un conto nel tuo paese in oltre 40 paesi, saldo multivaluta e incassi in USD, EUR, GBP, BRL e altre valute.'],
      ['Pix', 'Ricevi con QR code o copia e incolla e invia Pix a qualsiasi chiave con il conto Brasile.'],
      ['Boleto', 'Emetti boleto brasiliani e segui il pagamento nell\'estratto conto.'],
      ['Carte', 'Accetta carte di credito e di debito e salva le tue carte in sicurezza: il numero non passa mai dai nostri server.'],
      ['Link di pagamento', 'Crea un link, condividilo via WhatsApp, e-mail o social e incassa in reais o in un\'altra valuta.'],
      ['Prelievi globali', 'Preleva il saldo sul tuo conto bancario locale, nel tuo paese, con un estratto conto unico.'],
    ],
    howTitle: 'Come funziona',
    steps: [
      'Crea il tuo account Vertal Dev gratuito.',
      'Apri Vertal Vibe Pay e verifica la tua identità con Stripe (conto globale) e/o ASAAS (conto Brasile).',
      'Incassa, paga e preleva in un unico posto, anche dalle app che crei.',
    ],
    faqTitle: 'Domande frequenti',
    faq: [
      ['Vertal Vibe Pay è una banca?', 'No. È una funzione di conto digitale della piattaforma Vertal Dev. Conti e pagamenti sono forniti da Stripe e ASAAS (istituto di pagamento autorizzato dalla Banca Centrale del Brasile), a nome di ciascun titolare. Vertal non è una banca né un istituto finanziario.'],
      ['Posso usarlo da qualsiasi paese?', 'Il conto globale usa Stripe, disponibile in oltre 40 paesi. Pix e boleto sono per il Brasile, in reais. La disponibilità dipende dal paese e dalla verifica dell\'identità.'],
      ['In quali valute posso incassare?', 'In più valute, come dollaro, euro, sterlina e real. Il saldo è mostrato per valuta.'],
      ['Quanto costa?', 'L\'iscrizione a Vertal Dev è gratuita. Possono essere applicate commissioni di elaborazione di Stripe e ASAAS a ogni transazione.'],
      ['Come apro il mio conto?', 'Crea un account Vertal Dev gratuito, apri Vertal Vibe Pay dal pannello e segui la verifica.'],
    ],
    disclaimer: 'Vertal Vibe Pay è una funzione della piattaforma Vertal Dev, non una banca. I conti sono forniti da Stripe e ASAAS (istituto di pagamento autorizzato dalla Banca Centrale del Brasile), a nome di ciascun titolare. Vertal non è una banca né un istituto finanziario.',
    languages: 'Lingue',
  },
  {
    code: 'ja', lang: 'ja', ogLocale: 'ja_JP', label: '日本語',
    title: 'Vertal Vibe Pay — グローバル口座・多通貨デジタルウォレット',
    description: 'Vertal Dev のグローバル口座とデジタルウォレット。世界中から複数通貨で支払いを受け取り、Pix、ボレト、カード、支払いリンク、出金に対応。無料で登録できます。',
    keywords: 'グローバル口座, 多通貨口座, デジタルウォレット, 海外から支払いを受け取る, 海外送金 受け取り, 支払いリンク, Pix, Vertal Vibe Pay',
    eyebrow: 'Vertal Dev の中で',
    h1: '多通貨と Pix に対応したグローバルなデジタル口座',
    lead: 'ブラジルと世界中の顧客から支払いを受け取り、Pix で支払い、銀行口座へ出金。AI でアプリを作る同じダッシュボードから使えます。',
    cta: 'Vertal Dev に無料登録',
    login: 'アカウントをお持ちの方',
    featuresTitle: '受け取りと支払いに必要なすべて',
    features: [
      ['グローバルなデジタル口座', '40 か国以上でご自身の国の口座を開設。多通貨残高で USD、EUR、GBP、BRL などを受け取れます。'],
      ['Pix', 'ブラジル口座で QR コードやコピー＆ペーストで受け取り、任意のキーへ Pix を送金。'],
      ['ボレト', 'ブラジルのボレト（支払伝票）を発行し、明細で入金を確認。'],
      ['カード', 'クレジットカード・デビットカード決済を受け付け、ご自身のカードも安全に保存。カード番号が当社サーバーを通ることはありません。'],
      ['支払いリンク', 'リンクを作成して WhatsApp、メール、SNS で共有し、レアルや他の通貨で受け取り。'],
      ['グローバル出金', '残高をお住まいの国の銀行口座へ出金。明細は一つにまとまります。'],
    ],
    howTitle: '使い方',
    steps: [
      'Vertal Dev の無料アカウントを作成します。',
      'Vertal Vibe Pay を開き、Stripe（グローバル口座）や ASAAS（ブラジル口座）で本人確認を行います。',
      '受け取り・支払い・出金を一か所で。作成したアプリからも使えます。',
    ],
    faqTitle: 'よくある質問',
    faq: [
      ['Vertal Vibe Pay は銀行ですか？', 'いいえ。Vertal Dev プラットフォーム内のデジタル口座機能です。口座と決済は Stripe と ASAAS（ブラジル中央銀行認可の決済機関）が各名義人の名前で提供します。Vertal は銀行でも金融機関でもありません。'],
      ['どの国からでも使えますか？', 'グローバル口座は 40 か国以上で利用できる Stripe を使用します。Pix とボレトはブラジル（レアル）向けです。利用可否は国と本人確認によります。'],
      ['どの通貨で受け取れますか？', '米ドル、ユーロ、ポンド、レアルなど複数の通貨です。残高は通貨ごとに表示されます。'],
      ['費用はかかりますか？', 'Vertal Dev への登録は無料です。取引ごとに Stripe と ASAAS の決済手数料がかかる場合があります。'],
      ['口座はどう開設しますか？', 'Vertal Dev の無料アカウントを作成し、ダッシュボードから Vertal Vibe Pay を開いて本人確認を進めてください。'],
    ],
    disclaimer: 'Vertal Vibe Pay は Vertal Dev プラットフォームの機能であり、銀行ではありません。口座は Stripe と ASAAS（ブラジル中央銀行認可の決済機関）が各名義人の名前で提供します。Vertal は銀行でも金融機関でもありません。',
    languages: '言語',
  },
  {
    code: 'zh-CN', lang: 'zh-CN', ogLocale: 'zh_CN', label: '简体中文',
    title: 'Vertal Vibe Pay — 全球账户与多币种数字钱包',
    description: 'Vertal Dev 内的全球账户和数字钱包：以多种货币接收全球付款，支持 Pix、Boleto、信用卡、支付链接和提现。免费注册。',
    keywords: '全球账户, 多币种账户, 数字钱包, 电子钱包, 跨境收款, 国际收款, 支付链接, Pix, Vertal Vibe Pay',
    eyebrow: '内置于 Vertal Dev',
    h1: '您的全球数字账户：多币种，支持 Pix',
    lead: '向巴西和全球客户收款、用 Pix 付款、提现到您的银行——都在您用 AI 创建应用的同一个控制台中完成。',
    cta: '免费注册 Vertal Dev',
    login: '我已有账户',
    featuresTitle: '收款和付款所需的一切',
    features: [
      ['全球数字账户', '在 40 多个国家/地区开设本国账户，多币种余额，可收取 USD、EUR、GBP、BRL 等货币。'],
      ['Pix', '通过巴西账户用二维码或复制粘贴收款，并向任意密钥发送 Pix。'],
      ['Boleto', '开具巴西 Boleto 付款单，并在对账单中跟踪付款。'],
      ['信用卡与借记卡', '接受信用卡和借记卡付款，并安全保存您的卡——卡号绝不经过我们的服务器。'],
      ['支付链接', '创建链接，通过 WhatsApp、电子邮件或社交媒体分享，以雷亚尔或其他货币收款。'],
      ['全球提现', '将余额提现到您所在国家的本地银行账户，统一对账单。'],
    ],
    howTitle: '使用方式',
    steps: [
      '免费创建 Vertal Dev 账户。',
      '打开 Vertal Vibe Pay，通过 Stripe（全球账户）和/或 ASAAS（巴西账户）完成身份验证。',
      '在一个地方收款、付款和提现——也可以在您创建的应用中使用。',
    ],
    faqTitle: '常见问题',
    faq: [
      ['Vertal Vibe Pay 是银行吗？', '不是。它是 Vertal Dev 平台内的数字账户功能。账户和支付由 Stripe 和 ASAAS（经巴西中央银行授权的支付机构）以每位持有人的名义提供。Vertal 不是银行，也不是金融机构。'],
      ['可以在任何国家使用吗？', '全球账户基于 Stripe，覆盖 40 多个国家/地区。Pix 和 Boleto 仅适用于巴西（雷亚尔）。是否可用取决于您的国家和身份验证。'],
      ['可以收取哪些货币？', '多种货币，例如美元、欧元、英镑和雷亚尔。余额按币种分别显示。'],
      ['费用是多少？', '注册 Vertal Dev 免费。每笔交易可能产生 Stripe 和 ASAAS 的处理费用。'],
      ['如何开户？', '免费创建 Vertal Dev 账户，在控制台打开 Vertal Vibe Pay 并完成验证。'],
    ],
    disclaimer: 'Vertal Vibe Pay 是 Vertal Dev 平台的一项功能，不是银行。账户由 Stripe 和 ASAAS（经巴西中央银行授权的支付机构）以每位持有人的名义提供。Vertal 不是银行，也不是金融机构。',
    languages: '语言',
  },
  {
    code: 'hi', lang: 'hi', ogLocale: 'hi_IN', label: 'हिन्दी',
    title: 'Vertal Vibe Pay — ग्लोबल खाता और मल्टी-करेंसी डिजिटल वॉलेट',
    description: 'Vertal Dev के अंदर ग्लोबल खाता और डिजिटल वॉलेट: दुनिया भर से कई मुद्राओं में भुगतान पाएं, Pix, बोलेटो, कार्ड, पेमेंट लिंक और निकासी। मुफ़्त साइन अप।',
    keywords: 'ग्लोबल खाता, डिजिटल खाता, डिजिटल वॉलेट, मल्टी-करेंसी खाता, विदेश से भुगतान प्राप्त करें, अंतरराष्ट्रीय भुगतान, पेमेंट लिंक, Pix, Vertal Vibe Pay',
    eyebrow: 'Vertal Dev के अंदर',
    h1: 'आपका ग्लोबल डिजिटल खाता — मल्टी-करेंसी और Pix के साथ',
    lead: 'ब्राज़ील और दुनिया भर के ग्राहकों से भुगतान पाएं, Pix से भुगतान करें और अपने बैंक में पैसे निकालें — उसी डैशबोर्ड से जहां आप AI से ऐप बनाते हैं।',
    cta: 'Vertal Dev पर मुफ़्त साइन अप करें',
    login: 'मेरा खाता पहले से है',
    featuresTitle: 'भुगतान पाने और करने के लिए सब कुछ',
    features: [
      ['ग्लोबल डिजिटल खाता', '40 से ज़्यादा देशों में आपके अपने देश का खाता, मल्टी-करेंसी बैलेंस और USD, EUR, GBP, BRL व अन्य मुद्राओं में भुगतान।'],
      ['Pix', 'ब्राज़ील खाते से QR कोड या कॉपी-पेस्ट से भुगतान पाएं और किसी भी कुंजी पर Pix भेजें।'],
      ['बोलेटो', 'ब्राज़ीलियाई बोलेटो जारी करें और स्टेटमेंट में भुगतान ट्रैक करें।'],
      ['कार्ड', 'क्रेडिट और डेबिट कार्ड से भुगतान स्वीकार करें और अपने कार्ड सुरक्षित रूप से सहेजें — कार्ड नंबर कभी हमारे सर्वर से नहीं गुज़रता।'],
      ['पेमेंट लिंक', 'लिंक बनाएं, WhatsApp, ईमेल या सोशल मीडिया पर साझा करें और रियाल या किसी अन्य मुद्रा में भुगतान पाएं।'],
      ['ग्लोबल निकासी', 'अपना बैलेंस अपने देश के स्थानीय बैंक खाते में निकालें, एक ही स्टेटमेंट के साथ।'],
    ],
    howTitle: 'यह कैसे काम करता है',
    steps: [
      'अपना मुफ़्त Vertal Dev खाता बनाएं।',
      'Vertal Vibe Pay खोलें और Stripe (ग्लोबल खाता) और/या ASAAS (ब्राज़ील खाता) से अपनी पहचान सत्यापित करें।',
      'एक ही जगह से भुगतान पाएं, भुगतान करें और निकासी करें — अपने बनाए ऐप्स से भी।',
    ],
    faqTitle: 'अक्सर पूछे जाने वाले प्रश्न',
    faq: [
      ['क्या Vertal Vibe Pay एक बैंक है?', 'नहीं। यह Vertal Dev प्लेटफ़ॉर्म के अंदर एक डिजिटल खाता सुविधा है। खाते और भुगतान Stripe और ASAAS (ब्राज़ील के केंद्रीय बैंक द्वारा अधिकृत भुगतान संस्था) हर खाताधारक के नाम पर प्रदान करते हैं। Vertal न तो बैंक है और न ही वित्तीय संस्था।'],
      ['क्या मैं इसे किसी भी देश से इस्तेमाल कर सकता हूं?', 'ग्लोबल खाता Stripe पर चलता है, जो 40 से ज़्यादा देशों में उपलब्ध है। Pix और बोलेटो ब्राज़ील (BRL) के लिए हैं। उपलब्धता आपके देश और पहचान सत्यापन पर निर्भर करती है।'],
      ['मैं किन मुद्राओं में भुगतान पा सकता हूं?', 'कई मुद्राओं में, जैसे अमेरिकी डॉलर, यूरो, पाउंड और ब्राज़ीलियाई रियाल। बैलेंस हर मुद्रा के लिए अलग दिखता है।'],
      ['इसकी लागत कितनी है?', 'Vertal Dev पर साइन अप मुफ़्त है। हर लेन-देन पर Stripe और ASAAS का प्रोसेसिंग शुल्क लग सकता है।'],
      ['मैं अपना खाता कैसे खोलूं?', 'मुफ़्त Vertal Dev खाता बनाएं, डैशबोर्ड से Vertal Vibe Pay खोलें और सत्यापन के चरण पूरे करें।'],
    ],
    disclaimer: 'Vertal Vibe Pay, Vertal Dev प्लेटफ़ॉर्म की एक सुविधा है, बैंक नहीं। खाते Stripe और ASAAS (ब्राज़ील के केंद्रीय बैंक द्वारा अधिकृत भुगतान संस्था) हर खाताधारक के नाम पर प्रदान करते हैं। Vertal न तो बैंक है और न ही वित्तीय संस्था।',
    languages: 'भाषाएं',
  },
  {
    code: 'ar', lang: 'ar', dir: 'rtl', ogLocale: 'ar_AR', label: 'العربية',
    title: 'Vertal Vibe Pay — حساب عالمي ومحفظة رقمية متعددة العملات',
    description: 'حساب عالمي ومحفظة رقمية داخل Vertal Dev: استلم المدفوعات من حول العالم بعدة عملات، وPix، وبوليتو، والبطاقات، وروابط الدفع، والسحب. سجّل مجانًا.',
    keywords: 'حساب عالمي, حساب رقمي, محفظة رقمية, حساب متعدد العملات, استلام المدفوعات الدولية, رابط دفع, Pix, Vertal Vibe Pay',
    eyebrow: 'داخل Vertal Dev',
    h1: 'حسابك الرقمي العالمي، متعدد العملات ويدعم Pix',
    lead: 'استلم المدفوعات من العملاء في البرازيل وحول العالم، وادفع عبر Pix، واسحب إلى بنكك — من نفس لوحة التحكم التي تبني فيها تطبيقاتك بالذكاء الاصطناعي.',
    cta: 'سجّل مجانًا في Vertal Dev',
    login: 'لدي حساب بالفعل',
    featuresTitle: 'كل ما تحتاجه لاستلام المدفوعات والدفع',
    features: [
      ['حساب رقمي عالمي', 'حساب في بلدك ضمن أكثر من 40 دولة، ورصيد متعدد العملات، ومدفوعات بالدولار واليورو والجنيه الإسترليني والريال البرازيلي وغيرها.'],
      ['Pix', 'استلم عبر رمز QR أو النسخ واللصق وأرسل Pix إلى أي مفتاح باستخدام الحساب البرازيلي.'],
      ['بوليتو', 'أصدر قسائم بوليتو البرازيلية وتابع الدفع في كشف الحساب.'],
      ['البطاقات', 'اقبل بطاقات الائتمان والخصم واحفظ بطاقاتك بأمان — رقم البطاقة لا يمر أبدًا عبر خوادمنا.'],
      ['روابط الدفع', 'أنشئ رابطًا وشاركه عبر واتساب أو البريد الإلكتروني أو وسائل التواصل واستلم بالريال أو بعملة أخرى.'],
      ['سحب عالمي', 'اسحب رصيدك إلى حسابك البنكي المحلي في بلدك، مع كشف حساب موحد.'],
    ],
    howTitle: 'كيف يعمل',
    steps: [
      'أنشئ حسابك المجاني في Vertal Dev.',
      'افتح Vertal Vibe Pay وتحقّق من هويتك مع Stripe (الحساب العالمي) و/أو ASAAS (الحساب البرازيلي).',
      'استلم وادفع واسحب من مكان واحد — حتى من التطبيقات التي تبنيها.',
    ],
    faqTitle: 'الأسئلة الشائعة',
    faq: [
      ['هل Vertal Vibe Pay بنك؟', 'لا. إنه ميزة حساب رقمي داخل منصة Vertal Dev. تُقدَّم الحسابات والمدفوعات من Stripe وASAAS (مؤسسة دفع مرخّصة من البنك المركزي البرازيلي) باسم كل صاحب حساب. Vertal ليست بنكًا ولا مؤسسة مالية.'],
      ['هل يمكنني استخدامه من أي دولة؟', 'يعمل الحساب العالمي عبر Stripe المتاح في أكثر من 40 دولة. أما Pix وبوليتو فهما للبرازيل بالريال. يعتمد التوفر على بلدك والتحقق من الهوية.'],
      ['بأي عملات يمكنني الاستلام؟', 'بعدة عملات مثل الدولار الأمريكي واليورو والجنيه الإسترليني والريال البرازيلي. يُعرض الرصيد لكل عملة على حدة.'],
      ['كم التكلفة؟', 'التسجيل في Vertal Dev مجاني. قد تُطبَّق رسوم معالجة من Stripe وASAAS على كل معاملة.'],
      ['كيف أفتح حسابي؟', 'أنشئ حسابًا مجانيًا في Vertal Dev، وافتح Vertal Vibe Pay من لوحة التحكم، واتبع خطوات التحقق.'],
    ],
    disclaimer: 'Vertal Vibe Pay ميزة في منصة Vertal Dev وليست بنكًا. تُقدَّم الحسابات من Stripe وASAAS (مؤسسة دفع مرخّصة من البنك المركزي البرازيلي) باسم كل صاحب حساب. Vertal ليست بنكًا ولا مؤسسة مالية.',
    languages: 'اللغات',
  },
  {
    code: 'ko', lang: 'ko', ogLocale: 'ko_KR', label: '한국어',
    title: 'Vertal Vibe Pay — 글로벌 계좌·다중 통화 디지털 지갑',
    description: 'Vertal Dev 안의 글로벌 계좌와 디지털 지갑: 전 세계에서 여러 통화로 결제 받기, Pix, 보레투, 카드, 결제 링크, 출금까지. 무료로 가입하세요.',
    keywords: '글로벌 계좌, 디지털 계좌, 디지털 지갑, 다중 통화 계좌, 해외 결제 받기, 해외 송금 받기, 결제 링크, Pix, Vertal Vibe Pay',
    eyebrow: 'Vertal Dev 안에서',
    h1: '다중 통화와 Pix를 지원하는 글로벌 디지털 계좌',
    lead: '브라질과 전 세계 고객에게서 결제를 받고, Pix로 지불하고, 은행으로 출금하세요. AI로 앱을 만드는 같은 대시보드에서 모두 가능합니다.',
    cta: 'Vertal Dev 무료 가입',
    login: '이미 계정이 있어요',
    featuresTitle: '결제 받고 지불하는 데 필요한 모든 것',
    features: [
      ['글로벌 디지털 계좌', '40개국 이상에서 내 나라의 계좌, 다중 통화 잔액, USD·EUR·GBP·BRL 등으로 결제 받기.'],
      ['Pix', '브라질 계좌로 QR 코드나 복사·붙여넣기로 받고, 어떤 키로든 Pix 송금.'],
      ['보레투', '브라질 보레투를 발행하고 거래 내역에서 결제를 확인.'],
      ['카드', '신용·체크카드 결제를 받고 내 카드를 안전하게 저장. 카드 번호는 당사 서버를 거치지 않습니다.'],
      ['결제 링크', '링크를 만들어 WhatsApp, 이메일, SNS로 공유하고 헤알이나 다른 통화로 받기.'],
      ['글로벌 출금', '잔액을 내 나라의 은행 계좌로 출금하고, 거래 내역은 하나로.'],
    ],
    howTitle: '이용 방법',
    steps: [
      '무료 Vertal Dev 계정을 만드세요.',
      'Vertal Vibe Pay를 열고 Stripe(글로벌 계좌) 및/또는 ASAAS(브라질 계좌)로 본인 인증을 하세요.',
      '한곳에서 받고, 지불하고, 출금하세요. 직접 만든 앱에서도 가능합니다.',
    ],
    faqTitle: '자주 묻는 질문',
    faq: [
      ['Vertal Vibe Pay는 은행인가요?', '아닙니다. Vertal Dev 플랫폼 안의 디지털 계좌 기능입니다. 계좌와 결제는 Stripe와 ASAAS(브라질 중앙은행 인가 결제기관)가 각 명의자 이름으로 제공합니다. Vertal은 은행이나 금융기관이 아닙니다.'],
      ['어느 나라에서나 쓸 수 있나요?', '글로벌 계좌는 40개국 이상에서 제공되는 Stripe를 사용합니다. Pix와 보레투는 브라질(헤알) 전용입니다. 이용 가능 여부는 국가와 본인 인증에 따라 다릅니다.'],
      ['어떤 통화로 받을 수 있나요?', '미국 달러, 유로, 파운드, 헤알 등 여러 통화로 받을 수 있습니다. 잔액은 통화별로 표시됩니다.'],
      ['비용은 얼마인가요?', 'Vertal Dev 가입은 무료입니다. 거래마다 Stripe와 ASAAS의 처리 수수료가 붙을 수 있습니다.'],
      ['계좌는 어떻게 여나요?', '무료 Vertal Dev 계정을 만들고 대시보드에서 Vertal Vibe Pay를 연 뒤 인증 절차를 따르세요.'],
    ],
    disclaimer: 'Vertal Vibe Pay는 Vertal Dev 플랫폼의 기능이며 은행이 아닙니다. 계좌는 Stripe와 ASAAS(브라질 중앙은행 인가 결제기관)가 각 명의자 이름으로 제공합니다. Vertal은 은행이나 금융기관이 아닙니다.',
    languages: '언어',
  },
  {
    code: 'ru', lang: 'ru', ogLocale: 'ru_RU', label: 'Русский',
    title: 'Vertal Vibe Pay — глобальный счёт и мультивалютный кошелёк',
    description: 'Глобальный счёт и цифровой кошелёк в Vertal Dev: принимайте платежи со всего мира в разных валютах, Pix, boleto, карты, платёжные ссылки и вывод средств.',
    keywords: 'глобальный счёт, мультивалютный счёт, цифровой кошелёк, электронный кошелёк, приём платежей из-за рубежа, международные платежи, платёжная ссылка, Pix, Vertal Vibe Pay',
    eyebrow: 'Внутри Vertal Dev',
    h1: 'Ваш глобальный цифровой счёт — мультивалютный и с Pix',
    lead: 'Принимайте оплату от клиентов в Бразилии и по всему миру, платите через Pix и выводите на свой банк — в той же панели, где вы создаёте приложения с ИИ.',
    cta: 'Бесплатная регистрация в Vertal Dev',
    login: 'У меня уже есть аккаунт',
    featuresTitle: 'Всё, чтобы принимать и отправлять платежи',
    features: [
      ['Глобальный цифровой счёт', 'Счёт в вашей стране — более 40 стран, мультивалютный баланс и платежи в USD, EUR, GBP, BRL и других валютах.'],
      ['Pix', 'Принимайте по QR-коду или «скопировать и вставить» и отправляйте Pix на любой ключ с бразильского счёта.'],
      ['Boleto', 'Выставляйте бразильские boleto и отслеживайте оплату в выписке.'],
      ['Карты', 'Принимайте кредитные и дебетовые карты и безопасно сохраняйте свои — номер карты никогда не проходит через наши серверы.'],
      ['Платёжные ссылки', 'Создайте ссылку, отправьте её в WhatsApp, по e-mail или в соцсетях и получайте оплату в реалах или другой валюте.'],
      ['Глобальный вывод', 'Выводите баланс на местный банковский счёт в своей стране, с единой выпиской.'],
    ],
    howTitle: 'Как это работает',
    steps: [
      'Создайте бесплатный аккаунт Vertal Dev.',
      'Откройте Vertal Vibe Pay и пройдите проверку личности в Stripe (глобальный счёт) и/или ASAAS (бразильский счёт).',
      'Принимайте, платите и выводите в одном месте — в том числе из своих приложений.',
    ],
    faqTitle: 'Частые вопросы',
    faq: [
      ['Vertal Vibe Pay — это банк?', 'Нет. Это функция цифрового счёта в платформе Vertal Dev. Счета и платежи предоставляют Stripe и ASAAS (платёжное учреждение, авторизованное Центральным банком Бразилии) на имя каждого владельца. Vertal не является банком или финансовой организацией.'],
      ['Можно пользоваться из любой страны?', 'Глобальный счёт работает на Stripe, доступном в более чем 40 странах. Pix и boleto — для Бразилии, в реалах. Доступность зависит от страны и проверки личности.'],
      ['В каких валютах можно принимать платежи?', 'В нескольких валютах, например в долларах США, евро, фунтах и реалах. Баланс показывается по каждой валюте.'],
      ['Сколько это стоит?', 'Регистрация в Vertal Dev бесплатна. За каждую операцию может взиматься комиссия Stripe и ASAAS за обработку.'],
      ['Как открыть счёт?', 'Создайте бесплатный аккаунт Vertal Dev, откройте Vertal Vibe Pay в панели и пройдите проверку.'],
    ],
    disclaimer: 'Vertal Vibe Pay — функция платформы Vertal Dev, а не банк. Счета предоставляют Stripe и ASAAS (платёжное учреждение, авторизованное Центральным банком Бразилии) на имя каждого владельца. Vertal не является банком или финансовой организацией.',
    languages: 'Языки',
  },
  {
    code: 'tr', lang: 'tr', ogLocale: 'tr_TR', label: 'Türkçe',
    title: 'Vertal Vibe Pay — Küresel hesap ve çoklu döviz dijital cüzdan',
    description: 'Vertal Dev içinde küresel hesap ve dijital cüzdan: dünyanın her yerinden çoklu dövizle ödeme alın, Pix, boleto, kartlar, ödeme linkleri, para çekme.',
    keywords: 'küresel hesap, dijital hesap, dijital cüzdan, çoklu döviz hesabı, yurt dışından ödeme alma, uluslararası ödeme, ödeme linki, Pix, Vertal Vibe Pay',
    eyebrow: 'Vertal Dev içinde',
    h1: 'Çoklu döviz ve Pix destekli küresel dijital hesabınız',
    lead: 'Brezilya\'daki ve dünyadaki müşterilerden ödeme alın, Pix ile ödeyin ve bankanıza çekin — yapay zekâyla uygulama geliştirdiğiniz aynı panelden.',
    cta: 'Vertal Dev\'e ücretsiz kaydol',
    login: 'Zaten hesabım var',
    featuresTitle: 'Ödeme almak ve yapmak için ihtiyacınız olan her şey',
    features: [
      ['Küresel dijital hesap', '40\'tan fazla ülkede kendi ülkenizde hesap, çoklu döviz bakiyesi ve USD, EUR, GBP, BRL gibi para birimlerinde ödeme.'],
      ['Pix', 'Brezilya hesabıyla QR kod veya kopyala-yapıştır ile alın ve herhangi bir anahtara Pix gönderin.'],
      ['Boleto', 'Brezilya boletoları düzenleyin ve ödemeyi hesap dökümünden takip edin.'],
      ['Kartlar', 'Kredi ve banka kartı kabul edin, kartlarınızı güvenle saklayın — kart numarası asla sunucularımızdan geçmez.'],
      ['Ödeme linkleri', 'Bir link oluşturun, WhatsApp, e-posta veya sosyal medyada paylaşın ve real ya da başka bir para biriminde ödeme alın.'],
      ['Küresel para çekme', 'Bakiyenizi kendi ülkenizdeki yerel banka hesabınıza çekin, tek bir hesap dökümüyle.'],
    ],
    howTitle: 'Nasıl çalışır',
    steps: [
      'Ücretsiz Vertal Dev hesabınızı oluşturun.',
      'Vertal Vibe Pay\'ı açın ve kimliğinizi Stripe (küresel hesap) ve/veya ASAAS (Brezilya hesabı) ile doğrulayın.',
      'Tek yerden ödeme alın, ödeyin ve çekin — geliştirdiğiniz uygulamalardan da.',
    ],
    faqTitle: 'Sık sorulan sorular',
    faq: [
      ['Vertal Vibe Pay bir banka mı?', 'Hayır. Vertal Dev platformunda bir dijital hesap özelliğidir. Hesaplar ve ödemeler, her hesap sahibinin adına Stripe ve ASAAS (Brezilya Merkez Bankası tarafından yetkilendirilmiş ödeme kuruluşu) tarafından sağlanır. Vertal bir banka veya finans kuruluşu değildir.'],
      ['Her ülkeden kullanabilir miyim?', 'Küresel hesap, 40\'tan fazla ülkede sunulan Stripe ile çalışır. Pix ve boleto Brezilya (BRL) içindir. Kullanılabilirlik ülkenize ve kimlik doğrulamasına bağlıdır.'],
      ['Hangi para birimlerinde ödeme alabilirim?', 'ABD doları, euro, sterlin ve Brezilya reali gibi birçok para biriminde. Bakiye para birimine göre gösterilir.'],
      ['Ne kadar tutar?', 'Vertal Dev\'e kayıt ücretsizdir. Her işlemde Stripe ve ASAAS işlem ücretleri uygulanabilir.'],
      ['Hesabımı nasıl açarım?', 'Ücretsiz bir Vertal Dev hesabı oluşturun, panelden Vertal Vibe Pay\'ı açın ve doğrulama adımlarını izleyin.'],
    ],
    disclaimer: 'Vertal Vibe Pay, Vertal Dev platformunun bir özelliğidir, banka değildir. Hesaplar, her hesap sahibinin adına Stripe ve ASAAS (Brezilya Merkez Bankası tarafından yetkilendirilmiş ödeme kuruluşu) tarafından sağlanır. Vertal bir banka veya finans kuruluşu değildir.',
    languages: 'Diller',
  },
  {
    code: 'id', lang: 'id', ogLocale: 'id_ID', label: 'Bahasa Indonesia',
    title: 'Vertal Vibe Pay — Akun global & dompet digital multi-mata uang',
    description: 'Akun global dan dompet digital di Vertal Dev: terima pembayaran dari seluruh dunia dalam banyak mata uang, Pix, boleto, kartu, dan tautan pembayaran.',
    keywords: 'akun global, rekening digital, dompet digital, rekening multi mata uang, terima pembayaran internasional, tautan pembayaran, Pix, Vertal Vibe Pay',
    eyebrow: 'Di dalam Vertal Dev',
    h1: 'Rekening digital global Anda, multi-mata uang dan siap Pix',
    lead: 'Terima pembayaran dari pelanggan di Brasil dan seluruh dunia, bayar dengan Pix, dan tarik ke bank Anda — dari dasbor yang sama tempat Anda membuat aplikasi dengan AI.',
    cta: 'Daftar gratis di Vertal Dev',
    login: 'Saya sudah punya akun',
    featuresTitle: 'Semua yang Anda perlukan untuk menerima dan membayar',
    features: [
      ['Rekening digital global', 'Rekening di negara Anda sendiri di lebih dari 40 negara, saldo multi-mata uang, dan pembayaran dalam USD, EUR, GBP, BRL, dan lainnya.'],
      ['Pix', 'Terima lewat kode QR atau salin-tempel dan kirim Pix ke kunci mana pun dengan rekening Brasil.'],
      ['Boleto', 'Terbitkan boleto Brasil dan pantau pembayaran di mutasi rekening.'],
      ['Kartu', 'Terima kartu kredit dan debit serta simpan kartu Anda dengan aman — nomor kartu tidak pernah melewati server kami.'],
      ['Tautan pembayaran', 'Buat tautan, bagikan lewat WhatsApp, email, atau media sosial, dan terima dalam real atau mata uang lain.'],
      ['Penarikan global', 'Tarik saldo ke rekening bank lokal di negara Anda, dengan satu mutasi terpadu.'],
    ],
    howTitle: 'Cara kerjanya',
    steps: [
      'Buat akun Vertal Dev gratis Anda.',
      'Buka Vertal Vibe Pay dan verifikasi identitas Anda dengan Stripe (rekening global) dan/atau ASAAS (rekening Brasil).',
      'Terima, bayar, dan tarik di satu tempat — juga dari aplikasi yang Anda buat.',
    ],
    faqTitle: 'Pertanyaan umum',
    faq: [
      ['Apakah Vertal Vibe Pay adalah bank?', 'Bukan. Ini adalah fitur rekening digital di dalam platform Vertal Dev. Rekening dan pembayaran disediakan oleh Stripe dan ASAAS (lembaga pembayaran yang diotorisasi oleh Bank Sentral Brasil) atas nama setiap pemilik. Vertal bukan bank atau lembaga keuangan.'],
      ['Bisakah saya memakainya dari negara mana pun?', 'Rekening global berjalan di Stripe, tersedia di lebih dari 40 negara. Pix dan boleto untuk Brasil, dalam BRL. Ketersediaan bergantung pada negara dan verifikasi identitas Anda.'],
      ['Mata uang apa saja yang bisa saya terima?', 'Banyak mata uang, seperti dolar AS, euro, pound, dan real Brasil. Saldo ditampilkan per mata uang.'],
      ['Berapa biayanya?', 'Mendaftar di Vertal Dev gratis. Biaya pemrosesan Stripe dan ASAAS dapat berlaku untuk setiap transaksi.'],
      ['Bagaimana cara membuka rekening?', 'Buat akun Vertal Dev gratis, buka Vertal Vibe Pay dari dasbor, dan ikuti langkah verifikasi.'],
    ],
    disclaimer: 'Vertal Vibe Pay adalah fitur platform Vertal Dev, bukan bank. Rekening disediakan oleh Stripe dan ASAAS (lembaga pembayaran yang diotorisasi oleh Bank Sentral Brasil) atas nama setiap pemilik. Vertal bukan bank atau lembaga keuangan.',
    languages: 'Bahasa',
  },
]

export function vibePayCopy(code: VibePayCode): VibePayCopy {
  return VIBE_PAY_COPY.find((c) => c.code === code) ?? VIBE_PAY_COPY[0]
}
