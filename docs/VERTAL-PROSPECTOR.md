# Vertal Prospector

Agente de prospecção de clientes B2B dentro do **VERTAL Code AI** e do **Vertal Chat**.
Você diz qual é a sua empresa; ele descobre o que você vende, propõe o cliente ideal (ICP) para você confirmar,
encontra empresas que combinam, lê o site de cada uma, acha quem decide e o e-mail, escreve a primeira mensagem
e os follow-ups, e só envia o que você aprovar. Depois lê as respostas e prepara a sua resposta com horários de reunião.

> **Origem da ideia e licença.** Inspirado no comportamento descrito na documentação pública do projeto de código
> aberto Sellbird (antigo Harvey, github.com/ethanplusai/sellbird), licenciado em AGPL-3.0. **Nenhum código, prompt
> ou arquivo de habilidade desse projeto foi copiado.** Esta é uma implementação própria (clean-room), em TypeScript,
> com regras e prompts escritos do zero, em português do Brasil, para o mercado brasileiro. Não é obra derivada.

## Onde fica e quem vê

| | |
|---|---|
| Tela | `/vertal-code-ai/prospector` (botão **Prospector** no topo do VERTAL Code AI e do Vertal Chat) |
| Comando no chat | `prospectar clientes para <empresa> [CNPJ] [site]` ou `/prospectar` — abre a tela já preenchida (não passa pelo modelo do chat) |
| Servidor | edge function existente `vertal-code-ai`, `action: "prospector"` (nenhuma função nova) |
| Front ligado | `VITE_VERTAL_PROSPECTOR=true` (`.env.production`) |
| Servidor ligado | `VERTAL_PROSPECTOR_ENABLED=true` **e** usuário em `VERTAL_PROSPECTOR_USER_IDS` (lista vazia = ninguém) |
| Limite diário | `VERTAL_PROSPECTOR_DAILY_CAP` (padrão 20 e-mails/dia, teto 50) |
| Cobrança | desligada; o custo estimado de cada chamada de modelo sai no log do roteador (`retail_credits … cobrança desligada`) |

Quem não está liberado recebe 404 (igual a "desligado") e não vê botão, rota nem comando.

## Pipeline

1. **Empresa** — nome, CNPJ (opcional) e site (opcional). Lê o cadastro público do CNPJ (BrasilAPI) e até 2 páginas
   do site. O modelo descreve a oferta e propõe o ICP.
2. **ICP para confirmar** — resumo, segmentos, **categorias do mapa** (`chave=valor`, ex.: `amenity=dentist`,
   `shop=bakery`), região (cidade, UF), porte, sinais de compra, exclusões e cargos que decidem. Nada é buscado antes
   de você confirmar.
3. **Leads** — busca grátis em mapa aberto colaborativo (geocodificação + consulta de área). Sem repetir empresas de
   outras campanhas suas nem da lista de não contatar. **Ler site** (até 3 páginas, sem modelo para os sinais
   objetivos): WhatsApp no site, agendamento online, loja, formulário, contratando, rodapé desatualizado, HTTPS.
   O modelo dá a aderência (0–10), um gancho concreto e o decisor — **só se o nome estiver escrito no site ou no
   cadastro público** (sócios do CNPJ); nome inventado é descartado.
4. **Rascunhos para aprovar** — 1º e-mail (até 80 palavras, uma observação + uma pergunta, sem link), follow-up 1
   (3 dias), follow-up 2 (7 dias) e uma mensagem de WhatsApp. Editar volta para rascunho. Aprova um a um ou em lote.
5. **Enviados / Respostas** — envio pelo **Gmail já conectado** (mesma integração do Gmail secretário do Vertal Chat,
   `gmailToken.ts` + `gmailOps.ts`, sem app OAuth novo). **Ver respostas** lê as conversas enviadas e:
   - devolução → e-mail vira inválido e o resto da sequência é cancelado;
   - "parar"/"não tenho interesse"/descadastro → entra na lista de não contatar, lead vira "não contatar", tudo cancelado;
   - resposta automática (férias/ausente) → só registra;
   - resposta de verdade → para a sequência da empresa e cria um **rascunho de resposta** com horários de reunião
     (que também precisa de aprovação).

**CSV**: botão na aba Leads (colunas: empresa, site, cidade, endereço, telefone, categoria, decisor, cargo, e-mail,
status do e-mail, sinais, aderência, status, origem). Células que começam com `= + - @` são protegidas contra fórmula.

## Status do e-mail

| Status | Regra | Envia? |
|---|---|---|
| verificado | publicado pela própria empresa (site ou mapa) **e** o domínio tem MX | sim |
| arriscado | deduzido do padrão de outro endereço pessoal publicado no mesmo domínio, ou digitado à mão; domínio com MX | só marcando "aceito e-mail arriscado" |
| palpite | padrão comum (nome@, nome.sobrenome@…) sem confirmação | nunca por e-mail |
| inválido | sintaxe ruim, domínio sem MX, devolvido ou na lista de não contatar | nunca |

Não há sondagem SMTP (não conecta no servidor do destinatário).

## Regras de segurança (portão determinístico, roda em cada envio)

- Nada sai sem status **aprovado** na tela; o envio é um segundo clique, com confirmação.
- Trava contra envio duplo (`approved → sending` atômico).
- Lista de não contatar (e-mail, domínio, telefone), lead "não contatar", empresa que já respondeu (para a sequência
  de todos os leads do mesmo domínio).
- Limite diário de e-mails (contado no dia de Brasília).
- Texto: sem campos `{{…}}`/`[nome]` sem preencher, sem frases proibidas (genéricas/pressão), limite de palavras,
  1º contato sem link.
- Follow-up só depois do 1º enviado e do prazo (3 e 7 dias), na mesma conversa do Gmail.
- **WhatsApp nunca é enviado pelo sistema** (o WhatsApp bane automação fria): a tela gera um link `wa.me` que você toca
  e envia do seu aparelho; depois marca "enviado".

## LGPD

- Só dados de contato **empresariais** (B2B), com base no legítimo interesse; nada de dados pessoais sensíveis.
- Todo e-mail termina com a origem do contato ("encontrei este contato em fonte pública da sua empresa") e a saída
  ("responda 'parar'"); o WhatsApp também leva a saída.
- Pedido de exclusão: **apagar lead** remove o lead e todas as mensagens e o coloca na lista de não contatar.
  Apagar campanha remove tudo dela.
- Tabelas com RLS: o dono só lê e apaga o que é dele; inserir/alterar só pela edge function.

## Dados e fontes

- Empresas: mapa aberto colaborativo (OpenStreetMap, via Nominatim + Overpass), licença **ODbL** — a tela mostra o link
  de créditos (exigência da licença) e o CSV marca a origem. Respeite a política de uso: o servidor manda
  `User-Agent` próprio e faz poucas consultas (uma por busca).
- CNPJ: BrasilAPI (cadastro público da Receita).
- MX: DNS-over-HTTPS (Cloudflare).
- Modelos: o mesmo roteador do VERTAL Code AI (LLM própria → OpenRouter grátis → DeepSeek pago), esforço "low".
  Nenhum provedor novo.

## Tabelas (migração `20261125110000_vertal_prospector.sql`, só criação)

`prospector_campaigns`, `prospector_leads`, `prospector_messages` (direção out/in, canal, tipo, status, ids do Gmail),
`prospector_dnc`.

## Operações (`POST /functions/v1/vertal-code-ai` com `{action:"prospector", op, …}`)

`status`, `list_campaigns`, `get_campaign`, `create_campaign {companyName, cnpj?, website?}`,
`update_icp {campaignId, icp, confirm?}`, `update_settings {campaignId, settings:{senderName, senderCompany, bookingLink}}`,
`find_leads {campaignId, limit≤60}`, `enrich_lead {leadId}`, `draft_messages {leadId}`,
`update_message {messageId, subject?, body?}`, `approve|reject {messageIds[]}`,
`send {messageId, accountId, allowRisky?}`, `whatsapp_link {messageId}`, `mark_sent {messageId}`,
`check_replies {campaignId}`, `update_lead {leadId, email?, status?, decisionMaker?}`, `delete_lead {leadId, addToDnc?}`,
`delete_campaign {campaignId}`, `dnc_list`, `dnc_add {kind, value}`, `dnc_remove {id}`.
Limite: 40 operações/minuto por usuário (balde `vertal_prospector`).

## Arquivos

- `supabase/functions/_shared/vertalProspector/core.ts` — regras puras (testadas no Vitest e no Deno)
- `supabase/functions/_shared/vertalProspector/handler.ts` — operações (rede e banco injetados)
- `supabase/functions/vertal-code-ai/index.ts` — +1 bloco `action === "prospector"` atrás do interruptor
- `src/pages/VertalProspectorPage.tsx`, `src/lib/vertalProspector/client.ts`, `src/components/vertal-prospector/*`
- Linhas novas (só adicionadas, atrás do interruptor) em `src/App.tsx`, `src/components/vertal-chat/VertalChat.tsx`,
  `src/pages/VertalCodeAIPage.tsx`; `scripts/vertal-code-ai/engine-guard.mjs` aceita linhas do Vertal Prospector.

## Próximos passos possíveis

- Agenda do Google conectada para horários reais (hoje: 3 dias úteis × 10h/15h ou o link de agenda do remetente).
- Fila com envio espaçado ao longo do dia e checagem de respostas agendada.
- Fontes pagas de empresas (só com aprovação de custo).
