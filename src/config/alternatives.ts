/**
 * Páginas "Alternativa a X" / "Vertal vs X" (rotas /alternativas e
 * /alternativas/:slug). Servem para quem pesquisa por outras ferramentas
 * encontrar o Vertal com uma comparação honesta.
 *
 * Regras de conteúdo (uso nominativo de marca):
 * - descrever o outro produto de forma neutra e factual, sem depreciar;
 * - listar só recursos do Vertal que existem de fato no produto;
 * - manter o aviso de que as marcas pertencem aos respectivos donos.
 */

export type AlternativeCategory = 'builder' | 'agent' | 'editor' | 'hosting' | 'concept'

export interface Alternative {
  slug: string
  /** Nome do produto como o dono o escreve. */
  name: string
  category: AlternativeCategory
  /** Descrição neutra do outro produto. */
  summary: string
  /** Em que situação o Vertal é a melhor escolha. */
  whyVertal: string[]
  /** Quando faz sentido usar os dois juntos (ex.: hospedagem). */
  together?: string
  /** Outras formas como as pessoas pesquisam o produto (ex.: "lovable.dev"). */
  aliases?: string[]
}

export const CATEGORY_LABEL: Record<AlternativeCategory, string> = {
  builder: 'Construtores de apps com IA',
  agent: 'Assistentes e agentes de programação',
  editor: 'Editores de código com IA',
  hosting: 'Hospedagem e deploy',
  concept: 'Conceitos',
}

/** Recursos do Vertal usados nas comparações. */
export const VERTAL_FEATURES = [
  'Descreva o app em linguagem natural e a IA gera o código (React + Vite + Tailwind)',
  'Backend pronto com banco Postgres, autenticação e funções serverless',
  'Web3 nativo: carteiras, tokens e contratos inteligentes',
  'Integração com GitHub, Gmail, Slack e conectores próprios',
  'Agente local (Windows, macOS e Linux) e extensão para VS Code',
  'Registro de domínios e deploy a partir do mesmo painel',
  'Créditos transparentes, com plano gratuito para começar',
]

export const ALTERNATIVES: Alternative[] = [
  {
    slug: 'lovable',
    aliases: ['lovable.dev', 'lovable ai'],
    name: 'Lovable',
    category: 'builder',
    summary: 'Lovable é um construtor de aplicações web com IA: você descreve o app em linguagem natural e ele gera o projeto.',
    whyVertal: [
      'Você quer Web3 (carteiras, tokens, contratos) integrado desde o início',
      'Você quer créditos transparentes e um agente local no seu computador',
      'Você quer conectores (GitHub, Gmail, Slack) e domínio no mesmo lugar',
    ],
  },
  {
    slug: 'bolt',
    aliases: ['bolt', 'bolt ai', 'stackblitz bolt'],
    name: 'Bolt.new',
    category: 'builder',
    summary: 'Bolt.new, da StackBlitz, gera e executa aplicações full-stack direto no navegador a partir de um prompt.',
    whyVertal: [
      'Você precisa de backend com banco, autenticação e funções já configurados',
      'Você quer publicar com domínio próprio e acompanhar tudo num painel',
      'Você quer recursos Web3 prontos para usar',
    ],
  },
  {
    slug: 'replit',
    aliases: ['replit agent', 'replit ai'],
    name: 'Replit',
    category: 'builder',
    summary: 'Replit é um ambiente de desenvolvimento online com agente de IA, execução de código e hospedagem.',
    whyVertal: [
      'Você não programa e quer criar o app só descrevendo o que precisa',
      'Você quer Web3 e conectores de negócio sem configurar nada',
      'Você quer rodar agentes no seu computador pelo agente local',
    ],
  },
  {
    slug: 'bubble',
    name: 'Bubble',
    category: 'builder',
    summary: 'Bubble é uma plataforma no-code visual para construir aplicações web arrastando componentes.',
    whyVertal: [
      'Você quer que a IA construa por você, em vez de montar tela por tela',
      'Você quer ser dono do código gerado e poder levá-lo para o GitHub',
      'Você quer recursos Web3 nativos',
    ],
  },
  {
    slug: 'emergent',
    name: 'Emergent',
    category: 'builder',
    aliases: ['emergent.sh', 'emergent ai'],
    summary: 'Emergent é uma plataforma de criação de aplicativos com agentes de IA: você descreve o app e os agentes constroem o projeto.',
    whyVertal: [
      'Você quer Web3 (carteiras, tokens, contratos) integrado desde o início',
      'Você quer conectores (GitHub, Gmail, Slack), domínio e deploy no mesmo painel',
      'Você quer um agente local no seu computador e extensão para VS Code',
    ],
  },
  {
    slug: 'v0',
    name: 'v0',
    category: 'builder',
    aliases: ['v0.dev', 'v0 vercel', 'v0.app'],
    summary: 'v0, da Vercel, gera interfaces e aplicações web a partir de prompts em linguagem natural.',
    whyVertal: [
      'Você quer o app completo, com backend, banco e autenticação, não só a interface',
      'Você quer recursos Web3 prontos para usar',
      'Você quer registrar o domínio e publicar a partir do mesmo painel',
    ],
  },
  {
    slug: 'cursor',
    aliases: ['cursor ai', 'cursor editor'],
    name: 'Cursor',
    category: 'editor',
    summary: 'Cursor é um editor de código com IA, baseado no VS Code, voltado para desenvolvedores.',
    whyVertal: [
      'Você não quer instalar nem operar um editor de código',
      'Você quer o app publicado, com backend e domínio, sem sair do navegador',
      'Se você já usa um editor, a extensão do Vertal para VS Code conecta os dois',
    ],
  },
  {
    slug: 'trae',
    aliases: ['trae ai', 'trae ide'],
    name: 'Trae',
    category: 'editor',
    summary: 'Trae é um editor de código com IA voltado para desenvolvedores.',
    whyVertal: [
      'Você quer criar apps completos sem escrever código',
      'Você quer backend, Web3 e deploy integrados',
      'Você quer acompanhar custos por créditos num único painel',
    ],
  },
  {
    slug: 'claude',
    name: 'Claude',
    category: 'agent',
    aliases: ['claude code', 'claude ai', 'anthropic claude'],
    summary: 'Claude é o assistente de IA da Anthropic; com o Claude Code ele também atua como agente de programação no terminal e no editor.',
    whyVertal: [
      'Você quer um produto pronto para criar e publicar apps, sem montar o ambiente',
      'Você quer backend, Web3, domínio e deploy integrados num só painel',
      'Você quer acompanhar o custo por créditos, com plano gratuito para começar',
    ],
  },
  {
    slug: 'codex',
    name: 'Codex',
    category: 'agent',
    aliases: ['openai codex', 'chatgpt codex'],
    summary: 'Codex é o agente de programação da OpenAI, que escreve, revisa e executa código a partir de instruções.',
    whyVertal: [
      'Você não programa e quer o app publicado só descrevendo o que precisa',
      'Você quer backend, banco e autenticação já configurados',
      'Você quer Web3 e conectores de negócio sem configurar nada',
    ],
  },
  {
    slug: 'vercel',
    aliases: ['vercel.com', 'vercel deploy'],
    name: 'Vercel',
    category: 'hosting',
    summary: 'Vercel é uma plataforma de deploy e hospedagem para aplicações web, conhecida pelo Next.js.',
    whyVertal: [
      'Você ainda não tem o app: o Vertal cria e publica',
      'Você quer backend, banco e autenticação sem montar a infraestrutura',
    ],
    together: 'No Vertal o deploy já vem incluído: seu app é publicado na Cloudflare ou em containers do Vertal Cloud.',
  },
  {
    slug: 'railway',
    name: 'Railway',
    category: 'hosting',
    summary: 'Railway é uma plataforma para fazer deploy de aplicações, bancos de dados e serviços.',
    whyVertal: [
      'Você quer criar o app antes de pensar em infraestrutura',
      'Você quer IA, Web3 e conectores prontos',
    ],
    together: 'No Vertal o deploy já vem incluído: backend e serviços rodam em containers do Vertal Cloud.',
  },
  {
    slug: 'cloudflare',
    name: 'Cloudflare',
    category: 'hosting',
    summary: 'Cloudflare oferece rede global, DNS, segurança e hospedagem na borda (Workers e Pages).',
    whyVertal: [
      'Você quer o app criado por IA, não só a infraestrutura',
      'Você quer backend e Web3 integrados sem configurar serviços',
    ],
    together: 'Domínios e DNS na Cloudflare funcionam normalmente com apps do Vertal.',
  },
  {
    slug: 'render',
    name: 'Render',
    category: 'hosting',
    summary: 'Render é uma plataforma de hospedagem para aplicações web, APIs e bancos de dados.',
    whyVertal: [
      'Você quer ir da ideia ao app publicado sem montar a infraestrutura',
      'Você quer IA, Web3 e conectores prontos',
    ],
    together: 'O código gerado pelo Vertal pode ser hospedado também na Render.',
  },
  {
    slug: 'vibe-coding',
    name: 'Vibe coding',
    category: 'concept',
    summary: 'Vibe coding é criar software descrevendo o que você quer em linguagem natural e deixando a IA escrever o código.',
    whyVertal: [
      'O Vertal é uma plataforma de vibe coding completa: da ideia ao app publicado',
      'Backend, Web3 e domínio no mesmo lugar',
    ],
  },
]

export interface FaqItem {
  q: string
  a: string
}

/**
 * Perguntas frequentes de cada comparação. A mesma lista aparece na página e
 * no JSON-LD `FAQPage` do HTML pré-renderizado (`vite-plugins/seo.ts`).
 */
export function alternativeFaq(alt: Alternative, appName: string): FaqItem[] {
  if (alt.category === 'concept') {
    return [
      { q: `O que é ${alt.name}?`, a: alt.summary },
      {
        q: `Qual a melhor plataforma de ${alt.name.toLowerCase()}?`,
        a: `O ${appName} é uma plataforma de ${alt.name.toLowerCase()} completa: você descreve o app, a IA gera o código e você publica com backend, Web3 e domínio no mesmo lugar.`,
      },
      { q: `Preciso saber programar para usar o ${appName}?`, a: `Não. Basta descrever o que você quer em linguagem natural. Quem programa pode levar o código para o GitHub ou editar pela extensão do VS Code.` },
    ]
  }
  return [
    {
      q: `O ${appName} é uma alternativa ao ${alt.name}?`,
      a: `Sim. ${alt.summary} O ${appName} é uma boa escolha quando: ${alt.whyVertal.map((w) => w.charAt(0).toLowerCase() + w.slice(1)).join('; ')}.`,
    },
    {
      q: `Qual a diferença entre o ${appName} e o ${alt.name}?`,
      a: `O ${appName} junta em um só lugar a criação do app por IA, backend com banco e autenticação, recursos Web3, conectores e registro de domínio com deploy.`,
    },
    {
      q: `O ${appName} é gratuito?`,
      a: `Há um plano gratuito para começar. Depois você usa créditos transparentes ou assina um plano conforme o uso.`,
    },
    ...(alt.together ? [{ q: `Posso usar o ${appName} junto com o ${alt.name}?`, a: alt.together }] : []),
  ]
}

export function findAlternative(slug: string | undefined): Alternative | undefined {
  return ALTERNATIVES.find((a) => a.slug === slug)
}
