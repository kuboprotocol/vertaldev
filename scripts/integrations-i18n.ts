/**
 * Traduz as páginas de integração (/integracoes) para os 21 idiomas.
 *
 *   npx vite-node scripts/integrations-i18n.ts            # traduz só o que falta
 *   npx vite-node scripts/integrations-i18n.ts --check    # só mostra a cobertura
 *   npx vite-node scripts/integrations-i18n.ts --langs=en,es
 *
 * Lê o texto-fonte em pt-BR de `integrationSourceStrings()` (catálogo + conteúdo +
 * ações do motor), grava `src/config/integrations/i18n/source.pt-BR.json` e completa
 * cada `i18n/<código>.json` com as chaves que faltam ou cujo texto-fonte mudou.
 * Tradutor: qualquer endpoint de chat compatível com `/api/chat` (stream=false,
 * format=json) — configure TRANSLATE_API_URL, TRANSLATE_API_KEY e TRANSLATE_MODEL.
 * Sem tradutor configurado, o build continua funcionando: chave sem tradução cai no
 * inglês e depois no pt-BR.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { integrationSourceStrings } from '../src/config/integrations/i18n'
import { INTEGRATION_LOCALES } from '../src/config/integrations/locales'

const DIR = join(process.cwd(), 'src/config/integrations/i18n')
const LANG_NAMES: Record<string, string> = {
  'zh-CN': 'Simplified Chinese (Mainland China)', es: 'Spanish (neutral)', en: 'English (US)', hi: 'Hindi', bn: 'Bengali',
  ru: 'Russian', ja: 'Japanese', pa: 'Punjabi (Gurmukhi script)', vi: 'Vietnamese', tr: 'Turkish', mr: 'Marathi',
  te: 'Telugu', ko: 'Korean', fr: 'French', ta: 'Tamil', ar: 'Arabic (Modern Standard)', de: 'German', ur: 'Urdu',
  jv: 'Javanese (Latin script)', it: 'Italian', fa: 'Persian (Farsi)',
}

const PROMPT = (lang: string) => `You are a senior native-speaker localizer for a SaaS website's SEO landing pages about app integrations.
Translate each value from Brazilian Portuguese into ${lang}. Write natural, fluent, idiomatic copy a native marketer would write — not word-for-word.
Rules:
- Keep placeholders like {name}, {app}, {n}, {a}, {t}, {list}, {fields} exactly as they are.
- Never translate brand, product or app names (Vertal, Vertal Vibe Dev, Vertal Chat, Vertal Fluxos, Vertal Agentes, Vertal Run, Vertal.app, Vertal Vibe Pay, Vertal CRM, Vertal Prospector, and third-party app names). Keep technical terms people search for in the form used locally (API, OAuth, MCP, webhook; the local words for "integration" and "automation").
- Keys starting with "f." are short form-field labels used mid-sentence. Keys "t.title*" are page titles: keep them short.
- Do not add or mention any other company, AI model or vendor. In German never use the word "automatisch" (write "automatisiert").
- Return ONLY a JSON object with exactly the same keys and translated string values.`

const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',')

async function translate(lang: string, chunk: Record<string, string>): Promise<Record<string, string>> {
  const url = process.env.TRANSLATE_API_URL
  if (!url) throw new Error('TRANSLATE_API_URL não configurada')
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(process.env.TRANSLATE_API_KEY ? { authorization: `Bearer ${process.env.TRANSLATE_API_KEY}` } : {}),
    },
    body: JSON.stringify({
      model: process.env.TRANSLATE_MODEL,
      stream: false,
      think: false,
      format: 'json',
      options: { temperature: 0.2 },
      messages: [
        { role: 'system', content: PROMPT(lang) },
        { role: 'user', content: JSON.stringify(chunk) },
      ],
    }),
  })
  if (!res.ok) throw new Error(`tradutor: HTTP ${res.status}`)
  const data = (await res.json()) as { message?: { content?: string } }
  const text = data.message?.content ?? ''
  const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as Record<string, unknown>
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(parsed)) {
    if (k in chunk && typeof v === 'string' && v.trim() && placeholders(v) === placeholders(chunk[k])) out[k] = v
  }
  return out
}

async function main() {
  const check = process.argv.includes('--check')
  const only = process.argv.find((a) => a.startsWith('--langs='))?.slice(8).split(',')
  const source = integrationSourceStrings()
  const prevSourceFile = join(DIR, 'source.pt-BR.json')
  const prevSource: Record<string, string> = existsSync(prevSourceFile) ? JSON.parse(readFileSync(prevSourceFile, 'utf8')) : {}
  const changed = new Set(Object.keys(source).filter((k) => prevSource[k] !== undefined && prevSource[k] !== source[k]))

  for (const l of INTEGRATION_LOCALES) {
    if (only && !only.includes(l.code)) continue
    const file = join(DIR, `${l.code}.json`)
    const dict: Record<string, string> = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
    const missing = Object.keys(source).filter((k) => !dict[k] || changed.has(k))
    console.log(`${l.code}: ${Object.keys(source).length - missing.length}/${Object.keys(source).length} traduzidas`)
    if (check || !missing.length) continue
    for (let i = 0; i < missing.length; i += 60) {
      const chunk = Object.fromEntries(missing.slice(i, i + 60).map((k) => [k, source[k]]))
      try {
        Object.assign(dict, await translate(LANG_NAMES[l.code] ?? l.code, chunk))
      } catch (e) {
        console.warn(`${l.code}: lote ${i / 60} falhou — ${(e as Error).message}`)
      }
    }
    const sorted = Object.fromEntries(Object.keys(source).filter((k) => dict[k]).map((k) => [k, dict[k]]))
    writeFileSync(file, `${JSON.stringify(sorted, null, 1)}\n`)
  }
  if (!check) writeFileSync(prevSourceFile, `${JSON.stringify(source, null, 1)}\n`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
