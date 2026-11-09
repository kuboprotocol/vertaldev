import { describe, expect, it } from 'vitest'
import { parseBuilderTurn, splitProseAndCode, splitStages, splitUserMessage } from './builderTurn'

const DOC = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>App</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>
.btn{color:red}
.card{padding:8px}
</style>
</head>
<body>
<main id="app">
  <h1>Olá</h1>
</main>
<script>
(function(){ "use strict"; var state = { coins: 0 };
  document.title = 'x';
})();
</script>
</body>
</html>`

describe('splitProseAndCode', () => {
  it('trata HTML cru (sem cerca) como código, não como conversa', () => {
    const r = splitProseAndCode(DOC)
    expect(r.prose).toBe('')
    expect(r.complete).toBe(true)
    expect(r.code.startsWith('<!DOCTYPE html>')).toBe(true)
  })

  it('separa a análise do modo THINK do documento', () => {
    const r = splitProseAndCode(`Vou usar um layout em abas.\n\n${DOC}\n\nPronto!`)
    expect(r.prose).toBe('Vou usar um layout em abas.\n\nPronto!')
    expect(r.prose).not.toContain('<')
    expect(r.code.endsWith('</html>')).toBe(true)
  })

  it('aceita cerca de markdown fechada e ainda aberta', () => {
    const closed = splitProseAndCode('Aqui está:\n```html\n<div>oi</div>\n```\nFeito.')
    expect(closed).toEqual({ prose: 'Aqui está:\n\nFeito.', code: '<div>oi</div>', complete: true })
    const open = splitProseAndCode('Aqui está:\n```html\n<div>o')
    expect(open).toEqual({ prose: 'Aqui está:', code: '<div>o', complete: false })
  })

  it('mantém resposta só de conversa como conversa', () => {
    expect(splitProseAndCode('Claro, qual cor você prefere?')).toEqual({
      prose: 'Claro, qual cor você prefere?',
      code: '',
      complete: false,
    })
  })
})

describe('splitStages', () => {
  it('gera uma caixinha por etapa, na ordem do trabalho', () => {
    const stages = splitStages(DOC, true)
    expect(stages.map((s) => s.kind)).toEqual(['base', 'styles', 'interface', 'logic'])
    expect(stages.every((s) => !s.active)).toBe(true)
  })

  it('tira CSS e JS da marcação e deixa o script externo na base', () => {
    const [base, styles, ui, logic] = splitStages(DOC, true)
    expect(base.code).toContain('cdn.tailwindcss.com')
    expect(base.code).not.toContain('.btn')
    expect(styles.code).toBe('.btn{color:red}\n.card{padding:8px}')
    expect(styles.lines).toBe(2)
    expect(ui.code).toContain('<h1>Olá</h1>')
    expect(ui.code).not.toContain('use strict')
    expect(logic.code).toContain('var state')
    expect(logic.code).not.toContain('<script')
  })

  it('marca como ativa a etapa que está sendo escrita no streaming', () => {
    const midCss = DOC.slice(0, DOC.indexOf('.card'))
    expect(splitStages(midCss, false).find((s) => s.active)?.kind).toBe('styles')
    const midJs = DOC.slice(0, DOC.indexOf('document.title'))
    expect(splitStages(midJs, false).find((s) => s.active)?.kind).toBe('logic')
    const midBody = DOC.slice(0, DOC.indexOf('</main>'))
    expect(splitStages(midBody, false).find((s) => s.active)?.kind).toBe('interface')
  })
})

describe('parseBuilderTurn', () => {
  it('a conversa nunca recebe CSS/JS vazado do documento', () => {
    const turn = parseBuilderTurn(DOC.slice(0, DOC.indexOf('document.title')), true)
    expect(turn.prose).toBe('')
    expect(turn.codeComplete).toBe(false)
    expect(turn.stages.at(-1)).toMatchObject({ kind: 'logic', active: true })
  })

  it('mensagem salva e truncada não fica com etapa em andamento', () => {
    const turn = parseBuilderTurn(DOC.slice(0, DOC.indexOf('.card')), false)
    expect(turn.codeComplete).toBe(true)
    expect(turn.stages.some((s) => s.active)).toBe(false)
  })

  it('conta linhas e bytes do documento', () => {
    const turn = parseBuilderTurn(DOC)
    expect(turn.totalLines).toBe(DOC.split('\n').length)
    expect(turn.bytes).toBe(new TextEncoder().encode(DOC).length)
  })
})

describe('splitUserMessage', () => {
  it('separa o texto dos anexos', () => {
    const r = splitUserMessage('Use esta logo\n\nAttached files:\n[image: logo.png](https://x.dev/logo.png)')
    expect(r.text).toBe('Use esta logo')
    expect(r.files).toEqual([{ category: 'image', name: 'logo.png', url: 'https://x.dev/logo.png' }])
  })
})
