// Agente de formulários do Vertal Chat ("inscreva minha startup neste formulário").
//
// Módulo puro (sem Deno, DOM ou Workers): o contrato do agente (chatAgent.ts),
// o Worker do vertal.dev (worker/browserFormRoutes.ts, que roda o navegador na
// nuvem com o Cloudflare Browser Run) e o front-end usam as mesmas regras, e o
// Vitest testa exatamente o que roda em produção.
//
// O que fica aqui:
// - guarda SSRF (só sites públicos em http/https);
// - leitura do formulário: campos crus da página → esquema limpo, sem honeypots;
// - casamento dos valores que o agente mandou com os campos;
// - detecção de captcha (devolvemos "captcha", nunca tentamos burlar);
// - limites e limitador de taxa por usuário.

export const BROWSER_FORM_OPS = ["inspect", "preview", "submit"] as const;
export type BrowserFormOp = (typeof BROWSER_FORM_OPS)[number];

export const BROWSER_FORM_LIMITS = {
  maxUrlChars: 2_000,
  maxValues: 80,
  maxKeyChars: 120,
  maxValueChars: 5_000,
  maxFields: 80,
  maxOptions: 60,
  maxLabelChars: 200,
  maxBodyBytes: 64_000,
  /** Tempo máximo para abrir a página. */
  navigationTimeoutMs: 20_000,
  /** Tempo máximo da rota inteira (o navegador fecha sozinho com 60 s parado). */
  totalTimeoutMs: 50_000,
  /** Espera pela página de confirmação depois do clique. */
  submitWaitMs: 15_000,
  maxConfirmationChars: 1_500,
  /** Screenshot JPEG em base64: acima disso, refaz com qualidade menor. */
  maxScreenshotBase64: 400_000,
  /** Créditos cobrados por envio (mesmo valor do "Agent run" do Local Agent). */
  submitCredits: 4,
} as const;

/** Status que o Worker devolve (HTTP 200 com ok:false para erros de negócio). */
export type BrowserFormStatus =
  | "ok"
  | "captcha"
  | "no_form"
  | "validation_error"
  | "blocked_url"
  | "timeout"
  | "navigation_failed"
  | "rate_limited"
  | "insufficient_credits"
  | "not_configured"
  | "unauthorized"
  | "bad_request"
  | "error";

export const BROWSER_FORM_MESSAGES: Record<Exclude<BrowserFormStatus, "ok">, string> = {
  captcha: "O site pede um captcha (verificação \"não sou um robô\"). Não tento burlar: abra o link e envie você mesmo.",
  no_form: "Não encontrei um formulário preenchível nesta página.",
  validation_error: "O site recusou alguns campos. Veja os erros e corrija os valores.",
  blocked_url: "Esse endereço não pode ser aberto pelo navegador do chat (só sites públicos em http/https).",
  timeout: "O site demorou demais para responder.",
  navigation_failed: "Não consegui abrir a página.",
  rate_limited: "Muitos pedidos ao navegador em pouco tempo. Aguarde um minuto e tente de novo.",
  insufficient_credits: "Créditos insuficientes para enviar o formulário.",
  not_configured: "O navegador na nuvem ainda não está ativado no servidor.",
  unauthorized: "Sua sessão expirou. Entre novamente.",
  bad_request: "Pedido inválido para o navegador.",
  error: "Algo deu errado no navegador na nuvem.",
};

// ─── Guarda SSRF ─────────────────────────────────────────────────────────

const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home", ".corp", ".intranet", ".arpa"];

function ipv4Parts(host: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  return parts.every((p) => p >= 0 && p <= 255) ? parts : null;
}

function isPrivateIpv4([a, b]: number[]): boolean {
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local / metadados de nuvem
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 // multicast e reservados
  );
}

function isPrivateIpv6(raw: string): boolean {
  const host = raw.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "::" || host === "::1") return true;
  // IPv4 mapeado/compatível (::ffff:127.0.0.1 ou ::ffff:7f00:1): bloqueia tudo, é raro em sites públicos.
  if (host.startsWith("::ffff:") || /^::\d/.test(host) || host.startsWith("64:ff9b:")) return true;
  const first = parseInt(host.split(":")[0] || "0", 16);
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 (ULA)
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 (link-local)
  if ((first & 0xff00) === 0xff00) return true; // multicast
  return false;
}

/** Host que o navegador do chat nunca deve abrir (rede interna, loopback, metadados). */
export function isBlockedHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!host) return true;
  if (host === "localhost" || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) return true;
  if (host.includes(":") || host.startsWith("[")) return isPrivateIpv6(host);
  const v4 = ipv4Parts(host);
  if (v4) return isPrivateIpv4(v4);
  // Hosts sem ponto (ex.: "intranet") não são sites públicos.
  if (!host.includes(".")) return true;
  // Números soltos que escaparam da normalização da URL (ex.: 0x7f.1).
  if (host.split(".").every((label) => /^(0x[0-9a-f]*|\d+)$/.test(label))) return true;
  return false;
}

/**
 * Valida e normaliza a URL de um formulário. Devolve null quando não pode ser aberta.
 * Observação: a checagem é por nome/IP literal; DNS que aponta para rede interna
 * é barrado pela própria Cloudflare (o Browser Run não alcança redes privadas).
 */
export function normalizeFormUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (!text || text.length > BROWSER_FORM_LIMITS.maxUrlChars) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== "80" && url.port !== "443") return null;
  if (isBlockedHost(url.hostname)) return null;
  url.hash = "";
  return url.toString();
}

/** Requisições que a página faz (subrecursos e redirecionamentos) também passam pela guarda. */
export function isAllowedSubrequest(rawUrl: string): boolean {
  if (/^(data|blob|about):/i.test(rawUrl)) return true;
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:" && url.protocol !== "wss:" && url.protocol !== "ws:") return false;
    return !isBlockedHost(url.hostname);
  } catch {
    return false;
  }
}

// ─── Leitura do formulário ───────────────────────────────────────────────

/** O que o script dentro da página coleta de cada controle (sem processar). */
export interface RawFormControl {
  /** Ordem na página; o script marca o elemento com data-vertal-field="f<index>". */
  index: number;
  tag: "input" | "select" | "textarea";
  type: string;
  name: string;
  id: string;
  label: string;
  placeholder: string;
  ariaLabel: string;
  required: boolean;
  disabled: boolean;
  readOnly: boolean;
  /** Visível na tela (tem tamanho, display/visibility/opacity normais, dentro da página). */
  visible: boolean;
  ariaHidden: boolean;
  tabIndex: number;
  autocomplete: string;
  value: string;
  checked: boolean;
  options: Array<{ value: string; label: string }>;
  /** Índice do <form> que contém o campo (-1 = fora de form). */
  formIndex: number;
  /** Texto do contêiner próximo (para pegar "deixe em branco" ao lado do campo). */
  hint: string;
}

export interface RawSubmitButton {
  index: number;
  text: string;
  formIndex: number;
  visible: boolean;
}

export type FormFieldType =
  | "text" | "email" | "tel" | "url" | "number" | "date" | "datetime-local" | "time" | "month" | "week"
  | "password" | "search" | "color" | "range" | "textarea" | "select" | "multiselect" | "radio" | "checkbox" | "file";

export interface FormField {
  /** Chave que o agente usa em "values" (name, id ou rótulo). */
  key: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  options?: Array<{ value: string; label: string }>;
  /** Seletor CSS do elemento (para radio: do grupo). */
  selector: string;
  placeholder?: string;
  /** Campos que o navegador do chat não preenche (upload de arquivo). */
  unsupported?: boolean;
  /** Valor que já estava na página. */
  current?: string;
}

export interface SubmitButton {
  selector: string;
  text: string;
}

export interface FormSchema {
  title: string;
  fields: FormField[];
  submitButtons: SubmitButton[];
  /** Campos ignorados por parecerem armadilha anti-robô (honeypot). */
  honeypotsSkipped: number;
}

const SKIPPED_INPUT_TYPES = new Set(["submit", "button", "reset", "image", "hidden"]);
const KNOWN_TYPES = new Set<string>([
  "text", "email", "tel", "url", "number", "date", "datetime-local", "time", "month", "week",
  "password", "search", "color", "range", "radio", "checkbox", "file",
]);

const HONEYPOT_NAME_RE = /(honey|hpot|^hp[_-]|[_-]hp$|_gotcha|^gotcha$|bot[_-]?(check|trap|field)|trap|nospam|no[_-]?bots?|leave[_-]?(this[_-]?)?(blank|empty)|do[_-]?not[_-]?fill|dont[_-]?fill|^fax_only$)/i;
const HONEYPOT_TEXT_RE = /(n[ãa]o\s+preench(a|er)\s+(este|esse)\s+campo|deix[ea]\s+(este|esse)\s+campo\s+(em\s+branco|vazio)|leave\s+(this\s+)?(field\s+)?(blank|empty)|do\s*n[o']?t\s+fill|don['’]?t\s+fill|if\s+you\s+are\s+(a\s+)?human|se\s+voc[êe]\s+[ée]\s+humano|robot\s+trap|honeypot)/i;

const clip = (text: string, max: number) => text.replace(/\s+/g, " ").trim().slice(0, max);

/**
 * Campo armadilha anti-robô (honeypot): escondido, fora da tela, com aria-hidden
 * e tabindex -1, ou com nome/rótulo do tipo "não preencha". Nunca preenchemos.
 */
export function isHoneypot(c: RawFormControl): boolean {
  if (c.type === "hidden") return true;
  if (!c.visible) return true;
  if (c.ariaHidden) return true;
  const text = [c.label, c.placeholder, c.ariaLabel, c.hint].join(" ");
  if (HONEYPOT_TEXT_RE.test(text)) return true;
  // Rótulo que começa com "Não preencha" (ex.: "Não preencha", "Não preencher").
  if ([c.label, c.placeholder, c.ariaLabel].some((t) => /^\s*n[ãa]o\s+preench/i.test(t))) return true;
  if (HONEYPOT_NAME_RE.test(c.name) || HONEYPOT_NAME_RE.test(c.id)) return true;
  // tabindex -1 + autocomplete off num campo de texto sem rótulo: padrão clássico de armadilha.
  if (c.tabIndex < 0 && /^off$/i.test(c.autocomplete) && !c.label && !c.ariaLabel && !c.placeholder) return true;
  return false;
}

const slug = (text: string) =>
  text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);

/** Seletor estável do elemento marcado pelo script da página. */
export const fieldSelector = (index: number) => `[data-vertal-field="f${index}"]`;
export const submitSelector = (index: number) => `[data-vertal-submit="s${index}"]`;
const SUBMIT_SELECTOR_RE = /^\[data-vertal-submit="s(\d{1,4})"\]$/;

function fieldType(c: RawFormControl): FormFieldType | null {
  if (c.tag === "textarea") return "textarea";
  if (c.tag === "select") return c.type === "select-multiple" ? "multiselect" : "select";
  const type = (c.type || "text").toLowerCase();
  if (SKIPPED_INPUT_TYPES.has(type)) return null;
  return (KNOWN_TYPES.has(type) ? type : "text") as FormFieldType;
}

function labelOf(c: RawFormControl): string {
  return clip(c.label || c.ariaLabel || c.placeholder || c.name || c.id, BROWSER_FORM_LIMITS.maxLabelChars);
}

/**
 * Campos crus da página → esquema do formulário.
 * - pula honeypots, botões, campos desativados/somente leitura;
 * - junta radios do mesmo grupo num campo só (com as opções);
 * - dá a cada campo uma chave única (name > id > rótulo).
 */
export function buildFormSchema(
  controls: RawFormControl[],
  buttons: RawSubmitButton[] = [],
  title = "",
): FormSchema {
  const fields: FormField[] = [];
  const usedKeys = new Set<string>();
  const radioGroups = new Map<string, FormField>();
  let honeypotsSkipped = 0;

  const uniqueKey = (base: string) => {
    let key = base.slice(0, BROWSER_FORM_LIMITS.maxKeyChars) || "campo";
    for (let n = 2; usedKeys.has(key); n++) key = `${base.slice(0, BROWSER_FORM_LIMITS.maxKeyChars - 4)}_${n}`;
    usedKeys.add(key);
    return key;
  };

  for (const c of controls) {
    const type = fieldType(c);
    if (!type) continue;
    if (isHoneypot(c)) {
      honeypotsSkipped++;
      continue;
    }
    if (c.disabled || c.readOnly) continue;

    if (type === "radio") {
      const group = c.name || c.id || `radio_${c.index}`;
      const optionLabel = clip(c.label || c.ariaLabel || c.value, BROWSER_FORM_LIMITS.maxLabelChars);
      const existing = radioGroups.get(group);
      if (existing) {
        if ((existing.options?.length ?? 0) < BROWSER_FORM_LIMITS.maxOptions) {
          existing.options?.push({ value: c.value, label: optionLabel || c.value });
        }
        existing.required ||= c.required;
        if (c.checked) existing.current = c.value;
        continue;
      }
      if (fields.length >= BROWSER_FORM_LIMITS.maxFields) break;
      const field: FormField = {
        key: uniqueKey(c.name || c.id || slug(c.hint || optionLabel) || `campo_${c.index}`),
        label: clip(c.hint || c.name || optionLabel, BROWSER_FORM_LIMITS.maxLabelChars),
        type: "radio",
        required: c.required,
        options: [{ value: c.value, label: optionLabel || c.value }],
        selector: c.name ? `input[type="radio"][name="${cssString(c.name)}"]` : fieldSelector(c.index),
        ...(c.checked ? { current: c.value } : {}),
      };
      radioGroups.set(group, field);
      fields.push(field);
      continue;
    }

    if (fields.length >= BROWSER_FORM_LIMITS.maxFields) break;
    const label = labelOf(c);
    const field: FormField = {
      key: uniqueKey(c.name || c.id || slug(label) || `campo_${c.index}`),
      label: label || `Campo ${c.index + 1}`,
      type,
      required: c.required,
      selector: fieldSelector(c.index),
    };
    if (c.placeholder && c.placeholder !== label) field.placeholder = clip(c.placeholder, BROWSER_FORM_LIMITS.maxLabelChars);
    if (type === "select" || type === "multiselect") {
      field.options = c.options
        .filter((o) => o.value !== "" || o.label !== "")
        .slice(0, BROWSER_FORM_LIMITS.maxOptions)
        .map((o) => ({ value: o.value, label: clip(o.label || o.value, BROWSER_FORM_LIMITS.maxLabelChars) }));
    }
    if (type === "file") field.unsupported = true;
    if (type === "checkbox") {
      if (c.checked) field.current = "true";
    } else if (c.value && type !== "password") {
      field.current = clip(c.value, 300);
    }
    fields.push(field);
  }

  const submitButtons = buttons
    .filter((b) => b.visible)
    .slice(0, 10)
    .map((b) => ({ selector: submitSelector(b.index), text: clip(b.text, 80) || "Enviar" }));

  return { title: clip(title, 200), fields, submitButtons, honeypotsSkipped };
}

/** Escapa um valor para usar dentro de aspas num seletor CSS. */
export function cssString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\a ");
}

/** Formulário principal: o <form> com mais campos preenchíveis (-1 = campos soltos). */
export function dominantFormIndex(controls: RawFormControl[]): number {
  const count = new Map<number, number>();
  for (const c of controls) {
    if (c.type === "hidden" || !c.visible) continue;
    count.set(c.formIndex, (count.get(c.formIndex) ?? 0) + 1);
  }
  let best = -1;
  let max = 0;
  for (const [form, n] of count) {
    if (n > max) {
      best = form;
      max = n;
    }
  }
  return best;
}

/**
 * Qual botão clicar. O pedido do agente só vale se for um botão que o servidor
 * marcou e que está visível; senão, o botão do formulário principal.
 */
export function chooseSubmitButton(
  controls: RawFormControl[],
  buttons: RawSubmitButton[],
  requested?: string,
): RawSubmitButton | null {
  const visible = buttons.filter((b) => b.visible);
  if (requested && isValidSubmitSelector(requested)) {
    const wanted = visible.find((b) => submitSelector(b.index) === requested);
    if (wanted) return wanted;
  }
  const form = dominantFormIndex(controls);
  return visible.find((b) => b.formIndex === form) ?? visible[0] ?? null;
}

/** O agente só pode clicar num botão de envio que o próprio servidor marcou. */
export function isValidSubmitSelector(selector: unknown): selector is string {
  return typeof selector === "string" && SUBMIT_SELECTOR_RE.test(selector);
}

// ─── Valores ─────────────────────────────────────────────────────────────

export type FormValues = Record<string, string | boolean>;

/** Valida os valores que vêm do agente/navegador. Chaves e tamanhos limitados. */
export function parseFormValues(raw: unknown): FormValues {
  const out: FormValues = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>).slice(0, BROWSER_FORM_LIMITS.maxValues)) {
    const key = k.trim().slice(0, BROWSER_FORM_LIMITS.maxKeyChars);
    if (!key) continue;
    if (typeof v === "boolean") out[key] = v;
    else if (typeof v === "number" && Number.isFinite(v)) out[key] = String(v);
    else if (typeof v === "string") out[key] = v.slice(0, BROWSER_FORM_LIMITS.maxValueChars);
    else if (Array.isArray(v)) out[key] = v.filter((x) => typeof x === "string").join(", ").slice(0, BROWSER_FORM_LIMITS.maxValueChars);
  }
  return out;
}

const norm = (text: string) =>
  text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const TRUE_RE = /^(true|sim|s|yes|y|1|x|on|marcar|marcado|aceito|concordo)$/i;

/** Valor que vai de fato para o campo, ou um erro em português. */
export function coerceFieldValue(
  field: FormField,
  value: string | boolean,
): { ok: true; value: string | boolean | string[] } | { ok: false; error: string } {
  if (field.unsupported) return { ok: false, error: `"${field.label}" pede upload de arquivo; envie pelo site.` };
  if (field.type === "checkbox") {
    return { ok: true, value: typeof value === "boolean" ? value : TRUE_RE.test(String(value).trim()) };
  }
  const text = typeof value === "boolean" ? (value ? "true" : "false") : value;
  if (field.type === "select" || field.type === "radio" || field.type === "multiselect") {
    const options = field.options ?? [];
    const pick = (wanted: string) => {
      const n = norm(wanted);
      return options.find((o) => o.value === wanted)
        ?? options.find((o) => norm(o.label) === n || norm(o.value) === n)
        ?? options.find((o) => n.length >= 3 && norm(o.label).includes(n));
    };
    if (field.type === "multiselect") {
      const picked = text.split(/[,;]\s*/).map((t) => t.trim()).filter(Boolean).map(pick);
      if (picked.some((p) => !p)) return { ok: false, error: `"${field.label}": opção inválida. Opções: ${options.map((o) => o.label).join(", ")}.` };
      return { ok: true, value: picked.map((p) => p!.value) };
    }
    const option = pick(text);
    if (!option) return { ok: false, error: `"${field.label}": "${text.slice(0, 60)}" não é uma opção. Opções: ${options.map((o) => o.label).join(", ").slice(0, 400)}.` };
    return { ok: true, value: option.value };
  }
  if (field.type === "email" && text && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text.trim())) {
    return { ok: false, error: `"${field.label}": e-mail inválido.` };
  }
  return { ok: true, value: text };
}

export interface FillPlanItem {
  key: string;
  selector: string;
  type: FormFieldType;
  value: string | boolean | string[];
}

export interface FillPlan {
  fills: FillPlanItem[];
  /** Chaves enviadas que não casaram com nenhum campo. */
  unknownKeys: string[];
  /** Campos obrigatórios que ficaram sem valor (nem na página, nem enviado). */
  missingRequired: FormField[];
  /** Erros de valor (opção inexistente, e-mail inválido…). */
  errors: string[];
}

/** Acha o campo de uma chave: chave exata, depois rótulo/nome normalizado. */
export function findField(fields: FormField[], key: string): FormField | undefined {
  const exact = fields.find((f) => f.key === key);
  if (exact) return exact;
  const n = norm(key);
  if (!n) return undefined;
  return fields.find((f) => norm(f.key) === n) ?? fields.find((f) => norm(f.label) === n);
}

/** Casa os valores com os campos e diz o que falta. Nunca preenche honeypots (eles nem estão no esquema). */
export function planFill(fields: FormField[], values: FormValues): FillPlan {
  const fills: FillPlanItem[] = [];
  const unknownKeys: string[] = [];
  const errors: string[] = [];
  const filled = new Set<string>();
  for (const [key, raw] of Object.entries(values)) {
    const field = findField(fields, key);
    if (!field) {
      unknownKeys.push(key);
      continue;
    }
    if (filled.has(field.key)) continue;
    if (typeof raw === "string" && raw.trim() === "" && field.type !== "checkbox") continue;
    const coerced = coerceFieldValue(field, raw);
    // `in` em vez de `!coerced.ok`: o front-end compila sem strictNullChecks e não estreitaria o tipo.
    if ("error" in coerced) {
      errors.push(coerced.error);
      continue;
    }
    filled.add(field.key);
    fills.push({ key: field.key, selector: field.selector, type: field.type, value: coerced.value });
  }
  const missingRequired = fields.filter((f) => {
    if (!f.required || f.unsupported || filled.has(f.key)) return false;
    if (f.type === "checkbox") return f.current !== "true";
    return !f.current;
  });
  return { fills, unknownKeys, missingRequired, errors };
}

// ─── Captcha ─────────────────────────────────────────────────────────────

export interface CaptchaSignals {
  iframeSrcs: string[];
  /** Seletores que existem na página (o script testa uma lista fixa). */
  presentSelectors: string[];
  title: string;
  bodyText: string;
}

/** Seletores que o script da página testa para achar captcha. */
export const CAPTCHA_SELECTORS = [
  ".g-recaptcha", "#g-recaptcha", "[data-sitekey]", ".h-captcha", ".cf-turnstile", "#cf-challenge-running",
  "#challenge-form", "iframe[title*='captcha' i]", "#px-captcha", ".frc-captcha", "#captcha", "[name='captcha']",
] as const;

const CAPTCHA_IFRAME_RE = /(recaptcha|hcaptcha|challenges\.cloudflare\.com|turnstile|arkoselabs|funcaptcha|geetest|captcha)/i;
const CAPTCHA_TEXT_RE = /(just a moment\.\.\.|verify you are human|verifique se voc[êe] [ée] humano|checking your browser|confirme que voc[êe] n[ãa]o [ée] um rob[ôo]|i['’]?m not a robot|n[ãa]o sou um rob[ôo]|attention required)/i;

/** A página tem captcha ou desafio anti-robô? (Nunca tentamos resolver.) */
export function detectCaptcha(s: CaptchaSignals): { captcha: boolean; kind?: string } {
  const iframe = s.iframeSrcs.find((src) => CAPTCHA_IFRAME_RE.test(src));
  if (iframe) {
    const kind = /hcaptcha/i.test(iframe) ? "hcaptcha" : /recaptcha/i.test(iframe) ? "recaptcha" : /cloudflare|turnstile/i.test(iframe) ? "turnstile" : "captcha";
    return { captcha: true, kind };
  }
  const sel = s.presentSelectors.find((x) => (CAPTCHA_SELECTORS as readonly string[]).includes(x));
  if (sel) {
    const kind = sel.includes("h-captcha") ? "hcaptcha" : sel.includes("recaptcha") ? "recaptcha" : sel.includes("turnstile") || sel.includes("cf-") ? "turnstile" : "captcha";
    return { captcha: true, kind };
  }
  if (CAPTCHA_TEXT_RE.test(s.title) || CAPTCHA_TEXT_RE.test(s.bodyText.slice(0, 3_000))) return { captcha: true, kind: "challenge" };
  return { captcha: false };
}

// ─── Resultado do envio ──────────────────────────────────────────────────

/** Texto de confirmação: título + cabeçalhos + mensagens de status, sem repetir. */
export function confirmationText(input: { title: string; headings: string[]; alerts: string[]; bodyText: string }): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  const push = (t: string) => {
    const c = clip(t, 400);
    if (c && !seen.has(c.toLowerCase())) {
      seen.add(c.toLowerCase());
      parts.push(c);
    }
  };
  input.alerts.slice(0, 5).forEach(push);
  input.headings.slice(0, 4).forEach(push);
  if (parts.length === 0) push(input.title);
  const joined = parts.join("\n");
  const body = clip(input.bodyText, BROWSER_FORM_LIMITS.maxConfirmationChars);
  const out = joined.length >= 40 ? joined : [joined, body].filter(Boolean).join("\n");
  return out.slice(0, BROWSER_FORM_LIMITS.maxConfirmationChars);
}

// ─── Resumo para o agente ────────────────────────────────────────────────

/** Esquema em texto curto, para o modelo pedir ao usuário o que falta. */
export function describeSchemaForAgent(schema: FormSchema): string {
  const lines = schema.fields.map((f) => {
    const opts = f.options?.length ? ` opções: ${f.options.slice(0, 15).map((o) => o.label).join(" | ")}` : "";
    const flags = [f.required ? "obrigatório" : "opcional", f.unsupported ? "upload: o usuário envia pelo site" : "", f.current ? `já preenchido: ${f.current.slice(0, 60)}` : ""]
      .filter(Boolean).join(", ");
    return `- "${f.key}" — ${f.label} [${f.type}; ${flags}]${opts}`;
  });
  const buttons = schema.submitButtons.map((b) => `${b.selector} ("${b.text}")`).join(", ") || "(nenhum botão de envio visível)";
  return [
    `Formulário "${schema.title || "sem título"}": ${schema.fields.length} campo(s).`,
    ...lines,
    `Botões de envio: ${buttons}.`,
    schema.honeypotsSkipped ? `${schema.honeypotsSkipped} campo(s) armadilha anti-robô ignorado(s) (nunca preencha).` : "",
  ].filter(Boolean).join("\n");
}

// ─── Limitador de taxa (por usuário, em memória do isolate) ──────────────

export interface RateLimiter {
  /** true = pode seguir; false = estourou o limite. */
  take(key: string, now?: number): boolean;
}

/** Janela deslizante simples. Por isolate do Worker: limite de melhor esforço, não global. */
export function createRateLimiter(limit: number, windowMs: number, maxKeys = 5_000): RateLimiter {
  const hits = new Map<string, number[]>();
  return {
    take(key, now = Date.now()) {
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return false;
      }
      recent.push(now);
      hits.delete(key);
      hits.set(key, recent);
      if (hits.size > maxKeys) {
        const oldest = hits.keys().next().value;
        if (oldest !== undefined) hits.delete(oldest);
      }
      return true;
    },
  };
}

// ─── Quando oferecer a ferramenta ao agente ──────────────────────────────

const FORM_TOPIC_RE = /(browser_form|formul[aá]rio|inscri[çc][ãa]o|inscrev|cadastr|candidat|preench|forms\.gle|docs\.google\.com\/forms|typeform\.com|jotform|tally\.so|airtable\.com\/shr|hubspot.*forms|\bform\b|\bforms\b|sign[ -]?up|apply)/i;

/**
 * A conversa recente fala de formulário de site? (últimas mensagens e resultados
 * de ferramenta). Só então o prompt ganha a ferramenta browser_form: o prompt-base
 * já ocupa todo o orçamento de sistema do gateway.
 */
export function wantsBrowserForm(recent: Array<string | { content?: unknown; summary?: unknown; tool?: unknown }>, lookback = 8): boolean {
  return recent.slice(-lookback).some((item) => {
    if (typeof item === "string") return FORM_TOPIC_RE.test(item);
    if (!item || typeof item !== "object") return false;
    if (item.tool === "browser_form") return true;
    return [item.content, item.summary].some((t) => typeof t === "string" && FORM_TOPIC_RE.test(t));
  });
}
