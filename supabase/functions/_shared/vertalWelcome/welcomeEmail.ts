// VERTAL · e-mail de boas-vindas v2 (inglês, marca Vertal). Módulo PURO: sem Deno, sem npm:, sem rede.
// Usado pela edge function send-welcome-email (substitui o conteúdo do "welcome" antigo quando ligado)
// e pelos testes do Vitest. Nada aqui envia e-mail.
//
// Liga/desliga (sem segredo novo — o Supabase está no limite de 100 segredos):
//   VERTAL_GPU_CONFIG = '{ …, "VERTAL_WELCOME_EMAIL": { "enabled": true, … } }'
//   (um segredo avulso VERTAL_WELCOME_EMAIL com o mesmo JSON vence, como nos outros módulos).
// Ausente, inválido ou enabled ≠ true ⇒ DESLIGADO: o fluxo antigo continua exatamente igual.
//
// Textos: escritos pelo Laércio (2026-11-26). Só as linhas dos produtos foram ajustadas aos fatos do repo
// (ver docs/VERTAL-WELCOME-EMAIL.md). Nenhum nome de fornecedor aparece no e-mail.

export const WELCOME_V2_TEMPLATE = "vertal_welcome";
/** Templates que contam como "já recebeu boas-vindas" (o antigo também, para nunca mandar dois). */
export const WELCOME_TEMPLATES_SENT = [WELCOME_V2_TEMPLATE, "welcome"] as const;

export const WELCOME_DEFAULTS = {
  siteUrl: "https://vertal.dev",
  docsUrl: "https://vertal.dev/docs",
  /** PNG público do logo Vertal (ícone do PWA, 512×512, fundo escuro), já servido pelo site. */
  logoUrl: "https://vertal.dev/pwa-512x512.png",
  /** Endereço de suporte que já existe no repo (src/components/ErrorBoundary.tsx). */
  replyTo: "support@kubovibe.dev",
  fromName: "Vertal",
  /** Janela para mandar depois da confirmação do e-mail (ou 1º login com Google). */
  maxAccountAgeHours: 168,
  /** Estado real hoje: CRM e Vibe Pay ainda fechados para o público (allowlist / "em desenvolvimento"). */
  crmOpen: false,
  vibePayOpen: false,
} as const;

export interface WelcomeConfig {
  enabled: true;
  docsUrl: string;
  logoUrl: string;
  siteUrl: string;
  replyTo: string;
  fromName: string;
  maxAccountAgeHours: number;
  crmOpen: boolean;
  vibePayOpen: boolean;
  /** Vazio = todas as contas novas. Com ids = só essas (para o Laércio testar sozinho primeiro). */
  userIds: string[];
}

type Env = Record<string, string | undefined>;

function parseObj(raw: unknown): Record<string, unknown> | null {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

const truthy = (v: unknown) => v === true || v === "true" || v === "1" || v === 1;
const httpsUrl = (v: unknown, fb: string) =>
  typeof v === "string" && /^https:\/\/[^\s"'<>]+$/i.test(v.trim()) ? v.trim() : fb;
const email = (v: unknown, fb: string) =>
  typeof v === "string" && /^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i.test(v.trim()) ? v.trim() : fb;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Config do e-mail v2, ou null (= desligado). */
export function welcomeConfig(env: Env): WelcomeConfig | null {
  const c = parseObj(env.VERTAL_WELCOME_EMAIL) ?? parseObj(parseObj(env.VERTAL_GPU_CONFIG)?.VERTAL_WELCOME_EMAIL);
  if (!c || !truthy(c.enabled)) return null;
  const hours = Number(c.maxAccountAgeHours);
  return {
    enabled: true,
    docsUrl: httpsUrl(c.docsUrl, WELCOME_DEFAULTS.docsUrl),
    logoUrl: httpsUrl(c.logoUrl, WELCOME_DEFAULTS.logoUrl),
    siteUrl: httpsUrl(c.siteUrl, WELCOME_DEFAULTS.siteUrl).replace(/\/+$/, ""),
    replyTo: email(c.replyTo, WELCOME_DEFAULTS.replyTo),
    fromName:
      typeof c.fromName === "string" && /^[\w .-]{1,40}$/.test(c.fromName.trim()) ? c.fromName.trim() : WELCOME_DEFAULTS.fromName,
    maxAccountAgeHours: Number.isFinite(hours) && hours > 0 ? Math.min(720, hours) : WELCOME_DEFAULTS.maxAccountAgeHours,
    crmOpen: c.crmOpen === undefined ? WELCOME_DEFAULTS.crmOpen : truthy(c.crmOpen),
    vibePayOpen: c.vibePayOpen === undefined ? WELCOME_DEFAULTS.vibePayOpen : truthy(c.vibePayOpen),
    userIds: Array.isArray(c.userIds) ? c.userIds.filter((x): x is string => typeof x === "string" && UUID_RE.test(x)) : [],
  };
}

/** v2 vale para este usuário? (config ligada + allowlist vazia ou contendo o id). */
export function welcomeAppliesTo(cfg: WelcomeConfig | null, userId: string): cfg is WelcomeConfig {
  return !!cfg && (cfg.userIds.length === 0 || cfg.userIds.includes(userId));
}

// ───────────────────────────── Nome ─────────────────────────────

/** Primeiro nome a partir dos metadados do cadastro (e-mail: display_name; Google: full_name/name/given_name). */
export function firstNameFrom(meta: Record<string, unknown> | null | undefined): string | null {
  const m = meta ?? {};
  for (const k of ["given_name", "first_name", "display_name", "full_name", "name"]) {
    const v = m[k];
    if (typeof v !== "string") continue;
    // Remove controles/quebras (evita injeção no Assunto) e pega a primeira palavra.
    // eslint-disable-next-line no-control-regex
    const clean = v.replace(/[\u0000-\u001f\u007f<>"]/g, " ").trim();
    const first = clean.split(/\s+/)[0] ?? "";
    if (first && !first.includes("@")) return first.slice(0, 40);
  }
  return null;
}

// ───────────────────────────── Conteúdo ─────────────────────────────

export interface WelcomeVars {
  firstName: string | null;
  cfg: Pick<WelcomeConfig, "docsUrl" | "logoUrl" | "siteUrl" | "crmOpen" | "vibePayOpen">;
}

export interface WelcomeItem {
  label: string;
  text: string;
  href?: string;
}

export interface WelcomeEmail {
  subject: string;
  preheader: string;
  html: string;
  text: string;
}

export const WELCOME_PREHEADER = "Everything you need to build, launch and grow is already in your account.";

export function welcomeSubject(firstName: string | null): string {
  return firstName ? `Welcome to Vertal Dev, ${firstName}` : "Welcome to Vertal Dev";
}

/** Linhas dos produtos — cada uma conferida no repo/site (docs/VERTAL-WELCOME-EMAIL.md). */
export function welcomeItems(cfg: WelcomeVars["cfg"]): WelcomeItem[] {
  const site = cfg.siteUrl;
  return [
    cfg.crmOpen
      ? {
          label: "Free CRM",
          text: "keep your contacts, companies and deals in one place, with no monthly fee. Activate it from Connectors whenever you're ready.",
          href: `${site}/crm`,
        }
      : {
          label: "Free CRM",
          text: "keep your contacts, companies and deals in one place, with no monthly fee. It's opening soon, and you can join the waitlist today.",
          href: `${site}/crm`,
        },
    {
      label: "Deploy and rendering",
      text: "put your projects online in a few clicks and watch them come to life as you build.",
    },
    {
      label: "Vertal App",
      text: "take a project from your repository to a live app, with AI that detects your stack and build, plus live status and logs.",
      href: "https://vertal.app",
    },
    {
      label: "Vertal Run",
      text: "safe, isolated sandboxes where your AI agents run Python, JavaScript and Bash code.",
      href: "https://vertalrun.com",
    },
    cfg.vibePayOpen
      ? {
          label: "Vertal Vibe Pay",
          text: "a digital account to get paid in multiple currencies, with Pix, cards and payment links.",
          href: `${site}/en/vibe-pay`,
        }
      : {
          label: "Vertal Vibe Pay",
          text: "a digital account to get paid in multiple currencies, with Pix, cards and payment links. It's opening soon.",
          href: `${site}/en/vibe-pay`,
        },
    {
      label: "Premium Design, CAD and Office tools",
      text: "free whenever you use them manually.",
      href: `${site}/creative`,
    },
  ];
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export function buildWelcomeEmail(v: WelcomeVars): WelcomeEmail {
  const name = v.firstName;
  const hi = name ? `Hi ${name},` : "Hi there,";
  const items = welcomeItems(v.cfg);
  const subject = welcomeSubject(name);

  const text = [
    hi,
    "",
    "Welcome to Vertal Dev. We're really glad you're here.",
    "",
    "Your account comes with a full set of tools to build, launch and run your projects, and most of them cost nothing. Here's what's waiting for you:",
    "",
    ...items.map((i) => `• ${i.label}: ${i.text}${i.href ? ` (${i.href})` : ""}`),
    "",
    "You only pay for Vertal AI, and only for what you use, with credits you control.",
    "",
    "The best way to get started is our documentation. Spend a few minutes there and you'll find guides, examples and shortcuts that make everything easier.",
    "",
    `Explore the docs: ${v.cfg.docsUrl}`,
    "",
    "If you have a question or an idea, just reply to this email. We'd love to hear from you.",
    "",
    "Welcome aboard,",
    "Laércio Borges",
    "Founder, Vertal",
    "",
  ].join("\n");

  // HTML: tabelas + estilos inline (Gmail/Outlook), 600 px fluido, cabeçalho escuro com o logo,
  // corpo claro com color-scheme light dark (clientes em modo escuro invertem sem perder contraste).
  const font = "font-family:Inter,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";
  const p = `margin:0 0 16px;${font}font-size:16px;line-height:1.6;color:#1f2330;`;
  const link = "color:#6d28d9;text-decoration:underline;";
  const li = items
    .map(
      (i) => `<tr><td valign="top" style="padding:0 10px 12px 0;${font}font-size:16px;line-height:1.6;color:#7c3aed;">&#8226;</td>` +
        `<td valign="top" style="padding:0 0 12px;${font}font-size:16px;line-height:1.6;color:#1f2330;">` +
        (i.href
          ? `<a href="${esc(i.href)}" style="${link}font-weight:600;">${esc(i.label)}</a>`
          : `<strong style="font-weight:600;color:#1f2330;">${esc(i.label)}</strong>`) +
        `: ${esc(i.text)}</td></tr>`,
    )
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(subject)}</title>
<style>
@media (max-width:620px){.v-container{width:100%!important}.v-pad{padding-left:20px!important;padding-right:20px!important}}
@media (prefers-color-scheme:dark){.v-body{background:#0b0b12!important}.v-card{background:#14141f!important}.v-card td,.v-card p{color:#e8e8f0!important}.v-muted{color:#a1a1b5!important}}
</style>
</head>
<body class="v-body" style="margin:0;padding:0;background:#f3f2f8;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${esc(WELCOME_PREHEADER)}&#8203;&#160;&#8203;&#160;&#8203;&#160;&#8203;&#160;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="v-body" style="background:#f3f2f8;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="v-container" style="width:600px;max-width:600px;">
<tr><td align="center" style="background:#0b0b12;border-radius:16px 16px 0 0;padding:28px 24px;">
<a href="${esc(v.cfg.siteUrl)}" style="text-decoration:none;"><img src="${esc(v.cfg.logoUrl)}" width="88" height="88" alt="Vertal" style="display:block;width:88px;height:88px;border:0;outline:none;text-decoration:none;color:#ffffff;${font}font-size:20px;font-weight:700;"></a>
</td></tr>
<tr><td class="v-card v-pad" style="background:#ffffff;border-radius:0 0 16px 16px;padding:32px 40px 36px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td>
<p style="${p}">${esc(hi)}</p>
<p style="${p}">Welcome to Vertal Dev. We're really glad you're here.</p>
<p style="${p}">Your account comes with a full set of tools to build, launch and run your projects, and most of them cost nothing. Here's what's waiting for you:</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;">
${li}
</table>
<p style="${p}">You only pay for Vertal AI, and only for what you use, with credits you control.</p>
<p style="${p}">The best way to get started is our documentation. Spend a few minutes there and you'll find guides, examples and shortcuts that make everything easier.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
<tr><td align="center" bgcolor="#7c3aed" style="border-radius:12px;background:#7c3aed;">
<a href="${esc(v.cfg.docsUrl)}" style="display:inline-block;padding:14px 28px;${font}font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:12px;">Explore the docs</a>
</td></tr>
</table>
<p style="${p}">If you have a question or an idea, just reply to this email. We'd love to hear from you.</p>
<p style="margin:0;${font}font-size:16px;line-height:1.6;color:#1f2330;">Welcome aboard,<br>Laércio Borges<br><span class="v-muted" style="color:#5b5f6e;">Founder, Vertal</span></p>
</td></tr>
</table>
</td></tr>
<tr><td align="center" class="v-muted" style="padding:20px 12px 0;${font}font-size:12px;line-height:1.5;color:#7a7d8c;">
You're receiving this because you created a Vertal Dev account.<br><a href="${esc(v.cfg.siteUrl)}" style="color:#7a7d8c;text-decoration:underline;">vertal.dev</a>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`;

  return { subject, preheader: WELCOME_PREHEADER, html, text };
}
