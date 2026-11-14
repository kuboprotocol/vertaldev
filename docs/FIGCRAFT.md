# figCraft no Vertal

O [figCraft](https://github.com/storytold/figcraft) é um editor de interface e protótipos
(frames, auto layout, componentes, variantes, protótipos), open-source (MIT ou Apache-2.0), em
Rust compilado para WebAssembly. Aqui ele roda dentro do Vertal, em três lugares, sobre os mesmos
designs salvos na conta do usuário:

| Onde | Como |
|---|---|
| Painel Criativo | Categoria **Design e comunicação** → figCraft. Também em **Design Premium → Ferramentas gratuitas**. |
| Vertal Chat | Painel **figCraft** (`/creative/chat?tool=figcraft`). O agente cria, abre, lista e edita designs. |
| Servidor MCP (Vertal Dev) | Ferramentas `list_design_files`, `get_design_file`, `create_design_file`, `update_design_file`. |

## Arquivos

- `vendor/figcraft`: clone do repositório upstream (submódulo, commit fixado). É a fonte do build.
- `public/figcraft/`: build web (WASM) servido na mesma origem do site. Gerado a partir do
  upstream com `trunk build --release` em `apps/figcraft-web` (ver `packaging/web/package.sh` no upstream).
- `public/figcraft/templates/*.figcraft`: os 8 modelos iniciais, gerados pelo próprio engine por
  `scripts/build-figcraft-templates.mjs`.
- `supabase/functions/_shared/figcraftTemplates.generated.ts`: os mesmos modelos em base64, para o MCP.
- `supabase/migrations/20261114120000_design_files.sql`: tabela `design_files` e bucket privado
  `design-files` (RLS por dono, pasta `<user_id>/`).
- `src/components/creative/FigcraftEditor.tsx`: a tela (lista, modelos, iframe, salvamento).
- `src/lib/figcraft/`: ponte com o iframe (`bridge.ts`), dados (`designStore.ts`) e a fila de
  comandos entre o chat e o editor aberto (`activeEditor.ts`).

## Ponte com o editor

O iframe usa `?host=parent&control&author=…`:

- `host=parent`: o figCraft fala com o Vertal por `postMessage`. Ele manda `figcraft:ready`,
  `figcraft:save {name, bytes, saveAs}`, `figcraft:dirty` e `figcraft:failed`; recebe
  `figcraft:open {name, bytes}`. Um documento `.figcraft`/`.json` vira um design salvo; PNG, SVG,
  PDF e `.fig` são baixados no navegador.
- `control`: liga `window.figcraft`, o canal de comandos do engine (`execute`, `commands`,
  `inspect`). Como o iframe é da mesma origem, o Vertal chama esses comandos direto.

Só a mesma origem passa: o build tem de ficar no site (`public/figcraft`), não num domínio externo.

## Comandos do engine

O engine tem mais de 600 comandos. Os úteis para criar telas:

- `template.list {}` e `file.newFromTemplate {template, name?}`
- `node.create {type, name?, x?, y?, width?, height?, text?, parent?}` devolve `{id}`
- `node.set {id, …}`, `node.find {name?, type?, text?}`, `text.set {id, text}`
- `fill.set {ids, color}`, `layout.add {ids, direction}`, `component.create {ids}`
- `command.batch {commands: [{command, params}]}`: tudo em um passo de desfazer

Lista completa: `figcraft.commands()` no navegador, ou o `commands` do `figcraft-cli`
no upstream.

## Chat

`{"tool":"figcraft","op":"new","title":"…","template":"dashboard"}` cria e abre um design.
`op: "open"` abre um design por id, `op: "list"` lista os designs (o agente recebe a lista e
responde), e `op: "run"` aplica comandos no design aberto (ou abre o design e aplica ao montar).
Os resultados dos comandos (como o `{id}` de um `node.create`) voltam ao agente na rodada seguinte.

## MCP (para outros vibe coders)

Com uma chave `vtl_mcp_` de leitura e escrita (em `/mcp`):

- `list_design_files {limit?}`
- `get_design_file {designId}`: devolve um link temporário (15 min) do arquivo `.figcraft`.
- `create_design_file {title, template? | base64?}`: `template` é um dos 8 modelos; `base64` é um
  `.figcraft` de até ~4 MB.
- `update_design_file {designId, title?, base64?}`

**Limite atual:** o MCP cria e troca o arquivo inteiro, mas não aplica comandos do engine. Para
editar camadas por MCP é preciso o engine headless (ver “Próximos passos”).

## Como publicar uma atualização

1. Atualize o submódulo (`git -C vendor/figcraft pull`) e rebuild o web com `trunk build --release`
   em `vendor/figcraft/apps/figcraft-web`; copie `dist/web` para `public/figcraft`.
2. Gere os modelos: `node scripts/build-figcraft-templates.mjs` (com o build servido).
3. Aplique a migration `20261114120000_design_files.sql` e redeploy a função `mcp`.

## Próximos passos

- Engine headless em WASM (sem UI, só `figcraft-engine` + `figcraft-format`) numa Edge Function,
  para o MCP rodar `run_command` como o `figcraft-cli mcp` faz.
- Fila de comandos vinda do MCP para designs abertos no painel.
- Renomear e apagar pelo chat (hoje só pelo painel).
