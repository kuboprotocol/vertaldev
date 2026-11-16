# Vertal Chat — assistente de tarefas multicanal

Status: **base implementada** (precificação, política de acesso, conectores Telegram e WhatsApp, testes).
Pendente: edge functions de webhook, agente de dispositivo, canal Messenger, interface.

Código: `src/lib/vertalChat/`. Testes: `npx vitest run src/lib/vertalChat`.

---

## 1. O que o produto faz

O Vertal Chat é um assistente que trabalha com os arquivos e as conversas do usuário:

1. **Responde no próprio chat** do KUBO Vibe, com acesso às pastas que o dono liberou no PC ou no celular.
2. **Responde por canais de mensagem** (Telegram, WhatsApp Business, Messenger). Um cliente pergunta
   "qual o preço?" e o assistente consulta só as pastas marcadas como públicas para clientes.
3. **Lê, resume, compara e comenta** arquivos (PDF, imagem, texto, planilha, apresentação).
   Escrever ou alterar arquivo exige confirmação explícita do dono.

Regra de ouro: **o assistente só enxerga o que foi concedido, para quem foi concedido, e cada leitura fica registrada.**

---

## 2. Arquitetura

```
 PC (agente local)          Celular (seleção explícita)
        │                              │
        └──────────┬───────────────────┘
                   ▼
        Política de acesso (accessPolicy.ts)  ← concessões por pasta, auditável
                   │
   Canais ──► Conectores (telegram.ts, whatsapp.ts) ──► normalizam mensagens
                   │
                   ▼
        Orquestrador do Vertal Chat (edge function, service role)
          · valida assinatura do webhook
          · consulta a política de acesso
          · lê/indexa arquivo, chama o modelo
          · calcula cotação (pricing.ts) e debita créditos
                   │
                   ▼
        Saída: OutboundRequest (montado em conectors/*) → API do canal
```

Divisão de responsabilidades:

| Camada | Onde roda | O que faz |
|---|---|---|
| `types.ts`, `util.ts` | Cliente e edge | Formato neutro de mensagem e envio |
| `accessPolicy.ts` | Cliente e edge | Decide se um arquivo pode ser lido, sem tocar o disco |
| `pricing.ts` | Cliente e edge | Calcula custo, preço e créditos |
| `connectors/*` | Cliente e edge | Parse de webhook e montagem de envio. **Sem rede e sem token.** |
| Edge function de webhook | Supabase | Assinatura, token do canal, download de mídia, debite de créditos |
| Agente de dispositivo | PC/celular | Lê o arquivo local, resolve symlink, envia só o conteúdo autorizado |

Os tokens de canal (bot do Telegram, token da Meta) **nunca** saem do servidor.

---

## 3. Canais

| Canal | API | Viabilidade | Observação |
|---|---|---|---|
| Telegram | Bot API (oficial) | Alta | Webhook com `X-Telegram-Bot-Api-Secret-Token`. Download de arquivo até 20 MB. |
| WhatsApp | WhatsApp Business Cloud API (Meta) | Alta, para conta **de negócio** | Texto livre só dentro de 24 h da última mensagem do cliente; fora disso, template aprovado. Cobrança por conversa da Meta. |
| Messenger / Facebook Page | Graph API (Meta) | Média | Mesma família da Meta. Exige página e revisão de permissões do app. |
| Instagram DM | Graph API | Média | Restrito a contas profissionais e a permissões de revisão. |
| Conta **pessoal** de WhatsApp / Facebook | Nenhuma oficial | **Fora do escopo** | Automação de conta pessoal viola os termos e leva a banimento. |
| E-mail | Gmail / Microsoft Graph | Próxima fase | Usar conector OAuth já previsto no projeto. |

"Todas as redes" só é entregável para as que têm API oficial. Essa lista é o limite real.

---

## 4. Acesso a arquivos no PC e no celular

**PC (Windows, macOS, Linux):** o agente local (`kubo-agent`, já existente) recebe concessões por pasta.
Não existe acesso ao disco inteiro. Cada leitura passa por `evaluateAccess`:

- caminho com `..` ou relativo é recusado;
- arquivos sensíveis são bloqueados sempre: `.env`, chaves (`.pem`, `id_rsa`), `.kdbx`, `wallet.dat`,
  pastas `.ssh`/`.aws`, dados de navegador (`Login Data`, `Cookies`);
- tamanho máximo de leitura: 25 MB;
- tipos permitidos: texto, imagem, PDF, JSON/XML, Word, Excel, PowerPoint.

**Symlinks:** o agente precisa resolver `realpath` **antes** de montar a requisição. A política não vê links.

**Celular (iOS, Android):** o sistema não permite leitura livre de disco. O acesso é por seleção explícita
(seletor de arquivos ou compartilhar com o KUBO). Cada arquivo escolhido vira uma concessão de leitura com validade.

**Cliente externo:** quem fala pelo WhatsApp ou Telegram com o dono só lê, e só em pastas marcadas com
`external_contact`. Nunca comenta nem escreve. A pasta privada do dono fica inacessível para ele mesmo
que o dono tenha concessão de escrita nela.

---

## 5. Precificação em créditos

### Regra

```
custo      = tokens_entrada × taxa_in + tokens_saída × taxa_out + páginas × taxa_OCR + mensagens × taxa_envio
preço_usd  = custo / (1 − margem_alvo)          margem_alvo = 50%
créditos   = max(1, ceil(preço_usd / valor_crédito))
```

- O arredondamento é **para cima**, então a margem real nunca fica abaixo da alvo.
- Piso de margem bruta: **40%**. Testado em `pricing.test.ts`.
- Mínimo de cobrança: **1 crédito** por ação de IA.

### "Taxa justa para os dois lados"

- **Para a Vibe Dev:** margem de 50% sobre o custo variável. Sem custo de infraestrutura fixa embutido aqui.
- **Para o cliente:** arquivo já indexado **não paga a extração de novo**. Só a pergunta e a resposta são
  cobradas. Quem usa o mesmo contrato ou catálogo todo dia paga bem menos que na primeira leitura.
  Esse benefício sai da própria fórmula, não de desconto arbitrário.

### Exemplo calculado pelo código

Resposta de chat com 2.500 tokens de entrada e 800 de saída, com as taxas premissa:

- custo = 2.500 × 1 / 1e6 + 800 × 5 / 1e6 = **US$ 0,0065**
- preço bruto = 0,0065 / 0,5 = US$ 0,013 → arredondado para **2 créditos** = US$ 0,02
- margem bruta resultante = **67,5%** (acima da alvo por causa do arredondamento)

### Premissas que precisam de validação antes de cobrar

| Item | Valor no código | Ação |
|---|---|---|
| Taxas de LLM e OCR (`ASSUMED_RATES`) | US$ 1 / 5 por milhão de tokens; US$ 0,002 por página | Substituir pelas faturas reais do provedor escolhido |
| Valor do crédito (`CREDIT_VALUE_USD`) | US$ 0,01 | Alinhar com a tabela de planos (`planConfig.ts`) |
| Custo de mensagem WhatsApp | 0 | Incluir a tarifa da Meta por conversa, que varia por país |

Enquanto as premissas não forem trocadas, os números acima são **estimativas**, não preço final.

---

## 6. Segurança

- **Webhook:** validar `X-Hub-Signature-256` (WhatsApp, HMAC-SHA256 com o app secret) e
  `X-Telegram-Bot-Api-Secret-Token`. A verificação não está nesta base; é pré-requisito da edge function.
- **Injeção de prompt:** texto de arquivo e de mensagem é **dado**, nunca instrução. O modelo não recebe
  permissão nova por causa de conteúdo lido.
- **Log de auditoria:** toda leitura registra quem pediu, o caminho, a concessão usada e a decisão.
- **Revogação:** o dono revoga uma pasta e o efeito é imediato na política.

---

## 7. Roadmap

1. **Feito (esta base):** precificação, política de acesso, parse e envio de Telegram e WhatsApp, testes.
2. Edge function `vertal-chat-webhook`: verificação de assinatura, download de mídia, debite de créditos, resposta.
3. Tabelas: concessões de arquivo, log de acesso, canais conectados por usuário (com RLS).
4. Agente local: rota de leitura com `realpath` e concessão por pasta; indexação com cache.
5. Messenger e Instagram DM (após revisão de permissões da Meta).
6. Interface de concessões no KUBO Vibe e no celular.
7. E-mail via conector OAuth.

## 8. Decisões que dependem de você

- Valor real do crédito em dólar e margem alvo (hoje 50%, piso 40%).
- Provedor de LLM e de OCR, para trocar as taxas premissa pelas reais.
- Confirmar que o canal de WhatsApp será conta **de negócio**, não pessoal.

---

## 9. Carteira de pagamentos (decisão de arquitetura, ainda não implementada)

Visão do dono: uma carteira centralizada no estilo banco. Stripe cobre o lado global (contas em moeda estrangeira e cripto onde o Stripe permitir). Asaas cobre o Brasil, em real: Pix, boleto, cartão, envio e recebimento.

**Ponto que decide a arquitetura: quem fica com o dinheiro.**

| Opção | O que é | Consequência |
|---|---|---|
| A. Vertal recebe e guarda o dinheiro numa conta própria, e repassa | A Vertal vira custodiante | Exige autorização do Banco Central como instituição de pagamento. Não é só código. |
| B. Cada usuário tem conta própria no Asaas (ou no Stripe), e a Vertal só orquestra | A Vertal não custodia o dinheiro | Mais simples e mais seguro. Depende de o Asaas oferecer subcontas via API para marketplace. Confirmar na documentação do Asaas. |

**Recomendação:** começar pela opção B. Antes de escolher A, consultar advogado de pagamentos.

**Regras que valem nas duas opções:**
1. Enviar ou pagar só por pedido do dono, com confirmação mostrando valor e destinatário (ver `paymentPolicy.ts`).
2. Chave de API nunca em texto de pasta; fica em Conexões (conta do usuário) ou em variável de ambiente da edge function (conta da plataforma).
3. Cliente de canal nunca dispara pagamento.
4. Cripto: depende do que o Stripe libera por país. Fora de escopo até validar.
