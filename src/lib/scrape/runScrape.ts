// Executor das ferramentas de coleta web (F5) no chat: scrape_page, crawl_site, monitor_page.
// O servidor (Worker /api/scrape) aplica termo, robots.txt, limites e créditos; aqui o chat:
//   * abre o termo para assinar quando o servidor pede (consent_required) e tenta de novo;
//   * captcha: PAUSA, avisa "Apareceu um captcha, resolva na tela ao vivo", entrega o
//     controle ao usuário no Navigator e, quando ele devolve, continua a coleta na sessão dele;
//   * mostra o cartão do resultado (resumo, tabela, fonte, créditos).
import type { AgentAction, ToolResult } from '@/lib/chatAgent/contract';
import type { Artifact } from '@/lib/chatAgent/artifacts';
import { requestConsent } from '@/lib/consent/store';
import { solveCaptchaInNavigator } from '@/lib/navigator/store';
import { SCRAPE_MESSAGES, type ScrapePage } from '../../../supabase/functions/_shared/scrapeCore';
import { callScrape, type ScrapeResponse, type ScrapeRoute } from './client';
import { scrapeArtifactData, scrapeSummaryForAgent } from './artifact';

type ScrapeAction = Extract<AgentAction, { tool: 'scrape_page' | 'crawl_site' | 'monitor_page' }>;

export interface ScrapeOutcome {
  artifact?: Artifact;
  panel?: 'monitors';
  error?: string;
  result: ToolResult;
  needsFollowUp?: boolean;
}

export interface ScrapeDeps {
  call?: typeof callScrape;
  consent?: typeof requestConsent;
  solveCaptcha?: typeof solveCaptchaInNavigator;
}

const out = (tool: string, ok: boolean, summary: string, extra: Partial<ScrapeOutcome> = {}): ScrapeOutcome => ({
  result: { tool, ok, summary }, needsFollowUp: true, ...(ok ? {} : { error: extra.error ?? summary }), ...extra,
});

/** Chama a rota; se o servidor pedir o termo, abre o cartão e repete UMA vez depois do aceite. */
export async function callWithConsent(route: ScrapeRoute, body: Record<string, unknown>, deps: ScrapeDeps = {}): Promise<ScrapeResponse> {
  const call = deps.call ?? callScrape;
  const res = await call(route, body);
  if (res.ok || res.status !== 'consent_required' || !res.category) return res;
  const accepted = await (deps.consent ?? requestConsent)({ category: res.category, version: res.version, title: res.title });
  return accepted ? call(route, body) : { ...res, message: 'Sem o termo assinado a coleta não roda. Quando quiser, peça de novo e assine o termo.' };
}

/**
 * Captcha na coleta: pausa e entrega ao usuário (Navigator, tela ao vivo). Resolvido e
 * devolvido, a coleta daquelas páginas continua na sessão dele (modo dinâmico).
 */
export async function resumeAfterCaptcha(res: ScrapeResponse, body: Record<string, unknown>, deps: ScrapeDeps = {}): Promise<{ res: ScrapeResponse; captchaNote?: string }> {
  const urls = res.captchaUrls ?? [];
  if (!res.ok || !urls.length) return { res };
  const solved = await (deps.solveCaptcha ?? solveCaptchaInNavigator)(urls[0]);
  if (!solved.ok || !solved.sessionId) return { res, captchaNote: solved.message ?? 'O captcha não foi resolvido; essas páginas ficaram de fora.' };
  const again = await (deps.call ?? callScrape)('page', { ...body, urls, mode: 'dynamic', sessionId: solved.sessionId });
  if (!again.ok) return { res, captchaNote: again.message ?? 'Não consegui continuar depois do captcha.' };
  const fixed = new Map((again.pages ?? []).map((p) => [p.url, p] as const));
  const pages: ScrapePage[] = (res.pages ?? []).map((p) => fixed.get(p.url) ?? p);
  return {
    res: {
      ...res, pages, credits: (res.credits ?? 0) + (again.credits ?? 0),
      captchaUrls: (again.captchaUrls ?? []), blocked: pages.filter((p) => p.blocked).map((p) => ({ url: p.url, reason: p.blocked! })),
    },
    captchaNote: 'Captcha resolvido por você na tela ao vivo; a coleta continuou.',
  };
}

export async function runScrapeAction(action: ScrapeAction, newId: () => string, deps: ScrapeDeps = {}): Promise<ScrapeOutcome> {
  const tool = action.tool;
  const failMsg = (r: ScrapeResponse) => r.message ?? SCRAPE_MESSAGES[r.status as keyof typeof SCRAPE_MESSAGES] ?? SCRAPE_MESSAGES.error;

  if (tool === 'monitor_page') {
    if (action.op === 'list') {
      const r = await callWithConsent('monitors', {}, deps);
      if (!r.ok) return out(tool, false, failMsg(r));
      const list = (r.monitors ?? []).map((m) => `- ${m.name} (${m.id}): ${m.status}, último valor "${(m.last_value ?? '—').slice(0, 80)}", a cada ${m.frequency_minutes} min`).join('\n');
      return out(tool, true, list ? `Monitores do usuário (DADOS):\n${list}` : 'O usuário não tem monitores.', { panel: 'monitors' });
    }
    if (action.op === 'create') {
      const r = await callWithConsent('monitor-create', { url: action.url, selector: action.selector, mode: action.mode, frequencyMinutes: action.frequencyMinutes, name: action.name }, deps);
      if (!r.ok) return out(tool, false, r.detail === 'selector_not_found' ? 'O seletor não encontrou nada na página; o monitor não foi criado. Ajuste o seletor.' : failMsg(r));
      const value = r.value ?? '';
      const artifact: Artifact = {
        id: newId(), kind: 'scrape', title: `Monitor: ${action.name}`,
        ...scrapeArtifactData('monitor_page', { pages: [{ url: action.url, items: { [action.selector.name]: value ? [value] : [] } }], credits: r.credits, mode: action.mode }, action.url),
      };
      return out(tool, true, `Monitor "${action.name}" criado (a cada ${action.frequencyMinutes} min). Valor atual: "${value}". ${r.credits ?? 0} créditos. Mudanças aparecem como alerta no chat.`, { artifact, panel: 'monitors' });
    }
    const route: ScrapeRoute = action.op === 'delete' ? 'monitor-delete' : action.op === 'check' ? 'monitor-check' : 'monitor-update';
    const r = await callWithConsent(route, { id: action.id, ...(action.op === 'pause' ? { status: 'paused' } : action.op === 'resume' ? { status: 'active' } : {}) }, deps);
    if (!r.ok) return out(tool, false, failMsg(r));
    const done = { delete: 'Monitor excluído.', pause: 'Monitor pausado.', resume: 'Monitor retomado.', check: r.outcome?.message ?? 'Monitor verificado.' }[action.op];
    return out(tool, true, done, { panel: 'monitors' });
  }

  const body: Record<string, unknown> = tool === 'scrape_page'
    ? { urls: action.urls, mode: action.mode, selectors: action.selectors, purpose: action.purpose ?? '', includeText: action.selectors.length === 0 }
    : { url: action.url, mode: action.mode, maxPages: action.maxPages, maxDepth: action.maxDepth, selectors: action.selectors, ...(action.pathPrefix ? { pathPrefix: action.pathPrefix } : {}), purpose: action.purpose ?? '' };
  let res = await callWithConsent(tool === 'scrape_page' ? 'page' : 'crawl', body, deps);
  if (!res.ok) {
    if (res.status === 'robots') return out(tool, false, SCRAPE_MESSAGES.robots);
    return out(tool, false, failMsg(res));
  }
  let captchaNote: string | undefined;
  if (tool === 'scrape_page') ({ res, captchaNote } = await resumeAfterCaptcha(res, body, deps));
  const source = tool === 'scrape_page' ? action.urls[0] : action.url;
  const data = scrapeArtifactData(tool, res, source);
  const artifact: Artifact = { id: newId(), kind: 'scrape', title: `Coleta: ${(() => { try { return new URL(source).host; } catch { return source; } })()}`, ...data };
  return out(tool, true, [scrapeSummaryForAgent(data), captchaNote ?? ''].filter(Boolean).join('\n'), { artifact });
}
