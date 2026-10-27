// Catálogo de conectores e APIs que uma aplicação pode precisar.
//
// O agente do Vibe Code usa este catálogo para dizer, sem o usuário pedir,
// QUAIS conectores e APIs cada aplicação exige (e quais chaves/segredos), no
// estilo dos agentes atuais. A detecção é determinística (custo zero): olha o
// pedido e o código gerado em busca de sinais (imports, URLs de API, variáveis
// de ambiente). O modelo ainda pode declarar requisitos extras, que são
// validados aqui antes de chegar ao usuário.
//
// Sem APIs de Deno/DOM: este arquivo é importado pelas edge functions e pelo
// front-end (re-export em src/config/connectorCatalog.ts).

export type RequirementKind = "connector" | "api";
export type RequirementStatus = "needed" | "connected" | "dismissed";

export interface CatalogEntry {
  slug: string;
  label: string;
  kind: RequirementKind;
  description: string;
  /** Nomes dos segredos/variáveis que a aplicação vai precisar. */
  secrets: string[];
  /** Sinais textuais (pedido do usuário ou código) que indicam o uso. */
  signals: RegExp[];
  /** Página do produto onde o usuário conecta; ausente = configurar segredo. */
  connectPath?: string;
  /** A plataforma já fornece (nada para o usuário configurar). */
  builtin?: boolean;
}

export interface DetectedRequirement {
  slug: string;
  label: string;
  kind: RequirementKind;
  description: string;
  reason: string;
  secrets: string[];
  connectPath?: string;
  builtin: boolean;
  status: RequirementStatus;
}

export const CONNECTOR_CATALOG: CatalogEntry[] = [
  {
    slug: "supabase",
    label: "Cloud (banco, login e arquivos)",
    kind: "connector",
    description: "Banco de dados, autenticação, storage e edge functions.",
    secrets: [],
    builtin: true,
    connectPath: "/connectors/supabase",
    signals: [
      /@supabase\/supabase-js/i,
      /\bsupabase\b/i,
      /\b(banco de dados|database|login|cadastro|autentica[çc][ãa]o|authentication|sign ?up|sign ?in|usu[áa]rios?)\b/i,
    ],
  },
  {
    slug: "github",
    label: "GitHub",
    kind: "connector",
    description: "Guarda cada edição do agente num repositório seu.",
    secrets: [],
    connectPath: "/connectors/github",
    signals: [/\bgithub\b/i, /\bgit(moom|moon)\b/i, /api\.github\.com/i, /\boctokit\b/i],
  },
  {
    slug: "stripe",
    label: "Stripe (pagamentos)",
    kind: "connector",
    description: "Cobrança, assinaturas e checkout.",
    secrets: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
    connectPath: "/connect",
    signals: [/\bstripe\b/i, /api\.stripe\.com/i, /\b(checkout|assinaturas?|subscriptions?|cobran[çc]a|pagamentos?|payments?)\b/i],
  },
  {
    slug: "mercadopago",
    label: "Mercado Pago / Pix",
    kind: "api",
    description: "Pix, cartão e boleto no Brasil.",
    secrets: ["MERCADOPAGO_ACCESS_TOKEN"],
    signals: [/\bmercado ?pago\b/i, /\bpix\b/i, /api\.mercadopago\.com/i],
  },
  {
    slug: "gmail",
    label: "Gmail",
    kind: "connector",
    description: "Ler e enviar e-mails da conta Google do usuário.",
    secrets: [],
    connectPath: "/connectors/gmail",
    signals: [/\bgmail\b/i, /googleapis\.com\/gmail/i],
  },
  {
    slug: "slack",
    label: "Slack",
    kind: "connector",
    description: "Enviar e ler mensagens em canais do Slack.",
    secrets: [],
    connectPath: "/connectors/slack",
    signals: [/\bslack\b/i, /slack\.com\/api/i],
  },
  {
    slug: "web3",
    label: "Web3 / carteiras",
    kind: "connector",
    description: "Carteiras, contratos e redes blockchain.",
    secrets: [],
    connectPath: "/connectors/web3",
    signals: [/\b(web3|ethers|wagmi|viem|metamask|walletconnect|solidity|smart contract|blockchain|nfts?|carteira digital|crypto wallet)\b/i],
  },
  {
    slug: "ionos",
    label: "Domínios (IONOS)",
    kind: "connector",
    description: "Comprar, transferir e apontar domínios e DNS.",
    secrets: [],
    connectPath: "/domains",
    signals: [/\b(dom[íi]nios?|domains?|dns|ionos)\b/i],
  },
  {
    slug: "render",
    label: "Render (hospedagem)",
    kind: "connector",
    description: "Publicar backends e sites no Render.",
    secrets: [],
    connectPath: "/connectors/render",
    signals: [/\brender\.com\b/i, /\brender\b.{0,20}\b(deploy|servi[çc]o|service)\b/i],
  },
  {
    slug: "ai-gateway",
    label: "KUBO AI Gateway (IA)",
    kind: "api",
    description: "IA dentro do app (chat, resumo, geração) pelo gateway da plataforma, sem chave sua.",
    secrets: [],
    builtin: true,
    signals: [/\b(chatbot|assistente de ia|ai assistant|llm|gpt|deepseek|openai|anthropic|gemini|intelig[êe]ncia artificial)\b/i],
  },
  {
    slug: "resend",
    label: "Resend (e-mail transacional)",
    kind: "api",
    description: "Enviar e-mails de boas-vindas, recibos e avisos.",
    secrets: ["RESEND_API_KEY"],
    signals: [/\bresend\b/i, /api\.resend\.com/i, /\be-?mails? (transacionais?|de boas-vindas|de confirma[çc][ãa]o)\b/i, /\bsendgrid\b/i],
  },
  {
    slug: "twilio",
    label: "Twilio (SMS / WhatsApp)",
    kind: "api",
    description: "SMS, WhatsApp e ligações.",
    secrets: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"],
    signals: [/\btwilio\b/i, /\b(sms|whatsapp)\b/i],
  },
  {
    slug: "google-maps",
    label: "Google Maps",
    kind: "api",
    description: "Mapas, geocodificação e rotas.",
    secrets: ["GOOGLE_MAPS_API_KEY"],
    signals: [/\bgoogle maps\b/i, /maps\.googleapis\.com/i, /\b(geolocaliza[çc][ãa]o|geocod\w+|mapa interativo)\b/i],
  },
  {
    slug: "cloudflare",
    label: "Cloudflare",
    kind: "api",
    description: "DNS, CDN, Workers e proteção.",
    secrets: ["CLOUDFLARE_API_TOKEN"],
    connectPath: "/connectors/cloudflare/setup",
    signals: [/\bcloudflare\b/i, /api\.cloudflare\.com/i],
  },
  {
    slug: "firecrawl",
    label: "Firecrawl (coleta de sites)",
    kind: "api",
    description: "Ler e extrair conteúdo de páginas da web.",
    secrets: ["FIRECRAWL_API_KEY"],
    signals: [/\bfirecrawl\b/i, /\b(web ?scraping|raspar sites?|scrape)\b/i],
  },
];

const BY_SLUG = new Map(CONNECTOR_CATALOG.map((e) => [e.slug, e]));

export function getCatalogEntry(slug: string): CatalogEntry | undefined {
  return BY_SLUG.get(slug);
}

const SECRET_NAME_RE = /^[A-Z][A-Z0-9_]{2,63}$/;
const MAX_REQUIREMENTS = 8;

/** Variáveis de ambiente que o código lê (process.env.X, import.meta.env.X, Deno.env.get("X")). */
export function extractEnvVarNames(code: string): string[] {
  const names = new Set<string>();
  const patterns = [
    /process\.env\.([A-Z][A-Z0-9_]{2,63})/g,
    /import\.meta\.env\.([A-Z][A-Z0-9_]{2,63})/g,
    /Deno\.env\.get\(\s*["']([A-Z][A-Z0-9_]{2,63})["']\s*\)/g,
  ];
  for (const re of patterns) {
    for (const m of code.matchAll(re)) names.add(m[1]);
  }
  return [...names];
}

// Variáveis que a própria plataforma já injeta: não são pedido ao usuário.
const PLATFORM_ENV = new Set([
  "NODE_ENV", "MODE", "BASE_URL", "DEV", "PROD", "SSR",
  "SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY",
  "VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_ANON_KEY",
]);

const SECRET_HINT_RE = /(KEY|TOKEN|SECRET|PASSWORD|SID|CLIENT_ID|CLIENT_SECRET|WEBHOOK)/;

function reasonFromSource(source: "pedido" | "código", entry: CatalogEntry) {
  return source === "pedido"
    ? `O seu pedido envolve ${entry.label}.`
    : `O código gerado usa ${entry.label}.`;
}

function toDetected(entry: CatalogEntry, reason: string, secrets?: string[]): DetectedRequirement {
  return {
    slug: entry.slug,
    label: entry.label,
    kind: entry.kind,
    description: entry.description,
    reason,
    secrets: secrets ?? entry.secrets,
    connectPath: entry.connectPath,
    builtin: !!entry.builtin,
    status: entry.builtin ? "connected" : "needed",
  };
}

/**
 * Detecta conectores e APIs necessários a partir do pedido do usuário e do
 * código gerado. Não depende de IA. Ordem estável: a do catálogo.
 */
export function detectRequirements(
  prompt: string,
  files: Record<string, string> = {},
): DetectedRequirement[] {
  const code = Object.values(files).join("\n");
  const found = new Map<string, DetectedRequirement>();

  for (const entry of CONNECTOR_CATALOG) {
    if (code && entry.signals.some((re) => re.test(code))) {
      found.set(entry.slug, toDetected(entry, reasonFromSource("código", entry)));
      continue;
    }
    if (prompt && entry.signals.some((re) => re.test(prompt))) {
      found.set(entry.slug, toDetected(entry, reasonFromSource("pedido", entry)));
    }
  }

  // Variáveis de ambiente que o código lê e que ninguém do catálogo explicou
  // viram requisitos de API "genéricos", com o nome exato do segredo.
  if (code) {
    const explained = new Set([...found.values()].flatMap((r) => r.secrets));
    const orphan = extractEnvVarNames(code).filter(
      (n) => !PLATFORM_ENV.has(n) && !explained.has(n) && SECRET_HINT_RE.test(n),
    );
    if (orphan.length) {
      const prefix = orphan[0].split("_")[0] === "VITE" ? orphan[0].split("_")[1] : orphan[0].split("_")[0];
      const slug = `custom:${prefix.toLowerCase()}`;
      if (!found.has(slug)) {
        found.set(slug, {
          slug,
          label: `API externa (${prefix})`,
          kind: "api",
          description: "O código lê chaves de uma API que não está no catálogo.",
          reason: `O código lê ${orphan.slice(0, 3).join(", ")}.`,
          secrets: orphan.slice(0, 6),
          builtin: false,
          status: "needed",
        });
      }
    }
  }

  return [...found.values()].slice(0, MAX_REQUIREMENTS);
}

export interface DeclaredRequirement {
  slug?: unknown;
  name?: unknown;
  reason?: unknown;
  secrets?: unknown;
}

/** Junta o que o modelo declarou com o detectado, validando tudo. */
export function mergeDeclaredRequirements(
  detected: DetectedRequirement[],
  declared: unknown,
): DetectedRequirement[] {
  if (!Array.isArray(declared)) return detected;
  const out = new Map(detected.map((r) => [r.slug, r]));

  for (const raw of declared.slice(0, MAX_REQUIREMENTS) as DeclaredRequirement[]) {
    if (!raw || typeof raw !== "object") continue;
    const reason = typeof raw.reason === "string" ? raw.reason.trim().slice(0, 300) : "";
    const slugIn = typeof raw.slug === "string" ? raw.slug.trim().toLowerCase() : "";
    const entry = slugIn ? getCatalogEntry(slugIn) : undefined;

    if (entry) {
      const existing = out.get(entry.slug);
      if (existing) {
        if (reason) existing.reason = reason;
      } else {
        out.set(entry.slug, toDetected(entry, reason || `O agente indicou ${entry.label}.`));
      }
      continue;
    }

    const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 80) : "";
    if (!name) continue;
    const secrets = (Array.isArray(raw.secrets) ? raw.secrets : [])
      .filter((s): s is string => typeof s === "string" && SECRET_NAME_RE.test(s) && !PLATFORM_ENV.has(s))
      .slice(0, 6);
    const slug = `custom:${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40)}`;
    if (slug === "custom:" || out.has(slug)) continue;
    out.set(slug, {
      slug,
      label: name,
      kind: "api",
      description: "API indicada pelo agente para esta aplicação.",
      reason: reason || `O agente indicou a API ${name}.`,
      secrets,
      builtin: false,
      status: "needed",
    });
  }

  return [...out.values()].slice(0, MAX_REQUIREMENTS);
}

/** Marca como "connected" o que o usuário já conectou. `builtin` sempre conta. */
export function applyConnectionStatus(
  requirements: DetectedRequirement[],
  connectedSlugs: Iterable<string>,
): DetectedRequirement[] {
  const connected = new Set(connectedSlugs);
  return requirements.map((r) => ({
    ...r,
    status: r.builtin || connected.has(r.slug) ? "connected" : "needed",
  }));
}

/** Resumo curto para o prompt do agente: o que já está conectado e o que não. */
export function formatConnectorsForPrompt(connectedSlugs: Iterable<string>): string {
  const connected = new Set(connectedSlugs);
  const lines = CONNECTOR_CATALOG.map((e) => {
    const state = e.builtin ? "da plataforma" : connected.has(e.slug) ? "conectado" : "não conectado";
    return `- ${e.slug} (${e.label}): ${state}`;
  });
  return `\n\nConectores e APIs disponíveis (use os slugs exatos em "requirements"):\n${lines.join("\n")}`;
}
