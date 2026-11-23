// Formulários seguros do Vertal Navigator ("bloquinhos", como no Hark).
//
// Quando um site pede login, senha, código 2FA/autenticador ou telefone durante uma
// tarefa, o agente (navd.py) PAUSA e emite um pedido estruturado:
//   needs_login {host, fields}   · needs_password {host}
//   needs_otp {host, otpKind: totp|sms|email|unknown}   · needs_phone {host}
//   suggest_connector {connector: "gmail"} (login do Google em tarefa de e-mail)
// O chat mostra um cartão inline; o valor vai do cartão direto ao Worker (HTTPS),
// que salva no Cofre (cifrado, vinculado ao domínio) se o usuário marcar e entrega ao
// navd, que digita no campo. O valor nunca entra no contexto do modelo, no histórico
// do chat, na auditoria (nem cifrado) ou em log.
//
// Núcleo puro (sem Deno/DOM): Worker, front-end (Vitest) e edge functions.
// Espelho em Python no navd.py (site_slug_for_host, connector_for_login, mask_secret_like);
// casos compartilhados em infra/vertal-browser/auth_cases.json.
import { isBlockedHost } from "./browserForm.ts";
import { parseTotpSeed } from "./totp.ts";
import { secretMatchesHost, type VaultSecretMeta } from "./navigatorCore.ts";
export { SECRET_MASK, isSecretLikeToken, maskDeep, maskKnownValues, maskSecretLike } from "./secretMask.ts";

// ─── Domínio → slug do Cofre ─────────────────────────────────────────────
/** Segundos níveis comuns em ccTLDs (com.br, co.uk, gov.br…): o domínio registrável tem 3 rótulos. */
const SECOND_LEVEL = new Set(["com", "co", "org", "net", "gov", "edu", "ac", "mil", "nom", "art", "blog", "app", "ind", "eng", "adv", "jus", "leg", "med", "inf"]);

/** Domínio registrável aproximado: accounts.google.com → google.com; www.itau.com.br → itau.com.br. */
export function registrableDomain(host: unknown): string {
  let h = String(host ?? "").toLowerCase().replace(/\.$/, "");
  if (h.startsWith("www.")) h = h.slice(4);
  if (!h || isBlockedHost(h) || /^\d+(\.\d+){3}$/.test(h) || h.includes(":")) return "";
  const labels = h.split(".").filter(Boolean);
  if (labels.length < 2) return "";
  const tld = labels[labels.length - 1];
  const sld = labels[labels.length - 2];
  const take = labels.length >= 3 && tld.length === 2 && SECOND_LEVEL.has(sld) ? 3 : 2;
  return labels.slice(-take).join(".");
}

/** Slug do Cofre para o site (formato de kubo_secrets.bound_to): google.com → "google-com". */
export function siteSlugForHost(host: unknown): string {
  const d = registrableDomain(host);
  if (!d) return "";
  return d.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
}

/** Prefixo das variáveis do site: "google-com" → "GOOGLE_COM". */
export function siteEnvPrefix(slug: string): string {
  const p = slug.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const safe = /^[A-Z]/.test(p) ? p : `SITE_${p}`;
  return safe.slice(0, 50).replace(/_+$/, "");
}

export interface SiteSecretNames {
  username: string;
  password: string;
  totp: string;
  phone: string;
}

/** Nomes que o formulário usa ao salvar no Cofre (o usuário vê e pode renomear depois em /secrets). */
export function siteSecretNames(slug: string): SiteSecretNames {
  const p = siteEnvPrefix(slug);
  return { username: `${p}_LOGIN`, password: `${p}_PASSWORD`, totp: `${p}_TOTP`, phone: `${p}_PHONE` };
}

const USERNAME_NAME_RE = /_(LOGIN|USERNAME|USER|EMAIL|ACCOUNT|CPF|CNPJ)$/;
const PASSWORD_NAME_RE = /_(PASSWORD|PASS|PASSWD|SENHA|PWD)$/;
const PHONE_NAME_RE = /_(PHONE|TELEFONE|CELULAR|MOBILE)$/;

export interface SiteLogin {
  username: VaultSecretMeta | null;
  password: VaultSecretMeta | null;
}

const ownerFirst = (list: VaultSecretMeta[]) => list.find((s) => s.role === "owner") ?? list[0] ?? null;

/**
 * Login salvo que vale para esta página: segredos vinculados ao host (subdomínios e
 * domínio-pai pelo secretMatchesHost; SSO como accounts.google.com só quando o
 * próprio segredo está vinculado a google-com). Dono vence convidado.
 */
export function pickLoginForHost(secrets: VaultSecretMeta[], host: unknown): SiteLogin {
  const usable = secrets.filter((s) => secretMatchesHost(s.bound_to, host));
  return {
    username: ownerFirst(usable.filter((s) => USERNAME_NAME_RE.test(s.env_key))),
    password: ownerFirst(usable.filter((s) => PASSWORD_NAME_RE.test(s.env_key))),
  };
}

export function pickPhoneForHost(secrets: VaultSecretMeta[], host: unknown): VaultSecretMeta | null {
  return ownerFirst(secrets.filter((s) => PHONE_NAME_RE.test(s.env_key) && secretMatchesHost(s.bound_to, host)));
}

// ─── Conector em vez de login (Gmail) ────────────────────────────────────
const MAIL_TASK_RE = /\b(e-?mails?|gmail|inbox|caixa de entrada|correio)\b/i;

function decodeSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * Login do Google numa tarefa de e-mail: melhor oferecer o conector do Gmail (OAuth,
 * sem senha no navegador). Também quando a página de login é a do Gmail (service=mail).
 */
export function connectorForLogin(host: unknown, url: unknown = "", task: unknown = ""): "gmail" | null {
  const h = String(host ?? "").toLowerCase();
  const u = String(url ?? "");
  const googleLogin = h === "accounts.google.com" || h.endsWith(".accounts.google.com");
  const isMail = h === "mail.google.com" || /[?&]service=mail\b/.test(u) || decodeSafe(u).includes("mail.google.com") || MAIL_TASK_RE.test(String(task ?? ""));
  return (googleLogin || h === "mail.google.com") && isMail ? "gmail" : null;
}

// ─── Entradas dos cartões ────────────────────────────────────────────────
export type OtpKind = "totp" | "sms" | "email" | "unknown";

export function normalizeOtpKind(raw: unknown): OtpKind {
  const k = String(raw ?? "").toLowerCase();
  if (/totp|authenticator|autenticador|\bapp\b/.test(k)) return "totp";
  if (/sms|texto|celular|phone|telefone/.test(k)) return "sms";
  if (/e-?mail/.test(k)) return "email";
  return "unknown";
}

export const AUTH_LIMITS = { maxUsername: 254, maxPassword: 256, maxSeed: 512 } as const;

/** Telefone em formato internacional (+5511…); aceita espaços, traços e parênteses. Sem "+" e com 10–11 dígitos: Brasil (+55). */
export function normalizePhone(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s || s.length > 32 || !/^\+?[\d\s().-]+$/.test(s)) return null;
  const digits = s.replace(/\D/g, "");
  const full = s.startsWith("+") ? digits : digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  if (full.length < 8 || full.length > 15) return null;
  return `+${full}`;
}

/** País do cartão de telefone (padrão +55 Brasil). DDD/código de área é separado do número. */
export const PHONE_COUNTRIES = [
  { code: "55", label: "Brasil (+55)", areaDigits: 2 },
  { code: "1", label: "EUA/Canadá (+1)", areaDigits: 3 },
  { code: "351", label: "Portugal (+351)", areaDigits: 0 },
  { code: "54", label: "Argentina (+54)", areaDigits: 0 },
  { code: "52", label: "México (+52)", areaDigits: 0 },
  { code: "56", label: "Chile (+56)", areaDigits: 0 },
  { code: "57", label: "Colômbia (+57)", areaDigits: 0 },
  { code: "595", label: "Paraguai (+595)", areaDigits: 0 },
  { code: "598", label: "Uruguai (+598)", areaDigits: 0 },
  { code: "44", label: "Reino Unido (+44)", areaDigits: 0 },
  { code: "34", label: "Espanha (+34)", areaDigits: 0 },
  { code: "49", label: "Alemanha (+49)", areaDigits: 0 },
  { code: "33", label: "França (+33)", areaDigits: 0 },
  { code: "39", label: "Itália (+39)", areaDigits: 0 },
  { code: "81", label: "Japão (+81)", areaDigits: 0 },
] as const;

/** País + DDD + número → E.164 (+5511999998888). Null se não fecha 8–15 dígitos ou DDD inválido. */
export function composePhone(countryCode: string, area: string, number: string): string | null {
  const cc = String(countryCode ?? "").replace(/\D/g, "");
  const ddd = String(area ?? "").replace(/\D/g, "").replace(/^0+/, "");
  const num = String(number ?? "").replace(/\D/g, "");
  if (!/^[1-9]\d{0,2}$/.test(cc) || !num) return null;
  if (cc === "55" && !/^[1-9][1-9]$/.test(ddd)) return null;
  const full = `${cc}${ddd}${num}`;
  if (full.length < 8 || full.length > 15) return null;
  if (cc === "55" && !(num.length === 8 || (num.length === 9 && num.startsWith("9")))) return null;
  return `+${full}`;
}

export type AuthInput =
  | { kind: "login"; username?: string; password?: string; save: boolean }
  | { kind: "code"; value?: string; totpSeed?: string }
  | { kind: "phone"; value: string; save: boolean }
  | { kind: "connector"; connector: "gmail" }
  | { kind: "cancel" };

export type ParsedAuth = { ok: true; data: AuthInput } | { ok: false; detail: string };

/**
 * Corpo do cartão seguro (/api/navigator/input). `fields` é o que o site pediu:
 * só esses campos passam. Guardar semente TOTP exige `confirmed: true` (só o clique).
 */
export function parseAuthInput(body: Record<string, unknown>, fields: Array<"username" | "password"> = ["username", "password"]): ParsedAuth {
  if (body.cancel === true) return { ok: true, data: { kind: "cancel" } };
  const kind = body.kind;
  if (kind === "login") {
    const username = typeof body.username === "string" ? body.username.trim() : "";
    // Senha não é aparada: espaços podem fazer parte dela.
    const password = typeof body.password === "string" ? body.password : "";
    if (fields.includes("username") && !username) return { ok: false, detail: "username" };
    if (fields.includes("password") && !password) return { ok: false, detail: "password" };
    if (username.length > AUTH_LIMITS.maxUsername || /[\r\n\t]/.test(username)) return { ok: false, detail: "username" };
    if (password.length > AUTH_LIMITS.maxPassword || /[\r\n]/.test(password)) return { ok: false, detail: "password" };
    return {
      ok: true,
      data: {
        kind: "login", save: body.save !== false,
        ...(fields.includes("username") && username ? { username } : {}),
        ...(fields.includes("password") && password ? { password } : {}),
      },
    };
  }
  if (kind === "code") {
    const value = typeof body.value === "string" ? body.value.replace(/\s+/g, "") : "";
    const seed = typeof body.totpSeed === "string" ? body.totpSeed.trim() : "";
    if (value && !/^[A-Za-z0-9-]{3,32}$/.test(value)) return { ok: false, detail: "code_format" };
    if (seed) {
      if (seed.length > AUTH_LIMITS.maxSeed || !parseTotpSeed(seed)) return { ok: false, detail: "totp_seed" };
      if (body.confirmed !== true) return { ok: false, detail: "confirmation_required" };
    }
    if (!value && !seed) return { ok: false, detail: "value" };
    return { ok: true, data: { kind: "code", ...(value ? { value } : {}), ...(seed ? { totpSeed: seed } : {}) } };
  }
  if (kind === "phone") {
    const value = normalizePhone(body.value);
    if (!value) return { ok: false, detail: "phone" };
    return { ok: true, data: { kind: "phone", value, save: body.save === true } };
  }
  if (kind === "connector") {
    if (body.connector !== "gmail") return { ok: false, detail: "connector" };
    return { ok: true, data: { kind: "connector", connector: "gmail" } };
  }
  return { ok: false, detail: "kind" };
}

// ─── Cartão: o que o usuário vê ──────────────────────────────────────────
export interface AuthPendingView {
  host: string;
  site: string;
  domain: string;
  loginFields?: Array<"username" | "password">;
  otpKind?: OtpKind;
  retry?: boolean;
  connector?: "gmail";
  saveAs?: Partial<SiteSecretNames>;
}

/** Parte do pedido pendente que o cartão precisa (nunca valores de segredo). */
export function authPendingView(kind: "login" | "code" | "phone", p: Record<string, unknown>): AuthPendingView {
  const host = String(p.host ?? "").toLowerCase().slice(0, 253);
  const site = siteSlugForHost(host);
  const names = site ? siteSecretNames(site) : null;
  const view: AuthPendingView = { host, site, domain: registrableDomain(host) || host };
  if (kind === "login") {
    const raw = Array.isArray(p.fields) ? p.fields : ["username", "password"];
    const fields = (["username", "password"] as const).filter((f) => raw.includes(f));
    view.loginFields = fields.length ? [...fields] : ["username", "password"];
    if (p.retry === true) view.retry = true;
    const c = p.connector === "gmail" ? "gmail" : connectorForLogin(host, p.url, p.mailTask === true ? "e-mail" : "");
    if (c) view.connector = c;
    if (names) {
      view.saveAs = {
        ...(view.loginFields.includes("username") ? { username: names.username } : {}),
        ...(view.loginFields.includes("password") ? { password: names.password } : {}),
      };
    }
  } else if (kind === "code") {
    view.otpKind = normalizeOtpKind(p.otpKind);
    if (names && view.otpKind === "totp") view.saveAs = { totp: names.totp };
  } else if (names) {
    view.saveAs = { phone: names.phone };
  }
  return view;
}

/** Tipo do evento de cada pedido (os mesmos nomes do navd). */
export function authEventType(kind: string, fields?: unknown): string | null {
  if (kind === "login") {
    const f = Array.isArray(fields) ? fields : [];
    return f.length === 1 && f[0] === "password" ? "needs_password" : "needs_login";
  }
  if (kind === "code") return "needs_otp";
  if (kind === "phone") return "needs_phone";
  return null;
}
