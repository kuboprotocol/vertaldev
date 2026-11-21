# Vertal Scrapling — coleta web e monitoramento (F5)

Coleta e monitoramento de páginas públicas no Vertal Chat e no Vibe Code com o
[Scrapling](https://github.com/D4Vinci/Scrapling) **0.5.1** (BSD-3-Clause), usado como
**dependência** (não vendorizado) dentro do sandbox E2B do Vertal Navigator.

> Consent gate, termo assinado e OpenTimestamps: ver [CONSENT_GATE.md](./CONSENT_GATE.md).
> Licença do Scrapling: ver [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

## Arquitetura

```
Vertal Chat / Vibe Code ──► Worker vertal.dev /api/scrape/*  (JWT do usuário)
                               │  consent gate (termo web_scraping) · robots.txt · rate limit
                               │  saldo antes · créditos ×1,45 depois (só páginas obtidas)
                               ▼
                     Sandbox E2B (template vertal-browser ou vertal-scraper)
                        navd.py  POST /scrape ──► /opt/scrapling/bin/python scraped.py
                                                  (venv próprio, Scrapling 0.5.1)
```

| Peça | Arquivo |
|---|---|
| Coletor (Python, Scrapling) | `infra/vertal-browser/scraped.py` |
| Rota no daemon do sandbox | `infra/vertal-browser/navd.py` (`POST /scrape`, `run_scraped`) |
| Imagem (venv `/opt/scrapling`) | `infra/vertal-browser/e2b.Dockerfile`, `build-template.mjs` |
| Regras puras (preços, limites, robots, parse, máscara de dados pessoais, diff de monitor) | `supabase/functions/_shared/scrapeCore.ts` |
| Rotas do Worker | `worker/scrapeRoutes.ts` (`/api/scrape/*`), montadas em `worker/index.ts` |
| Ferramentas do chat (`scrape_page`, `crawl_site`, `monitor_page`) | `supabase/functions/_shared/chatAgent.ts`, `src/lib/scrape/runScrape.ts` |
| Ação do Vibe Code (`use_scraper`) | `supabase/functions/_shared/vibeAgentCore.ts`, `supabase/functions/vibe-code-agent/index.ts` |
| UI | `src/components/scrape/*` (cartão do resultado, painel Monitores, aviso de captcha/alertas), `src/components/pricing/ScraplingCreditsTable.tsx` |
| Banco (NÃO aplicada) | `supabase/migrations/20261122090000_scrapling_consent_gate.sql` |

**Por que venv próprio:** os fetchers do Scrapling pedem `anyio>=4.14`; o browser-use 0.13.14 do
navd fixa `anyio==4.12.1`. O modo stealth usa o **mesmo Chromium** do Playwright já instalado
(`executable_path`), sem `scrapling install` e sem baixar outro navegador.

## Ferramentas

| Ferramenta | O que faz | Modos |
|---|---|---|
| `scrape_page` | Lê até 5 URLs; extrai seletores CSS/XPath (com `adaptive`) e/ou o texto | `fetch` (HTTP), `dynamic` (Chromium), `stealth` |
| `crawl_site` | Varre um site a partir de uma URL (mesmo host, prefixo de caminho opcional) | `fetch`, `dynamic` (stealth não) |
| `monitor_page` | Cria/lista/pausa/exclui monitores; verifica no cron e alerta mudança no chat | `fetch`, `dynamic`, `stealth` |
| `use_scraper` (Vibe Code) | O agente do Vibe Code pede uma coleta ao Worker com o JWT do usuário | idem `scrape_page` |

O Navigator também tenta o Scrapling (`fetch`) **antes** de abrir o Chromium quando a tarefa só lê
uma página pública (`scrapeFirstCandidate`) — e **só** se o termo de coleta já estiver assinado; sem
termo, ou se falhar, segue para o navegador como antes (nenhum cartão é aberto nesse atalho).

## Créditos (×1,45 sobre o serviço vigente equivalente)

Preço Scrapling = `ceil(base × 1,45)` (conta inteira em `scraplingPrice`). Fonte única:
`SCRAPE_PRICE_TABLE` em `scrapeCore.ts`; o teste `scrapeCore.test.ts` confere que as bases batem com
as constantes de origem.

| Serviço | Unidade | Base (serviço vigente) | Créditos base | Créditos Scrapling |
|---|---|---|---:|---:|
| `scrape_page` — fetch | por página | Ação de IA no chat | 1 | **2** |
| `scrape_page` — dynamic | por página | Vertal Cloud build | 2 | **3** |
| `scrape_page` — stealth | por página | Envio de formulário (Agent run) | 4 | **6** |
| `crawl_site` — fetch | por página visitada | Navigator, 1 min | 1 | **2** |
| `crawl_site` — dynamic | por página visitada | Vertal Cloud build | 2 | **3** |
| `monitor_page` — verificação fetch | por verificação | Navigator, 1 min | 1 | **2** |
| `monitor_page` — verificação dynamic | por verificação | Vertal Cloud build | 2 | **3** |
| `monitor_page` — verificação stealth | por verificação | Envio de formulário | 4 | **6** |
| `monitor_page` — criar/pausar/excluir | por ação | — | 0 | grátis |
| Alerta de mudança no chat | por alerta | — | 0 | grátis |

Regras de cobrança:
- Saldo conferido **antes** pelo custo máximo; cobrança **depois**, só pelas páginas efetivamente
  obtidas (bloqueadas por robots/captcha/login não cobram).
- Chave de idempotência por tarefa: `scrape:<runId>`; verificação de monitor:
  `monitor:<id>:<next_check_at>` (o cron repetido não cobra duas vezes).
- Sem saldo no fim: os dados não saem (402).
- Pedido segurado pelo consent gate (termo ainda não assinado) **não cobra nada**: a coleta só
  começa depois do termo. No Vertal Chat, a 1ª rodada do turno é cobrada **depois** do gate, com
  chave de idempotência do turno (ver CONSENT_GATE.md › Cobrança).

## Regras duras

- **robots.txt** respeitado (User-Agent `VertalBot/1.0`; 5xx/erro = bloqueado; `crawl-delay` > 10 s
  recusa o domínio).
- Limites: 5 URLs por `scrape_page`; 25 páginas e profundidade 3 por crawl; 60 páginas e 20 tarefas
  por usuário em 10 min; 20 páginas/min por domínio (todas as contas); 1,5 s entre páginas do mesmo
  domínio; 20 monitores por conta; 2 sandboxes de coleta simultâneos (`SCRAPE_MAX_SANDBOXES`).
- Só URLs públicas http/https (guarda SSRF igual à do Navigator).
- **Captcha nunca é resolvido automaticamente** (`solve_cloudflare=False`, sem serviço de resolução).
  Na coleta, página com captcha volta como bloqueada; o chat oferece abrir no Navigator, o usuário
  resolve na tela ao vivo ("Assumir controle") e a coleta continua **na sessão dele**
  (`sessionId`, modo `dynamic`). No agente do Navigator, a tarefa **pausa** e o controle vai ao
  usuário com o aviso "Apareceu um captcha, resolva na tela ao vivo".
- Login/paywall: bloqueio, sem nova tentativa. Só contas do próprio usuário, com as credenciais dele
  (cofre / `fill_secret`).
- Dados pessoais (e-mail, telefone, CPF) são **mascarados** no resultado (`redactPersonalData`);
  seletor que mira dado pessoal é recusado.
- Auditoria em `navigator_audit` (`scrape`, `crawl`, `scrape_blocked`, `monitor_*`,
  `captcha_detected`, `captcha_resumed`).

## Rotas `/api/scrape/*` (Worker, POST, JWT)

`page`, `crawl`, `monitors`, `monitor-create`, `monitor-update`, `monitor-delete`, `monitor-check`,
`alerts`, `alerts-seen`, `pricing` (público) e `cron` (cabeçalho `x-cron-token`).

Status de erro: `consent_required` (com `category`, `version`, `title`), `prohibited`, `robots`,
`rate_limited`, `insufficient_credits`, `capacity`, `not_configured`, `sandbox_error`.

## Configuração (Worker)

| Variável | Uso |
|---|---|
| `SCRAPE_ENABLED` | `off` desliga as rotas (padrão: ligado se houver as chaves abaixo) |
| `E2B_API_KEY`, `SUPABASE_SECRET_KEY` | já existentes (Navigator) |
| `SCRAPE_TEMPLATE` | opcional: template E2B só de coleta (`vertal-scraper`); sem ele usa `NAVIGATOR_TEMPLATE` |
| `SCRAPE_MAX_SANDBOXES` | opcional (1–20, padrão 2) |
| `SCRAPE_CRON_TOKEN` | token do cron de monitores e do upgrade OpenTimestamps (mesmo valor do segredo `vertal_scrape_cron_token` no Vault do Supabase) |

Nenhum segredo novo é criado por este PR; os listados acima precisam ser configurados por quem faz
o deploy.

## Deploy (manual, nesta ordem)

1. **Revisar e aplicar a migration** `20261122090000_scrapling_consent_gate.sql` (idempotente, só
   soma; recria a CHECK de `navigator_audit.kind` como superconjunto). Não é aplicada pelo CI.
2. **Reconstruir o template E2B** com o Scrapling:
   `node infra/vertal-browser/build-template.mjs` (ou o template irmão
   `TEMPLATE_NAME=vertal-scraper VERTAL_BROWSER_MEM_MB=2048 …` + `SCRAPE_TEMPLATE=vertal-scraper`).
3. Configurar no Worker `SCRAPE_CRON_TOKEN` (e opcionais) e `CONSENT_ENC_KEY` (ver CONSENT_GATE.md);
   gravar o mesmo token no Vault do Supabase como `vertal_scrape_cron_token` e reaplicar o bloco de
   cron da migration (sem o segredo, nada é agendado).
4. Deploy das edge functions `creative-router` e `vibe-code-agent` e do Worker.
5. Smoke test: `/api/scrape/pricing`; `scrape_page` em uma página pública com o termo assinado;
   captcha de teste → pausa + controle ao usuário.

## Riscos conhecidos

- RAM do sandbox: Chromium + Scrapling stealth no mesmo template; se apertar, usar o template irmão.
- Sites com termos de uso que proíbem coleta: o robots.txt é respeitado, mas os ToS não são lidos
  automaticamente — a responsabilidade é declarada pelo usuário no termo.
- O texto do termo **precisa de revisão jurídica** antes de ir para produção (ver CONSENT_GATE.md).
