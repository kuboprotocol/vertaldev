# Vertal Design Intelligence

Camada de inteligência de design do Vertal Vibe Code. Injeta princípios de UI/UX inspirados em diretrizes públicas (Apple Human Interface Guidelines e WCAG 2.2) no agente de código e audita estaticamente toda interface gerada antes de ela ser aplicada.

Versão: `1.0.0` · Módulo: `supabase/functions/_shared/designIntelligence.ts`

## 1. Pesquisa: os três repositórios avaliados (23/10/2026)

| | guilannes2/apple-design-kb | mjmirza/apple-design-system | haplollc/ios-eras |
|---|---|---|---|
| Existe / último commit | Sim · 18/09/2026 | Sim · 28/08/2026 | Sim · 22/09/2026 |
| O que é | Base de conhecimento (PT-BR e EN) destilada das 173 páginas do HIG e 188 vídeos de design da Apple, mais uma skill de agente com 4 "leis", 37 anti-padrões e checklist de 38 perguntas | Catálogo por nome de componentes, fundamentos, padrões e downloads oficiais da Apple; scripts que baixam os assets direto da Apple na máquina do usuário | Visualizador da evolução da home screen e do botão do iOS (2007–2026), em SwiftUI e Vite + TypeScript |
| Conteúdo útil para IA | Muito alto (skill + regras + citações) | Médio (índice de nomes e notas de uso) | Baixo (peça histórica; não é design system) |
| Código-fonte proprietário da Apple | Não | Não (assets baixados localmente, nunca commitados) | Não (ícones redesenhados à mão) |
| Licença | **Nenhum arquivo LICENSE.** README diz que as diretrizes, vídeos e ilustrações pertencem à Apple. Sem licença = todos os direitos reservados ao autor | **Conflitante:** README diz MIT (código) + CC BY 4.0 (docs); LICENSE diz OpenRoots Agent License 2.3; NOTICE diz ORA 1.0. A ORA cobra royalty acima de US$ 20 mi/ano de receita e exclui treino de IA sem licença à parte. Assets da Apple restritos a mock-ups para plataformas Apple | MIT (código), Phosphor Icons MIT. Recriações de ícones/trade dress da Apple |
| Decisão | **Não incorporado.** Apenas referenciado. Pode ser usado por cada dev localmente; não redistribuir no produto | **Não incorporado.** Licença ambígua e potencialmente paga em escala; assets da Apple proibidos fora de mock-ups para plataformas Apple | **Não incorporado.** Licença permite, mas reproduz visual de produtos Apple — risco de marca e sem valor para geração de UI |

Conclusão: nenhum conteúdo dos três repositórios foi copiado. O Vertal Design Intelligence foi escrito do zero com palavras nossas, a partir de princípios gerais e de fatos (alvo de toque 44px, contraste 4.5:1 da WCAG, escala tipográfica, grade de 4px), citando as páginas públicas de origem em `DESIGN_SOURCES`.

Se quiser incorporar o apple-design-kb no futuro: pedir ao autor (guilannes2) uma licença explícita (ex.: CC BY 4.0) por escrito. Para o apple-design-system: pedir esclarecimento sobre qual licença vale (README x LICENSE x NOTICE).

## 2. Arquitetura

```
pedido do usuário
   │
   ├─ resolveDesignConfig()  ← body.designIntelligence / body.designSurface / secret DESIGN_INTELLIGENCE
   │      └─ detectSurface(): web_app | saas_dashboard | mobile_app | landing_page
   │
   ├─ buildDesignPrompt()    → anexado ao system prompt (princípios, processo, tokens,
   │                           navegação/layout/componentes do perfil, anti-padrões, checklist)
   │
   ├─ LLM (DeepSeek via AI Gateway) gera o plano com edit_file
   │
   └─ auditGeneratedCode()   → nota 0–100 + achados (blocker/warning/info) com correção sugerida
          └─ evento SSE kind:"design" na timeline do agente (antes de cobrar/commitar)
```

Pontos de integração:

- `vibe-code-agent` (projetos React/Vite/Tailwind): prompt com `target: "react"` + auditoria dos arquivos de UI do plano.
- `generate-code` (KUBO FLOW, HTML único): prompt com `target: "html"`.

Regras da auditoria estática: imagem sem alt, div/span clicável, outline removido sem focus-visible, texto < 12px, input com fonte < 16px, menu hambúrguer, cinza de baixo contraste, cor hex fixa, botão só-ícone sem aria-label, input sem label, HTML sem lang/viewport, zoom desabilitado, animação sem reduced-motion, excesso de botões primários, fontes/ícones/marca da Apple.

## 3. Arquivos

| Arquivo | Mudança |
|---|---|
| `supabase/functions/_shared/designIntelligence.ts` | Novo — tokens, princípios, perfis, detecção, prompt, auditoria |
| `src/config/designIntelligence.ts` | Novo — re-export para o frontend (mesmo padrão de `vibeAgents.ts`) |
| `src/config/designIntelligence.test.ts` | Novo — 15 testes Vitest |
| `supabase/functions/vibe-code-agent/index.ts` | Aditivo — prompt + auditoria + evento `design` |
| `supabase/functions/generate-code/index.ts` | Aditivo — prompt de design no KUBO FLOW |
| `src/lib/vibeCodeAgentTypes.ts` | Aditivo — kind `design`, campos `designIntelligence` e `designSurface` |
| `src/components/vibe-code/VibeCodeAgentChat.tsx` | Aditivo — ícone `Palette` para o passo `design` |

Nenhum arquivo removido, nenhuma migration, nenhuma tabela, nenhum secret novo obrigatório.

## 4. Como ativar

A camada vem **ligada por padrão** após o deploy das edge functions:

```bash
supabase functions deploy vibe-code-agent generate-code
```

Controles:

- Por pedido: `{ "designIntelligence": false }` desliga; `{ "designSurface": "saas_dashboard" }` força o perfil.
- Global: `supabase secrets set DESIGN_INTELLIGENCE=off` (desliga sem novo deploy de código).

## 5. Rollback

1. Imediato, sem deploy: `supabase secrets set DESIGN_INTELLIGENCE=off`.
2. Completo: `git revert <commit>` deste PR e redeploy de `vibe-code-agent` e `generate-code`. Não há dados nem schema a desfazer.

## 6. Testes

- `npx vitest run src/config/designIntelligence.test.ts` → 15/15.
- Suíte completa: 65 arquivos, 494 testes passando, 5 pulados (os mesmos de antes).
- `deno check` nas três edge functions/módulos: sem erros.
- ESLint nos arquivos alterados: limpo.

## 7. Próximos passos

- Auto-reparo: quando houver bloqueadores, rodar uma segunda passada com `buildFixPrompt()` (pronto no módulo; não ligado por custo de créditos — decidir preço).
- Seletor de perfil e "nota de design" visíveis na UI do Vibe Code.
- Verificação visual real: screenshot via sandbox E2B/Vertal Run + axe-core para contraste calculado (a auditoria atual é estática e heurística).
- Perfis para Flutter (Dart) — hoje a auditoria cobre `.tsx/.jsx/.html/.vue/.svelte/.css`.
- Personalização por marca: tokens do usuário salvos na memória do Prime sobrescrevendo `DESIGN_TOKENS`.
