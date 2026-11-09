/**
 * Separa a resposta do gerador em CONVERSA e CÓDIGO.
 *
 * O `generate-code` devolve um único texto: às vezes uma análise curta
 * (modo THINK), depois o HTML inteiro — normalmente sem cerca de markdown.
 * O chat do Builder mostra a conversa como texto e o código em caixinhas,
 * uma por etapa do trabalho (base, estilos, interface, lógica). Tudo aqui é
 * tolerante a texto pela metade, porque roda a cada pedaço do streaming.
 */

export type StageKind = 'base' | 'styles' | 'interface' | 'logic'

export interface BuildStage {
  kind: StageKind
  /** Código desta etapa, já sem as tags <style>/<script> que o envolvem. */
  code: string
  lines: number
  /** A etapa que o modelo está escrevendo neste instante (só no streaming). */
  active: boolean
}

export interface BuilderTurn {
  /** Texto de conversa: o que vem antes e depois do código. */
  prose: string
  /** O documento gerado (pode estar incompleto durante o streaming). */
  code: string
  /** O documento já fechou (`</html>` ou cerca fechada). */
  codeComplete: boolean
  stages: BuildStage[]
  totalLines: number
  bytes: number
}

const STAGE_ORDER: StageKind[] = ['base', 'styles', 'interface', 'logic']

function countLines(code: string): number {
  if (!code.trim()) return 0
  return code.split('\n').filter((l) => l.trim() !== '').length
}

const tidy = (prose: string) => prose.replace(/\n{3,}/g, '\n\n').trim()

/** Localiza o código dentro da mensagem e devolve o que sobra como conversa. */
export function splitProseAndCode(text: string): { prose: string; code: string; complete: boolean } {
  // 1) Cerca de markdown (```html ... ```), fechada ou ainda aberta.
  const fence = text.match(/```[a-zA-Z]*[^\S\n]*\n?/)
  const docStart = text.search(/<!DOCTYPE\s|<html[\s>]/i)
  if (fence && fence.index !== undefined && (docStart === -1 || fence.index < docStart)) {
    const start = fence.index + fence[0].length
    const close = text.indexOf('```', start)
    if (close === -1) return { prose: text.slice(0, fence.index).trim(), code: text.slice(start), complete: false }
    const prose = `${text.slice(0, fence.index)}\n${text.slice(close + 3)}`
    return { prose: tidy(prose), code: text.slice(start, close).trim(), complete: true }
  }

  // 2) Documento HTML cru, do <!DOCTYPE até </html>.
  if (docStart !== -1) {
    const endMatch = /<\/html\s*>/i.exec(text.slice(docStart))
    if (!endMatch) return { prose: text.slice(0, docStart).trim(), code: text.slice(docStart), complete: false }
    const end = docStart + endMatch.index + endMatch[0].length
    const prose = `${text.slice(0, docStart)}\n${text.slice(end)}`
    return { prose: tidy(prose), code: text.slice(docStart, end), complete: true }
  }

  // 3) Fragmento de marcação sem <!DOCTYPE (respostas antigas ou parciais).
  if (/^\s*<[a-zA-Z!]/.test(text)) return { prose: '', code: text.trim(), complete: true }

  return { prose: text.trim(), code: '', complete: false }
}

/**
 * Divide o documento nas etapas do trabalho. O que está dentro de <style>
 * vira "estilos", o que está em <script> embutido vira "lógica", e a
 * marcação restante se divide em "base" (até o <body>) e "interface".
 */
export function splitStages(code: string, complete: boolean): BuildStage[] {
  const parts: Record<StageKind, string[]> = { base: [], styles: [], interface: [], logic: [] }
  let inBody = false
  let last: StageKind = 'base'

  const pushMarkup = (chunk: string) => {
    if (!chunk) return
    if (!inBody) {
      const bodyAt = chunk.search(/<body[\s>]/i)
      if (bodyAt === -1) {
        parts.base.push(chunk)
        if (chunk.trim()) last = 'base'
        return
      }
      parts.base.push(chunk.slice(0, bodyAt))
      inBody = true
      chunk = chunk.slice(bodyAt)
    }
    parts.interface.push(chunk)
    if (chunk.trim()) last = 'interface'
  }

  const open = /<(style|script)\b([^>]*)>/gi
  let pos = 0
  let m: RegExpExecArray | null
  while ((m = open.exec(code))) {
    const tag = m[1].toLowerCase()
    // <script src="..."> não tem corpo: fica na marcação.
    if (tag === 'script' && /\bsrc\s*=/i.test(m[2])) continue
    pushMarkup(code.slice(pos, m.index))
    const bodyStart = m.index + m[0].length
    const closeRe = new RegExp(`</${tag}\\s*>`, 'i')
    const close = closeRe.exec(code.slice(bodyStart))
    const kind: StageKind = tag === 'style' ? 'styles' : 'logic'
    if (!close) {
      parts[kind].push(code.slice(bodyStart))
      last = kind
      pos = code.length
      break
    }
    parts[kind].push(code.slice(bodyStart, bodyStart + close.index))
    last = kind
    pos = bodyStart + close.index + close[0].length
    open.lastIndex = pos
  }
  pushMarkup(code.slice(pos))

  return STAGE_ORDER.map((kind) => {
    const joined = parts[kind].map((p) => p.replace(/^\n+|\s+$/g, '')).filter(Boolean).join('\n\n')
    return { kind, code: joined, lines: countLines(joined), active: !complete && kind === last }
  }).filter((s) => s.lines > 0)
}

/** Interpreta uma mensagem do assistente. `streaming` = ainda chegando texto. */
export function parseBuilderTurn(text: string, streaming = false): BuilderTurn {
  const { prose, code, complete } = splitProseAndCode(text)
  // Mensagem salva que parou no meio (erro de rede, limite): nada mais vai
  // chegar, então nenhuma etapa fica marcada como "em andamento".
  const codeComplete = complete || (!streaming && code !== '')
  const stages = code ? splitStages(code, !streaming || complete) : []
  return {
    prose,
    code,
    codeComplete,
    stages,
    totalLines: countLines(code),
    bytes: new TextEncoder().encode(code).length,
  }
}

/** Texto do usuário sem o bloco de anexos que o Builder acrescenta ao enviar. */
export function splitUserMessage(content: string): { text: string; files: { category: string; name: string; url: string }[] } {
  const marker = content.indexOf('\n\nAttached files:\n')
  if (marker === -1) return { text: content, files: [] }
  const files = [...content.slice(marker).matchAll(/\[(\w+): ([^\]]+)\]\(([^)]+)\)/g)].map((f) => ({
    category: f[1],
    name: f[2],
    url: f[3],
  }))
  return { text: content.slice(0, marker), files }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace('.', ',')} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}
