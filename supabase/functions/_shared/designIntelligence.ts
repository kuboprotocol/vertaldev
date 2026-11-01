// Vertal Design Intelligence — camada de design "Apple-inspired" do Vibe Code.
//
// O que é: um conjunto de regras, tokens e uma auditoria estática que o agente
// de código usa para gerar interfaces limpas, consistentes e acessíveis.
//
// De onde vem: princípios de usabilidade publicados abertamente pela Apple
// (Human Interface Guidelines, https://developer.apple.com/design/human-interface-guidelines/)
// e pelo W3C (WCAG 2.2), escritos aqui com palavras nossas. Nenhum texto,
// imagem, fonte, ícone ou asset da Apple é copiado ou redistribuído, e nenhum
// conteúdo dos repositórios de terceiros avaliados foi incorporado (ver
// docs/design-intelligence/README.md, seção "Licenças").
//
// Regra de marca: o resultado é INSPIRADO em princípios gerais. O agente nunca
// usa o logo, o nome, as fontes proprietárias (SF Pro/New York), os SF Symbols,
// os ícones de apps nem o visual de produtos da Apple.
//
// Módulo puro (sem APIs do Deno/navegador) para rodar igual no edge function
// e no Vitest.

export type DesignSurface = "web_app" | "saas_dashboard" | "mobile_app" | "landing_page";

export type FindingSeverity = "blocker" | "warning" | "info";

export interface DesignFinding {
  rule: string;
  severity: FindingSeverity;
  message: string;
  path?: string;
  line?: number;
  fix: string;
}

export interface DesignAuditResult {
  score: number;
  findings: DesignFinding[];
  blockers: number;
  warnings: number;
  checkedFiles: number;
}

export interface DesignIntelligenceConfig {
  enabled: boolean;
  surface: DesignSurface;
  /** "explicit" quando o usuário escolheu; "detected" quando inferido do pedido. */
  surfaceSource: "explicit" | "detected";
}

export const DESIGN_INTELLIGENCE_VERSION = "1.0.0";

/** Fontes públicas que embasam as regras (citadas nos docs e no prompt). */
export const DESIGN_SOURCES = {
  hig: "https://developer.apple.com/design/human-interface-guidelines/",
  higAccessibility: "https://developer.apple.com/design/human-interface-guidelines/accessibility",
  higLayout: "https://developer.apple.com/design/human-interface-guidelines/layout",
  higTypography: "https://developer.apple.com/design/human-interface-guidelines/typography",
  higColor: "https://developer.apple.com/design/human-interface-guidelines/color",
  wcag: "https://www.w3.org/TR/WCAG22/",
} as const;

// ---------------------------------------------------------------------------
// Tokens: valores-base que o agente pode usar sem justificar.
// ---------------------------------------------------------------------------

export const DESIGN_TOKENS = {
  /** Pilha de fontes do sistema: usa a fonte nativa do aparelho sem embarcar arquivos de fonte. */
  fontStack:
    'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  monoStack: 'ui-monospace, "SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace',
  /** Escala tipográfica (px) com papéis semânticos. Corpo nunca abaixo de 16px na web. */
  typeScale: {
    caption: 12,
    footnote: 13,
    subhead: 15,
    body: 16,
    callout: 17,
    title3: 20,
    title2: 22,
    title1: 28,
    largeTitle: 34,
    display: 48,
  },
  lineHeight: { tight: 1.15, heading: 1.25, body: 1.5 },
  /** Grade de 4px; espaços preferidos em múltiplos de 8. */
  spacing: [4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96],
  radius: { control: 10, card: 16, sheet: 24, pill: 9999 },
  /** Alvo mínimo de toque/clique. */
  minHitTarget: 44,
  /** Largura confortável de leitura. */
  maxReadingWidthCh: 72,
  motion: { fastMs: 150, baseMs: 250, slowMs: 400, easing: "cubic-bezier(0.2, 0, 0, 1)" },
  contrast: { bodyText: 4.5, largeText: 3, uiComponent: 3 },
  /** Cores semânticas (claro/escuro). O app deve expor como CSS variables, nunca hex solto em componentes. */
  colors: {
    light: {
      background: "#FFFFFF",
      surface: "#F5F5F7",
      elevated: "#FFFFFF",
      label: "#1D1D1F",
      secondaryLabel: "#6E6E73",
      separator: "#D2D2D7",
      accent: "#0A66E8",
      success: "#1F8A3B",
      warning: "#B25E00",
      danger: "#D42A1E",
    },
    dark: {
      background: "#000000",
      surface: "#1C1C1E",
      elevated: "#2C2C2E",
      label: "#F5F5F7",
      secondaryLabel: "#A1A1A6",
      separator: "#3A3A3C",
      accent: "#3D8BFF",
      success: "#3FBF5F",
      warning: "#FFB340",
      danger: "#FF6259",
    },
  },
} as const;

// ---------------------------------------------------------------------------
// Princípios, perfis por superfície, anti-padrões e checklist.
// ---------------------------------------------------------------------------

export const CORE_PRINCIPLES: readonly string[] = [
  "Conteúdo primeiro: a interface dá espaço ao que o usuário veio fazer; cromo, marca e decoração recuam.",
  "Clareza antes de estilo: estrutura e navegação são decididas antes de cor e forma.",
  "Hierarquia visual por tamanho, peso e espaço — não por excesso de cor, borda ou sombra.",
  "Familiaridade: use o componente padrão que as pessoas já conhecem; custom só com motivo explícito.",
  "Consistência: o mesmo problema tem a mesma solução em todo o produto.",
  "Feedback imediato e honesto: toda ação mostra estado (carregando, sucesso, erro) perto de onde aconteceu.",
  "Controle nas mãos do usuário: ações destrutivas pedem confirmação e, sempre que possível, podem ser desfeitas.",
  "Contenção: cor de destaque, animação, som e interrupções são recursos escassos — use pouco e com propósito.",
  "Acessibilidade desde o primeiro rascunho: contraste, foco visível, rótulos, teclado e leitores de tela.",
  "Escrita faz parte do design: botões com verbo específico, erros que explicam o próximo passo sem culpar.",
];

interface SurfaceProfile {
  label: string;
  navigation: string[];
  layout: string[];
  components: string[];
}

export const SURFACE_PROFILES: Record<DesignSurface, SurfaceProfile> = {
  web_app: {
    label: "Aplicação web",
    navigation: [
      "Barra superior com título da seção atual e ações primárias à direita; navegação principal persistente (topo ou sidebar).",
      "URLs refletem o estado (rotas por tela, filtros na query) para permitir voltar, compartilhar e recarregar.",
    ],
    layout: [
      "Container central com largura máxima (~1200px) e gutters de 16px no mobile, 24–32px no desktop.",
      "Formulários em coluna única, rótulo acima do campo, ação primária ao final e alinhada ao fluxo de leitura.",
    ],
    components: [
      "Botões: um primário por região (preenchido com a cor de destaque), secundários discretos (tinted/outline), destrutivo em vermelho apenas para ações destrutivas.",
      "Diálogos modais só para decisões que bloqueiam o fluxo; para o resto, use sheets/painéis ou edição inline.",
    ],
  },
  saas_dashboard: {
    label: "Dashboard SaaS",
    navigation: [
      "Sidebar à esquerda com poucas seções de primeiro nível (ícone + rótulo curto), recolhível; em telas pequenas vira barra inferior ou menu de seções.",
      "Cabeçalho de página com título, contexto (workspace/período) e no máximo 1–2 ações primárias.",
    ],
    layout: [
      "Linha de KPIs no topo (3–4 cartões), depois gráfico principal, depois tabelas — do resumo para o detalhe.",
      "Cartões com raio 16px, padding 20–24px, separação por espaço e fundo de superfície, não por bordas pesadas.",
      "Tabelas: números alinhados à direita com algarismos tabulares, cabeçalho fixo, linhas com altura mínima de 44px, estados vazios com próximo passo.",
    ],
    components: [
      "Gráficos sem 3D, com legenda clara, poucas séries e cores semânticas consistentes entre gráficos.",
      "Filtros e período visíveis e reversíveis; carregamento com skeleton no formato do conteúdo final.",
    ],
  },
  mobile_app: {
    label: "App mobile (Flutter/PWA/nativo)",
    navigation: [
      "Barra de abas inferior com poucos destinos de primeiro nível (tipicamente 3–5), rótulos de uma palavra e ícone preenchido na aba ativa; sempre visível e nunca desabilitada.",
      "Navegação hierárquica com botão voltar no topo e título da tela; nada de menu hambúrguer para esconder a navegação principal.",
      "Respeite as áreas seguras (notch, barra de status, indicador inferior) — env(safe-area-inset-*) no PWA, SafeArea no Flutter.",
    ],
    layout: [
      "Margens laterais de 16–20px, conteúdo em lista/cartões rolando por baixo de barras translúcidas.",
      "Ação primária ao alcance do polegar (parte inferior) em fluxos de tarefa.",
    ],
    components: [
      "Alvos de toque de no mínimo 44×44px, inclusive ícones; espaçamento entre alvos para evitar toque acidental.",
      "Campos de texto com fonte ≥16px (evita zoom automático no navegador móvel), teclado adequado (inputmode/type) e autocomplete.",
      "Sheets que sobem de baixo para tarefas secundárias; confirmações destrutivas como action sheet.",
    ],
  },
  landing_page: {
    label: "Landing page",
    navigation: [
      "Cabeçalho simples: marca à esquerda, 3–5 links, um CTA principal; fixo e translúcido ao rolar.",
    ],
    layout: [
      "Hero com uma promessa clara em título grande (40–64px), subtítulo de uma frase e um CTA primário + um secundário.",
      "Seções com respiro generoso (80–120px verticais), uma ideia por seção, alternando texto e prova visual.",
      "Largura de leitura limitada (~72 caracteres) para textos corridos.",
    ],
    components: [
      "Prova social, preços e FAQ como seções próprias; preços com plano recomendado destacado por espaço/borda, não por excesso de cor.",
      "Imagens com dimensões definidas (evita layout shift), lazy loading abaixo da dobra e texto alternativo descritivo.",
    ],
  },
};

export const ANTI_PATTERNS: readonly string[] = [
  "Menu hambúrguer escondendo a navegação principal em mobile.",
  "Vários botões primários competindo na mesma região.",
  "Texto cinza-claro sobre fundo claro (contraste abaixo de 4.5:1).",
  "Remover o outline de foco sem oferecer um focus-visible equivalente.",
  "div/span clicável em vez de <button>/<a> (sem teclado e sem leitor de tela).",
  "Ícone sem rótulo acessível (aria-label) ou imagem sem alt.",
  "Campos sem <label> associado ou com placeholder como único rótulo.",
  "Fontes abaixo de 12px ou corpo de texto abaixo de 16px na web.",
  "Hex/rgb soltos nos componentes em vez de tokens/variáveis de tema.",
  "Animações longas, em loop ou sem respeitar prefers-reduced-motion.",
  "Modais em cascata ou modal para informação que não exige decisão.",
  "Excesso de gradientes, glow, sombras e bordas competindo com o conteúdo.",
  "Mensagens de erro genéricas ('Algo deu errado') sem dizer o que fazer.",
  "Usar logo, nome, fontes proprietárias, ícones ou mockups de produtos da Apple.",
];

export const REVIEW_CHECKLIST: readonly string[] = [
  "A tela tem um único objetivo principal evidente em 3 segundos?",
  "Existe exatamente uma ação primária por região?",
  "A navegação de primeiro nível está visível (não escondida)?",
  "Todo texto de corpo tem contraste ≥ 4.5:1 e componentes de UI ≥ 3:1, no claro e no escuro?",
  "Todo elemento interativo é alcançável por teclado e tem foco visível?",
  "Todo alvo de toque tem pelo menos 44×44px?",
  "Imagens têm alt; ícones-botão têm aria-label; campos têm label?",
  "Estados de carregando, vazio, erro e sucesso estão desenhados?",
  "O layout funciona de 360px a 1440px sem rolagem horizontal?",
  "Cores vêm de tokens/variáveis, com tema claro e escuro?",
  "Animações respeitam prefers-reduced-motion?",
  "Nenhum asset ou marca de terceiros (Apple incluída) foi usado?",
];

// ---------------------------------------------------------------------------
// Detecção de superfície e configuração.
// ---------------------------------------------------------------------------

const SURFACE_KEYWORDS: Record<DesignSurface, RegExp> = {
  saas_dashboard:
    /\b(dashboard|painel|admin|analytics|kpi|m[ée]tricas?|crm|erp|back-?office|saas|relat[óo]rios?|tabela de dados)\b/i,
  mobile_app: /\b(mobile|celular|iphone|android|ios|flutter|pwa|app nativo|react native|capacitor|aplicativo)\b/i,
  landing_page:
    /\b(landing|p[áa]gina de vendas|site institucional|homepage|hero|waitlist|lista de espera|p[áa]gina inicial de marketing)\b/i,
  web_app: /\b(web ?app|aplica[çc][ãa]o web|sistema|plataforma|portal)\b/i,
};

const SURFACE_PRIORITY: DesignSurface[] = ["saas_dashboard", "mobile_app", "landing_page", "web_app"];

export function detectSurface(prompt: string): DesignSurface {
  for (const surface of SURFACE_PRIORITY) {
    if (SURFACE_KEYWORDS[surface].test(prompt)) return surface;
  }
  return "web_app";
}

export function isDesignSurface(v: unknown): v is DesignSurface {
  return v === "web_app" || v === "saas_dashboard" || v === "mobile_app" || v === "landing_page";
}

/**
 * Resolve a configuração da camada de design.
 * Precedência: pedido explícito (body) > variável de ambiente > padrão (ligado).
 * `DESIGN_INTELLIGENCE=off` desliga globalmente (rollback sem deploy de código).
 */
export function resolveDesignConfig(input: {
  prompt: string;
  envFlag?: string | null;
  requestEnabled?: unknown;
  requestSurface?: unknown;
}): DesignIntelligenceConfig {
  const env = (input.envFlag ?? "").trim().toLowerCase();
  const envOff = env === "off" || env === "false" || env === "0" || env === "disabled";
  let enabled = !envOff;
  if (typeof input.requestEnabled === "boolean") enabled = enabled && input.requestEnabled;

  if (isDesignSurface(input.requestSurface)) {
    return { enabled, surface: input.requestSurface, surfaceSource: "explicit" };
  }
  return { enabled, surface: detectSurface(input.prompt), surfaceSource: "detected" };
}

// ---------------------------------------------------------------------------
// Prompt para o agente.
// ---------------------------------------------------------------------------

function bullets(lines: readonly string[]) {
  return lines.map((l) => `- ${l}`).join("\n");
}

export interface DesignPromptOptions {
  /** "react" = projeto Vite/React/Tailwind; "html" = arquivo HTML único com Tailwind CDN. */
  target: "react" | "html";
}

export function buildDesignPrompt(surface: DesignSurface, opts: DesignPromptOptions): string {
  const p = SURFACE_PROFILES[surface];
  const t = DESIGN_TOKENS;
  const tokensLine =
    opts.target === "react"
      ? "Reaproveite os tokens do projeto (CSS variables + tailwind.config). Se faltar um token, crie-o como variável de tema (claro e escuro) — nunca hex solto no componente."
      : "Declare as cores como CSS variables em :root e em @media (prefers-color-scheme: dark), e use-as via Tailwind arbitrary values (ex.: bg-[var(--surface)]).";

  return `

## Vertal Design Intelligence v${DESIGN_INTELLIGENCE_VERSION} — perfil: ${p.label}
Gere interfaces com o nível de acabamento de produtos premium: simples para o usuário, rigorosas por dentro. Inspire-se em princípios públicos de usabilidade (Apple HIG e WCAG 2.2), mas crie um design ORIGINAL: nunca use logo, nome, fontes proprietárias, ícones ou mockups da Apple.

### Princípios
${bullets(CORE_PRINCIPLES)}

### Processo obrigatório (antes de escrever código)
1. Entenda o objetivo do produto e o usuário principal.
2. Defina estrutura e navegação; só depois cor e forma.
3. Escolha componentes padrão do projeto (shadcn/ui quando existir); custom só com motivo.
4. Crie hierarquia: um título por tela, uma ação primária por região.
5. Gere código responsivo (360px → 1440px), com estados de carregando/vazio/erro.
6. Revise contra o checklist abaixo e corrija antes de entregar.

### Tokens base
- Fonte: ${t.fontStack} (fonte do sistema; não embarque arquivos de fonte proprietários).
- Escala (px): corpo ${t.typeScale.body}, legenda ${t.typeScale.caption}, títulos ${t.typeScale.title3}/${t.typeScale.title1}/${t.typeScale.largeTitle}, display ${t.typeScale.display}. Line-height corpo ${t.lineHeight.body}.
- Espaçamento em grade de 4px (preferir 8/16/24/32/48). Raios: controle ${t.radius.control}px, card ${t.radius.card}px, sheet ${t.radius.sheet}px.
- Alvo mínimo ${t.minHitTarget}×${t.minHitTarget}px. Contraste: texto ${t.contrast.bodyText}:1, texto grande/UI ${t.contrast.largeText}:1.
- Movimento: ${t.motion.fastMs}–${t.motion.slowMs}ms, easing ${t.motion.easing}, sempre com prefers-reduced-motion.
- Cores semânticas (claro/escuro): background, surface, elevated, label, secondaryLabel, separator, accent, success, warning, danger. ${tokensLine}

### Navegação (${p.label})
${bullets(p.navigation)}

### Layout
${bullets(p.layout)}

### Componentes
${bullets(p.components)}

### Anti-padrões proibidos
${bullets(ANTI_PATTERNS)}

### Checklist de revisão (responda mentalmente; qualquer "não" deve ser corrigido)
${bullets(REVIEW_CHECKLIST)}

Se o usuário pedir algo que viole uma regra acima (ex.: menu hambúrguer em mobile), implemente a alternativa recomendada e explique em uma nota curta, deixando claro que ele pode insistir na versão original.`;
}

// ---------------------------------------------------------------------------
// Auditoria estática do código gerado.
// ---------------------------------------------------------------------------

interface Rule {
  id: string;
  severity: FindingSeverity;
  /** Regex aplicada linha a linha. */
  pattern: RegExp;
  /** Se presente, a linha só conta como violação quando NÃO casar com esta regex. */
  unless?: RegExp;
  message: string;
  fix: string;
}

const LINE_RULES: Rule[] = [
  {
    id: "img-alt",
    severity: "blocker",
    pattern: /<img\b(?![^>]*\balt=)[^>]*>?/i,
    message: "Imagem sem texto alternativo.",
    fix: 'Adicione alt descritivo (ou alt="" se for puramente decorativa).',
  },
  {
    id: "clickable-div",
    severity: "blocker",
    pattern: /<(div|span)\b[^>]*\bonClick=/,
    unless: /\brole=["'](button|link)["'][^>]*\btabIndex=|\btabIndex=[^>]*\brole=["'](button|link)["']/,
    message: "Elemento não interativo (div/span) com onClick — inacessível por teclado e leitor de tela.",
    fix: "Troque por <button type=\"button\"> ou <a href>; se não puder, adicione role, tabIndex={0} e onKeyDown.",
  },
  {
    id: "focus-outline-removed",
    severity: "blocker",
    pattern: /(\boutline-none\b|outline:\s*(none|0)\b)/,
    unless: /focus-visible:|:focus-visible|focus:ring|ring-offset/,
    message: "Outline de foco removido sem substituto visível.",
    fix: "Adicione focus-visible:ring-2 focus-visible:ring-[var(--accent)] (ou equivalente) na mesma classe.",
  },
  {
    id: "tiny-text",
    severity: "warning",
    pattern: /\btext-\[(?:[0-9]|1[01])px\]|font-size:\s*(?:[0-9]|1[01])px\b/,
    message: "Texto abaixo de 12px prejudica a leitura.",
    fix: "Use no mínimo 12px para legendas e 16px para corpo de texto.",
  },
  {
    id: "small-input-font",
    severity: "warning",
    pattern: /<(input|textarea|select)\b[^>]*\btext-(xs|sm)\b/i,
    message: "Campo de formulário com fonte < 16px causa zoom automático no navegador móvel.",
    fix: "Use text-base (16px) em inputs no mobile (ex.: text-base md:text-sm).",
  },
  {
    id: "hamburger-nav",
    severity: "warning",
    pattern: /\b(hamburger|HamburgerMenu|<Menu\s*\/?>|MenuIcon|menu-toggle)\b/,
    message: "Possível menu hambúrguer escondendo a navegação principal.",
    fix: "No mobile, prefira barra de abas inferior com 3–5 destinos; mantenha a navegação de primeiro nível visível.",
  },
  {
    id: "low-contrast-gray",
    severity: "warning",
    pattern: /\btext-(gray|slate|zinc|neutral|stone)-(200|300)\b/,
    unless: /\bdark:|bg-(gray|slate|zinc|neutral|stone|black)-(7|8|9)00\b|bg-black\b/,
    message: "Texto cinza muito claro — provável contraste abaixo de 4.5:1 sobre fundo claro.",
    fix: "Use a cor secondaryLabel do tema (ex.: text-muted-foreground) ou um tom ≥ 500 sobre fundo claro.",
  },
  {
    id: "hardcoded-color",
    severity: "info",
    pattern: /(?:bg|text|border|from|to|via|fill|stroke)-\[#[0-9a-fA-F]{3,8}\]/,
    message: "Cor hex fixa no componente em vez de token de tema.",
    fix: "Mova a cor para uma CSS variable/token (claro e escuro) e referencie o token.",
  },
  {
    id: "apple-brand-asset",
    severity: "blocker",
    pattern:
      /(SF-Pro|SFProDisplay|SFProText|SF Pro Display|SF Pro Text|New York Large|sf-symbols|apple-logo||AppleLogo|"Apple Inc)/i,
    message: "Uso de fonte, ícone ou marca proprietária da Apple.",
    fix: "Use a pilha de fontes do sistema (system-ui) e ícones de bibliotecas abertas (ex.: lucide-react).",
  },
];

/** Botões que só contêm um ícone precisam de rótulo acessível. */
const ICON_ONLY_BUTTON =
  /<(button|Button)\b(?![^>]*\baria-label=)(?![^>]*\btitle=)[^>]*>\s*<([A-Z][A-Za-z0-9]*|svg)\b[^>]*\/?>\s*(<\/svg>\s*)?<\/(button|Button)>/g;

const INPUT_TAG = /<(input|Input)\b([^>]*)\/?>/g;

function lineOf(content: string, index: number) {
  return content.slice(0, index).split("\n").length;
}

function auditFile(path: string, content: string): DesignFinding[] {
  const findings: DesignFinding[] = [];
  const lines = content.split("\n");

  lines.forEach((line, i) => {
    for (const rule of LINE_RULES) {
      if (!rule.pattern.test(line)) continue;
      if (rule.unless && rule.unless.test(line)) continue;
      findings.push({ rule: rule.id, severity: rule.severity, message: rule.message, fix: rule.fix, path, line: i + 1 });
    }
  });

  for (const m of content.matchAll(ICON_ONLY_BUTTON)) {
    findings.push({
      rule: "icon-button-label",
      severity: "blocker",
      message: "Botão só com ícone, sem rótulo acessível.",
      fix: 'Adicione aria-label="Ação" (ou texto visualmente oculto com sr-only).',
      path,
      line: lineOf(content, m.index ?? 0),
    });
  }

  const hasLabels = /<label\b|<Label\b|htmlFor=|aria-labelledby=/.test(content);
  for (const m of content.matchAll(INPUT_TAG)) {
    const attrs = m[2] ?? "";
    if (/type=["'](hidden|submit|button|checkbox|radio)["']/.test(attrs)) continue;
    if (/aria-label=|aria-labelledby=|\bid=/.test(attrs) && (hasLabels || /aria-label/.test(attrs))) continue;
    findings.push({
      rule: "input-label",
      severity: "warning",
      message: "Campo sem rótulo associado (placeholder não substitui label).",
      fix: "Adicione <label htmlFor> ligado ao id do campo, ou aria-label.",
      path,
      line: lineOf(content, m.index ?? 0),
    });
  }

  const isHtmlDoc = /<!DOCTYPE html>|<html\b/i.test(content);
  if (isHtmlDoc) {
    if (!/<html\b[^>]*\blang=/i.test(content)) {
      findings.push({
        rule: "html-lang",
        severity: "warning",
        message: "Documento HTML sem atributo lang.",
        fix: 'Use <html lang="pt-BR"> (ou o idioma do conteúdo).',
        path,
      });
    }
    if (!/<meta\b[^>]*name=["']viewport["']/i.test(content)) {
      findings.push({
        rule: "viewport-meta",
        severity: "blocker",
        message: "Sem meta viewport — o layout não fica responsivo no celular.",
        fix: '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
        path,
      });
    }
    if (/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(\.0)?\b/i.test(content)) {
      findings.push({
        rule: "zoom-disabled",
        severity: "blocker",
        message: "Zoom desabilitado — viola acessibilidade para pessoas com baixa visão.",
        fix: "Remova user-scalable=no e maximum-scale=1 da meta viewport.",
        path,
      });
    }
  }

  const usesAnimation = /\banimate-(?!none)|@keyframes|transition-all\b/.test(content);
  if (usesAnimation && !/prefers-reduced-motion|motion-reduce:|motion-safe:/.test(content)) {
    findings.push({
      rule: "reduced-motion",
      severity: "info",
      message: "Animações sem tratamento de prefers-reduced-motion.",
      fix: "Use motion-safe:/motion-reduce: (Tailwind) ou @media (prefers-reduced-motion: reduce).",
      path,
    });
  }

  const primaryCount = (content.match(/variant=["']default["']|\bbtn-primary\b/g) ?? []).length;
  if (primaryCount > 2) {
    findings.push({
      rule: "single-primary",
      severity: "info",
      message: `${primaryCount} botões primários no mesmo arquivo — verifique se competem na mesma região.`,
      fix: "Mantenha um primário por região; os demais como secondary/outline/ghost.",
      path,
    });
  }

  return findings;
}

const UI_FILE = /\.(tsx|jsx|html|vue|svelte|css)$/i;

const SEVERITY_WEIGHT: Record<FindingSeverity, number> = { blocker: 12, warning: 5, info: 1 };

/** Audita os arquivos de UI gerados pelo agente. Arquivos não-UI são ignorados. */
export function auditGeneratedCode(files: Array<{ path: string; content: string }>): DesignAuditResult {
  const uiFiles = files.filter((f) => UI_FILE.test(f.path) && typeof f.content === "string");
  const findings = uiFiles.flatMap((f) => auditFile(f.path, f.content));
  const penalty = findings.reduce((acc, f) => acc + SEVERITY_WEIGHT[f.severity], 0);
  return {
    score: Math.max(0, 100 - penalty),
    findings,
    blockers: findings.filter((f) => f.severity === "blocker").length,
    warnings: findings.filter((f) => f.severity === "warning").length,
    checkedFiles: uiFiles.length,
  };
}

/** Resumo curto para a timeline do agente. */
export function formatAuditSummary(result: DesignAuditResult, maxItems = 6): string {
  if (!result.checkedFiles) return "Nenhum arquivo de interface para auditar.";
  if (!result.findings.length) return `Nota ${result.score}/100 · nenhum problema encontrado em ${result.checkedFiles} arquivo(s).`;
  const head = `Nota ${result.score}/100 · ${result.blockers} bloqueador(es), ${result.warnings} aviso(s)`;
  const order: FindingSeverity[] = ["blocker", "warning", "info"];
  const items = [...result.findings]
    .sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity))
    .slice(0, maxItems)
    .map((f) => `• [${f.severity}] ${f.path ?? ""}${f.line ? `:${f.line}` : ""} — ${f.message} Correção: ${f.fix}`);
  const rest = result.findings.length > maxItems ? `\n… e mais ${result.findings.length - maxItems}.` : "";
  return `${head}\n${items.join("\n")}${rest}`;
}

/**
 * Prompt de correção para uma segunda passada (auto-reparo) quando houver
 * bloqueadores. O agente recebe só os problemas, não o arquivo inteiro de novo.
 */
export function buildFixPrompt(result: DesignAuditResult): string {
  const blockers = result.findings.filter((f) => f.severity !== "info");
  return `A auditoria de design encontrou problemas. Corrija TODOS abaixo e devolva o conteúdo final completo de cada arquivo afetado (mesmo formato JSON de antes):\n${blockers
    .map((f) => `- ${f.path ?? ""}${f.line ? `:${f.line}` : ""} [${f.rule}] ${f.message} → ${f.fix}`)
    .join("\n")}`;
}
